const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {SupabaseStore,encode,decode,TABLES,config}=require('./supabase-store');
const {backup,unpack}=require('./supabase-maintenance');
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_KEY:'test-service-key',GM_SUPABASE_IMPORT:'true'};
function source(){return {users:{u:{id:'u',tgId:123,favs:['l'],interests:{'z:number:48':[2,123]},guest:false}},listings:{l:{id:'l',sellerId:'u',sub:'dress',section:'dress-dresses',a:{ageGroup:'Взрослое',gender:'Женское'},sizes:{entries:[{system:'number',values:['48']}],standard:false},photos:[],price:'300',tags:['dress']}},sessions:{token:{userId:'u'}},codes:{c:{createdAt:100}},guestAccounts:{hashed:{userId:'u'}},threads:{t:{id:'t',buyerId:'u',sellerId:'s',messages:[{id:'m',from:'u',t:123,text:'Привет',re:{id:'other',text:'Фото'}}]}},reviews:[{id:'r',stars:5}],searches:{x:{userId:'u',q:'платье'}},whatsappAuth:{sessions:{login:{createdAt:100,expiresAt:300100,status:'pending',proofHash:'hash',codeHash:'hash2'}},limits:{}},unknown:{word:{c:1}},qlog:{dress:2},aiStatus:{state:'ok'}}}
async function database(){const pg=new PGlite();await pg.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');await pg.exec(fs.readFileSync('supabase-schema.sql','utf8'));const files=new Map();let lose=false;
 async function fetcher(url,opts){assert.equal(opts.headers.apikey,env.SUPABASE_SERVICE_KEY);const u=new URL(url);
 if(u.pathname.startsWith('/rest/v1/rpc/')){const name=u.pathname.split('/').at(-1),b=JSON.parse(opts.body||'{}');try{let q,args;
 if(name==='gm_snapshot'){q='select gm_snapshot($1,$2) as value';args=[b.p_writer||'',b.p_claim||false]}
 if(name==='gm_commit'){q='select gm_commit($1,$2,$3,$4,$5) as value';args=[b.p_writer,b.p_revision,b.p_commit,JSON.stringify(b.p_upserts),JSON.stringify(b.p_deletes)]}
 if(name==='gm_heartbeat'||name==='gm_release'){q='select '+name+'($1) as value';args=[b.p_writer]}
 if(name==='gm_ping'){q='select gm_ping() as value';args=[]}
 if(!q)throw Error('Unknown RPC');const r=await pg.query(q,args);if(name==='gm_commit'&&lose){lose=false;throw Error('Lost response after commit')};return new Response(JSON.stringify(r.rows[0].value),{status:200});
 }catch(e){return new Response(JSON.stringify({error:e.message}),{status:409})}}
 const file=u.pathname.replace('/storage/v1/object/authenticated/','').replace('/storage/v1/object/','');if(opts.method==='POST'){files.set(file,{bytes:Buffer.from(opts.body),type:opts.headers['Content-Type']});return new Response('{}')}
 const f=files.get(file);return f?new Response(f.bytes,{headers:{'content-type':f.type}}):new Response('',{status:404});
 }
 return {pg,files,fetcher,loseNext(){lose=true}};
}
test('Lossless normalized round trip retains messages, tags, guests and one-time WA state',()=>{const db=source();assert.deepEqual(decode(encode(db)),db);assert.equal(Object.keys(encode(db).gm_favorites).length,1);assert.ok(!('messages' in encode(db).gm_threads.t));assert.ok(!('favs' in encode(db).gm_users.u));assert.throws(()=>config({SUPABASE_URL:'https://example.com'}));assert.throws(()=>config({SUPABASE_URL:'http://example.com',SUPABASE_SERVICE_KEY:'secret'}));});
test('Real Postgres: RLS, lease exclusion, atomic revision commits, restart, media and backup',async()=>{
 const d=await database(),store=new SupabaseStore(env,d.fetcher),other=new SupabaseStore(env,d.fetcher),dir=fs.mkdtempSync(path.join(os.tmpdir(),'gm-db-test-'));
 try{
 const rows=await d.pg.query("select tablename,rowsecurity from pg_tables where schemaname='public'");assert.equal(rows.rows.length,TABLES.length+1);assert.ok(rows.rows.every(x=>x.rowsecurity));
 await d.pg.exec('set role anon');await assert.rejects(d.pg.query('select * from gm_users'));await assert.rejects(d.pg.query('select gm_snapshot()'));await d.pg.exec('reset role');
 await d.pg.exec('set role authenticated');await assert.rejects(d.pg.query('select gm_ping()'));await d.pg.exec('reset role');
 const legacy=source();await store.open(legacy);assert.deepEqual(decode(store.tables),legacy);
 await assert.rejects(other.open(legacy));
 legacy.users.u.name='Updated';d.loseNext();await assert.rejects(store.save(legacy));assert.equal(store.healthy,false);await store.save(legacy);assert.equal(store.tables.gm_users.u.name,'Updated');
 // Revisions reject concurrent writers; no partial changes survive failure.
 await assert.rejects(store.rpc('gm_commit',{p_writer:store.writer,p_revision:0,p_commit:'stale',p_upserts:{gm_users:{u:{id:'u',name:'OVERWRITE'}}},p_deletes:{}}));
 assert.equal((await store.rpc('gm_snapshot',{p_claim:false})).tables.gm_users.u.name,'Updated');
 const png=await require('sharp')({create:{width:1600,height:1600,channels:3,background:'#ddccaa'}}).png().toBuffer(),uri='data:image/png;base64,'+png.toString('base64');legacy.listings.l.photos=[uri];legacy.threads.t.messages[0].img=uri;
 await store.save(legacy);assert.equal(d.files.size,1);const marker=store.tables.gm_listings.l.photos[0];assert.match(marker,/^gm-media:[a-f0-9]{64}$/);assert.equal(store.tables.gm_messages['["t","m"]'].message.img,marker);const media=Object.values(store.tables.gm_media)[0];assert.equal(media.type,'image/webp');assert.ok(media.bytes<png.length);assert.equal(store.equivalent(marker,uri),true);
 assert.match(await store.data(marker),/^data:image\/webp;base64,/);assert.deepEqual(await store.expand({img:marker,text:'hello'}),{img:await store.data(marker),text:'hello'});
 process.env.SUPABASE_SERVICE_KEY=env.SUPABASE_SERVICE_KEY;const file=path.join(dir,'backup.gmbak');await backup(store,file);assert.ok(!fs.readFileSync(file).includes(Buffer.from('Updated')));
 const tmp=path.join(dir,'verified');fs.mkdirSync(tmp);const restored=await unpack(file,tmp);assert.deepEqual(restored.tables,store.tables);
 const bad=fs.readFileSync(file);bad[40]^=1;fs.writeFileSync(path.join(dir,'bad.gmbak'),bad);await assert.rejects(unpack(path.join(dir,'bad.gmbak'),dir));
 const revision=store.revision;await store.close();const reopened=new SupabaseStore(env,d.fetcher);await reopened.open({users:{},listings:{}});assert.equal(reopened.revision,revision);assert.equal(reopened.db.users.u.name,'Updated');assert.equal(reopened.db.listings.l.photos[0],marker);await reopened.close();
 }finally{clearInterval(store.timer);clearInterval(other.timer);delete process.env.SUPABASE_SERVICE_KEY;await d.pg.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test('Empty legacy file cannot silently initialize Supabase',async()=>{const d=await database(),s=new SupabaseStore(env,d.fetcher);try{await assert.rejects(s.open({users:{},listings:{}}));assert.equal((await s.rpc('gm_snapshot',{p_claim:false})).initialized,false)}finally{clearInterval(s.timer);await d.pg.close()}});
