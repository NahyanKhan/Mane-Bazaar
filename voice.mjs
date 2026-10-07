// Audio is fetched only from Meta and held in memory; it is not written to disk.
// Transcripts are untrusted input and can only create a draft, never confirm it.
export function voice(d,env,transport,app,wa,notify){
 let active=null,closing=false;
 const enabled=()=>env.VOICE_ENABLED==='true'&&env.SARVAM_API_KEY&&env.WHATSAPP_ACCESS_TOKEN&&/^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_VERSION||'');
 const advice=()=>app.shop().language==='kn'?'ಧ್ವನಿಯನ್ನು ಓದಲು ಆಗಲಿಲ್ಲ. 30 ಸೆಕೆಂಡಿಗಿಂತ ಕಡಿಮೆ ಧ್ವನಿ ಅಥವಾ ಪಠ್ಯ ಸಂದೇಶ ಕಳುಹಿಸಿ.':'Unable to read that voice note. Send a note under 30 seconds, or type the listing.';
 for(const job of d.all("SELECT * FROM audio_jobs WHERE state='processing'")){
  d.run("UPDATE audio_jobs SET state='failed' WHERE id=?",job.id);wa.enqueue(job.id,job.sender,advice());
 }
 function enqueue(id,sender,media){
  if(!/^[0-9]+$/.test(media||''))return false;
  d.run("INSERT OR IGNORE INTO audio_jobs(id,sender,media,state) VALUES(?,?,?,'queued')",id,sender,media);return true;
 }
 async function bounded(r){
  if(!r.ok||Number(r.headers.get('content-length')||0)>8*1024*1024)throw Error('Media unavailable or too large');
  const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>8*1024*1024)throw Error('Media too large');chunks.push(chunk);}return Buffer.concat(chunks);
 }
 async function transcribe(job){
  const headers={Authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`};
  const metadata=await transport(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${job.media}`,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!metadata.ok)throw Error('Media lookup failed');const info=await metadata.json();
  const url=new URL(info.url);
  if(url.protocol!=='https:'||!['lookaside.fbsbx.com','lookaside.facebook.com'].includes(url.hostname)||url.username||url.password||url.port)throw Error('Unexpected media host');
  if(!String(info.mime_type).startsWith('audio/')||Number(info.file_size)>8*1024*1024)throw Error('Not a supported short audio note');
  const content=await bounded(await transport(url.href,{headers,signal:AbortSignal.timeout(15000),redirect:'error'}));
  const form=new FormData();form.set('file',new Blob([content],{type:info.mime_type}),'voice.ogg');form.set('model',env.SARVAM_MODEL||'saaras:v3');form.set('mode','transcribe');form.set('language_code','unknown');
  const result=await transport('https://api.sarvam.ai/speech-to-text',{method:'POST',headers:{'api-subscription-key':env.SARVAM_API_KEY},body:form,signal:AbortSignal.timeout(30000)});
  if(!result.ok)throw Error('Transcription failed');const data=await result.json();
  if(typeof data.transcript!=='string'||!data.transcript.trim()||data.transcript.length>1000)throw Error('No usable transcript');
  return data.transcript;
 }
 async function work(){
  for(const job of d.all("SELECT * FROM audio_jobs WHERE state='queued' ORDER BY rowid LIMIT 10")){
   if(closing)break;
   d.run("UPDATE audio_jobs SET state='processing' WHERE id=?",job.id);
   try{
    const transcript=await transcribe(job);
    const reply=app.chat(job.id,'LIST '+transcript);
    wa.enqueue(job.id,job.sender,(app.shop().language==='kn'?'ಕೇಳಿಸಿಕೊಂಡದ್ದು: ':'I heard: ')+transcript+'\n\n'+reply);
    d.run("UPDATE audio_jobs SET state='done' WHERE id=?",job.id);
   }catch{
    d.run("UPDATE audio_jobs SET state='failed' WHERE id=?",job.id);wa.enqueue(job.id,job.sender,advice());
   }
   d.run('UPDATE meta SET version=version+1 WHERE id=1');notify();await wa.flush();
  }
 }
 function drain(){if(active||closing||!enabled())return active||Promise.resolve();active=work().finally(()=>{active=null;});return active;}
 return {enabled,enqueue,drain,stop:async()=>{closing=true;if(active)await active;}};
}
