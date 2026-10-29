import { openDatabase } from '../db.js';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const db=openDatabase(process.env.DATA_DIR||resolve('data'));
try {
  const email=(process.env.ADMIN_EMAIL||'zaq@brevia.local').trim().toLowerCase();
  if(!db.prepare("SELECT id FROM users WHERE role='admin'").get()){
    const password=process.env.ADMIN_PASSWORD||randomBytes(18).toString('base64url');
    if(password.length<12||Buffer.byteLength(password)>72)throw new Error('ADMIN_PASSWORD deve ter pelo menos 12 caracteres e no máximo 72 bytes.');
    db.prepare("INSERT INTO users(id,name,company,email,password,role,must_change) VALUES(?,?,?,?,?,'admin',1)").run(randomUUID(),'Zaq','Brevia',email,await bcrypt.hash(password,12));
    console.log(`Administrador criado: ${email}`);
    if(!process.env.ADMIN_PASSWORD)console.log(`Senha provisória: ${password}`);
    console.log('Troque a senha no primeiro acesso.');
  } else console.log('Administrador já existente; nenhuma senha foi alterada.');
  const file=process.argv[2];
  if(file&&!db.prepare('SELECT id FROM prototypes LIMIT 1').get()){
    const html=readFileSync(resolve(file));
    if(html.length>10*1024*1024)throw new Error('HTML maior que 10 MB.');
    db.prepare('INSERT INTO prototypes VALUES(?,?,?,?,1,?,?)').run(randomUUID(),'Estância: aplicativo dos representantes','Estância','Protótipo navegável do aplicativo dos representantes da Estância.',new Date().toISOString(),html);
    console.log('Protótipo Estância importado. Apenas o administrador pode vê-lo até liberar os acessos.');
  }
} finally {db.close();}
