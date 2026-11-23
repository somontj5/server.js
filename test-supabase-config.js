const test=require('node:test'),assert=require('node:assert/strict');
const {config,secretValue,SupabaseStore}=require('./supabase-store');
const key='sb_secret_example_test_only';
for(const [name,url] of [
 ['Project URL','https://demo-ref.supabase.co'],
 ['one trailing slash','https://demo-ref.supabase.co/'],
 ['multiple trailing slashes','https://demo-ref.supabase.co///'],
 ['REST API URL','https://demo-ref.supabase.co/rest/v1'],
 ['REST API URL with trailing slash','https://demo-ref.supabase.co/rest/v1/'],
 ['REST resource URL','https://demo-ref.supabase.co/rest/v1/gm_users'],
 ['Storage API URL','https://demo-ref.supabase.co/storage/v1/'],
 ['Auth API URL','https://demo-ref.supabase.co/auth/v1/'],
 ['copied quoted URL','"https://demo-ref.supabase.co/rest/v1/"'],
 ['clipboard whitespace','\uFEFF\u200B https://demo-ref.supabase.co/rest/v1/\r\n'],
 ['smart quotes','“https://demo-ref.supabase.co/rest/v1/”'],
 ['pasted environment assignment','SUPABASE_URL="https://demo-ref.supabase.co/rest/v1/"'],
 ['hosted HTTP typo safely upgraded','http://demo-ref.supabase.co/rest/v1/'],
])test('Configuration normalization: '+name,()=>{
 assert.deepEqual(config({SUPABASE_URL:url,SUPABASE_SERVICE_KEY:' "'+key+'"\n'}),{url:'https://demo-ref.supabase.co',key});
});
test('Unsafe/wrong URLs and browser/anon keys fail with no secrets in error messages',()=>{
 const jwt=claims=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.fake';
 const cases=[
  ['https://demo-ref.supabase.co/dashboard',key,/unsupported path/],
  ['https://supabase.com/dashboard/project/demo',key,/unsupported path/],
  ['postgresql://user:password@db.example:5432/postgres',key,/username or password/],
  ['http://custom.example',key,/requires HTTPS/],
  ['http://demo.supabase.co.attacker.test/rest/v1',key,/requires HTTPS/],
  ['https://demo-ref.supabase.co/rest/v1?apikey=do-not-print',key,/query parameters/],
  ['https://demo-ref.supabase.co/#do-not-print',key,/fragment/],
  ['not-a-url',key,/not a valid URL/],
  ['https://demo-ref.supabase.co','https://another.supabase.co',/not a URL/],
  ['https://demo-ref.supabase.co','sb_publishable_test',/publishable/],
  ['https://demo-ref.supabase.co',jwt({role:'anon'}),/service_role/],
  ['https://demo-ref.supabase.co','eyJbad.invalid',/malformed/],
  ['https://demo-ref.supabase.co','sb_secret_inner\nnewline',/internal whitespace/],
 ];
 for(const [url,k,pattern] of cases)assert.throws(()=>config({SUPABASE_URL:url,SUPABASE_SERVICE_KEY:k}),e=>{assert.match(e.message,pattern);assert.ok(!e.message.includes(url));assert.ok(!e.message.includes(k));assert.ok(!e.message.includes('do-not-print'));return true});
 assert.equal(config({}),null);assert.throws(()=>config({SUPABASE_URL:'https://demo-ref.supabase.co'}),/Both SUPABASE/);
 assert.equal(config({SUPABASE_URL:'https://custom.example/',SUPABASE_SERVICE_KEY:jwt({role:'service_role'})}).url,'https://custom.example');
});
test('Requests use the normalized origin and canonical secret, never HTTP or duplicate REST paths',async()=>{
 let calls=0;
 const store=new SupabaseStore({SUPABASE_URL:'http://demo-ref.supabase.co/rest/v1/',SUPABASE_SERVICE_KEY:'"'+key+'"\n'},async(url,opts)=>{
  calls++;assert.equal(url,'https://demo-ref.supabase.co/rest/v1/rpc/gm_ping');assert.equal(opts.headers.apikey,key);assert.equal(opts.headers.Authorization,'Bearer '+key);return new Response('1');
 });assert.equal(await store.rpc('gm_ping',{}),1);assert.equal(calls,1);
});
test('HTTP diagnostics distinguish missing SQL, invalid key, permissions and lease without echoing server bodies',async()=>{
 for(const [status,code,hint] of [[404,'PGRST202',/SQL functions\/tables are missing/],[401,'',/same project/],[403,'42501',/permission denied/],[409,'40001',/lease conflict/],[503,'',/temporarily unavailable/]]){
  const store=new SupabaseStore({SUPABASE_URL:'https://demo-ref.supabase.co',SUPABASE_SERVICE_KEY:key},async()=>new Response(JSON.stringify({code,message:'Private database content '+key}),{status}));
  await assert.rejects(store.rpc('gm_ping',{}),e=>{assert.match(e.message,hint);assert.ok(!e.message.includes(key));assert.ok(!e.message.includes('Private database'));return true});
 }
});
test('DNS and TLS errors are actionable but never print source URLs or headers',async()=>{
 const store=new SupabaseStore({SUPABASE_URL:'https://demo-ref.supabase.co',SUPABASE_SERVICE_KEY:key},async()=>{const e=Error('fetch failed '+key);e.cause={code:'ENOTFOUND'};throw e});
 await assert.rejects(store.rpc('gm_ping',{}),e=>{assert.match(e.message,/DNS lookup failed/);assert.ok(!e.message.includes(key));return true});
 assert.equal(secretValue('SUPABASE_SERVICE_KEY="'+key+'"\r\n','SUPABASE_SERVICE_KEY'),key);
});
