// Focused 9.17 regressions with a real isolated API and Chromium fake microphone.
const {chromium}=require('./.local-build/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const service=await require('./test-fixture').start(0);
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||chromium.executablePath(),args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 try{
 const context=await browser.newContext({viewport:{width:390,height:800},permissions:['microphone']});
 const page=await context.newPage(),errors=[];let feeds=0,reverseFeed=false,dropNext=false,similarFailure=false,holdSync=false;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='gm.test'&&url.pathname.startsWith('/api/')){
   const req=route.request(),endpoint=url.pathname.slice(4);
   if(holdSync&&req.method()==='GET'&&endpoint.startsWith('/threads'))return route.fulfill({contentType:'application/json',body:JSON.stringify(endpoint==='/threads'?{items:[]}:{messages:[]})});
   if(endpoint.endsWith('/similar')&&similarFailure)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"test outage"}'});
   const response=await fetch(service.base+endpoint+url.search,{method:req.method(),headers:{authorization:'Bearer test-buyer','content-type':'application/json'},body:req.postData()||undefined});
   let text=await response.text();
   if(endpoint==='/listings'){feeds++;if(reverseFeed){const data=JSON.parse(text);data.items.reverse();text=JSON.stringify(data)}}
   if(dropNext&&req.method()==='POST'&&endpoint.endsWith('/messages')){dropNext=false;return route.abort('failed')}
   return route.fulfill({status:response.status,contentType:'application/json',body:text});
  }
  if(url.hostname==='gm.test'){
   const name=url.pathname==='/'?'index.html':url.pathname.slice(1),file=path.join('android-src/assets/www',name);
   if(!/^[a-z.-]+$/.test(name)||!fs.existsSync(file))return route.abort();
   return route.fulfill({contentType:name.endsWith('.css')?'text/css':name.endsWith('.js')?'application/javascript':'text/html',body:fs.readFileSync(file)});
  }
  if(/github/.test(url.hostname))return route.fulfill({contentType:'text/plain',body:'https://gm.test/api'});
  return route.abort();
 });
 await page.addInitScript(()=>{localStorage.setItem('gm_srv','https://gm.test/api');localStorage.setItem('gm_token','test-buyer');localStorage.setItem('gm_user','{"id":"buyer","name":"Покупатель"}')});
 await page.goto('https://gm.test/');await page.waitForSelector('#grid .card');await page.waitForTimeout(600);
 const original=await page.evaluate(()=>SF.map(l=>l.id)),feedRequests=feeds;
 for(const tab of ['msg','home','profile','home','fav','home']){await page.evaluate(t=>go(t),tab);await page.waitForTimeout(80)}
 assert.equal(feeds,feedRequests,'tab switches must not fetch recommendations');assert.deepEqual(await page.evaluate(()=>SF.map(l=>l.id)),original);
 reverseFeed=true;await page.evaluate(()=>dispatchEvent(new Event('online')));await page.waitForSelector('#feedReady:not([hidden])');
 assert.deepEqual(await page.evaluate(()=>SF.map(l=>l.id)),original,'background preparation must not reorder visible cards');
 await page.click('#feedReady');assert.deepEqual(await page.evaluate(()=>SF.map(l=>l.id)),original.slice().reverse());
 // Keep-first rendering used to leave the similar section permanently hidden.
 await page.evaluate(()=>renderItem('base',true));await page.waitForSelector('#similarBlock:not([hidden]) #sim .card');assert.equal(await page.locator('#sim .card').first().getAttribute('data-id'),'match');
 similarFailure=true;await page.evaluate(()=>dispatchEvent(new Event('gm:server')));await page.waitForSelector('[data-sim-retry]');similarFailure=false;await page.click('[data-sim-retry]');await page.waitForSelector('#sim .card');
 await page.evaluate(()=>{$('itemPg').hidden=true;location.hash='home'});
 const chat=await page.evaluate(async()=>{var t=await GM.api('POST','/listings/base/thread',{});var c={id:'s_'+t.id,tid:t.id,lid:'base',name:'Магазин одежды',msgs:[],photo:find('base').photos[0]};chats.push(c);location.hash='chat/'+c.id;return {id:c.id,tid:t.id}});
 await page.waitForSelector('#cmic');
 await page.fill('#cta','Здравствуйте! Размер ещё есть?');dropNext=true;holdSync=true;await page.click('#csnd');await page.waitForSelector('.msg-retry');
 assert.equal(await page.locator('.msg-text').last().innerText(),'Здравствуйте! Размер ещё есть?');
 await page.click('.msg-retry');await page.waitForFunction(()=>!fchat($('chatPg').dataset.id).msgs.some(m=>m.pending||m.failed));
 holdSync=false;assert.equal(await page.evaluate(async tid=>(await GM.api('GET','/threads/'+tid)).messages.length,chat.tid),1,'lost response retry must not duplicate a sent message');
 const photo=await page.evaluate(()=>{var cv=document.createElement('canvas');cv.width=380;cv.height=240;var g=cv.getContext('2d');g.fillStyle='#e4f0f4';g.fillRect(0,0,380,240);g.fillStyle='#5e91a5';g.fillRect(120,40,140,150);return cv.toDataURL('image/png')});
 await page.evaluate(({photo,id})=>chatPreviewPhoto(photo,id),{photo,id:chat.id});await page.waitForSelector('#photoDraft');await page.fill('#photoCaption','Вот этот цвет');await page.click('[data-photo-send]');await page.waitForSelector('#cmsgs .mimg');await page.waitForSelector('#photoDraft',{state:'detached'});
 await page.evaluate(()=>SugdTheme.set('dark'));await page.click('#cmic');await page.waitForSelector('#crec:not([hidden])');await page.waitForTimeout(1600);
 assert.equal(await page.locator('#crec').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(37, 54, 45)');
 assert.equal(await page.locator('.rec-wave i').count(),32);
 await page.evaluate(()=>{var r=GMMessenger.recording();r.wave=[];var frame=0;r.analyser={fftSize:32,getByteTimeDomainData:function(data){frame++;data.fill(128+frame*2)}}});
 await page.waitForTimeout(650);const wave=await page.locator('.rec-wave i').evaluateAll(es=>es.map(e=>parseFloat(e.style.height)));assert.ok(new Set(wave).size>=4);assert.ok(wave[31]>wave[30]&&wave[30]>wave[29]);
 await page.screenshot({path:'.local-build/920-recorder-dark.png'});
 await page.click('[data-rec="pause"]');assert.equal(await page.evaluate(()=>GMMessenger.recording().running),false);
 const paused=await page.locator('#rtm').innerText();await page.waitForTimeout(1100);assert.equal(await page.locator('#rtm').innerText(),paused,'paused duration must stop');
 await page.screenshot({path:'.local-build/chat-recorder-9.17.png'});
 await page.click('[data-rec="preview"]');await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>GMMessenger.recording().running),false);
 await page.click('[data-rec="pause"]');assert.equal(await page.evaluate(()=>GMMessenger.recording().running),true);await page.waitForTimeout(700);
 await page.evaluate(()=>gmPauseMedia());assert.equal(await page.evaluate(()=>GMMessenger.recording().running),false,'background must pause microphone');
 await page.click('[data-rec="send"]');await page.waitForSelector('#crec',{state:'hidden'});await page.waitForSelector('.mvc');
 await page.waitForFunction(()=>fchat($('chatPg').dataset.id).msgs.some(m=>m.voice&&m.sid));
 await page.click('.vpl');await page.waitForTimeout(300);
 // Another message/read update must preserve an existing audio DOM node.
 assert.equal(await page.evaluate(()=>{var el=document.querySelector('.mvc');window.__voiceNode=el;drawMsgs();return el===document.querySelector('.mvc')}),true);
 await page.locator('.voice-seek').fill('40');
 await page.screenshot({path:'.local-build/chat-messages-9.17.png'});
 for(const width of [320,360,390,480]){await page.setViewportSize({width,height:800});assert.ok(await page.locator('#chatPg').evaluate(e=>e.scrollWidth<=innerWidth));assert.ok(await page.locator('#cmsgs').evaluate(e=>e.scrollWidth<=e.clientWidth));}
 // Cancel recording without sending and reject pending photo in a different chat.
 const before=await page.locator('.bub').count();await page.click('#cmic');await page.waitForSelector('#crec:not([hidden])');await page.click('[data-rec="cancel"]');await page.waitForSelector('#crec',{state:'hidden'});assert.equal(await page.locator('.bub').count(),before);
 await page.fill('#cta','Черновик для этого продавца');await page.evaluate(()=>location.hash='msg');await page.waitForTimeout(100);await page.evaluate(id=>location.hash='chat/'+id,chat.id);await page.waitForSelector('#cta');assert.equal(await page.inputValue('#cta'),'Черновик для этого продавца');
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.bub').first().evaluate(e=>getComputedStyle(e).animationName),'none');
 await page.waitForTimeout(400);await page.reload();await page.waitForSelector('.mvc');await page.click('.vpl');await page.waitForTimeout(200);
 assert.ok(await page.evaluate(()=>{var c=fchat($('chatPg').dataset.id),m=c.msgs.find(m=>m.voice);return !!(MED[mkey(m)]&&MED[mkey(m)].voice)}));
 assert.deepEqual(errors,[]);console.log('Messenger PASS: stable feed, keep-first similar, lost response retry, photo caption, real fake-device recording, pause/resume/preview, cancel, reload, narrow layout and reduced motion');
 }finally{await browser.close();await service.stop()}
})().catch(e=>{console.error(e);process.exit(1)});
