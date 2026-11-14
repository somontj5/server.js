'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const create=require('./whatsapp-auth');
function fixture(){
 let time=Date.now(),writes=0;
 const db={users:{legacy:{id:'legacy',phone:'+992 90 123 45 67'}},sessions:{}};
 const env={VERIFY_TOKEN:'test-verify-only',APP_SECRET:'test-app-secret-only',WA_LOGIN_NUMBER:'992900000000',WA_PHONE_NUMBER_ID:'12345'};
 const auth=create({db,env,persist:()=>writes++,userOut:u=>({id:u.id,phone:u.phone}),clock:()=>time});
 const req=(ip='1.2.3.4',proof)=>({socket:{remoteAddress:ip},headers:{'x-wa-session':proof}});
 const start=()=>auth.start(req());const check=s=>auth.check(req('1.2.3.4',s.sessionSecret),{sessionId:s.sessionId});
 const event=(s,phone='992901234567',extra={})=>({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'12345'},messages:[{id:'wamid.test',type:'text',from:phone,timestamp:String(Math.floor(time/1000)),text:{body:s.code},...extra}]}}]}]});
 return {db,env,auth,req,start,check,event,advance:ms=>time+=ms,writes:()=>writes};
}
async function serve(f,fn){const server=http.createServer((req,res)=>f.auth.webhook(req,res,new URL(req.url,'http://x')));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;try{await fn(base)}finally{await new Promise(r=>server.close(r))}}
async function post(base,f,event,signature){const body=typeof event==='string'?event:JSON.stringify(event);const sig=signature===undefined?'sha256='+crypto.createHmac('sha256',f.env.APP_SECRET).update(body).digest('hex'):signature;return fetch(base+'/webhooks/whatsapp',{method:'POST',body,headers:{'content-type':'application/json',...(sig?{'x-hub-signature-256':sig}:{})}})}
test('random 96-bit codes, 5 minute expiry, separate 256-bit session proof',()=>{
 const f=fixture(),s=f.start();assert.match(s.code,/^ATUSH [A-F0-9]{24}$/);assert.equal(s.expiresIn,300);assert.equal(s.sessionSecret.length,64);assert(s.link.includes(encodeURIComponent(s.code)));assert.equal(f.check(s).status,'pending');assert(!JSON.stringify(f.db).includes(s.code));assert(!JSON.stringify(f.db).includes(s.sessionSecret));
 f.advance(300000);assert.throws(()=>f.check(s),{code:410});
});
test('session ID or code alone cannot poll or authenticate',()=>{const f=fixture(),s=f.start();assert.throws(()=>f.auth.check(f.req(),{sessionId:s.sessionId}),{code:401});assert.throws(()=>f.check({...s,sessionSecret:'0'.repeat(64)}),{code:401});assert.equal(f.check(s).status,'pending')});
test('GET Meta challenge, wrong token, wrong mode, unicode and unset token',async()=>{const f=fixture();await serve(f,async base=>{let r=await fetch(base+'/?hub.mode=subscribe&hub.verify_token=test-verify-only&hub.challenge=42');assert.equal(r.status,200);assert.equal(await r.text(),'42');for(const token of ['bad','ю'.repeat(16)]){r=await fetch(base+'/?hub.mode=subscribe&hub.verify_token='+encodeURIComponent(token));assert.equal(r.status,403)}assert.equal((await fetch(base+'/?hub.verify_token=test-verify-only')).status,403)})});
test('unsigned or forged requests cannot confirm session',async()=>{const f=fixture(),s=f.start();await serve(f,async base=>{for(const sig of ['', 'sha256='+'0'.repeat(64),'bogus'])assert.equal((await post(base,f,f.event(s),sig)).status,403);assert.equal(f.check(s).status,'pending')})});
test('valid signed raw body creates verified account, never merges editable phone; idempotent claim',async()=>{const f=fixture(),s=f.start();await serve(f,async base=>{assert.equal((await post(base,f,f.event(s))).status,200);assert.equal(f.db.whatsappAuth.sessions[s.sessionId].codeHash,undefined);const a=f.check(s),b=f.check(s);assert.equal(a.status,'ok');assert.equal(a.token,b.token);assert.notEqual(a.user.id,'legacy');assert.equal(a.user.phone,'+992901234567');assert.equal(Object.keys(f.db.sessions).length,1);assert(f.writes()>0)})});
test('single-use code and duplicate Meta delivery cannot rebind to another sender',async()=>{const f=fixture(),s=f.start();await serve(f,async base=>{await post(base,f,f.event(s));const a=f.check(s);await post(base,f,f.event(s,'992999999999'));assert.deepEqual(f.check(s),a);assert.equal(Object.keys(f.db.users).length,2)})});
test('next login from the same verified sender finds the same user',async()=>{const f=fixture();await serve(f,async base=>{const a=f.start();await post(base,f,f.event(a));const u=f.check(a);const b=f.start();await post(base,f,f.event(b));assert.equal(f.check(b).user.id,u.user.id)})});
test('phone identity remains separate from an editable contact phone',async()=>{const f=fixture(),s=f.start();await serve(f,async base=>{await post(base,f,f.event(s));const a=f.check(s);f.db.users[a.user.id].phone='+992 11 111 11 11';const b=f.start();await post(base,f,f.event(b));assert.equal(f.check(b).user.id,a.user.id)})});
test('wrong recipient ID, old timestamp, statuses and non-text messages never confirm',async()=>{const f=fixture(),s=f.start();await serve(f,async base=>{for(const extra of [{type:'image'},{timestamp:'1'},{from:'not-a-phone'}]){await post(base,f,f.event(s,'992901234567',extra));assert.equal(f.check(s).status,'pending')}const e=f.event(s);e.entry[0].changes[0].value.metadata.phone_number_id='wrong';await post(base,f,e);await post(base,f,{object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{statuses:[{status:'sent'}]}}]}]});assert.equal(f.check(s).status,'pending')})});
test('signed payload tampering fails and invalid signed JSON is rejected',async()=>{const f=fixture(),s=f.start();await serve(f,async base=>{const original=JSON.stringify(f.event(s)),sig='sha256='+crypto.createHmac('sha256',f.env.APP_SECRET).update(original).digest('hex');assert.equal((await post(base,f,original+' ',sig)).status,403);assert.equal((await post(base,f,'{')).status,400);assert.equal(f.check(s).status,'pending')})});
test('expired code ignored even with a valid signature',async()=>{const f=fixture(),s=f.start();f.advance(300001);await serve(f,async base=>{assert.equal((await post(base,f,f.event(s))).status,200);assert.throws(()=>f.check(s),{code:410})})});
test('IP rate limiting ignores forged forwarded headers',()=>{const f=fixture();for(let i=0;i<10;i++)f.start();assert.throws(()=>f.auth.start({...f.req(),headers:{'x-forwarded-for':'8.8.8.8','cf-connecting-ip':'8.8.8.8'}}),{code:429});f.advance(900001);assert(f.start().sessionId)});
test('sender attempt limit includes unknown valid-looking codes',async()=>{const f=fixture(),s=f.start();await serve(f,async base=>{for(let i=0;i<10;i++)await post(base,f,f.event({code:'ATUSH '+'F'.repeat(24)}));await post(base,f,f.event(s));assert.equal(f.check(s).status,'pending')})});
test('secret/session persistence survives module recreation and logout blocks re-claim',async()=>{const f=fixture(),s=f.start();await serve(f,async base=>{await post(base,f,f.event(s));const a=f.check(s),copy=JSON.parse(JSON.stringify(f.db)),auth=create({db:copy,env:f.env,persist:()=>{},userOut:u=>({id:u.id,phone:u.phone})});assert.equal(auth.check(f.req('1.2.3.4',s.sessionSecret),{sessionId:s.sessionId}).token,a.token);delete copy.sessions[a.token];assert.throws(()=>auth.check(f.req('1.2.3.4',s.sessionSecret),{sessionId:s.sessionId}),{code:410})})});
test('full HTTP integration: raw webhook bypasses JSON parser, bearer token works on /me',async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
 const f=fixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'gm-wa-')),file=path.join(dir,'db.json');
 fs.writeFileSync(file,JSON.stringify(f.db));const port=21000+Math.floor(Math.random()*1000),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,...f.env,GM_CHILD:'1',PORT:String(port),DB_FILE:file,BOT_TOKEN:'',GITHUB_ACTIONS:''},stdio:'ignore'});
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,30))}assert(ready);
  let r=await fetch(base+'/auth/whatsapp/start',{method:'POST'});assert.equal(r.status,200);const s=await r.json();
  assert.equal((await post(base,f,f.event(s),'')).status,403);assert.equal((await post(base,f,f.event(s))).status,200);
  r=await fetch(base+'/auth/whatsapp/check',{method:'POST',headers:{'content-type':'application/json','x-wa-session':s.sessionSecret},body:JSON.stringify({sessionId:s.sessionId})});assert.equal(r.status,200);const a=await r.json();assert.equal(a.status,'ok');
  r=await fetch(base+'/me',{headers:{authorization:'Bearer '+a.token}});assert.equal(r.status,200);assert.equal((await r.json()).id,a.user.id);
  assert.equal(JSON.parse(fs.readFileSync(file)).whatsappAuth.sessions[s.sessionId].codeHash,undefined);
  r=await fetch(base+'/auth/whatsapp/check',{method:'OPTIONS',headers:{'access-control-request-headers':'x-wa-session'}});assert(r.headers.get('access-control-allow-headers').includes('x-wa-session'));
 }finally{const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await done;fs.rmSync(dir,{recursive:true,force:true})}
});
test('unconfigured WhatsApp fails closed and sends no external requests',()=>{const db={users:{},sessions:{}},a=create({db,persist:()=>{},userOut:u=>u,env:{}});assert.equal(a.enabled,false);assert.throws(()=>a.start({}),{code:503})});
