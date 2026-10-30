import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {passwordRules,passwordError} from '../public/password-policy.js';
const shell=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const adminView=readFileSync(new URL('../views/admin.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*\n/,'');
const admin={id:'admin',name:'Administrador',company:'Brevia',role:'admin',mustChange:false};
const client={id:'client',name:'Cliente de teste',company:'Estância',role:'client',mustChange:false};
const proto={id:'p',title:'Meu protótipo',client:'Estância',description:'Teste',version:1,updated:'2026-10-29',clients:[{id:'c',name:'Estância'}]};
function fixture({delayAdminView=false}={}){
  const dom=new JSDOM(shell,{url:'http://localhost:3000',runScripts:'outside-only'}),w=dom.window;
  w.scrollTo=()=>{};w.passwordRules=passwordRules;w.passwordError=passwordError;w.TextEncoder=TextEncoder;
  const requests=[];let releaseAdminView;
  const pending=delayAdminView?new Promise(resolve=>{releaseAdminView=resolve;}):null;
  w.fetch=async path=>{
    requests.push(path);
    if(path==='/api/admin/view'&&pending)await pending;
    const html=path==='/api/admin/view';let data,status=200;
    if(path==='/api/me'){status=401;data={error:'Entre para continuar.'};}
    else if(path==='/api/prototypes')data=[proto];
    else if(path==='/api/admin/view')data=adminView;
    else if(path==='/api/admin/users')data=[{...client,clients:proto.clients,active:true}];
    else if(path==='/api/admin/clients')data=[{id:'c',name:'Estância',people:1,prototypes:1}];
    else if(path==='/api/password')data={ok:true};
    else throw new Error('Rota inesperada no teste: '+path);
    return {ok:status===200,status,headers:{get:()=>html?'text/html':'application/json'},json:async()=>data,text:async()=>data};
  };
  w.eval(source+"\nwindow.testPortal={enter,showLogin,go,clientModal,userModal,protoModal,versionModal,deleteModal};");
  return {dom,w,requests,releaseAdminView};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
function assertClientOnly(w){assert.equal(w.document.querySelector('#page-admin'),null);assert.equal(w.document.querySelector('#btnNewProto'),null);assert.equal(w.document.querySelector('#stats'),null);assert.equal(w.document.querySelector('#page-home').classList.contains('hidden'),false);assert.equal(w.document.querySelector('#navAdmin').classList.contains('hidden'),true);assert.equal(w.document.querySelector('[data-page=home]').classList.contains('on'),true);}
test('cliente com senha provisória abre Meus protótipos após logout do admin e permanece ali após trocar a senha',async()=>{
  const {dom,w}=fixture();try{
    await settle();await w.testPortal.enter({user:admin,csrf:'admin'});w.testPortal.go('admin');assert.equal(w.document.querySelector('#page-admin').classList.contains('hidden'),false);
    w.testPortal.showLogin();assert.equal(w.document.querySelector('#page-admin'),null);
    await w.testPortal.enter({user:{...client,mustChange:true},csrf:'client'});assertClientOnly(w);
    assert.ok(w.document.querySelector('#newPassword'));
    for(const [id,value] of [['currentPassword','Provisoria123!'],['newPassword','Definitiva123!'],['confirmPassword','Definitiva123!']])w.document.getElementById(id).value=value;
    const form=w.document.querySelector('#modalRoot form');form.dispatchEvent(new w.Event('input'));form.dispatchEvent(new w.Event('submit',{cancelable:true}));await settle();await settle();
    assertClientOnly(w);assert.equal(w.document.querySelector('#modalRoot').children.length,0);assert.match(w.document.querySelector('#grid').textContent,/Meu protótipo/);
  }finally{dom.window.close();}
});
test('respostas administrativas pendentes não reaparecem depois de trocar para cliente',async()=>{
  const {dom,w,releaseAdminView}=fixture({delayAdminView:true});try{
    await settle();const enteringAdmin=w.testPortal.enter({user:admin,csrf:'admin'});await settle();
    w.testPortal.showLogin();await w.testPortal.enter({user:client,csrf:'client'});assertClientOnly(w);
    releaseAdminView();await enteringAdmin;assertClientOnly(w);assert.match(w.document.querySelector('#hello').textContent,/Cliente de teste/);
  }finally{dom.window.close();}
});
test('cliente não carrega a página administrativa e ações diretas não abrem formulários',async()=>{
  const {dom,w,requests}=fixture();try{
    await settle();await w.testPortal.enter({user:client,csrf:'client'});assert.equal(requests.some(p=>p.startsWith('/api/admin')),false);
    w.testPortal.go('admin');for(const name of ['clientModal','userModal','protoModal','versionModal','deleteModal'])w.testPortal[name]();
    assertClientOnly(w);assert.equal(w.document.querySelector('#modalRoot').children.length,0);
    assert.doesNotMatch(shell,/Publicar protótipo|Painel de protótipos|id="page-admin"/);
  }finally{dom.window.close();}
});
