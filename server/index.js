import express from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { pool, migrate, transaction } from './db.js';
import { AppError, uuid, text, normalizeRecord, warningsFor, validDate, duration } from './domain.js';
import { authenticated, admin, passwordHash, passwordMatches, cookie, hashToken, token, rateLimit } from './auth.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({contentSecurityPolicy:{directives:{'script-src':["'self'"],'style-src':["'self'"],'upgrade-insecure-requests':null}}}));
app.use(express.json({limit:'512kb'}));
app.use('/api', (req,res,next)=> {
  res.setHeader('Cache-Control','no-store');
  if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
    if(req.headers['x-kairos-client'] !== 'web') throw new AppError(403,'Solicitud no autorizada.');
    if(req.headers['sec-fetch-site'] === 'cross-site') throw new AppError(403,'Origen no autorizado.');
  }
  next();
});
const safeUser = row => ({id:row.id,name:row.name,email:row.email,role:row.role,active:row.active});
const email = value => { const clean=text(value,'Correo').toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new AppError(400,'Correo inválido.'); return clean; };
const mailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM && process.env.APP_URL);

app.get('/api/health', async(req,res)=> { await pool.query('SELECT 1'); res.json({ok:true}); });
app.get('/api/config', (req,res)=>res.json({recoveryAvailable:mailConfigured()}));
app.post('/api/login', async(req,res)=> {
  const address=email(req.body.email);
  await rateLimit(`login-ip:${req.ip}`,100); await rateLimit(`login:${address}`);
  const {rows} = await pool.query('SELECT * FROM users WHERE email=$1 AND active',[address]);
  if(!rows[0] || !await passwordMatches(req.body.password,rows[0].password_hash)) throw new AppError(401,'Correo o contraseña incorrectos.');
  const raw=token(), hours=Number(process.env.SESSION_HOURS || 12);
  if(!Number.isFinite(hours)||hours<=0) throw new Error('SESSION_HOURS inválido');
  await pool.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+$3*interval \'1 hour\')',[hashToken(raw),rows[0].id,hours]);
  cookie(res,raw,Math.floor(hours*3600)); res.json(safeUser(rows[0]));
});
app.post('/api/forgot-password',async(req,res)=> {
  if(!mailConfigured()) throw new AppError(503,'La recuperación por correo aún no está configurada. Contactá al administrador.');
  await rateLimit(`recover-ip:${req.ip}`,20);
  const address=email(req.body.email); await rateLimit(`recover:${address}`,5);
  const {rows}=await pool.query('SELECT id FROM users WHERE email=$1 AND active',[address]);
  if(rows[0]) {
    const raw=token();
    await pool.query('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'30 minutes\')',[hashToken(raw),rows[0].id]);
    const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined});
    try { await transport.sendMail({from:process.env.MAIL_FROM,to:address,subject:'Kairos · Recuperar acceso',text:`Restablecé tu contraseña en los próximos 30 minutos: ${process.env.APP_URL.replace(/\/$/,'')}/#reset=${raw}`}); }
    catch(e) { await pool.query('DELETE FROM password_resets WHERE token_hash=$1',[hashToken(raw)]); console.error('No se pudo entregar un correo de recuperación.'); }
  }
  res.json({message:'Si la cuenta está activa, recibirás un enlace de recuperación. Si no llega, contactá al administrador.'});
});
app.post('/api/reset-password',async(req,res)=> {
  await rateLimit(`reset:${req.ip}`,30);
  if(typeof req.body.token!=='string'|| !/^[a-f0-9]{64}$/.test(req.body.token)) throw new AppError(400,'Enlace inválido.');
  const hashed=await passwordHash(req.body.password);
  await transaction(async c=> {
    const {rows}=await c.query('DELETE FROM password_resets WHERE token_hash=$1 AND expires_at>now() RETURNING user_id',[hashToken(req.body.token)]);
    if(!rows[0]) throw new AppError(400,'El enlace venció o ya fue utilizado.');
    const user=await c.query('SELECT id FROM users WHERE id=$1 AND active FOR UPDATE',[rows[0].user_id]);
    if(!user.rows[0]) throw new AppError(400,'Cuenta no disponible.');
    await c.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hashed,rows[0].user_id]);
    await c.query('DELETE FROM sessions WHERE user_id=$1',[rows[0].user_id]);
    await c.query('DELETE FROM password_resets WHERE user_id=$1',[rows[0].user_id]);
    await audit(c,rows[0].user_id,'users',rows[0].user_id,'password_reset',null,{password_changed:true});
  });
  res.json({message:'Contraseña actualizada. Ya podés iniciar sesión.'});
});
app.use('/api',authenticated);
app.get('/api/me',(req,res)=>res.json(req.user));
app.post('/api/logout',async(req,res)=> {await pool.query('DELETE FROM sessions WHERE token_hash=$1',[req.sessionHash]);cookie(res,'');res.json({ok:true});});
app.get('/api/catalog',async(req,res)=> {
  const results=await Promise.all([
    pool.query('SELECT * FROM employees ORDER BY name,dni'),
    pool.query(`SELECT p.*,COALESCE(jsonb_agg(jsonb_build_object('owner_id',po.owner_id,'is_primary',po.is_primary,'name',o.name)) FILTER (WHERE po.owner_id IS NOT NULL),'[]') owners FROM places p LEFT JOIN place_owners po ON po.place_id=p.id LEFT JOIN owners o ON o.id=po.owner_id GROUP BY p.id ORDER BY p.name`),
    pool.query('SELECT * FROM owners ORDER BY name')
  ]);
  res.json({employees:results[0].rows,places:results[1].rows,owners:results[2].rows});
});
async function audit(c,userId,entity,id,action,before,after) {
  const {rows}=await c.query('INSERT INTO audit(user_id,entity,entity_id,action,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[userId,entity,id,action,before,after]);return rows[0].id;
}
app.post('/api/catalog/:entity',admin,async(req,res)=> saveCatalog(req,res));
app.put('/api/catalog/:entity/:id',admin,async(req,res)=> saveCatalog(req,res));
async function saveCatalog(req,res) {
  const entity=req.params.entity;
  if(!['employees','places','owners'].includes(entity)) throw new AppError(404,'Entidad no encontrada.');
  const id=req.params.id?uuid(req.params.id):randomUUID(), body=req.body;
  const name=text(body.name,'Nombre');
  const result=await transaction(async c=> {
    await c.query('SELECT pg_advisory_xact_lock(419034)');
    let before=null;
    if(req.params.id) { before=(await c.query(`SELECT * FROM ${entity} WHERE id=$1 FOR UPDATE`,[id])).rows[0]; if(!before) throw new AppError(404,'No encontrado.'); }
    const active=typeof body.active==='boolean'?body.active:before?.active??true;
    if(entity==='employees') {
      const dni=text(body.dni,'DNI').replace(/[.\s-]/g,'');
      if(!/^\d{6,12}$/.test(dni)) throw new AppError(400,'DNI inválido: ingresá de 6 a 12 dígitos.');
      await c.query('INSERT INTO employees(id,name,dni,phone,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=$2,dni=$3,phone=$4,active=$5',[id,name,dni,text(body.phone??'','Teléfono',false),active]);
    } else if(entity==='owners') {
      if(!active && (await c.query('SELECT 1 FROM place_owners po JOIN places p ON p.id=po.place_id WHERE po.owner_id=$1 AND p.active LIMIT 1',[id])).rowCount) throw new AppError(400,'Quitá al dueño de sus lugares activos antes de desactivarlo.');
      await c.query('INSERT INTO owners(id,name,phone,active) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=$2,phone=$3,active=$4',[id,name,text(body.phone??'','Teléfono',false),active]);
    } else {
      if(!Array.isArray(body.owners)||!body.owners.length||body.owners.length>100||body.owners.filter(o=>o.is_primary===true).length!==1) throw new AppError(400,'Elegí al menos un dueño y exactamente uno principal.');
      const ids=body.owners.map(o=>uuid(o.owner_id));
      if(new Set(ids).size!==ids.length) throw new AppError(400,'No repitas dueños.');
      const available=await c.query('SELECT id FROM owners WHERE id=ANY($1::uuid[]) AND active', [ids]);
      if(available.rowCount!==ids.length && active) throw new AppError(400,'Los dueños deben estar activos.');
      if(before) before.owners=(await c.query('SELECT owner_id,is_primary FROM place_owners WHERE place_id=$1',[id])).rows;
      await c.query('INSERT INTO places(id,name,address,active) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=$2,address=$3,active=$4',[id,name,text(body.address??'','Dirección',false),active]);
      await c.query('DELETE FROM place_owners WHERE place_id=$1',[id]);
      for(const o of body.owners) await c.query('INSERT INTO place_owners(place_id,owner_id,is_primary) VALUES($1,$2,$3)',[id,o.owner_id,o.is_primary===true]);
    }
    const after=(await c.query(`SELECT * FROM ${entity} WHERE id=$1`,[id])).rows[0];
    if(entity==='places') after.owners=body.owners;
    await audit(c,req.user.id,entity,id,before?'update':'create',before,after);return after;
  });
  res.json(result);
}
app.get('/api/users',admin,async(req,res)=>res.json((await pool.query('SELECT id,name,email,role,active FROM users ORDER BY name')).rows));
app.post('/api/users',admin,async(req,res)=>saveUser(req,res));
app.put('/api/users/:id',admin,async(req,res)=>saveUser(req,res));
async function saveUser(req,res) {
  const id=req.params.id?uuid(req.params.id):randomUUID(), b=req.body;
  const name=text(b.name,'Nombre'),address=email(b.email);
  if(!['admin','rrhh'].includes(b.role)||typeof b.active!=='boolean') throw new AppError(400,'Rol o estado inválido.');
  const hashed=b.password?await passwordHash(b.password):null;
  if(!req.params.id&&!hashed) throw new AppError(400,'La contraseña inicial es obligatoria.');
  await transaction(async c=> {
    await c.query('SELECT pg_advisory_xact_lock(419035)');
    const before=(await c.query('SELECT id,name,email,role,active FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(req.params.id&&!before) throw new AppError(404,'Cuenta no encontrada.');
    if(before?.role==='admin'&&before.active&&(!b.active||b.role!=='admin')) {
      const others=await c.query("SELECT id FROM users WHERE active AND role='admin' AND id<>$1",[id]);
      if(!others.rowCount) throw new AppError(400,'Debe quedar al menos un administrador activo.');
    }
    await c.query('INSERT INTO users(id,name,email,password_hash,role,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=$2,email=$3,password_hash=COALESCE($4,users.password_hash),role=$5,active=$6',[id,name,address,hashed,b.role,b.active]);
    if(before && (hashed||!b.active||before.role!==b.role)) { await c.query('DELETE FROM sessions WHERE user_id=$1',[id]); await c.query('DELETE FROM password_resets WHERE user_id=$1',[id]); }
    await audit(c,req.user.id,'users',id,before?'update':'create',before,{id,name,email:address,role:b.role,active:b.active,password_changed:Boolean(hashed)});
  });res.json({ok:true});
}
function filters(query,alias='r') {
  const clauses=[`${alias}.deleted_at IS NULL`],params=[];
  for(const [key,column,operator] of [['employee_id','employee_id','='],['place_id','place_id','='],['from','date','>='],['to','date','<=']]) {
    if(!query[key]) continue;
    if(key.endsWith('_id')) uuid(query[key]); else if(!validDate(query[key])) throw new AppError(400,'Período inválido.');
    params.push(query[key]);clauses.push(`${alias}.${column}${operator}$${params.length}`);
  }
  if(query.from&&query.to&&query.from>query.to) throw new AppError(400,'El inicio del período no puede ser posterior al fin.');
  return {where:clauses.join(' AND '),params};
}
const recordSelect=`SELECT r.*,r.date::text, to_char(r.start_time,'HH24:MI') start_time,to_char(r.end_time,'HH24:MI') end_time,e.name employee_name,e.dni,p.name place_name FROM records r JOIN employees e ON e.id=r.employee_id JOIN places p ON p.id=r.place_id`;
app.get('/api/records',async(req,res)=> {
  const {where,params}=filters(req.query);
  const page=Math.max(0,Number.parseInt(req.query.page||'0',10)||0);
  const count=await pool.query(`SELECT count(*)::int count,COALESCE(sum(r.minutes),0)::bigint minutes FROM records r WHERE ${where}`,params);
  const {rows}=await pool.query(`${recordSelect} WHERE ${where} ORDER BY r.date DESC,r.created_at DESC LIMIT 50 OFFSET $${params.length+1}`,[...params,page*50]);
  res.json({records:rows,count:count.rows[0].count,minutes:Number(count.rows[0].minutes),page});
});
async function notify(c,userId,id,action,before,after,warnings=[]) {
  const aid=await audit(c,userId,'records',id,action,before,after);
  for(const reason of [action,...warnings.map(w=>w.reason)]) await c.query('INSERT INTO notifications(record_id,audit_id,reason,details) VALUES($1,$2,$3,$4)',[id,aid,reason,{warnings}]);
}
async function assertEntities(c,record,before=null) {
  const e=(await c.query('SELECT active FROM employees WHERE id=$1',[record.employee_id])).rows[0];
  const p=(await c.query('SELECT active FROM places WHERE id=$1',[record.place_id])).rows[0];
  if(!e||!p||(!e.active&&before?.employee_id!==record.employee_id)||(!p.active&&before?.place_id!==record.place_id)) throw new AppError(400,'Elegí un empleado y un lugar activos.');
}
async function related(c,records) {
  const ids=[...new Set(records.map(r=>r.employee_id))];
  return (await c.query(`SELECT id,employee_id,place_id,date::text,to_char(start_time,'HH24:MI') start_time,to_char(end_time,'HH24:MI') end_time,minutes FROM records WHERE employee_id=ANY($1::uuid[]) AND date BETWEEN $2 AND $3 AND deleted_at IS NULL ORDER BY id`,[ids,records.map(r=>r.date).sort()[0],records.map(r=>r.date).sort().at(-1)])).rows;
}
app.post('/api/records/batch',async(req,res)=> {
  const body=req.body, submissionId=uuid(body.submission_id);
  if(!Array.isArray(body.records)||!body.records.length||body.records.length>100) throw new AppError(400,'El lote debe contener de 1 a 100 filas.');
  const errors=[]; const rows=body.records.map((r,i)=>{try{return normalizeRecord(r);}catch(e){errors.push({row:i,message:e.message});return null;}});
  if(errors.length) throw new AppError(400,'Corregí las filas señaladas.',{errors});
  const payloadHash=hashToken(JSON.stringify(rows));
  const result=await transaction(async c=> {
    // Serialize writes and catalog deactivation so warnings and retries see a consistent state.
    await c.query('SELECT pg_advisory_xact_lock(419033)');
    await c.query('SELECT pg_advisory_xact_lock(419034)');
    const existing=(await c.query('SELECT * FROM submissions WHERE id=$1',[submissionId])).rows[0];
    if(existing) {if(existing.user_id!==req.user.id||existing.payload_hash!==payloadHash) throw new AppError(409,'La solicitud anterior ya se guardó con otros datos. Revisá los registros antes de volver a guardar este lote.',{reset_submission:true});return existing.result;}
    for(let i=0;i<rows.length;i++) {try{await assertEntities(c,rows[i]);}catch(e){errors.push({row:i,message:e.message});}}
    if(errors.length) throw new AppError(400,'Corregí las filas señaladas.',{errors});
    const stored=await related(c,rows);
    const warnings=rows.flatMap((r,i)=>warningsFor({...r,id:`new-${i}`},[...stored,...rows.map((v,j)=>({...v,id:`new-${j}`}))]).map(w=>({...w,row:i})));
    if(warnings.length && body.warning_token!==hashToken(JSON.stringify({rows,warnings,stored}))) throw new AppError(409,'Revisá las advertencias y confirmá para guardar.',{warnings,warning_token:hashToken(JSON.stringify({rows,warnings,stored}))});
    const ids=[];
    for(let i=0;i<rows.length;i++) {
      const r=rows[i], id=randomUUID();
      const after=(await c.query('INSERT INTO records(id,employee_id,place_id,date,start_time,end_time,minutes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[id,r.employee_id,r.place_id,r.date,r.start_time,r.end_time,r.minutes,req.user.id])).rows[0];
      await notify(c,req.user.id,id,'create',null,after,warnings.filter(w=>w.row===i));ids.push(id);
    }
    const result={ids,message:`Se guardaron ${ids.length} registros.`};
    await c.query('INSERT INTO submissions(id,user_id,payload_hash,result) VALUES($1,$2,$3,$4)',[submissionId,req.user.id,payloadHash,result]);return result;
  }); res.json(result);
});
app.put('/api/records/:id',async(req,res)=> {
  const id=uuid(req.params.id),record=normalizeRecord(req.body);
  await transaction(async c=> {
    await c.query('SELECT pg_advisory_xact_lock(419033)'); await c.query('SELECT pg_advisory_xact_lock(419034)');
    const before=(await c.query('SELECT * FROM records WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
    if(!before) throw new AppError(404,'Registro no encontrado.');
    if(before.version!==req.body.version) throw new AppError(409,'Otra persona modificó este registro. Volvé a consultarlo.');
    await assertEntities(c,record,before);
    const stored=await related(c,[record]); const warnings=warningsFor({...record,id},stored);
    const expected=hashToken(JSON.stringify({record,warnings,stored,version:before.version}));
    if(warnings.length && req.body.warning_token!==expected) throw new AppError(409,'Revisá las advertencias y confirmá.',{warnings,warning_token:expected});
    const after=(await c.query('UPDATE records SET employee_id=$2,place_id=$3,date=$4,start_time=$5,end_time=$6,minutes=$7,version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[id,record.employee_id,record.place_id,record.date,record.start_time,record.end_time,record.minutes])).rows[0];
    await notify(c,req.user.id,id,'update',before,after,warnings);
  });res.json({message:'Registro actualizado.'});
});
app.delete('/api/records/:id',async(req,res)=> {
  const id=uuid(req.params.id);
  await transaction(async c=> {
    await c.query('SELECT pg_advisory_xact_lock(419033)');
    const before=(await c.query('SELECT * FROM records WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id])).rows[0];
    if(!before) throw new AppError(404,'Registro no encontrado.');
    if(before.version!==req.body.version) throw new AppError(409,'El registro cambió. Volvé a consultarlo antes de eliminarlo.');
    const after=(await c.query('UPDATE records SET deleted_at=now(),deleted_by=$2,updated_at=now(),version=version+1 WHERE id=$1 RETURNING *',[id,req.user.id])).rows[0];
    await notify(c,req.user.id,id,'delete',before,after);
  });res.json({message:'Registro eliminado. Su historial se conserva.'});
});
app.get('/api/records/:id/history',async(req,res)=> {
  const id=uuid(req.params.id);
  const result=await pool.query(`SELECT a.*,u.name user_name,u.email user_email FROM audit a JOIN users u ON u.id=a.user_id WHERE a.entity='records' AND a.entity_id=$1 ORDER BY a.id DESC`,[id]);
  res.json(result.rows);
});
app.get('/api/audit',admin,async(req,res)=> {
  const page=Math.max(0,Number.parseInt(req.query.page||'0',10)||0);
  res.json((await pool.query('SELECT a.*,u.name user_name FROM audit a JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 50 OFFSET $1',[page*50])).rows);
});
app.get('/api/notifications',admin,async(req,res)=> {
  const params=[], clauses=['true'];
  for(const [key,col] of [['reason','n.reason'],['user_id','a.user_id'],['employee_id','r.employee_id'],['place_id','r.place_id']]) if(req.query[key]) {
    if(key.endsWith('_id')) uuid(req.query[key]);
    params.push(req.query[key]);clauses.push(`${col}=$${params.length}`);
  }
  if(req.query.state==='pending') clauses.push('n.reviewed_at IS NULL');
  if(req.query.state==='reviewed') clauses.push('n.reviewed_at IS NOT NULL');
  for(const [key,op] of [['from','>='],['to','<=']]) if(req.query[key]) {
    if(!validDate(req.query[key])) throw new AppError(400,'Fecha inválida.');
    params.push(req.query[key]);clauses.push(`(n.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date ${op} $${params.length}::date`);
  }
  const page=Math.max(0,Number.parseInt(req.query.page||'0',10)||0);
  const base=`FROM notifications n JOIN audit a ON a.id=n.audit_id JOIN users u ON u.id=a.user_id JOIN records r ON r.id=n.record_id JOIN employees e ON e.id=r.employee_id JOIN places p ON p.id=r.place_id WHERE ${clauses.join(' AND ')}`;
  const count=(await pool.query(`SELECT count(*)::int count ${base}`,params)).rows[0].count;
  const {rows}=await pool.query(`SELECT n.*,u.name user_name,e.name employee_name,p.name place_name,r.date::text record_date,r.deleted_at,a.before_data,a.after_data ${base} ORDER BY n.id DESC LIMIT 50 OFFSET $${params.length+1}`,[...params,page*50]);
  res.json({notifications:rows,count,page});
});
app.post('/api/notifications/:id/review',admin,async(req,res)=> {
  if(!/^\d+$/.test(req.params.id)) throw new AppError(400,'Identificador inválido.');
  await pool.query('UPDATE notifications SET reviewed_at=now(),reviewed_by=$2 WHERE id=$1 AND reviewed_at IS NULL',[req.params.id,req.user.id]);res.json({ok:true});
});
app.get('/api/export/:format',async(req,res)=> {
  if(!['xlsx','pdf'].includes(req.params.format)) throw new AppError(400,'Formato inválido.');
  const {where,params}=filters(req.query);
  const {rows}=await pool.query(`${recordSelect} WHERE ${where} ORDER BY e.name,r.date,p.name LIMIT 10001`,params);
  if(rows.length>10000) throw new AppError(400,'La exportación supera 10.000 registros. Acotá el período.');
  const total=rows.reduce((n,r)=>n+r.minutes,0);
  res.setHeader('Content-Disposition',`attachment; filename="kairos-horas.${req.params.format}"`);
  if(req.params.format==='xlsx') {
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Horas');
    sheet.columns=[{header:'Empleado',key:'employee_name',width:28},{header:'DNI',key:'dni',width:16},{header:'Fecha',key:'date',width:14},{header:'Día',key:'weekday',width:16},{header:'Lugar',key:'place_name',width:28},{header:'Entrada',key:'start_time',width:12},{header:'Salida',key:'end_time',width:12},{header:'Duración',key:'hours',width:16}];
    for(const r of rows) sheet.addRow({...r,weekday:weekday(r.date),hours:r.minutes/1440});
    sheet.getColumn('hours').numFmt='[h]:mm';
    sheet.addRow({employee_name:'TOTAL',hours:total/1440}); sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];
    await book.xlsx.write(res);res.end();
  } else {
    res.type('application/pdf');
    const doc=new PDFDocument({size:'A4',layout:'landscape',margin:32});doc.pipe(res);
    doc.fontSize(20).text('Kairos | Registro de horas');
    doc.fontSize(10).text(`Período: ${req.query.from||'sin inicio'} a ${req.query.to||'sin fin'} · ${rows.length} registros`);doc.moveDown();
    const xs=[32,185,250,322,400,570,635,700],widths=[148,60,68,74,164,60,60,100];
    function header(){ const y=doc.y; ['Empleado','DNI','Fecha','Día','Lugar','Entrada','Salida','Duración'].forEach((s,i)=>doc.font('Helvetica-Bold').fontSize(9).text(s,xs[i],y,{width:widths[i]}));doc.y=y+22; }
    header();
    for(const r of rows) {
      const cells=[r.employee_name,r.dni,r.date,weekday(r.date),r.place_name,r.start_time||'',r.end_time||'',duration(r.minutes)];
      doc.font('Helvetica').fontSize(9);
      const height=Math.max(22,...cells.map((s,i)=>doc.heightOfString(String(s),{width:widths[i]})+8));
      if(doc.y+height>doc.page.height-55){doc.addPage();header();}
      const y=doc.y;cells.forEach((s,i)=>doc.text(String(s),xs[i],y,{width:widths[i]}));doc.y=y+height;
    }
    if(doc.y>doc.page.height-70) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(12).text(`Total: ${duration(total)} horas`,32,doc.y+10);doc.end();
  }
});
function weekday(date) { return new Intl.DateTimeFormat('es-AR',{weekday:'long',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`)); }
app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
app.use('/api',(req,res)=>res.status(404).json({message:'Ruta no encontrada.'}));
app.use((err,req,res,next)=> {
  if(res.headersSent) return next(err);
  const status=err.status || (err.code==='23505'?409:err.code==='23503'?400:500);
  if(status===500) console.error('Error de servidor:',err.message);
  res.status(status).json({message:err.code==='23505'?'Ya existe un registro con ese DNI o correo.':err.code==='23503'?'La entidad relacionada no está disponible.':status===500?'No se pudo completar la operación. Reintentá.':err.message,...err.details});
});
await migrate();
const server=app.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Kairos disponible en puerto '+(process.env.PORT||3000)));
const cleanup=setInterval(()=>pool.query("DELETE FROM sessions WHERE expires_at<now(); DELETE FROM password_resets WHERE expires_at<now(); DELETE FROM login_attempts WHERE resets_at<now()").catch(()=>{}),3600000);cleanup.unref();
process.on('SIGTERM',()=>server.close(()=>pool.end()));
