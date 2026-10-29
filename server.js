import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, transaction } from './db.js';
import { passwordError } from './public/password-policy.js';

const root=dirname(fileURLToPath(import.meta.url));
const hash=s=>createHash('sha256').update(s).digest('hex');
const safeUser=u=>({id:u.id,name:u.name,company:u.company,email:u.email,role:u.role,active:!!u.active,mustChange:!!u.must_change});
const fail=(status,message)=>Object.assign(new Error(message),{status});
const text=(v,max=200)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max) throw fail(400,'Preencha os campos corretamente.'); return v.trim();};
const password=v=>{const error=passwordError(v);if(error)throw fail(400,error);return v;};
export function createApp({dataDir=process.env.DATA_DIR||resolve(root,'data'),production=process.env.NODE_ENV==='production',origin=process.env.APP_ORIGIN||'http://localhost:3000'}={}) {
  if(production&&!origin.startsWith('https://'))throw new Error('APP_ORIGIN deve usar HTTPS em produção.');
  const db=openDatabase(dataDir), app=express();
  app.disable('x-powered-by'); app.disable('etag');
  if(production)app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],fontSrc:["'self'",'https://fonts.gstatic.com'],imgSrc:["'self'",'data:'],frameSrc:["'self'"],objectSrc:["'none'"],baseUri:["'none'"],formAction:["'self'"],frameAncestors:["'none'"],upgradeInsecureRequests:production?[]:null}},strictTransportSecurity:production?undefined:false}));
  app.use((req,res,next)=>{res.set({'X-Robots-Tag':'noindex, nofollow, noarchive','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()'}); next();});
  app.get('/robots.txt',(req,res)=>res.type('text').send('User-agent: *\nDisallow: /\n'));
  app.use('/api',rateLimit({windowMs:60000,limit:300,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Muitas solicitações. Aguarde um minuto.'}}));
  app.use(express.json({limit:'64kb'}));
  app.use((req,res,next)=>{
    const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('brevia_session='))?.slice(15);
    if(token&&/^[a-f0-9]{64}$/.test(token)) {
      const session=db.prepare('SELECT s.*,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE token=? AND expires>?').get(hash(token),Date.now());
      if(session?.active){req.session=session;req.user=db.prepare('SELECT * FROM users WHERE id=?').get(session.user_id);}
    }
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      if(req.headers.origin!==origin)return next(fail(403,'Origem da solicitação não autorizada.'));
      if(req.path!=='/api/login'&&(!req.session||req.headers['x-csrf-token']!==req.session.csrf))return next(fail(403,'Sessão inválida. Atualize a página.'));
    }
    next();
  });
  const auth=(req,res,next)=>req.user?next():next(fail(401,'Entre para continuar.'));
  const ready=(req,res,next)=>req.user.must_change?next(fail(403,'Troque sua senha provisória para continuar.')):next();
  const admin=(req,res,next)=>req.user.role==='admin'?next():next(fail(403,'Acesso restrito à administração.'));
  const canAccess=(u,id)=>u.role==='admin'||!!db.prepare('SELECT 1 FROM access WHERE user_id=? AND prototype_id=?').get(u.id,id);
  const accessIds=(v,table)=>{if(!Array.isArray(v)||v.length>1000||v.some(id=>typeof id!=='string'||!db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id)))throw fail(400,'Acessos inválidos.');return [...new Set(v)];};
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:10},fileFilter:(req,file,cb)=>cb(null,/\.html?$/i.test(file.originalname))}).single('html');
  const htmlFile=req=>{if(!req.file)throw fail(400,'Selecione um arquivo .html de até 10 MB.');const html=req.file.buffer.toString('utf8');if(!/<(?:html|body|!doctype)\b/i.test(html)||html.includes('\u0000'))throw fail(400,'O arquivo não contém um documento HTML válido.');return req.file.buffer;};
  const loginLimit=rateLimit({windowMs:15*60000,limit:10,skipSuccessfulRequests:true,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Muitas tentativas. Aguarde 15 minutos.'}});
  const dummy=bcrypt.hashSync(randomBytes(32).toString('hex'),12);
  app.post('/api/login',loginLimit,async(req,res)=>{
    const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
    const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);
    const pass=typeof req.body?.password==='string'?req.body.password:'';
    const valid=await bcrypt.compare(pass.slice(0,200),u?.password||dummy);
    if(!u||!u.active||!valid)throw fail(401,'E-mail ou senha incorretos.');
    if(req.session)db.prepare('DELETE FROM sessions WHERE token=?').run(req.session.token);
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),u.id,csrf,Date.now()+8*3600000);
    res.cookie('brevia_session',token,{httpOnly:true,secure:production,sameSite:'strict',path:'/',maxAge:8*3600000});
    res.json({user:safeUser(u),csrf});
  });
  app.get('/api/me',auth,(req,res)=>res.json({user:safeUser(req.user),csrf:req.session.csrf}));
  app.post('/api/logout',auth,(req,res)=>{db.prepare('DELETE FROM sessions WHERE token=?').run(req.session.token);res.clearCookie('brevia_session',{httpOnly:true,secure:production,sameSite:'strict',path:'/'}).json({ok:true});});
  app.post('/api/password',auth,async(req,res)=>{
    const next=password(req.body.password);
    if(!await bcrypt.compare(String(req.body.currentPassword||''),req.user.password))throw fail(400,'A senha atual está incorreta.');
    if(await bcrypt.compare(next,req.user.password))throw fail(400,'Escolha uma senha diferente da atual.');
    const encrypted=await bcrypt.hash(next,12);
    transaction(db,()=>{db.prepare('UPDATE users SET password=?,must_change=0 WHERE id=?').run(encrypted,req.user.id);db.prepare('DELETE FROM sessions WHERE user_id=? AND token!=?').run(req.user.id,req.session.token);});
    res.json({ok:true});
  });
  app.get('/api/prototypes',auth,ready,(req,res)=>res.json(db.prepare(`SELECT id,title,client,description,version,updated FROM prototypes ${req.user.role==='admin'?'':'WHERE id IN (SELECT prototype_id FROM access WHERE user_id=?)'} ORDER BY updated DESC`).all(...(req.user.role==='admin'?[]:[req.user.id]))));
  app.get('/api/prototypes/:id/content',auth,ready,(req,res)=>{
    if(!canAccess(req.user,req.params.id))throw fail(404,'Protótipo não encontrado ou acesso não autorizado.');
    const p=db.prepare('SELECT html FROM prototypes WHERE id=?').get(req.params.id);if(!p)throw fail(404,'Protótipo não encontrado.');
    // The response itself stays sandboxed, even when its URL is opened directly.

    res.set({'Content-Security-Policy':`sandbox allow-scripts allow-forms; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; img-src https: data: blob:; font-src https: data:; media-src https: data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,'X-Frame-Options':'SAMEORIGIN','Cross-Origin-Resource-Policy':'same-origin'}).type('html').send(Buffer.from(p.html));
  });
  app.use('/api/admin',auth,ready,admin);
  app.get('/api/admin/users',(req,res)=>res.json(db.prepare('SELECT * FROM users ORDER BY name').all().map(u=>({...safeUser(u),access:db.prepare('SELECT prototype_id FROM access WHERE user_id=?').all(u.id).map(a=>a.prototype_id)}))));
  app.post('/api/admin/users',async(req,res)=>{
    const name=text(req.body.name),company=text(req.body.company),email=text(req.body.email).toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'Informe um e-mail válido.');
    const encrypted=await bcrypt.hash(password(req.body.password),12),ids=accessIds(req.body.access||[],'prototypes'),id=randomUUID();
    transaction(db,()=>{db.prepare("INSERT INTO users(id,name,company,email,password,role) VALUES(?,?,?,?,?,'client')").run(id,name,company,email,encrypted);for(const p of ids)db.prepare('INSERT INTO access VALUES(?,?)').run(id,p);});res.status(201).json({id});
  });
  app.patch('/api/admin/users/:id',async(req,res)=>{
    const u=db.prepare("SELECT * FROM users WHERE id=? AND role='client'").get(req.params.id);if(!u)throw fail(404,'Cliente não encontrado.');
    const name=text(req.body.name),company=text(req.body.company),email=text(req.body.email).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'Informe um e-mail válido.');
    const ids=accessIds(req.body.access||[],'prototypes');if(typeof req.body.active!=='boolean')throw fail(400,'Status inválido.');
    const encrypted=req.body.password?await bcrypt.hash(password(req.body.password),12):null;
    transaction(db,()=>{
      db.prepare('UPDATE users SET name=?,company=?,email=?,active=?,password=?,must_change=? WHERE id=?').run(name,company,email,+req.body.active,encrypted||u.password,encrypted?1:u.must_change,u.id);
      db.prepare('DELETE FROM access WHERE user_id=?').run(u.id);for(const p of ids)db.prepare('INSERT INTO access VALUES(?,?)').run(u.id,p);
      if(!req.body.active||encrypted)db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
    });res.json({ok:true});
  });
  app.post('/api/admin/prototypes',upload,(req,res)=>{
    const html=htmlFile(req),title=text(req.body.title),client=text(req.body.client),description=text(req.body.description,2000),id=randomUUID();
    let ids;try{ids=accessIds(JSON.parse(req.body.access||'[]'),'users');}catch{throw fail(400,'Acessos inválidos.');}
    transaction(db,()=>{db.prepare('INSERT INTO prototypes VALUES(?,?,?,?,1,?,?)').run(id,title,client,description,new Date().toISOString(),html);for(const u of ids)db.prepare('INSERT INTO access VALUES(?,?)').run(u,id);});res.status(201).json({id});
  });
  app.put('/api/admin/prototypes/:id/html',upload,(req,res)=>{
    const result=db.prepare('UPDATE prototypes SET html=?,version=version+1,updated=? WHERE id=?').run(htmlFile(req),new Date().toISOString(),req.params.id);
    if(!result.changes)throw fail(404,'Protótipo não encontrado.');res.json({ok:true});
  });
  app.patch('/api/admin/prototypes/:id',(req,res)=>{
    const ids=accessIds(req.body.access,'users'),title=text(req.body.title),client=text(req.body.client),description=text(req.body.description,2000);
    transaction(db,()=>{if(!db.prepare('UPDATE prototypes SET title=?,client=?,description=? WHERE id=?').run(title,client,description,req.params.id).changes)throw fail(404,'Protótipo não encontrado.');db.prepare('DELETE FROM access WHERE prototype_id=?').run(req.params.id);for(const u of ids)db.prepare('INSERT INTO access VALUES(?,?)').run(u,req.params.id);});res.json({ok:true});
  });
  app.delete('/api/admin/prototypes/:id',(req,res)=>{if(!db.prepare('DELETE FROM prototypes WHERE id=?').run(req.params.id).changes)throw fail(404,'Protótipo não encontrado.');res.json({ok:true});});
  app.get('/',(req,res)=>res.sendFile(resolve(root,'public/index.html')));
  app.get('/app.js',(req,res)=>res.sendFile(resolve(root,'public/app.js')));
  app.get('/styles.css',(req,res)=>res.sendFile(resolve(root,'public/styles.css')));
  app.get('/password-policy.js',(req,res)=>res.sendFile(resolve(root,'public/password-policy.js')));
  app.get('/assets/brevia-logo-white.png',(req,res)=>res.sendFile(resolve(root,'public/assets/brevia-logo-white.png')));
  app.get('/assets/brevia-logo.png',(req,res)=>res.sendFile(resolve(root,'public/assets/brevia-logo.png')));
  app.use((req,res,next)=>next(fail(404,'Página não encontrada.')));
  app.use((err,req,res,next)=>{
    let status=err.status||500,message=err.message;
    if(err.code==='LIMIT_FILE_SIZE'){status=413;message='O arquivo deve ter até 10 MB.';}
    else if(err instanceof multer.MulterError){status=400;message='Upload inválido. Selecione somente um HTML.';}
    else if(err.code?.startsWith('ERR_SQLITE')&&err.message.includes('UNIQUE')){status=409;message='Este e-mail já está cadastrado.';}
    if(status===500){console.error('Erro interno:',err.code||err.name);message='Não foi possível concluir. Tente novamente.';}
    res.status(status).json({error:message});
  });
  return {app,db};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {app,db}=createApp();const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
  const server=app.listen(port,host,()=>console.log(`Portal Brevia: ${process.env.APP_ORIGIN||`http://localhost:${port}`}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
}
