/* End-to-end release checks use a disposable database and local assets only. */
const {chromium}=require('./.local-build/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{start}=require('./test-fixture');
(async()=>{
 const service=await start(0);let browser;
 try{
  const photo='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="#e7e6de"/><ellipse cx="150" cy="360" rx="85" ry="12" fill="#d3d2c9"/><path d="m104 60-60 35 24 72 30-14-8 185h120l-8-185 30 14 24-72-60-35-46 24z" fill="#7d9580" stroke="#60745f" stroke-width="2"/><path d="m104 60 46 24 46-24-14 52-32-24-32 24zM150 90v245M113 180h22M166 180h22" stroke="#d2dfcb" fill="none" stroke-width="3"/><circle cx="157" cy="144" r="3" fill="#d2dfcb"/><circle cx="157" cy="204" r="3" fill="#d2dfcb"/></svg>').toString('base64');
  const draft={name:'Рубашка мягкий хлопок',desc:'Мягкая рубашка для прогулок и отдыха, подкладка алькантара.',cat:'clothes',sub:'tops',section:'tops-shirts',shopName:'Тест',row:'1',shopNum:'1',priceNum:1200,discountPrice:790,photos:[photo],a:{gender:'Женское',ageGroup:'Взрослое',cond:'Новое'}};
  // Use a valid catalog leaf from the shared source, not a made-up identifier.
  draft.section=require('./android-src/assets/www/categories').group('tops').children[0].id;
  const r=await fetch(service.base+'/listings',{method:'POST',headers:{authorization:'Bearer test-seller','content-type':'application/json'},body:JSON.stringify(draft)}),made=await r.json();assert.equal(r.status,200,JSON.stringify(made));
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:860},colorScheme:'light'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const u=new URL(route.request().url());
   if(u.hostname==='gm.test'&&u.pathname.startsWith('/api/')){const req=route.request();try{const response=await fetch(service.base+u.pathname.slice(4)+u.search,{method:req.method(),headers:{authorization:'Bearer test-seller','content-type':'application/json'},body:req.postData()||undefined});return route.fulfill({status:response.status,contentType:response.headers.get('content-type'),body:Buffer.from(await response.arrayBuffer())})}catch{return route.abort()}}
   if(u.hostname==='gm.test'){const name=u.pathname==='/'?'index.html':path.basename(u.pathname),file=path.join('android-src/assets/www',name);if(!fs.existsSync(file))return route.abort();return route.fulfill({contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html',body:fs.readFileSync(file)})}
   if(/github/.test(u.hostname))return route.fulfill({contentType:'text/plain',body:'https://gm.test/api'});return route.abort();
  });
  await page.addInitScript(()=>{localStorage.setItem('gm_srv','https://gm.test/api');localStorage.setItem('gm_token','test-seller');localStorage.setItem('gm_user',JSON.stringify({id:'seller',name:'Продавец'}))});
  await page.goto('https://gm.test/');await page.waitForSelector('#grid .card');
  await page.evaluate(()=>{S.q='алькантара';renderGrid()});await page.waitForSelector('#grid .card[data-id="'+made.id+'"]');
  assert.equal(await page.locator('#grid .card').count(),1,'description-only search must survive the light API response');
  assert.equal(await page.locator('#grid del').count(),1);assert.match(await page.locator('#grid .price-current').innerText(),/790/);
  for(const width of [320,390,480]){await page.setViewportSize({width,height:860});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const box=await page.locator('#grid .card').boundingBox();assert.ok(box.width>=125,'card is too narrow: '+box.width);assert.ok(await page.locator('#grid .p').evaluate(e=>e.nextElementSibling.classList.contains('t')))}
  for(const theme of ['light','dark']){await page.setViewportSize({width:390,height:860});await page.evaluate(t=>SugdTheme.set(t),theme);await page.waitForTimeout(100);await page.screenshot({path:'.local-build/921-feed-'+theme+'.png'})}
  await page.evaluate(id=>{S.q='';location.hash='edit/'+id;openSell(id)},made.id);await page.waitForSelector('[data-k="discountPrice"]');
  assert.equal(await page.inputValue('[data-k="priceNum"]'),'1200');assert.equal(await page.inputValue('[data-k="discountPrice"]'),'790');
  await page.fill('[data-k="discountPrice"]','690');assert.equal(await page.evaluate(()=>F.discountPrice),'690');
  await page.evaluate(()=>{$('sellPg').scrollTop=$('f-price').offsetTop-100});await page.screenshot({path:'.local-build/921-discount-form.png'});
  await page.click('[data-s="neg"]');assert.equal(await page.isDisabled('[data-k="discountPrice"]'),true);await page.click('[data-s="neg"]');assert.equal(await page.isDisabled('[data-k="discountPrice"]'),false);
  await page.evaluate(()=>{$('sellPg').hidden=true;location.hash='home'});await page.waitForTimeout(100);
  const result=await page.evaluate(()=>({single:ic('check'),double:ic('checks'),pending:ic('clock'),star:stars(5)}));for(const value of Object.values(result))assert.ok(value.includes('<path')||value.includes('<circle'));
  assert.deepEqual(errors,[]);console.log('9.21 browser PASS: description-only search, original/sale prices, price-first cards, 320/390/480px layout, light/dark, editable discount, SVG icons.');
 }finally{if(browser)await browser.close();await service.stop()}
})().catch(e=>{console.error(e);process.exit(1)});
