import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import net from 'node:net';

async function smtpInbox() {
  const messages=[];
  const server=net.createServer(socket=>{
    socket.setEncoding('utf8');socket.write('220 localhost SMTP\r\n');
    let buffer='',inData=false,message='';
    socket.on('data',chunk=>{
      buffer+=chunk;
      while(buffer.includes('\r\n')) {
        const end=buffer.indexOf('\r\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+2);
        if(inData){if(line==='.') {messages.push(message);message='';inData=false;socket.write('250 Stored\r\n');} else message+=line+'\r\n';}
        else if(/^EHLO|^HELO/.test(line))socket.write('250-localhost\r\n250 PIPELINING\r\n');
        else if(line==='DATA'){inData=true;socket.write('354 End with dot\r\n');}
        else if(line==='QUIT'){socket.end('221 Bye\r\n');}
        else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {server,messages,port:server.address().port};
}

test('API completa con PostgreSQL aislado', {skip:!process.env.TEST_DATABASE_URL,timeout:90000}, async t=>{
  const {default:pg}=await import('pg');
  const control=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
  const schema='kairos_test_'+randomUUID().replaceAll('-','');
  await control.query(`CREATE SCHEMA ${schema}`);
  const connection=new URL(process.env.TEST_DATABASE_URL);connection.searchParams.set('options',`-c search_path=${schema}`);
  const env={...process.env,DATABASE_URL:connection.toString(),PORT:'3199',SMTP_HOST:'',MAIL_FROM:'',COOKIE_SECURE:'false'};
  let app=spawn(process.execPath,['server/index.js'],{env,stdio:['ignore','pipe','pipe']});
  let output='';app.stdout.on('data',v=>output+=v);app.stderr.on('data',v=>output+=v);
  t.after(async()=>{if(app.exitCode===null){const closed=new Promise(resolve=>app.once('exit',resolve));app.kill();await closed;}await control.query(`DROP SCHEMA ${schema} CASCADE`);await control.end();});
  const base='http://127.0.0.1:3199/api';
  let ready=false;
  for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}if(app.exitCode!==null)break;await delay(100);}
  assert.ok(ready,output);
  const password='Una-clave-de-prueba-2026';
  const bootstrap=spawn(process.execPath,['server/admin.js','create','admin@example.test','Admin Test'],{env,stdio:['pipe','pipe','pipe']});
  bootstrap.stdin.end(password);let bootError='';bootstrap.stderr.on('data',v=>bootError+=v);
  assert.equal(await new Promise(resolve=>bootstrap.on('exit',resolve)),0,bootError);
  let cookie='';
  async function request(path,method='GET',body,expected=200,session=cookie){
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Kairos-Client':'web',Cookie:session},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return {data,response};
  }
  cookie=(await request('/login','POST',{email:'admin@example.test',password})).response.headers.get('set-cookie').split(';')[0];
  const employee=(await request('/catalog/employees','POST',{name:'Ana Pérez',dni:'30.123.456',phone:''})).data;
  await request('/catalog/employees','POST',{name:'Otra Ana',dni:'30123456',phone:''},409);
  const second=(await request('/catalog/employees','POST',{name:'Ana Pérez',dni:'30123457',phone:''})).data;
  assert.notEqual(second.id,employee.id);
  const owner=(await request('/catalog/owners','POST',{name:'Dueño',phone:''})).data;
  const place=(await request('/catalog/places','POST',{name:'Obra A',address:'',owners:[{owner_id:owner.id,is_primary:true}]})).data;
  await request('/users','POST',{name:'RRHH',email:'rrhh@example.test',password,role:'rrhh',active:true});
  const rrhh=(await request('/login','POST',{email:'rrhh@example.test',password})).response.headers.get('set-cookie').split(';')[0];
  await request('/catalog/employees','POST',{name:'No permitido',dni:'30123458'},403,rrhh);
  await request('/notifications','GET',undefined,403,rrhh);
  const record={employee_id:employee.id,place_id:place.id,date:'2026-01-20',minutes:541};
  const payload={submission_id:randomUUID(),records:[record]};
  const warning=(await request('/records/batch','POST',payload,409,rrhh)).data;
  assert.equal(warning.warnings[0].reason,'long_duration');
  payload.warning_token=warning.warning_token;
  const saved=(await request('/records/batch','POST',payload,200,rrhh)).data;
  const retry=(await request('/records/batch','POST',payload,200,rrhh)).data;
  assert.deepEqual(saved.ids,retry.ids);
  const invalid={submission_id:randomUUID(),records:[{...record,date:'2999-01-01'},record]};
  await request('/records/batch','POST',invalid,400,rrhh);
  const list=(await request('/records')).data;
  assert.equal(list.count,1);assert.equal(list.minutes,541);
  const id=saved.ids[0];
  await request('/records/'+id,'PUT',{...record,minutes:60,version:1},200,rrhh);
  await request('/records/'+id,'PUT',{...record,minutes:90,version:1},409,rrhh);
  let result=await fetch(base+'/export/pdf',{headers:{Cookie:cookie}});
  assert.equal(result.status,200);assert.equal(Buffer.from(await result.arrayBuffer()).subarray(0,4).toString(),'%PDF');
  result=await fetch(base+'/export/xlsx',{headers:{Cookie:cookie}});
  assert.equal(result.status,200);
  const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await result.arrayBuffer()));
  assert.equal(book.worksheets[0].getCell('A2').value,'Ana Pérez');assert.equal(book.worksheets[0].getCell('H3').value,60/1440);
  await request('/records/'+id,'DELETE',{version:2},200,rrhh);
  assert.equal((await request('/records')).data.count,0);
  const history=(await request('/records/'+id+'/history')).data;
  assert.deepEqual(history.map(h=>h.action),['delete','update','create']);assert.ok(history.every(h=>h.user_email==='rrhh@example.test'));
  const notifications=(await request('/notifications?reason=delete&state=pending')).data;
  assert.equal(notifications.count,1);assert.ok(notifications.notifications[0].deleted_at);
  await request('/notifications/'+notifications.notifications[0].id+'/review','POST',{});
  assert.equal((await request('/notifications?reason=delete&state=pending')).data.count,0);
  await request('/forgot-password','POST',{email:'admin@example.test'},503);

  // Exercise actual SMTP delivery and one-use password recovery without a real mail provider.
  const inbox=await smtpInbox();t.after(()=>new Promise(resolve=>inbox.server.close(resolve)));
  const exited=new Promise(resolve=>app.once('exit',resolve));app.kill();await exited;
  app=spawn(process.execPath,['server/index.js'],{env:{...env,SMTP_HOST:'127.0.0.1',SMTP_PORT:String(inbox.port),SMTP_SECURE:'false',SMTP_USER:'',MAIL_FROM:'kairos@example.test',APP_URL:'http://127.0.0.1:3199'},stdio:['ignore','pipe','pipe']});
  app.stdout.on('data',v=>output+=v);app.stderr.on('data',v=>output+=v);
  ready=false;
  for(let i=0;i<100;i++){try{if((await fetch(base+'/config')).ok){ready=true;break;}}catch{}await delay(100);}
  assert.ok(ready,output);
  await request('/forgot-password','POST',{email:'admin@example.test'});
  assert.equal(inbox.messages.length,1);
  const raw=inbox.messages[0],split=raw.indexOf('\r\n\r\n');
  const message=/Content-Transfer-Encoding: base64/i.test(raw.slice(0,split))?Buffer.from(raw.slice(split+4),'base64').toString():raw.slice(split+4).replace(/=\r\n/g,'').replace(/=([A-F0-9]{2})/gi,(_,hex)=>String.fromCharCode(Number.parseInt(hex,16)));
  const resetToken=message.match(/#reset=([a-f0-9]{64})/)?.[1];assert.ok(resetToken,'El correo debe contener el enlace de recuperación.');
  const newPassword='Otra-clave-de-prueba-2026';
  await request('/reset-password','POST',{token:resetToken,password:newPassword});
  await request('/me','GET',undefined,401);
  await request('/reset-password','POST',{token:resetToken,password:newPassword},400);
  await request('/login','POST',{email:'admin@example.test',password:newPassword});
});
