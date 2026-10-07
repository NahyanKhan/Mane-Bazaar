import http from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash,createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
import {database} from './db.mjs';
import {domain,fail,uid} from './domain.mjs';
import {accessConfig,identify} from './access.mjs';
import {whatsapp} from './whatsapp.mjs';
import {voice} from './voice.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const hash=x=>createHash('sha256').update(x).digest('hex');
export function createApp({dbPath=path.join(root,'data','mane.sqlite'),demo=false,env=process.env,transport=fetch}={}){
 const config=accessConfig(env,demo),d=database(dbPath),streams=new Set(),buckets=new Map();
 const wa=whatsapp(d,env,transport,()=>notify()),app=domain(d,{onNewOrder:wa.orderCreated});
 const audio=voice(d,env,transport,app,wa,()=>notify());
 const sessionHash=token=>hash(config.epoch+':'+token);
 if(!demo)for(const id of Object.keys(config.riders))d.run('INSERT OR IGNORE INTO riders VALUES(?,?,?,?)',id,0,'Vidyanagar',0);
 const notify=()=>{for(const s of streams){if(s.expires<Date.now()||!d.get('SELECT token FROM sessions WHERE token=?',s.token)){s.res.end();streams.delete(s);}else s.res.write(`data: ${JSON.stringify({version:app.version()})}\n\n`);}};
 const limit=(key,n=100)=>{let b=buckets.get(key);if(!b||Date.now()-b.at>60000){b={at:Date.now(),n:0};buckets.set(key,b);}if(++b.n>n)fail(429,'Too many requests. Try again shortly.');};
 const auth=req=>{let token=(req.headers.authorization||'').replace(/^Bearer /,'');return d.get('SELECT * FROM sessions WHERE token=? AND expires>?',sessionHash(token),Date.now())||fail(401,'Your session ended. Please enter again.');};
 const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 const raw=async req=>{let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>100000)fail(413,'Request too large.');chunks.push(c);}return Buffer.concat(chunks);};
 const server=http.createServer(async(req,res)=>{try{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  if(!demo)res.setHeader('Strict-Transport-Security','max-age=31536000');
  let url=new URL(req.url,'http://localhost'),p=url.pathname;
  if(p==='/health')return json(res,200,{ok:true,demo});
  if(p==='/webhooks/whatsapp'){
   if(!env.WHATSAPP_APP_SECRET||!env.WHATSAPP_VERIFY_TOKEN||!env.WHATSAPP_SELLER_NUMBER)fail(503,'WhatsApp is not configured.');
   if(req.method==='GET'){if(url.searchParams.get('hub.mode')!=='subscribe'||url.searchParams.get('hub.verify_token')!==env.WHATSAPP_VERIFY_TOKEN)fail(403,'Verification failed.');res.writeHead(200,{'Content-Type':'text/plain'});return res.end(url.searchParams.get('hub.challenge')||'');}
   if(req.method!=='POST')fail(405,'Method not allowed.');const bytes=await raw(req),expected='sha256='+createHmac('sha256',env.WHATSAPP_APP_SECRET).update(bytes).digest('hex'),sig=req.headers['x-hub-signature-256']||'';if(expected.length!==sig.length||!timingSafeEqual(Buffer.from(expected),Buffer.from(sig)))fail(401,'Invalid webhook signature.');let body;try{body=JSON.parse(bytes)}catch{fail(400,'Invalid JSON.');}
   for(const entry of body.entry||[])for(const change of entry.changes||[]){
    for(const receipt of change.value?.statuses||[])wa.status(receipt);
    for(const m of change.value?.messages||[]){
     if(m.from!==env.WHATSAPP_SELLER_NUMBER||typeof m.id!=='string')continue;
     wa.received(m.from,m.timestamp);
     if(m.type==='audio'&&audio.enabled()&&audio.enqueue(m.id,m.from,m.audio?.id))continue;
     const txt=m.type==='text'?String(m.text?.body||'').slice(0,1000):'VOICE_NOT_CONNECTED';
     const reply=app.chat(m.id,txt);wa.enqueue(m.id,m.from,reply);
    }
   }
   d.run('UPDATE meta SET version=version+1 WHERE id=1');notify();json(res,200,{received:true});void wa.flush();void audio.drain();return;
  }
  if(p.startsWith('/api/')){
   const origin=req.headers.origin;if(origin&&(demo?origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`:origin!==config.origin))fail(403,'Cross-origin request denied.');
   if(p==='/api/config'&&req.method==='GET')return json(res,200,{demo});
   if(p==='/api/access'&&req.method==='POST'){
    if(demo)fail(404,'Not found.');limit('access-total',120);limit(req.socket.remoteAddress+':access',30);
    let b;try{b=JSON.parse(await raw(req));}catch{fail(400,'Invalid JSON.');}
    const who=identify(b,env,config);if(!who)fail(401,'Invalid access details.');
    const token=randomBytes(32).toString('hex');d.run('INSERT INTO sessions VALUES(?,?,?,?)',sessionHash(token),who.account,who.role,Date.now()+8*3600000);return json(res,200,{token});
   }
   if(p==='/api/session'&&req.method==='POST'){if(!demo)fail(404,'Not found.');limit(req.socket.remoteAddress+':session',30);let b=JSON.parse(await raw(req));if(!['seller','customer','customer2','rider','rider2'].includes(b.account))fail(400,'Unknown test account.');let token=randomBytes(32).toString('hex'),role=b.account.replace(/2$/,'');d.run('INSERT INTO sessions VALUES(?,?,?,?)',sessionHash(token),b.account,role,Date.now()+8*3600000);return json(res,200,{token});}
   const u=auth(req);
   if(p==='/api/logout'&&req.method==='POST'){d.run('DELETE FROM sessions WHERE token=?',u.token);notify();return json(res,200,{ok:true});}
   if(p==='/api/state'&&req.method==='GET'){let state=app.state(u);state.integrations={demo,whatsapp:env.WHATSAPP_APP_SECRET&&env.WHATSAPP_SELLER_NUMBER?'webhook-configured':'not-connected',outbound:env.WHATSAPP_SEND_ENABLED==='true'?'enabled':'disabled',voice:audio.enabled()?'configured-not-live-verified':'not-connected',payments:'seller-confirmation-only',third_party_delivery:'not-connected'};return json(res,200,state);}
   if(p==='/api/events'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(`data: ${JSON.stringify({version:app.version()})}\n\n`);let s={res,expires:u.expires,token:u.token};streams.add(s);req.on('close',()=>streams.delete(s));return;}
   if(req.method!=='POST')fail(404,'Not found.');limit(u.account);let b;try{b=JSON.parse(await raw(req))}catch{fail(400,'Invalid JSON.');}
   if(p==='/api/chat'){if(u.role!=='seller')fail(403,'Seller access required.');if(typeof b.text!=='string'||!b.text.trim()||b.text.length>1000)fail(400,'Enter a short message.');const result=app.chat('test-'+uid(),b.text);notify();return json(res,200,{reply:result});}
   if(p==='/api/action'&&['pickup','deliver'].includes(b.action))limit(u.account+':code',10);
   let result=app.mutate(u,p.slice(5),b);notify();void wa.flush();return json(res,200,result);
  }
  if(req.method!=='GET')fail(405,'Method not allowed.');const files={'/':'index.html','/seller':'index.html','/customer':'index.html','/rider':'index.html','/app.js':'app.js','/base.css':'base.css','/style.css':'style.css'};if(!files[p])fail(404,'Not found.');const f=files[p];res.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript; charset=utf-8':f.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(readFileSync(path.join(root,'public',f)));
 }catch(e){if(res.headersSent)return res.end();json(res,e.status||500,{error:e.status?e.message:'Unable to complete request. Please retry.'});if(!e.status)console.error(e.message);}});
 const outboundTimer=setInterval(()=>{void wa.flush();void audio.drain();},10000);outboundTimer.unref();
 const heartbeat=setInterval(()=>{for(const s of streams){if(s.expires<Date.now()||!d.get('SELECT token FROM sessions WHERE token=?',s.token)){s.res.end();streams.delete(s);}else s.res.write(': keepalive\n\n');}for(const [key,b] of buckets)if(Date.now()-b.at>120000)buckets.delete(key);},15000);heartbeat.unref();
 return {server,d,app,wa,audio,flush:wa.flush,close:async()=>{clearInterval(outboundTimer);clearInterval(heartbeat);await audio.stop();await wa.idle();for(const s of streams)s.res.end();await new Promise(r=>server.close(r));d.db.close();}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(existsSync(path.join(root,'.env')))process.loadEnvFile(path.join(root,'.env'));
 const demo=process.argv.includes('--demo'),hosted=process.argv.includes('--hosted');
 if(demo===hosted){console.error('Choose --demo (local only) or --hosted (invitation pilot).');process.exit(1);}
 const app=createApp({demo,dbPath:process.env.DB_PATH||path.join(root,'data',demo?'mane.sqlite':'pilot.sqlite')});const port=Number(process.env.PORT||4180);
 app.server.listen(port,demo?'127.0.0.1':'0.0.0.0',()=>console.log(demo?`Local pilot: http://127.0.0.1:${port}`: 'Invitation pilot listening. Public origin: '+process.env.PUBLIC_ORIGIN));
 let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;await app.close();process.exit(0);});
}
