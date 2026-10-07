import {randomBytes,randomInt} from 'node:crypto';
export const AREAS={Vidyanagar:[15.376,75.118],Keshwapur:[15.365,75.145],Unkal:[15.391,75.111],'Gokul Road':[15.352,75.100]};
export const uid=()=>randomBytes(8).toString('hex');
export const now=()=>new Date().toISOString();
export function fail(status,message){throw Object.assign(new Error(message),{status})}
const text=(v,max=200)=>typeof v==='string'&&v.trim()&&v.trim().length<=max?v.trim():fail(400,'Please complete the required fields.');
const num=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max?v:fail(400,'Enter a valid whole number.');
const area=v=>Object.hasOwn(AREAS,v)?v:fail(400,'Choose a supported neighbourhood.');
const role=(u,r)=>u.role===r||fail(403,'This action is not available to your account.');
export function km(a,b){let [lat,lon]=AREAS[a],[lat2,lon2]=AREAS[b],r=x=>x*Math.PI/180;return Math.round(6371*2*Math.asin(Math.sqrt(Math.sin(r(lat-lat2)/2)**2+Math.cos(r(lat))*Math.cos(r(lat2))*Math.sin(r(lon-lon2)/2)**2))*10)/10}
export function domain(d,{onNewOrder=()=>{}}={}){
 const {get,all,run,tx}=d;
 const shop=()=>get('SELECT * FROM shop WHERE id=1');
 const version=()=>get('SELECT version FROM meta WHERE id=1').version;
 const bump=()=>run('UPDATE meta SET version=version+1 WHERE id=1');
 const event=(id,action,actor)=>run('INSERT INTO events(order_id,action,actor,created) VALUES(?,?,?,?)',id,action,actor,now());
 const order=id=>get('SELECT * FROM orders WHERE id=?',id)||fail(404,'Order not found.');
 function state(u){
  let s=shop(),orders=u.role==='seller'?all('SELECT * FROM orders ORDER BY created DESC'):u.role==='customer'?all('SELECT * FROM orders WHERE customer=? ORDER BY created DESC',u.account):all('SELECT * FROM orders WHERE rider=? ORDER BY created DESC',u.account);
  let r=u.role==='rider'?get('SELECT * FROM riders WHERE id=?',u.account):null;
  let jobs=r&&r.online&&Date.now()-r.updated<600000&&km(r.area,s.area)<=8?all("SELECT id,area,qty,name,name_kn,unit FROM orders WHERE status='ready' AND mode='rider' AND rider IS NULL").map(o=>({...o,pickup_area:s.area,distance:km(r.area,s.area)})):[];
  return {version:version(),account:u.account,role:u.role,shop:u.role==='seller'?s:{name:s.name,name_kn:s.name_kn,area:s.area,open:s.open},products:all('SELECT * FROM products'),orders:orders.map(o=>{let x={...o};delete x.customer;delete x.request_key;if(u.role!=='seller')delete x.pickup_code;if(u.role!=='customer')delete x.delivery_code;if(u.role==='rider'||(u.role==='customer'&&o.mode==='pickup'&&o.status!=='new'))x.pickup_address=s.address;x.events=all('SELECT action,created FROM events WHERE order_id=? ORDER BY id',o.id);return x}),rider:r,jobs,areas:Object.keys(AREAS),inbox:u.role==='seller'?all('SELECT * FROM inbox ORDER BY created DESC LIMIT 15'):[],drafts:u.role==='seller'?all("SELECT * FROM drafts WHERE state='pending'").map(x=>({...x,data:JSON.parse(x.data)})):[],outbox:u.role==='seller'?all('SELECT id,state,error,created FROM outbox ORDER BY id DESC LIMIT 10'):[]};
 }
 function mutate(u,p,b){return tx(()=>{let result={ok:true};
  if(p==='profile'){role(u,'seller');run('UPDATE shop SET name=?,name_kn=?,area=?,address=?,open=?,language=? WHERE id=1',text(b.name,70),text(b.name_kn,100),area(b.area),text(b.address,250),b.open===true?1:0,b.language==='kn'?'kn':'en');}
  else if(p==='product'){role(u,'seller');let cutoff=b.cutoff||null;if(cutoff&&(!Number.isFinite(Date.parse(cutoff))||Date.parse(cutoff)<=Date.now()))fail(400,'Choose a future closing time.');let values=[text(b.name,70),text(b.name_kn,100),num(b.price,1,100000),num(b.stock,0,9999),text(b.unit,60),['chakli','peda','pickle'].includes(b.image)?b.image:'',b.active===false?0:1,cutoff];if(b.id){if(!get('SELECT id FROM products WHERE id=?',b.id))fail(404,'Product not found.');run('UPDATE products SET name=?,name_kn=?,price=?,stock=?,unit=?,image=?,active=?,cutoff=? WHERE id=?',...values,b.id);}else result.id=Number(run('INSERT INTO products(name,name_kn,price,stock,unit,image,active,cutoff) VALUES(?,?,?,?,?,?,?,?)',...values).lastInsertRowid);}
  else if(p==='order'){role(u,'customer');const key=text(b.key,100),prior=get('SELECT id FROM orders WHERE customer=? AND request_key=?',u.account,key);if(prior)return {id:prior.id};if(!shop().open)fail(409,'The shop is paused.');let prod=get('SELECT * FROM products WHERE id=?',num(b.product,1,999999));if(!prod||!prod.active||(prod.cutoff&&Date.parse(prod.cutoff)<=Date.now()))fail(409,'This item is unavailable.');let qty=num(b.qty,1,50);if(prod.stock<qty)fail(409,'Not enough stock. Please choose fewer packs.');if(!['pickup','self','rider'].includes(b.mode))fail(400,'Choose a delivery option.');if(!['cod','upi'].includes(b.payment_method))fail(400,'Choose a payment method.');const id='MB-'+uid().slice(0,8).toUpperCase();run('UPDATE products SET stock=stock-? WHERE id=?',qty,prod.id);run('INSERT INTO orders(id,customer,product,name,name_kn,unit,price,qty,total,mode,status,area,address,customer_name,payment_method,pickup_code,delivery_code,created,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,u.account,prod.id,prod.name,prod.name_kn,prod.unit,prod.price,qty,prod.price*qty,b.mode,'new',area(b.area),b.mode==='pickup'?'Customer pickup':text(b.address,250),text(b.name,70),b.payment_method,String(randomInt(100000,1000000)),String(randomInt(100000,1000000)),now(),key);event(id,'created',u.account);onNewOrder(order(id));result.id=id;}
  else if(p==='action'){let o=order(text(b.id,50)),a=text(b.action,30),next;
   if(u.role==='seller'){
    if(a==='accept'&&o.status==='new')next='accepted';else if(a==='decline'&&o.status==='new')next='declined';else if(a==='ready'&&o.status==='accepted')next='ready';else if(a==='dispatch'&&o.status==='ready'&&o.mode==='self')next='picked_up';else if(a==='deliver'&&((o.status==='ready'&&o.mode==='pickup')||(o.status==='picked_up'&&o.mode==='self'))){if(b.code!==o.delivery_code)fail(400,'Incorrect customer handover code.');next='delivered';}else if(a==='paid'&&!['cancelled','declined'].includes(o.status)){run("UPDATE orders SET payment='seller-confirmed' WHERE id=?",o.id);event(o.id,'payment_recorded',u.account);bump();return result;}else if(a==='cancel'&&['accepted','ready'].includes(o.status))next='cancelled';else fail(409,'That action is not available now.');
   }else if(u.role==='customer'){
    if(o.customer!==u.account)fail(403,'Not your order.');if(a==='cancel'&&o.status==='new')next='cancelled';else if(a==='received'&&o.status==='delivered'){run('UPDATE orders SET confirmed=1 WHERE id=?',o.id);event(o.id,'customer_confirmed',u.account);bump();return result;}else fail(409,'That action is not available now.');
   }else if(u.role==='rider'){
    if(o.rider!==u.account)fail(403,'Not assigned to you.');if(a==='pickup'&&o.status==='ready'){if(b.code!==o.pickup_code)fail(400,'Incorrect seller pickup code.');next='picked_up';}else if(a==='deliver'&&o.status==='picked_up'){if(b.code!==o.delivery_code)fail(400,'Incorrect customer handover code.');next='delivered';}else if(a==='release'&&o.status==='ready'){run('UPDATE orders SET rider=NULL WHERE id=?',o.id);event(o.id,'rider_released',u.account);bump();return result;}else fail(409,'That action is not available now.');
   }else fail(403,'Not allowed.');
   if(['cancelled','declined'].includes(next))run('UPDATE products SET stock=stock+? WHERE id=?',o.qty,o.product);run('UPDATE orders SET status=? WHERE id=?',next,o.id);event(o.id,a,u.account);
  }else if(p==='availability'){role(u,'rider');run('UPDATE riders SET online=?,area=?,updated=? WHERE id=?',b.online===true?1:0,area(b.area),Date.now(),u.account);}
  else if(p==='claim'){role(u,'rider');let r=get('SELECT * FROM riders WHERE id=?',u.account);if(!r.online||Date.now()-r.updated>600000||km(r.area,shop().area)>8)fail(409,'Refresh your availability and neighbourhood first.');if(get("SELECT id FROM orders WHERE rider=? AND status IN ('ready','picked_up')",u.account))fail(409,'Finish your current delivery first.');if(run("UPDATE orders SET rider=? WHERE id=? AND status='ready' AND mode='rider' AND rider IS NULL",u.account,text(b.id,50)).changes!==1)fail(409,'This job was already claimed or is no longer available.');event(b.id,'rider_assigned',u.account);}
  else fail(404,'Unknown action.');bump();return result;
 });}
 function chat(messageId,body){return tx(()=>{
  const prior=get('SELECT reply FROM inbox WHERE id=?',messageId);if(prior)return prior.reply;
  body=body.replace(/[\u0CE6-\u0CEF]/g,c=>String(c.charCodeAt(0)-0xCE6));
  const kn=shop().language==='kn',choose=(en,k)=>kn?k:en;let reply;
  const confirm=body.trim().match(/^(?:CONFIRM|ದೃಢೀಕರಿಸಿ)\s+([a-f0-9]+)$/i);
  const command=body.trim().match(/^(ACCEPT|READY|ಸ್ವೀಕರಿಸಿ|ಸಿದ್ಧ)\s+(MB-[a-f0-9]+)$/i);
  if(confirm){let draft=get("SELECT * FROM drafts WHERE id=? AND state='pending'",confirm[1]);if(!draft)reply=choose('Draft not found or already confirmed.','ಕರಡು ಸಿಗಲಿಲ್ಲ ಅಥವಾ ಈಗಾಗಲೇ ದೃಢಪಡಿಸಲಾಗಿದೆ.');else{const p=JSON.parse(draft.data);run('INSERT INTO products(name,name_kn,price,stock,unit,image,active) VALUES(?,?,?,?,?,?,1)',p.name,p.name_kn,p.price,p.stock,p.unit,p.image);run("UPDATE drafts SET state='confirmed' WHERE id=?",draft.id);reply=choose('Published. Your shop has updated.','ಪ್ರಕಟಿಸಲಾಗಿದೆ. ನಿಮ್ಮ ಅಂಗಡಿ ಬದಲಾಗಿದೆ.');}}
  else if(command){let o=get('SELECT * FROM orders WHERE id=?',command[2].toUpperCase()),accept=/ACCEPT|ಸ್ವೀಕರಿಸಿ/i.test(command[1]);if(!o||o.status!==(accept?'new':'accepted'))reply=choose('Order not found or action unavailable.','ಆರ್ಡರ್ ಸಿಗಲಿಲ್ಲ ಅಥವಾ ಕ್ರಿಯೆ ಲಭ್ಯವಿಲ್ಲ.');else{run('UPDATE orders SET status=? WHERE id=?',accept?'accepted':'ready',o.id);event(o.id,accept?'accept':'ready','seller-whatsapp');reply=choose('Order updated.','ಆರ್ಡರ್ ಬದಲಾಗಿದೆ.');}}
  else if(/^(orders|ಆರ್ಡರ್)$/i.test(body.trim())){let rows=all("SELECT id,name,qty,status FROM orders WHERE status IN ('new','accepted','ready')");reply=rows.length?rows.map(o=>`${o.id}: ${o.qty} × ${o.name} (${o.status})`).join('\n'):choose('No open orders.','ಬಾಕಿ ಆರ್ಡರ್‌ಗಳಿಲ್ಲ.');}
  else{
   // Deliberately constrained parser. Never infer a pack size or silently publish.
   let qty=Number(body.match(/(\d+)\s*(?:boxes|packs|ಡಬ್ಬಿ|ಪ್ಯಾಕ್)/i)?.[1]||(/ಇಪ್ಪತ್ತು|ippattu/i.test(body)?20:0)),price=Number(body.match(/(\d+)\s*(?:rupees|ರೂಪಾಯಿ|ರೂ|rs)/i)?.[1]||body.match(/₹\s*(\d+)/)?.[1]||(/ನೂರೈವತ್ತು|nooraivattu/i.test(body)?150:0));
   const unit=body.match(/(\d+)\s*(kilograms?|grams?|kg|g|ಗ್ರಾಂ|ಕೆಜಿ)(?=\s|$|[,\.])/i);const known=/ಚಕ್ಲಿ|chakli/i.test(body)?['Homemade chakli','ಮನೆಯ ಚಕ್ಲಿ','chakli']:/peda|ಪೇಡ/i.test(body)?['Dharwad peda','ಧಾರವಾಡ ಪೇಡ','peda']:null;
   if(known&&qty>0&&qty<=999&&price>0&&price<=100000&&unit){let draft={name:known[0],name_kn:known[1],image:known[2],stock:qty,price,unit:unit[0]},id=uid();run('INSERT INTO drafts(id,data,created) VALUES(?,?,?)',id,JSON.stringify(draft),now());reply=choose(`Please check: ${qty} packs of ${known[0]}, ₹${price} per pack, ${unit[0]}. Reply CONFIRM ${id} to publish.`,`ಪರಿಶೀಲಿಸಿ: ${known[1]}, ${qty} ಪ್ಯಾಕ್, ಪ್ರತಿ ಪ್ಯಾಕ್ ₹${price}, ${unit[0]}. ಪ್ರಕಟಿಸಲು CONFIRM ${id} ಎಂದು ಕಳುಹಿಸಿ.`);}
   else reply=choose('Please use: chakli 20 boxes, 150 rupees per box, 250 g. I need product, quantity, unit price and pack size. Or use the seller form. Commands: ORDERS, ACCEPT <order ID>, READY <order ID>. For voice, enable the server voice connector first.','ಉದಾಹರಣೆ: ಚಕ್ಲಿ 20 ಡಬ್ಬಿ, ಪ್ರತಿ ಡಬ್ಬಿಗೆ 150 ರೂಪಾಯಿ, 250 g. ಉತ್ಪನ್ನ, ಸಂಖ್ಯೆ, ಬೆಲೆ ಮತ್ತು ಪ್ರಮಾಣ ಬೇಕು. ಅಥವಾ ಆ್ಯಪ್ ಫಾರ್ಮ್ ಬಳಸಿ. ಧ್ವನಿ ಗುರುತಿಸುವಿಕೆ ಇನ್ನೂ ಸಂಪರ್ಕಗೊಂಡಿಲ್ಲ.');
  }
  run('INSERT INTO inbox VALUES(?,?,?,?)',messageId,body.slice(0,1000),reply,now());bump();return reply;
 });}
 return {state,mutate,chat,version,shop};
}
