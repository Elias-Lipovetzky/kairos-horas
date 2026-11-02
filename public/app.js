const $=(s,root=document)=>root.querySelector(s), $$=(s,root=document)=>[...root.querySelectorAll(s)];
const app=$('#app'),modal=$('#modal');
let user=null,catalog={employees:[],places:[],owners:[]},users=[],view='load',activeEntity='employees',recordPage=0,notificationPage=0,auditPage=0;
const newId=()=>crypto.randomUUID?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16));
let draftRows=[{}],draftEmployee='',submissionId=newId(),recordFilters={},notificationFilters={state:'pending'},busy=false;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={create:'Alta',update:'Modificación',delete:'Eliminación',long_duration:'Más de 9 horas',duplicate:'Posible duplicado',overlap:'Superposición'};
const entityNames={employees:'Empleados',places:'Lugares',owners:'Dueños',users:'Usuarios'};
const hours=n=>`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dateLabel=d=>new Intl.DateTimeFormat('es-AR',{weekday:'long',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(d.slice(0,10)+'T12:00:00Z'));
const stamp=d=>new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(d));
async function api(path,options={}) {
  let res;
  try {res=await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json','X-Kairos-Client':'web',...options.headers}});} catch {throw new Error('No hay conexión con el servidor. Conservamos los datos en pantalla; reintentá sin recargar.');}
  const data=await res.json();
  if(!res.ok){ const e=Object.assign(new Error(data.message||'No se pudo completar la operación.'),data,{status:res.status});if(res.status===401&&user){user=null;login();}throw e; }
  return data;
}
function toast(message){const el=$('#toast');el.textContent=message;el.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.style.display='none',5000);}
function showError(e,container=$('#page-error')){if(container){container.textContent=e.message;container.scrollIntoView({block:'nearest'});}else toast(e.message);}
function field(label,html){return `<label>${label}${html}</label>`;}
function input(name,value='',type='text',extra=''){return `<input name="${name}" type="${type}" value="${escape(value)}" ${extra}>`;}
function options(items,selected='',blank='Seleccionar…'){return `<option value="">${blank}</option>`+items.map(i=>`<option value="${escape(i.id)}" ${i.id===selected?'selected':''}>${escape(i.name)}${i.dni?' · '+escape(i.dni):''}${i.active===false?' (inactivo)':''}</option>`).join('');}
function select(name,items,selected='',blank='Seleccionar…',extra=''){return `<select name="${name}" ${extra}>${options(items,selected,blank)}</select>`;}
function formData(form){return Object.fromEntries(new FormData(form));}
function openModal(html){$('#modal-content').innerHTML=html;if(!modal.open)modal.showModal();$$('[data-close]',modal).forEach(b=>b.onclick=()=>modal.close());}
function modalHead(title){return `<div class="modal-head"><h2>${escape(title)}</h2><button type="button" data-close aria-label="Cerrar">✕</button></div>`;}
function handleForm(form,fn){form.onsubmit=async e=>{e.preventDefault();if(form.dataset.busy)return;form.dataset.busy='1';const buttons=$$('button[type=submit]',form);buttons.forEach(b=>b.disabled=true);try{await fn();}catch(err){showError(err,$('.error',form));}finally{delete form.dataset.busy;buttons.forEach(b=>b.disabled=false);}};}
async function login(resetToken=null){
  app.innerHTML=`<main class="login"><div class="brand"><span class="mark">k</span> kairos<span class="badge">HORAS</span></div><div class="card"><div class="eyebrow">Gestión de jornadas</div><h1>${resetToken?'Nueva contraseña':'Tu equipo, su tiempo.'}</h1><p class="muted">${resetToken?'Elegí una contraseña de al menos 12 caracteres.':'Ingresá para registrar y consultar las horas de trabajo.'}</p><form id="login-form">${resetToken?'':field('Correo',input('email','','email','required autocomplete="username"'))}${field('Contraseña',input('password','','password',`required ${resetToken?'minlength="12" autocomplete="new-password"':'autocomplete="current-password"'}`))}<div class="error" role="alert"></div><button type="submit" class="primary">${resetToken?'Guardar contraseña':'Ingresar'}</button></form>${resetToken?'':'<button class="quiet" id="forgot">Olvidé mi contraseña</button>'}</div><footer>Kairos · Registro de horas de trabajo</footer></main>`;
  handleForm($('#login-form'),async()=>{
    const data=formData($('#login-form'));
    if(resetToken){await api('/reset-password',{method:'POST',body:JSON.stringify({...data,token:resetToken})});history.replaceState(null,'',location.pathname);toast('Contraseña actualizada.');return login();}
    user=await api('/login',{method:'POST',body:JSON.stringify(data)});await loadCatalog();shell();
  });
  if($('#forgot'))$('#forgot').onclick=async()=>{
    openModal(`${modalHead('Recuperar acceso')}<p class="muted">Te enviaremos un enlace si tu cuenta está activa y el correo está configurado.</p><form id="recover-form">${field('Correo',input('email','','email','required'))}<div class="error" role="alert"></div><button class="primary" type="submit">Enviar enlace</button></form>`);
    handleForm($('#recover-form'),async()=>{const r=await api('/forgot-password',{method:'POST',body:JSON.stringify(formData($('#recover-form')))});modal.close();toast(r.message);});
  };
}
async function loadCatalog(){catalog=await api('/catalog');}
function shell(){
  app.innerHTML=`${navigator.onLine?'':'<div class="network">Sin conexión. Es necesario conectarse para guardar.</div>'}<header class="topbar"><div class="brand"><span class="mark">k</span> kairos <span class="badge">HORAS</span></div><div class="account"><span class="user-name">${escape(user.name)} · ${user.role==='admin'?'Administrador':'RR. HH.'}</span><button class="quiet" id="logout">Salir</button></div></header><main class="workspace"><nav class="nav" aria-label="Principal">${[['load','Cargar horas'],['records','Registros'],...(user.role==='admin'?[['notifications','Notificaciones'],['catalog','Administración'],['audit','Historial']]:[])].map(([key,label])=>`<button data-view="${key}" class="${view===key?'selected':''}">${label}</button>`).join('')}</nav><div id="page-error" class="error" role="alert"></div><div id="page"></div><footer class="page">Kairos · Horarios de Argentina · Los cambios quedan registrados con tu usuario.</footer></main>`;
  $$('[data-view]').forEach(b=>b.onclick=()=>{if(busy)return;captureDraft();view=b.dataset.view;shell();});
  $('#logout').onclick=async()=>{if(draftRows.some(r=>r.place_id)&&!confirm('Hay filas sin guardar. ¿Querés cerrar sesión y descartarlas?'))return;try{await api('/logout',{method:'POST'});user=null;draftRows=[{}];draftEmployee='';login();}catch(e){showError(e);}};
  ({load:renderLoad,records:renderRecords,notifications:renderNotifications,catalog:renderCatalog,audit:renderAudit}[view])();
}
function captureDraft(){if(!$('#batch-form'))return;draftEmployee=$('[name=employee_id]',$('#batch-form')).value;draftRows=$$('.entry',$('#batch-form')).map(el=>Object.fromEntries($$('input,select',el).map(i=>[i.name,i.value])));}
function rowHtml(r,i){const timed=r.mode==='times'||r.start_time;return `<div class="entry" data-row="${i}"><div class="entry-head"><span class="badge">REGISTRO ${i+1}</span><button type="button" class="quiet danger" data-remove="${i}" aria-label="Quitar registro ${i+1}">Quitar</button></div><div class="entry-grid">${field('Lugar',select('place_id',catalog.places.filter(x=>x.active||x.id===r.place_id),r.place_id,'Elegir lugar','required'))}${field('Fecha',input('date',r.date||day(),'date',`required max="${day()}"`))}${field('Modalidad',`<select name="mode"><option value="duration" ${!timed?'selected':''}>Solo duración</option><option value="times" ${timed?'selected':''}>Entrada y salida</option></select>`)}${timed?field('Entrada',input('start_time',r.start_time||'','time','required'))+field('Salida',input('end_time',r.end_time||'','time','required'))+field('Total',input('calculated','','text','readonly tabindex="-1"')):field('Horas',input('hours',r.hours??'','number','required min="0" max="35791394" step="1" inputmode="numeric"'))+field('Minutos',input('remainder',r.remainder??'0','number','required min="0" max="59" step="1" inputmode="numeric"'))}</div><div class="error row-error" role="alert"></div></div>`;}
function renderLoad(){
  $('#page').innerHTML=`<header class="section"><div><div class="eyebrow">Registro diario</div><h1>Cargar horas</h1><div class="muted">Una persona, todos sus lugares.</div></div><span class="badge">NUEVO LOTE</span></header><form id="batch-form"><section class="card"><h2>¿Quién trabajó?</h2><div class="employee-picker">${field('Empleado · nombre o DNI',`<input id="employee-search" type="search" placeholder="Buscar empleado…" aria-label="Buscar empleado por nombre o DNI">${select('employee_id',catalog.employees.filter(e=>e.active),draftEmployee,'Seleccionar empleado','required')}`)}</div>${catalog.employees.some(e=>e.active)&&catalog.places.some(p=>p.active)?'':'<div class="notice">Un administrador debe crear empleados y lugares activos antes de cargar horas.</div>'}</section><section class="card"><h2>Lugares y horas</h2><p class="muted">Ingresá la duración o los horarios de cada registro.</p><div id="entries">${draftRows.map(rowHtml).join('')}</div><button type="button" id="add-row" class="quiet">＋ Agregar otro lugar</button><div class="error form-error" role="alert"></div><div id="batch-warnings"></div><div class="summary"><div><small>TOTAL DEL LOTE</small><div id="batch-total" class="total">0:00 <small>h</small></div></div><div class="actions"><button type="submit" class="primary" id="save-batch">Guardar registros</button></div></div></section></form>`;
  const form=$('#batch-form');
  $('#employee-search').oninput=e=>{const selected=$('[name=employee_id]',form).value,q=e.target.value.toLowerCase();$('[name=employee_id]',form).innerHTML=options(catalog.employees.filter(x=>x.active&&(x.name.toLowerCase().includes(q)||x.dni.includes(q)||x.id===selected)),selected);};
  $('#add-row').onclick=()=>{captureDraft();if(draftRows.length>=100)return toast('El máximo es 100 filas por lote.');draftRows.push({date:draftRows.at(-1)?.date||day()});renderLoad();};
  $$('[data-remove]').forEach(b=>b.onclick=()=>{captureDraft();draftRows.splice(Number(b.dataset.remove),1);if(!draftRows.length)draftRows=[{}];renderLoad();});
  $$('[name=mode]',form).forEach(el=>el.onchange=()=>{captureDraft();const i=Number(el.closest('.entry').dataset.row);draftRows[i]={...draftRows[i],start_time:'',end_time:''};renderLoad();});
  form.oninput=()=>{updateTotals();$('#batch-warnings').innerHTML='';};updateTotals();
  handleForm(form,async()=>{captureDraft();await saveBatch();});
}
function rowPayload(el,employee){const values=Object.fromEntries($$('input,select',el).map(i=>[i.name,i.value]));return {employee_id:employee,place_id:values.place_id,date:values.date,start_time:values.mode==='times'?values.start_time:null,end_time:values.mode==='times'?values.end_time:null,minutes:Number(values.hours||0)*60+Number(values.remainder||0)};}
function updateTotals(){let total=0;$$('.entry').forEach(el=>{const r=rowPayload(el,'');let minutes=r.minutes;if(r.start_time&&r.end_time){const toMin=s=>Number(s.slice(0,2))*60+Number(s.slice(3));minutes=toMin(r.end_time)-toMin(r.start_time);}if($('[name=calculated]',el))$('[name=calculated]',el).value=minutes>0?hours(minutes):'—';total+=Math.max(0,minutes||0);});if($('#batch-total'))$('#batch-total').innerHTML=`${hours(total)} <small>h</small>`;}
function warningHtml(warnings){return `<div class="warning"><strong>Revisá antes de guardar</strong><ul>${warnings.map(w=>`<li>${w.row!==undefined?'Fila '+(w.row+1)+': ':''}${escape(w.message)}</li>`).join('')}</ul><p>Podés guardar estos registros si los datos son correctos.</p><button type="button" id="confirm-warnings">Confirmar y guardar</button></div>`;}
async function saveBatch(warningToken){
  if(busy)return;busy=true;const form=$('#batch-form'),button=$('#save-batch');button.disabled=true;
  const payload={submission_id:submissionId,records:$$('.entry',form).map(el=>rowPayload(el,$('[name=employee_id]',form).value)),warning_token:warningToken};
  const controls=$$('input,select,button',form);controls.forEach(el=>el.disabled=true);
  $$('.row-error',form).forEach(el=>el.textContent='');$('.form-error',form).textContent='';
  try{const r=await api('/records/batch',{method:'POST',body:JSON.stringify(payload)});toast(r.message);draftRows=[{}];submissionId=newId();renderLoad();}
  catch(e){if(e.reset_submission)submissionId=newId();if(e.warnings){$('#batch-warnings').innerHTML=warningHtml(e.warnings);$('#confirm-warnings').onclick=()=>saveBatch(e.warning_token);}else{showError(e,$('.form-error',form));e.errors?.forEach(error=>{const el=$(`.entry[data-row="${error.row}"] .row-error`);if(el)el.textContent=error.message;});}}
  finally{busy=false;controls.forEach(el=>el.disabled=false);button.disabled=false;}
}
function filterHtml(values,notifications=false){return `<div class="filters">${field('Empleado',select('employee_id',catalog.employees,values.employee_id,'Todos'))}${field('Lugar',select('place_id',catalog.places,values.place_id,'Todos'))}${field(notifications?'Notificaciones desde':'Desde',input('from',values.from||'','date'))}${field('Hasta',input('to',values.to||'','date'))}${notifications?field('Motivo',`<select name="reason"><option value="">Todos</option>${Object.entries(names).map(([k,v])=>`<option value="${k}" ${values.reason===k?'selected':''}>${v}</option>`).join('')}</select>`)+field('Estado',`<select name="state"><option value="">Todos</option><option value="pending" ${values.state==='pending'?'selected':''}>Pendientes</option><option value="reviewed" ${values.state==='reviewed'?'selected':''}>Revisados</option></select>`)+field('Usuario',select('user_id',users,values.user_id,'Todos')):''}</div>`;}
function query(values){return new URLSearchParams(Object.entries(values).filter(([,v])=>v!==''&&v!==undefined)).toString();}
function pager(page,count){return `<div class="pager"><button id="previous" ${page===0?'disabled':''}>Anterior</button><span>Página ${page+1} · ${count} resultados</span><button id="next" ${(page+1)*50>=count?'disabled':''}>Siguiente</button></div>`;}
async function renderRecords(){
  $('#page').innerHTML=`<header class="section"><div><div class="eyebrow">Consulta y reportes</div><h1>Registros</h1><span class="muted">Buscá, corregí y compartí las horas registradas.</span></div></header><section class="card"><form id="filters">${filterHtml(recordFilters)}<div class="actions"><button type="submit" class="primary">Buscar</button><button type="button" id="export-xlsx">Excel</button><button type="button" id="export-pdf">PDF</button></div></form></section><section class="card" id="results"><p class="muted">Cargando registros…</p></section>`;
  handleForm($('#filters'),async()=>{recordFilters=formData($('#filters'));recordPage=0;await renderRecords();});
  for(const format of ['xlsx','pdf'])$('#export-'+format).onclick=()=>download(format);
  try{
    const data=await api('/records?'+query({...recordFilters,page:recordPage}));
    if(view!=='records')return;
    $('#results').innerHTML=`<header class="section"><h2>${data.count} registros</h2><div><small>TOTAL FILTRADO</small><div class="total">${hours(data.minutes)} <small>h</small></div></div></header>${data.records.length?data.records.map(r=>`<article class="record"><div class="record-info"><h3>${escape(r.employee_name)} <small>· ${escape(r.dni)}</small></h3><p>${escape(r.place_name)}</p><small>${escape(dateLabel(r.date))}${r.start_time?' · '+r.start_time+' a '+r.end_time:' · Solo duración'}</small></div><div class="record-right"><div class="total">${hours(r.minutes)} <small>h</small></div><div class="actions"><button data-edit="${r.id}">Editar</button><button data-history="${r.id}">Historial</button><button class="danger" data-delete="${r.id}">Eliminar</button></div></div></article>`).join(''):'<div class="empty">No hay registros para estos filtros.</div>'}${pager(recordPage,data.count)}`;
    $('#previous').onclick=()=>{recordPage--;renderRecords();};$('#next').onclick=()=>{recordPage++;renderRecords();};
    $$('[data-edit]').forEach(b=>b.onclick=()=>editRecord(data.records.find(r=>r.id===b.dataset.edit)));
    $$('[data-history]').forEach(b=>b.onclick=()=>historyModal(b.dataset.history));
    $$('[data-delete]').forEach(b=>b.onclick=async()=>{const r=data.records.find(r=>r.id===b.dataset.delete);if(!confirm(`¿Eliminar el registro de ${r.employee_name} en ${r.place_name}? Se conservará el historial.`))return;b.disabled=true;try{const result=await api('/records/'+r.id,{method:'DELETE',body:JSON.stringify({version:r.version})});toast(result.message);renderRecords();}catch(e){showError(e);b.disabled=false;}});
  }catch(e){showError(e);if($('#results'))$('#results').innerHTML='<div class="empty">No pudimos cargar los registros.</div>';}
}
async function download(format){
  try{
    const filters=formData($('#filters'));const response=await fetch('/api/export/'+format+'?'+query(filters));
    if(!response.ok){const error=await response.json();throw new Error(error.message);}
    const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download='kairos-horas.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(e){showError(e);}
}
function editRecord(record){
  const r={...record,mode:record.start_time?'times':'duration',hours:Math.floor(record.minutes/60),remainder:record.minutes%60};
  function renderEdit(){
    openModal(`${modalHead('Editar registro')}<form id="edit-form">${field('Empleado',select('employee_id',catalog.employees.filter(e=>e.active||e.id===r.employee_id),r.employee_id,'Seleccionar','required'))}${rowHtml(r,0)}<div class="error form-error" role="alert"></div><div id="edit-warnings"></div><div class="actions"><button type="button" data-close>Cancelar</button><button type="submit" class="primary">Guardar cambios</button></div></form>`);
    $('[data-remove]',modal).remove();const form=$('#edit-form');
    $('[name=mode]',form).onchange=()=>{Object.assign(r,Object.fromEntries($$('input,select',form).map(i=>[i.name,i.value])));r.start_time='';r.end_time='';renderEdit();};
    form.oninput=()=>{$('#edit-warnings').innerHTML='';updateTotals();};updateTotals();
    const save=async warning_token=>{
      const payload={...rowPayload($('.entry',form),$('[name=employee_id]',form).value),version:record.version,warning_token};
      try{await api('/records/'+record.id,{method:'PUT',body:JSON.stringify(payload)});modal.close();toast('Registro actualizado.');renderRecords();}
      catch(e){if(e.warnings){$('#edit-warnings').innerHTML=warningHtml(e.warnings);$('#confirm-warnings').onclick=async()=>{if(form.dataset.busy)return;form.dataset.busy='1';try{await save(e.warning_token);}finally{delete form.dataset.busy;}};}else showError(e,$('.form-error',form));}
    };
    handleForm(form,()=>save());
  }renderEdit();
}
const fieldNames={employee_id:'Empleado',place_id:'Lugar',date:'Fecha',start_time:'Entrada',end_time:'Salida',minutes:'Duración',deleted_at:'Eliminado',name:'Nombre',dni:'DNI',phone:'Teléfono',address:'Dirección',email:'Correo',role:'Rol',active:'Activo',owners:'Dueños',password_changed:'Contraseña modificada',local_operator:'Operación local'};
function snapshot(data){if(!data)return '<p class="muted">Sin datos</p>';return `<dl>${Object.entries(data).filter(([key])=>fieldNames[key]).map(([k,v])=>{let value=v;if(k==='employee_id')value=catalog.employees.find(e=>e.id===v)?.name||v;if(k==='place_id')value=catalog.places.find(p=>p.id===v)?.name||v;if(k==='minutes')value=hours(v);if(k==='owners')value=v.map(o=>(catalog.owners.find(p=>p.id===o.owner_id)?.name||o.owner_id)+(o.is_primary?' (principal)':'')).join(', ');if(k==='deleted_at'&&v)value=stamp(v);return `<dt>${fieldNames[k]}</dt><dd>${escape(typeof value==='boolean'?(value?'Sí':'No'):value??'—')}</dd>`;}).join('')}</dl>`;}
function changes(before,after){return `<div class="changes"><div><strong>Antes</strong>${snapshot(before)}</div><div><strong>Después</strong>${snapshot(after)}</div></div>`;}
async function historyModal(id){
  openModal(`${modalHead('Historial del registro')}<p>Cargando…</p>`);
  try{const rows=await api('/records/'+id+'/history');openModal(`${modalHead('Historial del registro')}<small>ID: ${escape(id)}</small>${rows.map(r=>`<div class="history"><strong>${escape(names[r.action]||r.action)}</strong><p>${escape(r.user_name)} · ${escape(r.user_email)}<br>${stamp(r.created_at)}</p>${changes(r.before_data,r.after_data)}</div>`).join('')||'<p>Sin historial.</p>'}`);}catch(e){showError(e);modal.close();}
}
async function renderNotifications(){
  try{users=await api('/users');}catch(e){return showError(e);}
  if(view!=='notifications')return;
  $('#page').innerHTML=`<header class="section"><div><div class="eyebrow">Seguimiento</div><h1>Notificaciones</h1><span class="muted">Filtrá por motivo y revisá cada cambio.</span></div></header><section class="card"><form id="notification-filters">${filterHtml(notificationFilters,true)}<div class="actions"><button type="submit" class="primary">Aplicar filtros</button></div></form></section><section class="card" id="notifications-list">Cargando…</section>`;
  handleForm($('#notification-filters'),async()=>{notificationFilters=formData($('#notification-filters'));notificationPage=0;await renderNotifications();});
  try{
    const data=await api('/notifications?'+query({...notificationFilters,page:notificationPage}));if(view!=='notifications')return;
    $('#notifications-list').innerHTML=`<h2>${data.count} notificaciones</h2>${data.notifications.map(n=>`<article class="record"><div class="record-info"><span class="badge ${['duplicate','overlap','long_duration'].includes(n.reason)?'warn':''}">${escape(names[n.reason]||n.reason)}</span><h3>${escape(n.employee_name)} · ${escape(n.place_name)}</h3><p>${escape(n.user_name)} · ${stamp(n.created_at)}</p><small>Registro: ${escape(n.record_date)} ${n.deleted_at?'· Eliminado':''}</small><details><summary>Ver cambio</summary>${changes(n.before_data,n.after_data)}</details></div><div class="record-right"><div class="actions"><button data-history="${n.record_id}">Historial</button>${n.reviewed_at?'<span class="badge off">Revisado</span>':`<button data-review="${n.id}">Marcar revisado</button>`}</div></div></article>`).join('')||'<div class="empty">No hay notificaciones para estos filtros.</div>'}${pager(notificationPage,data.count)}`;
    $('#previous').onclick=()=>{notificationPage--;renderNotifications();};$('#next').onclick=()=>{notificationPage++;renderNotifications();};
    $$('[data-history]').forEach(b=>b.onclick=()=>historyModal(b.dataset.history));
    $$('[data-review]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('/notifications/'+b.dataset.review+'/review',{method:'POST'});renderNotifications();}catch(e){showError(e);b.disabled=false;}});
  }catch(e){showError(e);}
}
async function renderCatalog(){
  try{await loadCatalog();users=await api('/users');if(view!=='catalog')return;
    const items=activeEntity==='users'?users:catalog[activeEntity];
    $('#page').innerHTML=`<header class="section"><div><div class="eyebrow">Datos del equipo</div><h1>Administración</h1></div><button id="new-entity" class="primary">＋ Agregar</button></header><div class="row tabs">${Object.entries(entityNames).map(([k,v])=>`<button data-entity="${k}" class="${activeEntity===k?'primary':''}">${v}</button>`).join('')}</div><section class="card"><label>Buscar<input type="search" id="catalog-search" placeholder="Nombre, DNI o correo"></label><div id="catalog-list"></div></section>`;
    const list=q=>{$('#catalog-list').innerHTML=items.filter(i=>(i.name+' '+(i.dni||i.email||'')).toLowerCase().includes(q)).map(i=>`<article class="record"><div class="record-info"><h3>${escape(i.name)} <span class="badge ${i.active?'':'off'}">${i.active?'Activo':'Inactivo'}</span></h3><p class="muted">${escape(i.dni||i.email||i.address||i.phone||'')}${i.role?' · '+(i.role==='admin'?'Administrador':'RR. HH.') :''}</p>${i.owners?`<small>${i.owners.map(o=>escape(o.name)+(o.is_primary?' (principal)':'')).join(', ')}</small>`:''}</div><button data-catalog-edit="${i.id}">Editar</button></article>`).join('')||'<div class="empty">Sin resultados. Agregá el primer registro.</div>';
      $$('[data-catalog-edit]').forEach(b=>b.onclick=()=>editEntity(items.find(i=>i.id===b.dataset.catalogEdit)));
    };list('');$('#catalog-search').oninput=e=>list(e.target.value.toLowerCase());
    $$('[data-entity]').forEach(b=>b.onclick=()=>{activeEntity=b.dataset.entity;renderCatalog();});$('#new-entity').onclick=()=>editEntity();
  }catch(e){showError(e);}
}
function editEntity(item={}){
  const entity=activeEntity;
  openModal(`${modalHead((item.id?'Editar · ':'Agregar · ')+entityNames[entity])}<form id="entity-form"><div class="grid">${field('Nombre *',input('name',item.name||'','text','required maxlength="200"'))}${entity==='employees'?field('DNI *',input('dni',item.dni||'','text','required inputmode="numeric" maxlength="20"')):''}${['employees','owners'].includes(entity)?field('Teléfono',input('phone',item.phone||'','tel','maxlength="200"')):''}${entity==='places'?field('Dirección',input('address',item.address||'','text','maxlength="200"')):''}${entity==='users'?field('Correo *',input('email',item.email||'','email','required'))+field('Rol',`<select name="role"><option value="rrhh" ${item.role!=='admin'?'selected':''}>Recursos Humanos</option><option value="admin" ${item.role==='admin'?'selected':''}>Administrador</option></select>`)+field(item.id?'Nueva contraseña (opcional)':'Contraseña inicial *',input('password','','password',`${item.id?'':'required'} minlength="12" maxlength="200" autocomplete="new-password"`)):''}</div>${entity==='places'?`<h3>Dueños *</h3><p class="muted">Seleccioná los dueños y uno principal.</p>${catalog.owners.filter(o=>o.active||item.owners?.some(v=>v.owner_id===o.id)).map(o=>`<div class="owner-choice"><input aria-label="Asociar a ${escape(o.name)}" type="checkbox" name="owner" value="${o.id}" ${item.owners?.some(v=>v.owner_id===o.id)?'checked':''}><span>${escape(o.name)}</span><label><input type="radio" name="primary" value="${o.id}" ${item.owners?.some(v=>v.owner_id===o.id&&v.is_primary)?'checked':''}> Principal</label></div>`).join('')||'<p class="warning">Creá un dueño antes de agregar lugares.</p>'}`:''}<p><label class="checkline"><input type="checkbox" name="active" ${item.active!==false?'checked':''}> Activo</label></p><div class="error" role="alert"></div><div class="actions"><button type="button" data-close>Cancelar</button><button type="submit" class="primary">Guardar</button></div></form>`);
  handleForm($('#entity-form'),async()=>{const form=$('#entity-form'),data=formData(form);data.active=$('[name=active]',form).checked;
    if(entity==='places'){data.owners=$$('[name=owner]:checked',form).map(i=>({owner_id:i.value,is_primary:i.value===data.primary}));delete data.primary;delete data.owner;}
    if(!data.password)delete data.password;
    await api((entity==='users'?'/users':'/catalog/'+entity)+(item.id?'/'+item.id:''),{method:item.id?'PUT':'POST',body:JSON.stringify(data)});modal.close();toast('Datos guardados.');await renderCatalog();
  });
}
async function renderAudit(){
  $('#page').innerHTML=`<header class="section"><div><div class="eyebrow">Trazabilidad</div><h1>Historial general</h1><p class="muted">Altas, cambios y eliminaciones, atribuidos a cada usuario.</p></div></header><section class="card" id="audit-list">Cargando…</section>`;
  try{const rows=await api('/audit?page='+auditPage);if(view!=='audit')return;$('#audit-list').innerHTML=rows.map(r=>`<div class="history"><strong>${escape(names[r.action]||r.action)} · ${escape(entityNames[r.entity]||'Registros')}</strong><p>${escape(r.user_name)} · ${stamp(r.created_at)}</p><details><summary>Ver detalle</summary>${changes(r.before_data,r.after_data)}</details>${r.entity==='records'?`<button data-history="${r.entity_id}">Historial del registro</button>`:''}</div>`).join('')||'<div class="empty">Sin movimientos.</div>';$('#audit-list').insertAdjacentHTML('beforeend',`<div class="pager"><button id="previous" ${auditPage===0?'disabled':''}>Anterior</button><span>Página ${auditPage+1}</span><button id="next" ${rows.length<50?'disabled':''}>Siguiente</button></div>`);$('#previous').onclick=()=>{auditPage--;renderAudit();};$('#next').onclick=()=>{auditPage++;renderAudit();};$$('[data-history]').forEach(b=>b.onclick=()=>historyModal(b.dataset.history));}catch(e){showError(e);}
}
window.addEventListener('beforeunload',e=>{captureDraft();if(user&&draftRows.some(r=>r.place_id)){e.preventDefault();e.returnValue='';}});
window.addEventListener('offline',()=>toast('Sin conexión. No recargues la página si tenés datos sin guardar.'));
window.addEventListener('online',()=>toast('Conexión restablecida. Podés reintentar el guardado.'));
async function boot(){
  const reset=location.hash.match(/^#reset=([a-f0-9]{64})$/)?.[1];if(reset)return login(reset);
  try{user=await api('/me');await loadCatalog();shell();}catch(e){if(e.status!==401)toast(e.message);user=null;login();}
}
boot();
