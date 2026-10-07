import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
export function database(file){
 if(file!==':memory:')mkdirSync(path.dirname(file),{recursive:true});
 const db=new DatabaseSync(file);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS meta(id INTEGER PRIMARY KEY,version INTEGER NOT NULL); INSERT OR IGNORE INTO meta VALUES(1,0);
 CREATE TABLE IF NOT EXISTS shop(id INTEGER PRIMARY KEY,name TEXT NOT NULL,name_kn TEXT NOT NULL,area TEXT NOT NULL,address TEXT NOT NULL,open INTEGER NOT NULL,language TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,name_kn TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>0),stock INTEGER NOT NULL CHECK(stock>=0),unit TEXT NOT NULL,image TEXT NOT NULL,active INTEGER NOT NULL,cutoff TEXT);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,account TEXT NOT NULL,role TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS riders(id TEXT PRIMARY KEY,online INTEGER NOT NULL,area TEXT NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,customer TEXT NOT NULL,product INTEGER NOT NULL REFERENCES products(id),name TEXT NOT NULL,name_kn TEXT NOT NULL,unit TEXT NOT NULL,price INTEGER NOT NULL,qty INTEGER NOT NULL,total INTEGER NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL,area TEXT NOT NULL,address TEXT NOT NULL,customer_name TEXT NOT NULL,rider TEXT,payment TEXT NOT NULL DEFAULT 'pending',payment_method TEXT NOT NULL,pickup_code TEXT NOT NULL,delivery_code TEXT NOT NULL,confirmed INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL,request_key TEXT NOT NULL,UNIQUE(customer,request_key));
 CREATE INDEX IF NOT EXISTS orders_customer ON orders(customer,created);
 CREATE INDEX IF NOT EXISTS orders_rider ON orders(rider,status);
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT,action TEXT NOT NULL,actor TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS inbox(id TEXT PRIMARY KEY,text TEXT NOT NULL,reply TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,data TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audio_jobs(id TEXT PRIMARY KEY,sender TEXT NOT NULL,media TEXT NOT NULL,state TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS wa_contacts(number TEXT PRIMARY KEY,last_message INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS wa_receipts(provider_id TEXT PRIMARY KEY,state TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY AUTOINCREMENT,message_id TEXT NOT NULL UNIQUE,recipient TEXT NOT NULL,body TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued',provider_id TEXT,error TEXT,created TEXT NOT NULL);
 `);
 if(!db.prepare('PRAGMA table_info(outbox)').all().some(c=>c.name==='kind'))db.exec("ALTER TABLE outbox ADD COLUMN kind TEXT NOT NULL DEFAULT 'reply'");
 const get=(sql,...v)=>db.prepare(sql).get(...v),all=(sql,...v)=>db.prepare(sql).all(...v),run=(sql,...v)=>db.prepare(sql).run(...v);
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}};
 if(!get('SELECT id FROM shop'))tx(()=>{
 run('INSERT INTO shop VALUES(1,?,?,?,?,?,?)','Savita’s kitchen','ಸವಿತಾ ಅವರ ಅಡುಗೆಮನೆ','Vidyanagar','Sample pickup point, Vidyanagar, Hubballi',1,'en');
 for(const p of [['Homemade chakli','ಮನೆಯ ಚಕ್ಲಿ',150,20,'250 g box','chakli',1],['Dharwad peda','ಧಾರವಾಡ ಪೇಡ',200,12,'250 g box','peda',1],['Mango pickle','ಮಾವಿನ ಉಪ್ಪಿನಕಾಯಿ',120,8,'200 g jar','pickle',1]])run('INSERT INTO products(name,name_kn,price,stock,unit,image,active) VALUES(?,?,?,?,?,?,?)',...p);
 for(const id of ['rider','rider2'])run('INSERT INTO riders VALUES(?,?,?,?)',id,0,'Vidyanagar',0);
 });
 return {db,get,all,run,tx};
}
