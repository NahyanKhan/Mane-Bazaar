import {createHash, timingSafeEqual, randomBytes} from 'node:crypto';
export const digest=value=>createHash('sha256').update(value).digest('hex');
const validHash=value=>/^[a-f0-9]{64}$/.test(value||'');
export function accessConfig(env,demo){
 if(demo)return {epoch:'demo',origin:null};
 let origin;
 try{origin=new URL(env.PUBLIC_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==env.PUBLIC_ORIGIN)throw Error();}catch{throw Error('Set PUBLIC_ORIGIN to the exact HTTPS origin, without a trailing slash.');}
 let riders;try{riders=JSON.parse(env.RIDER_ACCESS_KEYS_JSON||'{}');}catch{throw Error('RIDER_ACCESS_KEYS_JSON must contain a JSON object of rider IDs and SHA-256 hashes.');}
 if(!riders||Array.isArray(riders)||typeof riders!=='object'||!Object.keys(riders).length||Object.entries(riders).some(([id,h])=>!/^rider[-a-z0-9]{0,35}$/.test(id)||!validHash(h)))throw Error('Configure at least one rider access-key hash.');
 if(!validHash(env.SELLER_ACCESS_KEY_HASH)||!validHash(env.PILOT_ACCESS_KEY_HASH))throw Error('Configure seller and customer pilot access-key hashes.');
 if(new Set([env.SELLER_ACCESS_KEY_HASH,env.PILOT_ACCESS_KEY_HASH,...Object.values(riders)]).size!==Object.keys(riders).length+2)throw Error('Each role and rider must use a different access key.');
 return {origin:origin.origin,riders,epoch:digest(JSON.stringify([env.SELLER_ACCESS_KEY_HASH,env.PILOT_ACCESS_KEY_HASH,riders]))};
}
export function identify(body,env,config){
 const role=body?.role;if(!['seller','customer','rider'].includes(role))return null;
 const expected=role==='seller'?env.SELLER_ACCESS_KEY_HASH:role==='customer'?env.PILOT_ACCESS_KEY_HASH:config.riders[body.account];
 if(!validHash(expected)||typeof body.key!=='string'||body.key.length>200||!timingSafeEqual(Buffer.from(expected),Buffer.from(digest(body.key))))return null;
 return {role,account:role==='seller'?'seller':role==='rider'?body.account:'guest-'+randomBytes(16).toString('hex')};
}
