import { openDatabase } from '../db.js';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const dir=resolve(process.env.DATA_DIR||'data');
mkdirSync(resolve(dir,'backups'),{recursive:true,mode:0o700});
const target=resolve(dir,'backups',`portal-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
const db=openDatabase(dir);
try{db.prepare('VACUUM INTO ?').run(target);console.log(`Backup criado: ${target}`);}finally{db.close();}
