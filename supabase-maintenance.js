'use strict';
// Private backup files are encrypted before uploading to GitHub artifacts.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib'),readline=require('node:readline');
const {Readable}=require('node:stream'),{pipeline}=require('node:stream/promises');
const {SupabaseStore,TABLES,decode,encode}=require('./supabase-store');
const key=()=>crypto.createHash('sha256').update('gm-backup-v1\0'+(process.env.GM_BACKUP_KEY||process.env.SUPABASE_SERVICE_KEY||'')).digest();
async function backup(store,file){
 const snapshot=await store.rpc('gm_snapshot',{p_claim:false});if(!snapshot.initialized)throw Error('Database not initialized; backup aborted');
 async function* lines(){yield JSON.stringify({format:'gm-backup-v1',createdAt:new Date().toISOString(),schema:fs.readFileSync(path.join(__dirname,'supabase-schema.sql'),'utf8'),snapshot})+'\n';
  for(const [id,m] of Object.entries(snapshot.tables.gm_media)){
   const r=await store.request('/storage/v1/object/authenticated/gm-media/'+m.path,undefined,'GET');const bytes=Buffer.from(await r.arrayBuffer());
   yield JSON.stringify({id,bytes:bytes.toString('base64'),sha256:crypto.createHash('sha256').update(bytes).digest('hex')})+'\n';
  }
 }
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv),tmp=file+'.tmp';
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(tmp,Buffer.concat([Buffer.from('GMBAK1'),iv]),{mode:0o600});
 try{await pipeline(Readable.from(lines()),zlib.createGzip(),cipher,fs.createWriteStream(tmp,{flags:'a',mode:0o600}));fs.appendFileSync(tmp,cipher.getAuthTag());if(fs.statSync(tmp).size>64*1024*1024)throw Error('Full backup exceeds 64 MB free-artifact budget; choose external backup storage before retrying');fs.renameSync(tmp,file)}catch(e){fs.rmSync(tmp,{force:true});throw e}
 console.log('Encrypted backup written:',file,'bytes:',fs.statSync(file).size);
}
async function unpack(file,dir){
 const n=fs.statSync(file).size;if(n<35)throw Error('Invalid backup');const fd=fs.openSync(file,'r'),header=Buffer.alloc(18),tag=Buffer.alloc(16);fs.readSync(fd,header,0,18,0);fs.readSync(fd,tag,0,16,n-16);fs.closeSync(fd);
 if(header.subarray(0,6).toString()!=='GMBAK1')throw Error('Unsupported backup');
 const decipher=crypto.createDecipheriv('aes-256-gcm',key(),header.subarray(6));decipher.setAuthTag(tag);
 // Authenticate the complete encrypted stream BEFORE parsing or restoring anything.
 const gz=path.join(dir,'verified.gz');await pipeline(fs.createReadStream(file,{start:18,end:n-17}),decipher,fs.createWriteStream(gz,{mode:0o600}));
 const input=readline.createInterface({input:fs.createReadStream(gz).pipe(zlib.createGunzip()),crlfDelay:Infinity});let snapshot,count=0;
 for await(const line of input){const v=JSON.parse(line);if(!snapshot){if(v.format!=='gm-backup-v1'||!v.snapshot)throw Error('Invalid backup header');snapshot=v.snapshot;continue}
  if(!/^[a-f0-9]{64}$/.test(v.id)||!snapshot.tables.gm_media[v.id])throw Error('Unknown media in backup');const bytes=Buffer.from(v.bytes,'base64');if(bytes.length>2097152||crypto.createHash('sha256').update(bytes).digest('hex')!==v.sha256)throw Error('Backup media checksum mismatch');fs.writeFileSync(path.join(dir,v.id),bytes,{flag:'wx',mode:0o600});count++;
 }
 if(!snapshot||count!==Object.keys(snapshot.tables.gm_media).length)throw Error('Incomplete backup');return snapshot;
}
async function main(){const cmd=process.argv[2],file=process.argv[3],store=new SupabaseStore();if(!store.cfg&&cmd!=='inspect-json')throw Error('Supabase secrets required');
 if(cmd==='ping'){await store.rpc('gm_ping',{});console.log('Supabase health query succeeded');return}
 if(cmd==='backup'){if(!file)throw Error('Provide backup output file');return backup(store,file)}
 if(cmd==='inspect-json'||cmd==='import-json'){
  const db=JSON.parse(fs.readFileSync(file,'utf8')),tables=encode(db);console.log('Legacy row counts:',Object.fromEntries(TABLES.map(t=>[t,Object.keys(tables[t]).length])));
  if(cmd==='import-json'){
   if(!process.argv.includes('--apply'))throw Error('Import requires --apply; destination must be empty');
   store.env={...process.env,GM_SUPABASE_IMPORT:'true',DB_FILE:file};try{const s=await store.rpc('gm_snapshot',{p_claim:false});if(s.initialized)throw Error('Target already initialized; refusing overwrite');await store.open(db);console.log('Migration committed; all legacy fields preserved')}finally{await store.close()}
  }return;
 }
 if(cmd==='verify-backup'||cmd==='restore-backup'){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gm-restore-'));
  try{const snapshot=await unpack(file,dir);console.log('Backup authenticated; media verified:',Object.keys(snapshot.tables.gm_media).length);
   if(cmd==='restore-backup'){
    if(!process.argv.includes('--apply'))throw Error('Restore requires --apply and an empty destination');
    const s=await store.rpc('gm_snapshot',{p_writer:store.writer,p_claim:true});if(s.initialized)throw Error('Target not empty; no data changed');
    try{for(const [id,m] of Object.entries(snapshot.tables.gm_media))await store.request('/storage/v1/object/gm-media/'+m.path,fs.readFileSync(path.join(dir,id)),'POST',{'Content-Type':m.type,'x-upsert':'true'});
     await store.rpc('gm_commit',{p_writer:store.writer,p_revision:s.revision,p_commit:crypto.randomUUID(),p_upserts:snapshot.tables,p_deletes:{}});console.log('Restore committed');
    }finally{await store.rpc('gm_release',{p_writer:store.writer})}
   }
  }finally{fs.rmSync(dir,{recursive:true,force:true})}return;
 }
 throw Error('Commands: ping, inspect-json FILE, import-json FILE --apply, backup FILE, verify-backup FILE, restore-backup FILE --apply');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={backup,unpack};
