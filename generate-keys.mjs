import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {digest} from './access.mjs';
const keys=Object.fromEntries(['seller','customer','rider'].map(role=>[role,randomBytes(32).toString('base64url')]));
const text=`PRIVATE PILOT ACCESS - do not commit or share this entire file.\n\nSeller access key: ${keys.seller}\nCustomer pilot access key: ${keys.customer}\nRider ID: rider\nRider access key: ${keys.rider}\n\nCopy the following hashes into your hosting environment variables:\nSELLER_ACCESS_KEY_HASH=${digest(keys.seller)}\nPILOT_ACCESS_KEY_HASH=${digest(keys.customer)}\nRIDER_ACCESS_KEYS_JSON=${JSON.stringify({rider:digest(keys.rider)})}\n\nUse each access key only with its intended participant. Treat keys as passwords.\nRotating a configured hash invalidates all existing hosted sessions.\n`;
writeFileSync('pilot-access.private.txt',text,{flag:'wx',mode:0o600});
console.log('Created pilot-access.private.txt locally. Keep it private. Existing files are never overwritten.');
