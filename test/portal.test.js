import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { createApp } from '../server.js';
const dir=mkdtempSync(join(tmpdir(),'brevia-test-'));
let app,db,server,url,admin,client,other,protoId;
const pass='Senha-provisoria-12345';
async function request(path,{session,method='GET',body,origin}={}) {
  const headers={};if(session){headers.Cookie=session.cookie;headers['X-CSRF-Token']=session.csrf;}
  if(method!=='GET')headers.Origin=origin||url;
  if(body&&!(body instanceof FormData)){headers['Content-Type']='application/json';body=JSON.stringify(body);}
  return fetch(url+path,{method,headers,body});
}
async function login(email){const r=await request('/api/login',{method:'POST',body:{email,password:pass}});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],...(await r.json())};}
function upload(html='<html><body><button onclick="this.textContent=\'Clicou\'">Teste</button></body></html>',clients=['companyA']){const f=new FormData();f.set('title','Aplicativo Estância');f.set('description','Protótipo de teste');f.set('clients',JSON.stringify(clients));f.set('html',new Blob([html],{type:'text/html'}),'app.html');return f;}
before(async()=>{const result=createApp({dataDir:dir,origin:'http://127.0.0.1:3018'});({app,db}=result);const encrypted=await bcrypt.hash(pass,4);for(const [id,role] of [['admin','admin'],['client','client'],['other','client'],['temporary','client']])db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,1,?)').run(id,id,'Empresa',id+'@example.com',encrypted,role,id==='temporary'?1:0);db.prepare('INSERT INTO clients VALUES(?,?,?)').run('companyA','Estância','estancia');db.prepare('INSERT INTO clients VALUES(?,?,?)').run('companyB','Rincão','rincao');db.prepare('INSERT INTO user_clients VALUES(?,?)').run('client','companyA');db.prepare('INSERT INTO user_clients VALUES(?,?)').run('other','companyB');server=app.listen(3018,'127.0.0.1');await new Promise(r=>server.once('listening',r));url='http://127.0.0.1:3018';admin=await login('admin@example.com');client=await login('client@example.com');other=await login('other@example.com');});
after(async()=>{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});});
test('login inválido e cookie seguro sem credenciais no retorno',async()=>{const r=await request('/api/login',{method:'POST',body:{email:'admin@example.com',password:'errada'}});assert.equal(r.status,401);const ok=await request('/api/login',{method:'POST',body:{email:'admin@example.com',password:pass}});assert.match(ok.headers.get('set-cookie'),/HttpOnly/i);assert.match(ok.headers.get('set-cookie'),/SameSite=Strict/i);assert.equal((await ok.json()).user.password,undefined);assert.notEqual(db.prepare('SELECT password FROM users WHERE id=?').get('admin').password,pass);});
test('sem login não há dados nem acesso direto ao HTML',async()=>{for(const p of ['/api/prototypes','/api/prototypes/inexistente/content','/api/admin/users'])assert.equal((await request(p)).status,401);});
test('cliente não pode administrar e mutações exigem CSRF e origem',async()=>{assert.equal((await request('/api/admin/users',{session:client})).status,403);assert.equal((await request('/api/admin/users',{session:admin,method:'POST',origin:'https://outro.example',body:{}})).status,403);assert.equal((await request('/api/admin/users',{session:{...admin,csrf:'invalido'},method:'POST',body:{}})).status,403);});
test('HTML administrativo e links diretos exigem administrador no servidor',async()=>{
  const shell=await (await request('/')).text();assert.doesNotMatch(shell,/Publicar protótipo|Painel de protótipos|id="page-admin"/);
  for(const path of ['/api/admin/view','/admin','/administracao']){
    assert.equal((await request(path)).status,401);
    assert.equal((await request(path,{session:client})).status,403);
    assert.equal((await request(path,{session:admin})).status,200);
  }
  assert.equal((await request('/views/admin.html',{session:client})).status,404);
  for(const [method,path] of [['POST','/api/admin/prototypes'],['PUT','/api/admin/prototypes/p/html'],['PATCH','/api/admin/prototypes/p'],['DELETE','/api/admin/prototypes/p'],['POST','/api/admin/users'],['PATCH','/api/admin/users/u'],['POST','/api/admin/clients'],['PATCH','/api/admin/clients/c']])assert.equal((await request(path,{session:client,method,body:{}})).status,403);
});
test('publicação privada, isolamento entre clientes e sandbox no servidor',async()=>{let r=await request('/api/admin/prototypes',{session:admin,method:'POST',body:upload()});assert.equal(r.status,201);protoId=(await r.json()).id;r=await request('/api/prototypes',{session:client});assert.equal((await r.json()).length,1);r=await request('/api/prototypes',{session:other});assert.deepEqual(await r.json(),[]);assert.equal((await request(`/api/prototypes/${protoId}/content`,{session:other})).status,404);assert.equal((await request(`/api/prototypes/${protoId}/content`)).status,401);r=await request(`/api/prototypes/${protoId}/content`,{session:client});assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/sandbox allow-scripts allow-forms;/);assert.doesNotMatch(r.headers.get('content-security-policy'),/allow-same-origin/);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.match(await r.text(),/Teste/);r=await request(`/api/prototypes/${protoId}/content?preview=1`,{session:client});assert.match(r.headers.get('content-security-policy'),/sandbox allow-scripts allow-forms;/);});
test('nova versão incrementa contador e mantém acesso',async()=>{const f=new FormData();f.set('html',new Blob(['<html><body>Versão 2</body></html>']),'novo.html');assert.equal((await request(`/api/admin/prototypes/${protoId}/html`,{session:admin,method:'PUT',body:f})).status,200);const r=await request('/api/prototypes',{session:client});assert.equal((await r.json())[0].version,2);assert.match(await (await request(`/api/prototypes/${protoId}/content`,{session:client})).text(),/Versão 2/);});
test('clientes são cadastrados uma vez, sem duplicidade por acento, caixa ou espaços',async()=>{
  for(const name of ['ESTANCIA','  Estância  '])assert.equal((await request('/api/admin/clients',{session:admin,method:'POST',body:{name}})).status,409);
  const r=await request('/api/admin/clients',{session:admin,method:'POST',body:{name:'Novo cliente'}});assert.equal(r.status,201);const {id}=await r.json();
  assert.equal((await request('/api/admin/clients/'+id,{session:admin,method:'PATCH',body:{name:'Nova empresa'}})).status,200);
  assert.equal((await request('/api/admin/clients/'+id,{session:admin,method:'PATCH',body:{name:'rincao'}})).status,409);
  assert.equal((await request('/api/admin/clients',{session:client})).status,403);
});
test('um protótipo pode atender duas empresas e cada pessoa só vê os nomes dos seus clientes',async()=>{
  assert.equal((await request(`/api/admin/prototypes/${protoId}`,{session:admin,method:'PATCH',body:{title:'Novo nome',description:'Compartilhado',clients:['companyA','companyB']}})).status,200);
  for(const session of [client,other])assert.equal((await request(`/api/prototypes/${protoId}/content`,{session})).status,200);
  const a=await (await request('/api/prototypes',{session:client})).json(),b=await (await request('/api/prototypes',{session:other})).json();
  assert.deepEqual(a[0].clients.map(c=>c.id),['companyA']);assert.deepEqual(b[0].clients.map(c=>c.id),['companyB']);
  const all=await (await request('/api/prototypes',{session:admin})).json();assert.equal(all[0].clients.length,2);
});
test('vínculos de pessoas herdam e revogam acesso sem alterar o login',async()=>{
  const body={name:'Outra pessoa',email:'other@example.com',active:true,password:'',clients:['companyA','companyB']};
  assert.equal((await request('/api/admin/users/other',{session:admin,method:'PATCH',body})).status,200);
  const list=await (await request('/api/prototypes',{session:other})).json();assert.equal(list.length,1);assert.equal(list[0].clients.length,2);
  const third=db.prepare("SELECT id FROM clients WHERE name='Nova empresa'").get().id;
  assert.equal((await request('/api/admin/users/other',{session:admin,method:'PATCH',body:{...body,clients:[third]}})).status,200);
  assert.equal((await request(`/api/prototypes/${protoId}/content`,{session:other})).status,404);
  assert.equal((await request('/api/admin/users/other',{session:admin,method:'PATCH',body:{...body,clients:['companyB']}})).status,200);
});
test('uma empresa pode receber vários protótipos, com acesso herdado imediatamente',async()=>{
  const r=await request('/api/admin/prototypes',{session:admin,method:'POST',body:upload(undefined,['companyA'])});assert.equal(r.status,201);const {id}=await r.json();
  assert.equal((await (await request('/api/prototypes',{session:client})).json()).length,2);
  assert.equal((await request(`/api/prototypes/${id}/content`,{session:other})).status,404);
  assert.equal((await request('/api/admin/prototypes/'+id,{session:admin,method:'DELETE'})).status,200);
});
test('empresa em texto ou identificadores inexistentes não substituem a seleção de clientes',async()=>{
  for(const clients of [undefined,[],['inexistente'],'Estância'])assert.equal((await request(`/api/admin/prototypes/${protoId}`,{session:admin,method:'PATCH',body:{title:'Nome',description:'Texto',client:'Estância',clients}})).status,400);
  assert.equal((await request('/api/admin/users',{session:admin,method:'POST',body:{name:'Pessoa',email:'texto@example.com',company:'Estância',password:pass}})).status,400);
});
test('revogar acesso bloqueia link imediatamente',async()=>{assert.equal((await request(`/api/admin/prototypes/${protoId}`,{session:admin,method:'PATCH',body:{title:'Novo nome',description:'Atualizado',clients:['companyB']}})).status,200);assert.equal((await request(`/api/prototypes/${protoId}/content`,{session:client})).status,404);});
test('criação, e-mail único, redefinição e desativação de usuário',async()=>{const body={name:'Nova pessoa',clients:['companyA'],email:'nova@example.com',password:pass};let r=await request('/api/admin/users',{session:admin,method:'POST',body});assert.equal(r.status,201);const {id}=await r.json();r=await request('/api/admin/users',{session:admin,method:'POST',body});assert.equal(r.status,409);const s=await login(body.email);r=await request('/api/prototypes',{session:s});assert.equal(r.status,403);r=await request('/api/password',{session:s,method:'POST',body:{currentPassword:pass,password:'Minha-senha-definitiva-123'}});assert.equal(r.status,200);assert.equal((await request('/api/prototypes',{session:s})).status,200);r=await request('/api/admin/users/'+id,{session:admin,method:'PATCH',body:{...body,password:'',active:false}});assert.equal(r.status,200);assert.equal((await request('/api/me',{session:s})).status,401);r=await request('/api/login',{method:'POST',body:{email:body.email,password:'Minha-senha-definitiva-123'}});assert.equal(r.status,401);});
test('senha provisória impede abertura até troca e requer senha atual',async()=>{const s=await login('temporary@example.com');assert.equal((await request('/api/prototypes',{session:s})).status,403);assert.equal((await request('/api/password',{session:s,method:'POST',body:{currentPassword:'errada',password:'Minha-senha-definitiva-123'}})).status,400);assert.equal((await request('/api/password',{session:s,method:'POST',body:{currentPassword:pass,password:'curta'}})).status,400);});
test('servidor exige todos os requisitos de senha mesmo sem o verificador da interface',async()=>{
  for(const invalid of ['Curta1!','semm aiuscula123!','SEMMINUSCULA123!','SemNumeroAqui!!','SemSimbolo123456','Aa1!'+'á'.repeat(35)]) {
    const r=await request('/api/password',{session:other,method:'POST',body:{currentPassword:pass,password:invalid}});
    assert.equal(r.status,400,`Senha fora da política deve ser recusada`);
  }
  const r=await request('/api/admin/users',{session:admin,method:'POST',body:{name:'Teste',clients:['companyA'],email:'politica@example.com',password:'semsimbolo12345'}});
  assert.equal(r.status,400);
  assert.equal(db.prepare('SELECT id FROM users WHERE email=?').get('politica@example.com'),undefined);
});
test('upload inválido e atribuição inexistente são recusados sem gravação parcial',async()=>{const count=db.prepare('SELECT COUNT(*) AS n FROM prototypes').get().n;assert.equal((await request('/api/admin/prototypes',{session:admin,method:'POST',body:upload('isto não é HTML')})).status,400);assert.equal((await request('/api/admin/prototypes',{session:admin,method:'POST',body:upload(undefined,['inexistente'])})).status,400);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM prototypes').get().n,count);});
test('nenhum arquivo privado, download ou banco é servido publicamente',async()=>{for(const path of ['/data/portal.sqlite','/server.js','/.env','/api/prototypes/'+protoId+'/download','/node_modules/express/package.json'])assert.equal((await request(path,{session:admin})).status,404);assert.equal((await request('/robots.txt')).status,200);});
test('dados persistem ao reabrir o banco',async()=>{const second=createApp({dataDir:dir});assert.equal(second.db.prepare('SELECT title FROM prototypes WHERE id=?').get(protoId).title,'Novo nome');second.db.close();});
test('remover protótipo apaga HTML e permissões; logout invalida sessão',async()=>{assert.equal((await request(`/api/admin/prototypes/${protoId}`,{session:admin,method:'DELETE'})).status,200);assert.equal(db.prepare('SELECT id FROM prototypes WHERE id=?').get(protoId),undefined);assert.equal((await request('/api/logout',{session:client,method:'POST'})).status,200);assert.equal((await request('/api/me',{session:client})).status,401);});
