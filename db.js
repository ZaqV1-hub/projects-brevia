import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
export const clientKey = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export function openDatabase(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(resolve(dir, 'portal.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,company TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','client')),active INTEGER NOT NULL DEFAULT 1,must_change INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS prototypes(id TEXT PRIMARY KEY,title TEXT NOT NULL,client TEXT NOT NULL,description TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated TEXT NOT NULL,html BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS access(user_id TEXT REFERENCES users(id) ON DELETE CASCADE,prototype_id TEXT REFERENCES prototypes(id) ON DELETE CASCADE,PRIMARY KEY(user_id,prototype_id));
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS user_clients(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,PRIMARY KEY(user_id,client_id));
    CREATE TABLE IF NOT EXISTS prototype_clients(prototype_id TEXT NOT NULL REFERENCES prototypes(id) ON DELETE CASCADE,client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,PRIMARY KEY(prototype_id,client_id));
    CREATE INDEX IF NOT EXISTS user_clients_client ON user_clients(client_id);
    CREATE INDEX IF NOT EXISTS prototype_clients_client ON prototype_clients(client_id);
  `);
  if(db.prepare('PRAGMA user_version').get().user_version<1)transaction(db,()=>{
    const ensureClient=name=>{
      const clean=name.trim().replace(/\s+/g,' '),key=clientKey(clean);
      if(!key||key==='—')return null;
      const existing=db.prepare('SELECT id FROM clients WHERE name_key=?').get(key);
      if(existing)return existing.id;
      const id=randomUUID();db.prepare('INSERT INTO clients VALUES(?,?,?)').run(id,clean,key);return id;
    };
    for(const p of db.prepare('SELECT id,client FROM prototypes').all()){
      const id=ensureClient(p.client);if(id)db.prepare('INSERT OR IGNORE INTO prototype_clients VALUES(?,?)').run(p.id,id);
    }
    for(const u of db.prepare("SELECT id,company FROM users WHERE role='client'").all()){
      const id=ensureClient(u.company);if(!id)continue;
      db.prepare('INSERT OR IGNORE INTO user_clients VALUES(?,?)').run(u.id,id);
      for(const a of db.prepare('SELECT prototype_id FROM access WHERE user_id=?').all(u.id))db.prepare('INSERT OR IGNORE INTO prototype_clients VALUES(?,?)').run(a.prototype_id,id);
    }
    db.exec('PRAGMA user_version=1');
  });
  return db;
}
export function transaction(db, fn) { db.exec('BEGIN IMMEDIATE'); try { const result=fn(); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; } }
