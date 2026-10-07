import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createApp} from './server.mjs';
test('Signed WhatsApp audio to a confirmed catalogue draft',async t=>{
 const env={WHATSAPP_SELLER_NUMBER:'919000000000',WHATSAPP_APP_SECRET:'mock-secret',WHATSAPP_VERIFY_TOKEN:'verify',WHATSAPP_ACCESS_TOKEN:'mock-meta-token',WHATSAPP_GRAPH_VERSION:'v99.0',VOICE_ENABLED:'true',SARVAM_API_KEY:'mock-sarvam-key'};
 let transcript='ಚಕ್ಲಿ ೨೦ ಡಬ್ಬಿ, ಪ್ರತಿ ಡಬ್ಬಿಗೆ ೧೫೦ ರೂಪಾಯಿ, 250 ಗ್ರಾಂ',calls=0,unsafe=false;
 const transport=async(url,options)=>{
  if(url.startsWith('https://graph.facebook.com/'))return Response.json({url:unsafe?'https://example.org/steal':'https://lookaside.fbsbx.com/media',mime_type:'audio/ogg',file_size:4});
  if(url.startsWith('https://lookaside.fbsbx.com/'))return new Response(new Uint8Array([1,2,3,4]),{headers:{'Content-Type':'audio/ogg'}});
  assert.equal(url,'https://api.sarvam.ai/speech-to-text');calls++;
  assert.equal(options.headers['api-subscription-key'],'mock-sarvam-key');assert.equal(options.body.get('language_code'),'unknown');assert.equal(options.body.get('mode'),'transcribe');
  return Response.json({transcript,language_code:'kn-IN'});
 };
 const app=createApp({dbPath:':memory:',demo:true,env,transport});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const post=async id=>{
  const body=JSON.stringify({entry:[{changes:[{value:{messages:[{id,from:env.WHATSAPP_SELLER_NUMBER,timestamp:String(Math.floor(Date.now()/1000)),type:'audio',audio:{id:'123456'}}]}}]}]});
  const r=await fetch('http://127.0.0.1:'+app.server.address().port+'/webhooks/whatsapp',{method:'POST',headers:{'x-hub-signature-256':'sha256='+createHmac('sha256',env.WHATSAPP_APP_SECRET).update(body).digest('hex')},body});assert.equal(r.status,200);await app.audio.drain();
 };
 try{
  let draft;
  await t.test('Kannada transcript creates a draft, not an immediately published product',async()=>{
   await post('voice-1');assert.equal(calls,1);assert.equal(app.d.get('SELECT COUNT(*) AS n FROM products').n,3);
   draft=app.d.get("SELECT * FROM drafts WHERE state='pending'");assert.ok(draft);const data=JSON.parse(draft.data);assert.equal(data.stock,20);assert.equal(data.price,150);
   assert.match(app.d.get('SELECT body FROM outbox WHERE message_id=?','voice-1').body,/CONFIRM/);
  });
  await t.test('Duplicate audio webhook does not re-transcribe or duplicate drafts',async()=>{await post('voice-1');assert.equal(calls,1);assert.equal(app.d.get('SELECT COUNT(*) AS n FROM drafts').n,1);});
  await t.test('A spoken confirmation cannot publish; explicit text confirmation can',async()=>{
   transcript='CONFIRM '+draft.id;await post('voice-2');assert.equal(app.d.get('SELECT COUNT(*) AS n FROM products').n,3);
   app.app.chat('text-confirm','CONFIRM '+draft.id);assert.equal(app.d.get('SELECT COUNT(*) AS n FROM products').n,4);
  });
  await t.test('Unexpected media host is rejected before tokens or audio reach it',async()=>{
   unsafe=true;const before=calls;await post('voice-3');assert.equal(calls,before);assert.equal(app.d.get('SELECT state FROM audio_jobs WHERE id=?','voice-3').state,'failed');
   assert.match(app.d.get('SELECT body FROM outbox WHERE message_id=?','voice-3').body,/Unable to read/);
  });
 }finally{await app.close();}
});
