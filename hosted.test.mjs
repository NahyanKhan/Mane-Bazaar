import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from './server.mjs';
import {digest} from './access.mjs';
const settings=()=>({PUBLIC_ORIGIN:'https://pilot.example.com',SELLER_ACCESS_KEY_HASH:digest('seller-test-key'),PILOT_ACCESS_KEY_HASH:digest('customer-test-key'),RIDER_ACCESS_KEYS_JSON:JSON.stringify({rider:digest('rider-test-key')}),WHATSAPP_SELLER_NUMBER:'919000000000',WHATSAPP_APP_SECRET:'test-secret',WHATSAPP_VERIFY_TOKEN:'verify'});
test('Hosted pilot access and website-to-WhatsApp automation',async t=>{
 const env=settings(),sent=[];
 let uncertain=false;
 const transport=async(url,options)=>{sent.push(JSON.parse(options.body));if(uncertain)throw Error('timeout');return {ok:true,json:async()=>({messages:[{id:'wamid-'+sent.length}]})};};
 const app=createApp({dbPath:':memory:',env,transport});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 const request=async(route,body,token,origin)=>{const r=await fetch(base+'/api/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
 const login=async(role,key,account)=>(await request('access',{role,key,account})).body.token;
 let seller,c1,c2,oid;
 const order=key=>({key,product:1,qty:1,mode:'pickup',name:'Sample customer',area:'Vidyanagar',payment_method:'cod'});
 try{
  await t.test('Missing HTTPS and access settings fail closed',()=>{assert.throws(()=>createApp({dbPath:':memory:',env:{}}),/PUBLIC_ORIGIN/);assert.throws(()=>createApp({dbPath:':memory:',env:{PUBLIC_ORIGIN:'https://pilot.example.com'}}),/rider/);});
  await t.test('Demo impersonation is disabled; keys cannot cross roles',async()=>{
   assert.equal((await request('session',{account:'seller'})).status,404);
   assert.equal((await request('access',{role:'seller',key:'customer-test-key'})).status,401);
   assert.equal((await request('access',{role:'rider',key:'rider-test-key',account:'rider2'})).status,401);
   assert.equal((await request('access',{role:'seller',key:'seller-test-key'},null,'https://other.example.com')).status,403);
   seller=await login('seller','seller-test-key');c1=await login('customer','customer-test-key');c2=await login('customer','customer-test-key');
   assert.ok(seller&&c1&&c2);assert.notEqual(c1,c2);
   assert.equal((await request('state',undefined,seller)).body.role,'seller');
   assert.equal((await request('state',undefined,await login('rider','rider-test-key','rider'))).body.role,'rider');
  });
  await t.test('Customer sessions remain isolated and an order queues one notification',async()=>{
   oid=(await request('order',order('one'),c1)).body.id;assert.ok(oid);
   assert.equal((await request('order',order('one'),c1)).body.id,oid);
   assert.equal((await request('state',undefined,c2)).body.orders.length,0);
   assert.equal(app.d.get('SELECT COUNT(*) AS n FROM outbox WHERE message_id=?','order:'+oid).n,1);
   assert.equal(sent.length,0);
  });
  await t.test('Outside the reply window a message is held without an approved template',async()=>{
   Object.assign(env,{WHATSAPP_SEND_ENABLED:'true',WHATSAPP_ACCESS_TOKEN:'mock-only',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_GRAPH_VERSION:'v99.0'});
   await app.flush();assert.equal(sent.length,0);assert.equal(app.d.get('SELECT state FROM outbox').state,'blocked');
   app.wa.received(env.WHATSAPP_SELLER_NUMBER,Math.floor(Date.now()/1000)-48*3600);await app.flush();assert.equal(sent.length,0);
  });
  await t.test('A current seller message opens the reply window and releases the notification once',async()=>{
   app.wa.received(env.WHATSAPP_SELLER_NUMBER,Math.floor(Date.now()/1000));await app.flush();await app.flush();assert.equal(sent.length,1);assert.equal(sent[0].type,'text');assert.match(sent[0].text.body,new RegExp(oid));assert.equal(sent[0].to,env.WHATSAPP_SELLER_NUMBER);
  });
  await t.test('An approved template is used outside the window and receipts do not regress',async()=>{
   app.d.run('DELETE FROM wa_contacts');env.WHATSAPP_ORDER_TEMPLATE='mane_order_alert';env.WHATSAPP_TEMPLATE_LANGUAGE='en';
   app.wa.orderCreated({id:'MB-TEMPLATE',qty:1,name:'Chakli',name_kn:'ಚಕ್ಲಿ',total:150});await app.flush();
   assert.equal(sent[1].type,'template');assert.equal(sent[1].template.components[0].parameters.length,1);
   app.wa.status({id:'wamid-2',status:'read'});app.wa.status({id:'wamid-2',status:'sent'});app.wa.status({id:'wamid-2',status:'failed'});
   assert.equal(app.d.get('SELECT state FROM outbox WHERE provider_id=?','wamid-2').state,'read');
  });
  await t.test('Uncertain sends are not retried automatically',async()=>{
   uncertain=true;app.wa.orderCreated({id:'MB-UNKNOWN',qty:1,name:'Chakli',name_kn:'ಚಕ್ಲಿ',total:150});await app.flush();await app.flush();assert.equal(sent.length,3);assert.equal(app.d.get('SELECT state FROM outbox WHERE message_id=?','order:MB-UNKNOWN').state,'unknown');
  });
  await t.test('Logout revokes the server session',async()=>{assert.equal((await request('logout',{},seller)).status,200);assert.equal((await request('state',undefined,seller)).status,401);});
 }finally{await app.close();}
});
