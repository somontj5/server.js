'use strict';
// Server-only adapter. The APK never receives URL, service key or storage URLs.
const fs=require('node:fs'),crypto=require('node:crypto');
const TABLES=['gm_users','gm_listings','gm_favorites','gm_sessions','gm_guest_accounts','gm_login_codes','gm_threads','gm_messages','gm_reviews','gm_searches','gm_metadata','gm_media'];
const clone=v=>JSON.parse(JSON.stringify(v));
const empty=()=>Object.fromEntries(TABLES.map(t=>[t,{}]));
const ref=/^gm-media:([a-f0-9]{64})$/;
function encode(db){
 const t=empty(),extra=clone(db);
 for(const [key,table] of [['users','gm_users'],['listings','gm_listings'],['sessions','gm_sessions'],['guestAccounts','gm_guest_accounts'],['searches','gm_searches']]){t[table]=clone(db[key]||{});delete extra[key]}
 for(const [id,u] of Object.entries(t.gm_users)){(u.favs||[]).forEach((listingId,position)=>{t.gm_favorites[JSON.stringify([id,listingId])]={userId:id,listingId,position}});delete u.favs}
 for(const [id,v] of Object.entries(db.codes||{}))t.gm_login_codes['tg:'+id]={...clone(v),provider:'telegram',expiresAt:v.createdAt+600000};delete extra.codes;
 const wa=db.whatsappAuth||{};for(const [id,v] of Object.entries(wa.sessions||{}))t.gm_login_codes['wa:'+id]={...clone(v),provider:'whatsapp'};
 if(extra.whatsappAuth)delete extra.whatsappAuth.sessions;
 for(const [id,thread] of Object.entries(db.threads||{})){
  const v=clone(thread);delete v.messages;t.gm_threads[id]=v;
  (thread.messages||[]).forEach((message,position)=>{t.gm_messages[JSON.stringify([id,message.id])]={threadId:id,position,message:clone(message)}});
 }delete extra.threads;
 (db.reviews||[]).forEach((review,position)=>{t.gm_reviews[String(position)]={position,review:clone(review)}});delete extra.reviews;
 t.gm_metadata.app=extra;return t;
}
function decode(t){
 const db={...(t.gm_metadata.app||{}),users:clone(t.gm_users),listings:clone(t.gm_listings),sessions:clone(t.gm_sessions),guestAccounts:clone(t.gm_guest_accounts),searches:clone(t.gm_searches),codes:{},threads:clone(t.gm_threads),reviews:[]};
 for(const u of Object.values(db.users))u.favs=[];
 for(const v of Object.values(t.gm_favorites).sort((a,b)=>a.position-b.position))if(db.users[v.userId])db.users[v.userId].favs.push(v.listingId);
 db.whatsappAuth=db.whatsappAuth||{};db.whatsappAuth.sessions={};
 for(const [id,v] of Object.entries(t.gm_login_codes)){const s={...v};delete s.provider;if(id.startsWith('wa:'))db.whatsappAuth.sessions[id.slice(3)]=s;else{delete s.expiresAt;db.codes[id.slice(3)]=s}}
 for(const thread of Object.values(db.threads))thread.messages=[];
 for(const v of Object.values(t.gm_messages).sort((a,b)=>a.position-b.position)){
  if(!db.threads[v.threadId])throw Error('Orphan message in database; refusing partial load');db.threads[v.threadId].messages.push(v.message);
 }
 db.reviews=Object.values(t.gm_reviews).sort((a,b)=>a.position-b.position).map(x=>x.review);return db;
}
function diff(before,after){const upserts={},deletes={};for(const t of TABLES){const rows={};for(const [id,v] of Object.entries(after[t]))if(JSON.stringify(before[t][id])!==JSON.stringify(v))rows[id]=v;const del=Object.keys(before[t]).filter(id=>!(id in after[t]));if(Object.keys(rows).length)upserts[t]=rows;if(del.length)deletes[t]=del}return {upserts,deletes}}
// GitHub Secrets often contain a copied API URL, surrounding quotes or a newline.
// Normalize only known Supabase service paths; never print configuration values.
function secretValue(value,name){
 if(value==null)return '';if(typeof value!=='string')throw Error(name+' must be text');
 let v=value.replace(/^[\s\uFEFF\u200B]+|[\s\uFEFF\u200B]+$/g,'');
 if(v.startsWith(name+'='))v=v.slice(name.length+1).trim();
 const pairs={'"':'"',"'":"'",'“':'”','«':'»'};
 for(let i=0;i<2;i++){const end=pairs[v[0]];if(end&&v.endsWith(end))v=v.slice(1,-1).trim();else break}
 return v;
}
function config(env){
 const url=secretValue(env.SUPABASE_URL,'SUPABASE_URL'),key=secretValue(env.SUPABASE_SERVICE_KEY,'SUPABASE_SERVICE_KEY');
 if(!url&&!key)return null;if(!url||!key)throw Error('Both SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
 let u;try{u=new URL(url)}catch{throw Error('SUPABASE_URL is not a valid URL. Copy Project URL from Supabase Settings > Data API.')}
 if(u.username||u.password)throw Error('SUPABASE_URL must not contain a username or password');
 if(u.search||u.hash)throw Error('SUPABASE_URL must not contain query parameters or a fragment');
 // Correct http to https only for Supabase-managed hosts. No key is sent over HTTP.
 if(u.protocol==='http:'&&/^[a-z0-9-]+\.supabase\.(co|in)$/i.test(u.hostname)&&!u.port)u.protocol='https:';
 if(u.protocol!=='https:')throw Error('SUPABASE_URL requires HTTPS; plain HTTP would expose the service key');
 const path=u.pathname.replace(/\/+$/,'');
 if(path&&!/^\/(?:rest|auth|storage|functions)\/v1(?:\/|$)/.test(path))throw Error('SUPABASE_URL contains an unsupported path. Use Project URL, not a dashboard page or database connection string.');
 if(/^https?:\/\//i.test(key))throw Error('SUPABASE_SERVICE_KEY must be a secret API key, not a URL');
 if(/^sb_publishable_/i.test(key))throw Error('SUPABASE_SERVICE_KEY is a publishable key; use the secret or legacy service_role key');
 if(/\s/.test(key))throw Error('SUPABASE_SERVICE_KEY contains internal whitespace; copy the key as one line');
 if(key.startsWith('eyJ')){let claims;try{claims=JSON.parse(Buffer.from(key.split('.')[1]||'','base64url').toString())}catch{throw Error('SUPABASE_SERVICE_KEY is a malformed legacy JWT')}
  if(claims.role&&claims.role!=='service_role')throw Error('SUPABASE_SERVICE_KEY must have service_role, not the anon/authenticated role');}
 return {url:u.origin,key};
}
class SupabaseStore{
 constructor(env=process.env,fetcher=fetch){this.env=env;this.cfg=config(env);this.fetch=fetcher;this.writer=crypto.randomUUID();this.queue=Promise.resolve();this.tables=empty();this.media=new Map();this.cache=new Map();this.revision=0;this.healthy=true;this.pending=null;this.downloads=new Map();this.downloadActive=0;this.downloadWaiters=[]}
 async request(path,body,method='POST',headers={}){
  const h={apikey:this.cfg.key,Authorization:'Bearer '+this.cfg.key,...headers};if(body!==undefined&&!Buffer.isBuffer(body))h['Content-Type']='application/json';
  let r;try{r=await this.fetch(this.cfg.url+path,{method,headers:h,body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),signal:AbortSignal.timeout(25000)})}catch(e){const codes={ENOTFOUND:'DNS lookup failed: check Project URL and whether the Supabase project is paused',EAI_AGAIN:'temporary DNS lookup failure',ECONNREFUSED:'connection refused',CERT_HAS_EXPIRED:'TLS certificate expired',UNABLE_TO_VERIFY_LEAF_SIGNATURE:'TLS certificate could not be verified'};throw Error('Supabase connection failed: '+(codes[e.cause&&e.cause.code]||(e.name==='TimeoutError'?'request timed out':'network or TLS error')))}
  if(!r.ok){let code='';try{const body=await r.json();if(typeof body.code==='string'&&/^[A-Z0-9_]{3,24}$/.test(body.code))code=body.code}catch{}
   const hint=code==='PGRST202'||code==='42P01'?'Project SQL functions/tables are missing. Run supabase-schema.sql in this project SQL Editor.':r.status===401?'API key was rejected. Check SUPABASE_SERVICE_KEY belongs to the same project as SUPABASE_URL.':r.status===403||code==='42501'?'Service-role permission denied. Do not use anon or publishable keys.':code==='40001'?'Database revision or writer lease conflict. Do not start a second server.':r.status===404?'Resource not found. Check project schema and private gm-media bucket.':r.status>=500?'Supabase is temporarily unavailable; retry later.':'Check schema, permissions and free-plan quota.';
   const e=new Error('Supabase operation failed (HTTP '+r.status+(code?', '+code:'')+'). '+hint);e.status=r.status;throw e}return r;
 }
 async rpc(name,body){const r=await this.request('/rest/v1/rpc/'+name,body);return r.status===204?null:r.json()}
 async open(local){
  const s=await this.rpc('gm_snapshot',{p_writer:this.writer,p_claim:true});this.tables=s.tables;this.revision=Number(s.revision);
  this.timer=setInterval(()=>this.heartbeat().catch(()=>{this.healthy=false}),20000);this.timer.unref();
  if(!s.initialized){
   if(this.env.GM_SUPABASE_IMPORT!=='true')throw Error('Supabase is empty. Run the verified migration first.');
   if(!local||(!Object.keys(local.users||{}).length&&!Object.keys(local.listings||{}).length))throw Error('Legacy database is missing or empty; refusing automatic initialization');
   // Take a local immutable backup before the first cloud write.
   if(this.env.DB_FILE&&fs.existsSync(this.env.DB_FILE))fs.copyFileSync(this.env.DB_FILE,this.env.DB_FILE+'.pre-supabase-'+Date.now());
   await this.save(local);
   const verified=await this.rpc('gm_snapshot',{p_claim:false});
   if(!verified.initialized||Number(verified.revision)!==this.revision||!require('node:util').isDeepStrictEqual(verified.tables,this.tables))throw Error('Cloud import read-back verification failed; local backup retained');
   console.log('Supabase import committed and read-back verified');this.db=local;
  }else this.db=decode(this.tables);
  for(const [id,m] of Object.entries(this.tables.gm_media))this.media.set(id,m);
  return this.db;
 }
 async heartbeat(){const ok=await this.rpc('gm_heartbeat',{p_writer:this.writer});if(!ok){this.healthy=false;this.leaseLost=true;throw Error('Database lease lost')}this.healthy=true}
 async importMedia(value,metadata){
  if(typeof value==='string'&&/^data:(image\/(?:jpeg|png|webp)|audio\/[\w.+-]+)(?:;codecs=[\w-]+)?;base64,/.test(value)){
   const m=value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s),raw=Buffer.from(m[2],'base64');if(raw.length>2097152)throw Error('Media file exceeds 2 MB');
   const id=crypto.createHash('sha256').update(raw).digest('hex');if(metadata[id])return 'gm-media:'+id;
   let bytes=raw,type=m[1];
   if(type.startsWith('image/')){const sharp=require('sharp');bytes=await sharp(raw,{limitInputPixels:40000000,failOn:'error'}).rotate().resize({width:1440,height:1440,fit:'inside',withoutEnlargement:true}).webp({quality:78,effort:4}).toBuffer();type='image/webp'}
   // Leave headroom within the free 1 GB Storage allowance. Orphans count too.
   const used=Object.values(metadata).reduce((n,x)=>n+x.bytes,0);if(used+bytes.length>900*1024*1024)throw Error('Media storage limit reached');
   const path=id.slice(0,2)+'/'+id;await this.request('/storage/v1/object/gm-media/'+path,bytes,'POST',{'Content-Type':type,'x-upsert':'true'});
   metadata[id]={path,type,bytes:bytes.length,createdAt:Date.now()};return 'gm-media:'+id;
  }
  if(Array.isArray(value)){const out=[];for(const v of value)out.push(await this.importMedia(v,metadata));return out}
  if(value&&typeof value==='object'){const out={};for(const [k,v] of Object.entries(value))out[k]=await this.importMedia(v,metadata);return out}return value;
 }
 save(db){const snapshot=clone(db);const work=this.queue.catch(()=>{}).then(()=>this.commit(snapshot));this.queue=work;return work.then(()=>{this.compact(db)})}
 async commit(db){
  if(this.leaseLost)throw Error('Database lease lost; restart required');
  // Finish an uncertain commit before preparing another revision.
  if(this.pending)await this.finishPending();
  const next=encode(db),metadata=clone(this.tables.gm_media);for(const t of TABLES)if(t!=='gm_media')next[t]=await this.importMedia(next[t],metadata);next.gm_media=metadata;
  const changes=diff(this.tables,next);if(!Object.keys(changes.upserts).length&&!Object.keys(changes.deletes).length){this.healthy=true;return}
  this.pending={p_writer:this.writer,p_revision:this.revision,p_commit:crypto.randomUUID(),p_upserts:changes.upserts,p_deletes:changes.deletes};this.pendingTables=next;await this.finishPending();
 }
 compact(value){if(!value||typeof value!=='object')return;for(const k of Object.keys(value)){const v=value[k];if(typeof v==='string'&&/^data:(?:image|audio)\/[^,]+;base64,/.test(v)){const id=crypto.createHash('sha256').update(Buffer.from(v.slice(v.indexOf(',')+1),'base64')).digest('hex');if(this.media.has(id))value[k]='gm-media:'+id}else if(v&&typeof v==='object')this.compact(v)}}
 publicPhoto(listing,index,origin){return typeof listing.photos[index]==='string'&&ref.test(listing.photos[index])?origin+'/l/'+encodeURIComponent(listing.id)+'/photos/'+index:listing.photos[index]}
 async finishPending(){try{this.revision=Number(await this.rpc('gm_commit',this.pending));this.tables=this.pendingTables;for(const [id,m] of Object.entries(this.tables.gm_media))this.media.set(id,m);this.pending=null;this.pendingTables=null;this.healthy=true}catch(e){this.healthy=false;throw e}}
 async data(value){const match=typeof value==='string'&&value.match(ref);if(!match)return value;const id=match[1],m=this.media.get(id);if(!m)throw Error('Media reference not found');if(this.cache.has(id))return this.cache.get(id);if(this.downloads.has(id))return this.downloads.get(id);const task=(async()=>{if(this.downloadActive>=4)await new Promise(resolve=>this.downloadWaiters.push(resolve));this.downloadActive++;try{const r=await this.request('/storage/v1/object/authenticated/gm-media/'+m.path,undefined,'GET');const data='data:'+m.type+';base64,'+Buffer.from(await r.arrayBuffer()).toString('base64');if(data.length<2800000){while(this.cache.size>=16)this.cache.delete(this.cache.keys().next().value);this.cache.set(id,data)}return data}finally{this.downloadActive--;const next=this.downloadWaiters.shift();if(next)next()}})();this.downloads.set(id,task);try{return await task}finally{this.downloads.delete(id)}}
 async expand(value){if(typeof value==='string')return this.data(value);if(Array.isArray(value))return Promise.all(value.map(v=>this.expand(v)));if(value&&typeof value==='object'){const out={};await Promise.all(Object.entries(value).map(async([k,v])=>{out[k]=await this.expand(v)}));return out}return value}
 equivalent(a,b){if(a===b)return true;const m=typeof a==='string'&&a.match(ref);if(!m||!/^data:[^,]+;base64,/.test(b||''))return false;return crypto.createHash('sha256').update(Buffer.from(b.slice(b.indexOf(',')+1),'base64')).digest('hex')===m[1]}
 async close(){clearInterval(this.timer);await this.queue;await this.rpc('gm_release',{p_writer:this.writer})}
}
module.exports={SupabaseStore,encode,decode,diff,config,secretValue,TABLES};
