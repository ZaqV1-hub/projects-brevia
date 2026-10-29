import { passwordRules, passwordError } from '/password-policy.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials=n=>n.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
const date=s=>new Date(s).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
let me=null,csrf='',prototypes=[],users=[],clients=[],page='home',modalFocus=null,noticeTimer;
async function api(path,options={}) {
  const headers={...options.headers};
  if(options.body&&!(options.body instanceof FormData)){headers['Content-Type']='application/json';options.body=JSON.stringify(options.body);}
  if(options.method&&options.method!=='GET')headers['X-CSRF-Token']=csrf;
  const response=await fetch(path,{...options,headers,credentials:'same-origin',cache:'no-store'});
  const data=await response.json();
  if(!response.ok){if(response.status===401&&me)showLogin();throw new Error(data.error||'Não foi possível concluir.');}
  return data;
}
function notify(message){$('#notice').textContent=message;$('#notice').classList.add('visible');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').classList.remove('visible'),5000);}
function showLogin(){me=null;csrf='';closeViewer();closeModal(true);$('#app').classList.add('hidden');$('#login').classList.remove('hidden');$('#pass').value='';prototypes=[];users=[];clients=[];$('#grid').replaceChildren();$('#protoRows').replaceChildren();$('#userRows').replaceChildren();}
async function enter(data){me=data.user;csrf=data.csrf;$('#login').classList.add('hidden');$('#app').classList.remove('hidden');$('#meName').innerHTML=`${esc(me.name)}<small>${esc(me.company)}</small>`;$('#meAvatar').textContent=initials(me.name);$('#navAdmin').classList.toggle('hidden',me.role!=='admin');if(me.mustChange){changePassword(true);return;}await refresh();go('home');}
async function refresh(){prototypes=await api('/api/prototypes');if(me.role==='admin'){[users,clients]=await Promise.all([api('/api/admin/users'),api('/api/admin/clients')]);}else{users=[];clients=[];}renderHome();if(me.role==='admin')renderAdmin();}
function setLoginError(message){$('#loginErr').textContent=message;for(const id of ['email','pass']){const input=$('#'+id);input.classList.toggle('password-invalid',!!message);input.setAttribute('aria-invalid',String(!!message));input.setAttribute('aria-describedby','loginErr');}}
$('#loginForm').noValidate=true;
$('#email').oninput=$('#pass').oninput=()=>setLoginError('');
$('#loginForm').onsubmit=async e=>{e.preventDefault();if(!$('#email').validity.valid){setLoginError('Informe um e-mail válido.');$('#email').focus();return;}if(!$('#pass').value){setLoginError('Informe sua senha.');$('#pass').focus();return;}const b=e.submitter;b.disabled=true;setLoginError('');try{await enter(await api('/api/login',{method:'POST',body:{email:$('#email').value,password:$('#pass').value}}));$('#pass').value='';}catch(err){setLoginError(err.message);}finally{b.disabled=false;}};
$('#logout').onclick=async()=>{try{await api('/api/logout',{method:'POST'});showLogin();}catch(e){notify(e.message);}};
const passwordButton=document.createElement('button');passwordButton.className='btn btn-dark-ghost btn-sm';passwordButton.textContent='Trocar senha';passwordButton.onclick=()=>changePassword(false);$('.me').insertBefore(passwordButton,$('#logout'));
function go(p){if(p==='admin'&&me.role!=='admin')return;page=p;document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.page===p));$('#page-home').classList.toggle('hidden',p!=='home');$('#page-admin').classList.toggle('hidden',p!=='admin');window.scrollTo(0,0);}
$('#nav').onclick=e=>{const b=e.target.closest('[data-page]');if(b)go(b.dataset.page);};
$('#q').setAttribute('aria-label','Buscar protótipo');$('#q').oninput=renderHome;
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function renderHome(){
  const q=normalize($('#q').value.trim()),list=prototypes.filter(p=>normalize(p.title+' '+p.client+' '+p.description).includes(q));
  $('#hello').textContent=`Olá, ${me.name}`;$('#homeLead').textContent=`${prototypes.length} ${prototypes.length===1?'protótipo disponível':'protótipos disponíveis'} para você.`;
  $('#grid').innerHTML=list.length?list.map(p=>`<article class="card" data-open="${p.id}" tabindex="0" role="button" aria-label="Abrir ${esc(p.title)}"><div class="thumb"><iframe src="/api/prototypes/${p.id}/content?preview=1" sandbox="allow-scripts" loading="lazy" tabindex="-1" aria-hidden="true" title="Miniatura de ${esc(p.title)}"></iframe><div class="open"><span>Abrir protótipo</span></div></div><div class="card-body"><div><span class="pill">${esc(p.client)}</span></div><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><div class="card-foot"><span>Atualizado em ${date(p.updated)} · v${p.version}</span><b>Abrir →</b></div></div></article>`).join(''):`<div class="empty" style="grid-column:1/-1"><h3>${q?'Nada encontrado':'Ainda não há protótipos para você'}</h3><p class="muted">${q?'Tente outro termo de busca.':'Assim que a Brevia liberar um protótipo, ele aparece aqui.'}</p></div>`;
}
$('#grid').onclick=e=>{const c=e.target.closest('[data-open]');if(c)openViewer(c.dataset.open);};
$('#grid').onkeydown=e=>{if(e.target.matches('[data-open]')&&['Enter',' '].includes(e.key)){e.preventDefault();openViewer(e.target.dataset.open);}};
function openViewer(id){const p=prototypes.find(p=>p.id===id);if(!p)return;$('#vTitle').textContent=p.title;$('#vSub').textContent=`${p.client} · v${p.version}`;$('#vVer').textContent=`Atualizado em ${date(p.updated)}`;$('#vIframe').src=`/api/prototypes/${p.id}/content`;$('#viewer').dataset.id=id;$('#viewer').classList.remove('hidden');setDevice('desktop');document.body.style.overflow='hidden';$('#vBack').focus();}
function closeViewer(){$('#viewer').classList.add('hidden');$('#vIframe').src='about:blank';document.body.style.overflow='';if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}
function setDevice(d){$('#vFrame').className='frame '+(d==='desktop'?'':d);document.querySelectorAll('#vSeg button').forEach(b=>b.classList.toggle('on',b.dataset.d===d));}
$('#vBack').onclick=closeViewer;$('#vSeg').onclick=e=>{const b=e.target.closest('[data-d]');if(b)setDevice(b.dataset.d);};
$('#vReload').onclick=()=>{$('#vIframe').src=`/api/prototypes/${$('#viewer').dataset.id}/content?t=${Date.now()}`;};
$('#vFull').onclick=async()=>{try{document.fullscreenElement?await document.exitFullscreen():await $('#viewer').requestFullscreen();}catch{notify('Tela cheia indisponível neste navegador.');}};
document.querySelectorAll('.icon-btn').forEach(b=>b.setAttribute('aria-label',b.title));
document.querySelectorAll('#vSeg button').forEach(b=>b.setAttribute('aria-label',b.textContent.trim()));
document.querySelector('.tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(!b)return;document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));for(const tab of ['protos','clients','people'])$('#tab-'+tab).classList.toggle('hidden',b.dataset.tab!==tab);};
const companyBadges=items=>items.map(c=>`<span class="pill">${esc(c.name)}</span>`).join(' ');
const inheritedPrototypes=u=>prototypes.filter(p=>p.clients.some(c=>u.clients.some(uc=>uc.id===c.id)));
function renderAdmin(){const people=users.filter(u=>u.role==='client');
  $('#stats').innerHTML=`<div class="stat"><small>Protótipos publicados</small><b>${prototypes.length}</b></div><div class="stat"><small>Pessoas ativas</small><b>${people.filter(u=>u.active).length}</b></div><div class="stat"><small>Clientes cadastrados</small><b>${clients.length}</b></div>`;
  $('#protoRows').innerHTML=prototypes.map(p=>`<tr><td><div class="t">${esc(p.title)}</div><div class="sub">Atualizado em ${date(p.updated)}</div></td><td class="hide-m">${companyBadges(p.clients)}</td><td class="hide-m">v${p.version}</td><td>${people.filter(u=>u.active&&inheritedPrototypes(u).some(x=>x.id===p.id)).length} pessoa(s)</td><td><div class="actions"><button class="btn btn-ghost btn-sm" data-view="${p.id}">Ver</button><button class="btn btn-ghost btn-sm" data-acc="${p.id}">Editar / clientes</button><button class="btn btn-ghost btn-sm" data-version="${p.id}">Nova versão</button><button class="btn btn-ghost btn-sm danger" data-delete="${p.id}">Remover</button></div></td></tr>`).join('')||'<tr><td colspan="5">Nenhum protótipo publicado.</td></tr>';
  $('#clientRows').innerHTML=clients.map(c=>`<tr><td><div class="t">${esc(c.name)}</div></td><td>${c.people}</td><td>${c.prototypes}</td><td><div class="actions"><button class="btn btn-ghost btn-sm" data-client="${c.id}">Editar cliente</button></div></td></tr>`).join('')||'<tr><td colspan="4">Adicione as empresas para vincular pessoas e protótipos.</td></tr>';
  $('#userRows').innerHTML=people.map(u=>`<tr><td><div class="t">${esc(u.name)}</div><div class="sub">${esc(u.email)}</div><span class="pill ${u.active?'teal':'pink'}">${u.active?'Ativo':'Desativado'}</span></td><td class="hide-m">${companyBadges(u.clients)}</td><td>${inheritedPrototypes(u).length}</td><td><div class="actions"><button class="btn btn-ghost btn-sm" data-edit="${u.id}">Editar pessoa</button></div></td></tr>`).join('')||'<tr><td colspan="4">Nenhuma pessoa cadastrada.</td></tr>';
}
$('#protoRows').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.view)openViewer(b.dataset.view);if(b.dataset.acc)protoModal(prototypes.find(p=>p.id===b.dataset.acc));if(b.dataset.version)versionModal(prototypes.find(p=>p.id===b.dataset.version));if(b.dataset.delete)deleteModal(prototypes.find(p=>p.id===b.dataset.delete));};
$('#userRows').onclick=e=>{const b=e.target.closest('[data-edit]');if(b)userModal(users.find(u=>u.id===b.dataset.edit));};
$('#btnNewClient').onclick=()=>clientModal();
$('#clientRows').onclick=e=>{const b=e.target.closest('[data-client]');if(b)clientModal(clients.find(c=>c.id===b.dataset.client));};
$('#btnNewUser').onclick=()=>userModal();$('#btnNewProto').onclick=()=>protoModal();
function closeModal(force=false){const root=$('#modalRoot');if(root.dataset.required==='true'&&!force)return;root.replaceChildren();delete root.dataset.required;document.body.style.overflow='';modalFocus?.focus();}
function modal(title,lead,body,onSave,{required=false,saveLabel='Salvar'}={}){
  modalFocus=document.activeElement;$('#modalRoot').dataset.required=String(required);
  $('#modalRoot').innerHTML=`<div class="modal-bg"><form class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-head"><p class="eyebrow v">Brevia · Protótipos</p><h2 class="h1" id="modalTitle">${esc(title)}</h2><p class="lead">${esc(lead)}</p></div><div class="modal-body">${body}<p class="login-err" id="modalError" role="alert"></p></div><div class="modal-foot">${required?'':'<button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>'}<button class="btn btn-primary" type="submit">${esc(saveLabel)}</button></div></form></div>`;
  document.body.style.overflow='hidden';const form=$('#modalRoot form');
  $('#modalRoot [data-cancel]')?.addEventListener('click',()=>closeModal());
  form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('[type=submit]');b.disabled=true;form.dataset.saving='true';$('#modalError').textContent='';try{await onSave(form);closeModal(true);if(me&&!me.mustChange)await refresh();}catch(err){if($('#modalError'))$('#modalError').textContent=err.message;else notify(err.message);}finally{b.disabled=false;form.dataset.saving='false';if(form.isConnected)form.dispatchEvent(new Event('input'));}};
  form.querySelector('input,button')?.focus();
}
const field=(id,label,value='',type='text',extra='')=>`<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" name="${id}" type="${type}" value="${esc(value)}" ${extra}></div>`;
function passwordFields(id, confirmationId, label, optional=false) {
  return field(id,label,'','password',`${optional?'':'required'} minlength="12" maxlength="72" autocomplete="new-password" aria-describedby="passwordRequirements passwordLimit"`)
    + `<div class="password-checks" id="passwordRequirements" data-password-checks><p>Sua senha precisa ter:</p><div role="list">${passwordRules.map(rule=>`<div class="password-rule" role="listitem" data-rule="${rule.id}"><span class="rule-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m4 8 3 3 5-6"/></svg></span><span>${esc(rule.label)}</span><span class="sr-only" data-rule-state>Não atendido</span></div>`).join('')}</div><p class="password-feedback error" id="passwordLimit" hidden></p></div>`
    + field(confirmationId,'Confirme a nova senha','','password',`${optional?'':'required'} maxlength="72" autocomplete="new-password" aria-describedby="passwordMatch"`)
    + '<p class="password-feedback" id="passwordMatch" role="status" aria-live="polite">Repita a senha para confirmar.</p>';
}
function wirePassword(id, confirmationId, {optional=false,currentId}={}) {
  const input=$('#'+id),confirmation=$('#'+confirmationId),form=input.form,button=form.querySelector('[type=submit]');
  const update=()=>{
    const value=input.value,confirm=confirmation.value,empty=!value&&!confirm;
    for(const rule of passwordRules){const row=form.querySelector(`[data-rule="${rule.id}"]`),valid=rule.test(value);row.classList.toggle('met',valid);row.querySelector('[data-rule-state]').textContent=valid?'Atendido':'Não atendido';}
    const tooLong=new TextEncoder().encode(value).length>72;
    $('#passwordLimit').hidden=!tooLong;$('#passwordLimit').textContent=tooLong?'A senha ficou longa demais. Use menos caracteres.':'';
    const same=!!value&&value===confirm,current=currentId?$('#'+currentId).value:null,reused=!!current&&current===value;
    const status=$('#passwordMatch');
    status.className='password-feedback'+(empty?'':same&&!reused?' success':' error');
    status.textContent=empty?'Repita a senha para confirmar.':reused?'Escolha uma senha diferente da atual.':same?'As senhas coincidem.':confirm?'As senhas não coincidem.':'Confirme a nova senha.';
    confirmation.setAttribute('aria-invalid',String(!empty&&(!same||reused)));
    confirmation.classList.toggle('password-invalid',!empty&&(!same||reused));confirmation.classList.toggle('password-valid',same&&!reused);
    input.setCustomValidity(value?passwordError(value):'');confirmation.setCustomValidity(!empty&&!same?'As senhas não coincidem.':reused?'Escolha uma senha diferente da atual.':'');
    button.disabled=form.dataset.saving==='true'||!(optional&&empty||!passwordError(value)&&same&&!reused&&(!currentId||!!current));
  };
  form.addEventListener('input',update);update();
}
const checks=(items,selected)=>`<div class="checks">${items.length?items.map(i=>`<label class="check"><input type="checkbox" name="access" value="${i.id}" ${selected.includes(i.id)?'checked':''}><div><div class="t">${esc(i.title||i.name)}</div><div class="sub">${esc(i.client||i.company)}${i.active===false?' · desativado':''}</div></div></label>`).join(''):'<p class="muted">Nenhum item disponível. Você pode definir os acessos depois.</p>'}</div>`;
const selected=form=>[...form.querySelectorAll('[name=access]:checked')].map(x=>x.value);
function clientModal(client){modal(client?'Editar cliente':'Adicionar cliente','Cadastre a empresa uma única vez para selecionar nos protótipos e nas pessoas.',field('clientName','Nome da empresa',client?.name||'','text','required maxlength="200"'),async()=>{await api('/api/admin/clients'+(client?'/'+client.id:''),{method:client?'PATCH':'POST',body:{name:$('#clientName').value}});notify(client?'Cliente atualizado.':'Cliente cadastrado.');});}
function clientSelection(ids){return `<div class="field"><label>Clientes</label><p class="muted">Selecione uma ou mais empresas cadastradas.</p>${checks(clients,ids)}${clients.length?'':'<p class="muted">Cadastre as empresas na aba Clientes primeiro.</p>'}</div>`;}
function userModal(u) {
  modal(u?'Editar pessoa':'Criar login',u?'A pessoa recebe os protótipos dos clientes selecionados.':'Vincule a pessoa aos clientes. A senha será trocada no primeiro acesso.',
    field('uName','Nome',u?.name||'','text','required maxlength="200"')
    +clientSelection(u?.clients.map(c=>c.id)||[])
    +field('uEmail','E-mail',u?.email||'','email','required maxlength="200" autocomplete="off"')
    +passwordFields('uPassword','uConfirmPassword',u?'Nova senha provisória (opcional)':'Senha provisória',!!u)
    +(u?`<label class="check"><input type="checkbox" id="uActive" ${u.active?'checked':''}>Login ativo</label>`:'')
    +'<p class="muted">Os acessos acompanham automaticamente os protótipos liberados para cada cliente.</p>',
    async form=>{
      const value=$('#uPassword').value,companies=selected(form);
      if(!companies.length)throw new Error('Selecione pelo menos um cliente.');
      if(value&&passwordError(value))throw new Error(passwordError(value));
      if(value!==$('#uConfirmPassword').value)throw new Error('As senhas não coincidem.');
      await api('/api/admin/users'+(u?'/'+u.id:''),{method:u?'PATCH':'POST',body:{name:$('#uName').value,email:$('#uEmail').value,password:value,active:u?$('#uActive').checked:true,clients:companies}});
      notify(u?'Pessoa atualizada.':'Login criado. Envie a senha provisória por um canal seguro.');
    });
  wirePassword('uPassword','uConfirmPassword',{optional:!!u});
}
function fileField(){return '<div class="field"><label for="htmlFile">Arquivo HTML</label><div class="drop" id="fileDrop"><b>Escolha um arquivo .html ou arraste aqui</b><p class="muted">Até 10 MB · HTML com estilos e scripts incorporados</p><input id="htmlFile" type="file" accept=".html,.htm" required aria-label="Arquivo HTML"></div></div>';}
function wireDrop(){const drop=$('#fileDrop');if(!drop)return;drop.ondragover=e=>e.preventDefault();drop.ondrop=e=>{e.preventDefault();if(e.dataTransfer.files.length){$('#htmlFile').files=e.dataTransfer.files;}};}
function protoModal(p){modal(p?'Editar protótipo e clientes':'Publicar protótipo','Todas as pessoas das empresas selecionadas poderão abrir este protótipo.',field('pTitle','Nome do protótipo',p?.title||'','text','required maxlength="200"')+clientSelection(p?.clients.map(c=>c.id)||[])+`<div class="field"><label for="pDescription">Descrição</label><textarea class="input" id="pDescription" required maxlength="2000" rows="3">${esc(p?.description||'')}</textarea></div>`+(p?'':fileField()),async form=>{const body={title:$('#pTitle').value,description:$('#pDescription').value,clients:selected(form)};if(!body.clients.length)throw new Error('Selecione pelo menos um cliente.');let payload=body;if(!p){payload=new FormData();for(const [key,value] of Object.entries(body))payload.append(key,key==='clients'?JSON.stringify(value):value);payload.append('html',$('#htmlFile').files[0]);}await api('/api/admin/prototypes'+(p?'/'+p.id:''),{method:p?'PATCH':'POST',body:payload});notify(p?'Protótipo e clientes atualizados.':'Protótipo publicado.');});wireDrop();}
function versionModal(p){modal('Publicar nova versão',`${p.title} passará de v${p.version} para v${p.version+1}. Os acessos serão mantidos.`,fileField(),async()=>{const body=new FormData();body.append('html',$('#htmlFile').files[0]);await api(`/api/admin/prototypes/${p.id}/html`,{method:'PUT',body});notify('Nova versão publicada.');},{saveLabel:'Publicar versão'});wireDrop();}
function deleteModal(p){modal('Remover protótipo',`O HTML de “${p.title}” e seus acessos serão removidos. Esta ação não pode ser desfeita.`,field('confirmation','Digite REMOVER para confirmar','','text','required pattern="REMOVER" autocomplete="off"'),async()=>{await api(`/api/admin/prototypes/${p.id}`,{method:'DELETE'});notify('Protótipo removido.');},{saveLabel:'Remover protótipo'});}
function changePassword(required) {
  modal(required?'Defina sua senha':'Trocar senha',required?'Para continuar, substitua a senha provisória por uma senha pessoal.':'Crie uma senha pessoal seguindo os requisitos abaixo.',
    field('currentPassword','Senha atual','','password','required autocomplete="current-password"')
    +passwordFields('newPassword','confirmPassword','Nova senha'),
    async()=>{
      const value=$('#newPassword').value;
      if(passwordError(value))throw new Error(passwordError(value));
      if(value!==$('#confirmPassword').value)throw new Error('As senhas não coincidem.');
      await api('/api/password',{method:'POST',body:{currentPassword:$('#currentPassword').value,password:value}});
      me.mustChange=false;notify('Senha atualizada.');
    },{required,saveLabel:'Salvar senha'});
  wirePassword('newPassword','confirmPassword',{currentId:'currentPassword'});
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if($('#modalRoot').children.length)closeModal();else if(!$('#viewer').classList.contains('hidden'))closeViewer();}if(e.key==='Tab'&&$('#modalRoot').children.length){const nodes=[...$('#modalRoot').querySelectorAll('input,textarea,button')].filter(n=>!n.disabled),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
api('/api/me').then(enter).catch(e=>{if(me)notify(e.message);});
