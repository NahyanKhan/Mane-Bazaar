import {now} from './domain.mjs';
// One explicitly allowlisted seller. No customer phone numbers are collected or messaged.
export function whatsapp(d,env,transport,notify){
 let sending=false;
 const enabled=()=>env.WHATSAPP_SEND_ENABLED==='true'&&env.WHATSAPP_ACCESS_TOKEN&&/^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_VERSION||'')&&/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID||'');
 const inWindow=recipient=>{const c=d.get('SELECT last_message FROM wa_contacts WHERE number=?',recipient);return c&&Date.now()-c.last_message<23*3600000;};
 function received(number,timestamp){let time=Number(timestamp)*1000;if(!Number.isFinite(time)||time>Date.now()+60000)return;time=Math.min(time,Date.now());d.run('INSERT INTO wa_contacts(number,last_message) VALUES(?,?) ON CONFLICT(number) DO UPDATE SET last_message=MAX(last_message,excluded.last_message)',number,time);}
 function enqueue(id,recipient,body,kind='reply'){
  d.run('INSERT OR IGNORE INTO outbox(message_id,recipient,body,created,kind) VALUES(?,?,?,?,?)',id,recipient,body,now(),kind);
 }
 function orderCreated(order){
  if(!env.WHATSAPP_SELLER_NUMBER)return;
  const kn=d.get('SELECT language FROM shop WHERE id=1').language==='kn';
  const body=kn?`ಹೊಸ ಆರ್ಡರ್ ${order.id}: ${order.qty} x ${order.name_kn}, ₹${order.total}. ಸ್ವೀಕರಿಸಲು ACCEPT ${order.id} ಎಂದು ಕಳುಹಿಸಿ.`:`New order ${order.id}: ${order.qty} x ${order.name}, ₹${order.total}. Reply ACCEPT ${order.id} to accept.`;
  enqueue('order:'+order.id,env.WHATSAPP_SELLER_NUMBER,body,'order');
 }
 function status(s){
  if(typeof s.id!=='string'||!['sent','delivered','read','failed'].includes(s.status))return;
  const ranks={sent:1,failed:2,delivered:3,read:4};
  const prior=d.get('SELECT state FROM wa_receipts WHERE provider_id=?',s.id);
  if(prior&&ranks[prior.state]>=ranks[s.status])return;
  d.run('INSERT INTO wa_receipts(provider_id,state) VALUES(?,?) ON CONFLICT(provider_id) DO UPDATE SET state=excluded.state',s.id,s.status);
  d.run('UPDATE outbox SET state=?,error=? WHERE provider_id=?',s.status,s.status==='failed'?'Provider reported delivery failure.':null,s.id);
 }
 async function flush(){
  if(sending||!enabled())return;sending=true;
  let changed=false;
  try{for(const m of d.all("SELECT * FROM outbox WHERE state IN ('queued','blocked') ORDER BY id LIMIT 25")){
   if(Date.now()-Date.parse(m.created)>23*3600000){d.run("UPDATE outbox SET state='expired',error='Notification expired. Review orders in the app.' WHERE id=?",m.id);changed=true;continue;}
   let payload={messaging_product:'whatsapp',to:m.recipient};
   if(inWindow(m.recipient)){payload={...payload,type:'text',text:{body:m.body.slice(0,4000)}};}
   else if(m.kind==='order'&&/^[a-z0-9_]+$/.test(env.WHATSAPP_ORDER_TEMPLATE||'')&&/^[a-z]{2}(?:_[A-Z]{2})?$/.test(env.WHATSAPP_TEMPLATE_LANGUAGE||'')){
    payload={...payload,type:'template',template:{name:env.WHATSAPP_ORDER_TEMPLATE,language:{code:env.WHATSAPP_TEMPLATE_LANGUAGE},components:[{type:'body',parameters:[{type:'text',text:m.body}]}]}};
   }else{if(m.state!=='blocked'){d.run("UPDATE outbox SET state='blocked',error='Seller must message first, or configure an approved order template.' WHERE id=?",m.id);changed=true;}continue;}
   d.run("UPDATE outbox SET state='sending',error=NULL WHERE id=?",m.id);changed=true;
   try{
    const r=await transport(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:'POST',headers:{Authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    const result=await r.json(),id=result.messages?.[0]?.id;
    if(!r.ok)d.run("UPDATE outbox SET state='failed',error=? WHERE id=?",`Provider rejected request (${r.status}). Review configuration.`,m.id);
    else if(!id)d.run("UPDATE outbox SET state='unknown',error='Provider response contained no message ID; inspect before retrying.' WHERE id=?",m.id);
    else d.run('UPDATE outbox SET state=?,provider_id=? WHERE id=?',d.get('SELECT state FROM wa_receipts WHERE provider_id=?',id)?.state||'sent',id,m.id);
   }catch{d.run("UPDATE outbox SET state='unknown',error='Send outcome uncertain; inspect provider before retrying.' WHERE id=?",m.id);}
  }}finally{sending=false;if(changed){d.run('UPDATE meta SET version=version+1 WHERE id=1');notify();}}
 }
 d.run("UPDATE outbox SET state='unknown',error='Server restarted during send; inspect provider before retrying.' WHERE state='sending'");
 async function idle(){while(sending)await new Promise(r=>setTimeout(r,20));}
 return {received,enqueue,orderCreated,status,flush,idle};
}
