// UI regression with mocked API responses; real Meta is NOT involved.
const {chromium}=require('./.local-build/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:360,height:780}}),page=await context.newPage(),errors=[];
  let confirmed=false,starts=0,polls=0,external='';const id='a'.repeat(32),proof='b'.repeat(64),code='ATUSH '+'C'.repeat(24);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url()),reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   if(u.hostname==='wa.me'){external=req.url();return route.abort('aborted')}
   if(/github/.test(u.hostname))return route.fulfill({body:'https://gm.test/api'});
   if(u.hostname!=='gm.test')return route.abort();
   if(u.pathname==='/api/auth/whatsapp/start'){starts++;return reply({sessionId:id,sessionSecret:proof,code,expiresIn:300,expiresAt:Date.now()+300000,link:'https://wa.me/992900000000?text='+encodeURIComponent(code)})}
   if(u.pathname==='/api/auth/whatsapp/check'){
    polls++;assert.equal(req.method(),'POST');assert.equal(req.headers()['x-wa-session'],proof);assert.equal(JSON.parse(req.postData()).sessionId,id);assert(!req.url().includes(proof));
    return reply(confirmed?{status:'ok',token:'mock-verified-token',user:{id:'wa-user',phone:'+992901234567'}}:{status:'pending'});
   }
   if(u.pathname.startsWith('/api/'))return reply(u.pathname==='/api/me'?{id:'wa-user',phone:'+992901234567'}:{items:[],total:0});
   const name=['categories.js','sizes.js','sizes-ui.js','validation.js','chat-media.js'].find(n=>u.pathname==='/'+n)||'index.html';
   return route.fulfill({contentType:name.endsWith('.js')?'text/javascript':'text/html',body:fs.readFileSync('android-src/assets/www/'+name)});
  });
  await page.addInitScript(()=>localStorage.setItem('gm_srv','https://gm.test/api'));
  await page.goto('https://gm.test/');
  await page.screenshot({path:'.local-build/categories-9.15.png',fullPage:true});
  await page.evaluate(()=>GM.need('Войдите для проверки'));
  await page.click('#waGo');await page.waitForSelector('#waCode');assert.equal(await page.locator('#waCode').innerText(),code);
  await page.screenshot({path:'.local-build/whatsapp-login-9.15.png',fullPage:true});
  await page.waitForTimeout(2700);assert(polls>=1);assert(external.includes(encodeURIComponent(code)));assert.equal(await page.evaluate(()=>GM.token()),'');
  confirmed=true;
  await page.waitForFunction(()=>localStorage.getItem('gm_token')==='mock-verified-token');
  assert.equal(starts,1);assert.deepEqual(errors,[]);
  await context.close();console.log('WhatsApp mobile UI PASS: start, wa.me, secret header, pending, polling, login; mocked API only');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
