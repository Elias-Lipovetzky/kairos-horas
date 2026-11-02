import {randomUUID} from 'node:crypto';
import {pool,migrate,transaction} from './db.js';
import {passwordHash} from './auth.js';
// Password comes from stdin to avoid shell history and process arguments.
let input='';for await(const chunk of process.stdin) input+=chunk;
try {
  const [command,email,name]=process.argv.slice(2);
  if(!['create','reset'].includes(command)||!email||!name) throw new Error('Uso: npm run admin -- create|reset correo "Nombre" < archivo-seguro-de-clave');
  const address=email.toLowerCase().trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Correo inválido');
  const hashed=await passwordHash(input.trim()); await migrate();
  await transaction(async c=> {
    await c.query('SELECT pg_advisory_xact_lock(419035)');
    const existing=(await c.query('SELECT id FROM users WHERE email=$1 FOR UPDATE',[address])).rows[0];
    if(command==='create' && existing) throw new Error('La cuenta ya existe. Usá reset.');
    if(command==='reset' && !existing) throw new Error('La cuenta no existe.');
    const id=existing?.id||randomUUID();
    if(existing) await c.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hashed,id]);
    else await c.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'admin')",[id,name,address,hashed]);
    await c.query('DELETE FROM sessions WHERE user_id=$1',[id]);await c.query('DELETE FROM password_resets WHERE user_id=$1',[id]);
    await c.query('INSERT INTO audit(user_id,entity,entity_id,action,after_data) VALUES($1,\'users\',$1,$2,$3)',[id,existing?'local_password_reset':'bootstrap',{email:address,local_operator:true,password_changed:true}]);
  }); console.log('Cuenta actualizada. No se mostró ni guardó la contraseña en logs.');
} catch(e){console.error(e.message);process.exitCode=1;} finally {await pool.end();}
