const {chromium}=require('./.local-build/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {start}=require('./test-fixture');
(async()=>{
 const service=await start(19819),browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:820},colorScheme:'light'}),page=await context.newPage(),errors=[];let offline=false;
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{const url=new URL(route.request().url());
  if(url.hostname==='gm.test'&&url.pathname.startsWith('/api/')){if(offline)return route.abort();const req=route.request();try{const r=await fetch(service.base+url.pathname.slice(4)+url.search,{method:req.method(),headers:{authorization:'Bearer test-buyer','content-type':'application/json'},body:req.postData()||undefined});return route.fulfill({status:r.status,contentType:r.headers.get('content-type'),body:Buffer.from(await r.arrayBuffer())})}catch{return route.abort()}}
  if(url.hostname==='gm.test'){const name=url.pathname==='/'?'index.html':path.basename(url.pathname),file=path.join('android-src/assets/www',name);if(!fs.existsSync(file))return route.abort();return route.fulfill({contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html',body:fs.readFileSync(file)})}
  if(/github/.test(url.hostname))return route.fulfill({contentType:'text/plain',body:'https://gm.test/api'});return route.abort();
 });
 await page.addInitScript(()=>{localStorage.setItem('gm_srv','https://gm.test/api');localStorage.setItem('gm_token','test-buyer');localStorage.setItem('gm_user',JSON.stringify({id:'buyer',name:'Покупатель'}));});
 async function overflow(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow')}
 try{
  await page.goto('https://gm.test/');await page.waitForSelector('#grid .card');
  assert.ok(!(await page.locator('body').innerText()).match(/\bСОГД\b|Свои люди|Хорошие вещи|ВЕЩИ И ЛЮДИ/));
  const colors=await page.locator('#cats .cat').evaluateAll(es=>es.map(e=>getComputedStyle(e).backgroundColor));assert.equal(new Set(colors).size,1);
  await page.waitForTimeout(350);await page.screenshot({path:'.local-build/919-home-light.png'});
  await page.evaluate(()=>{F=blankForm();drawSell();$('sellPg').hidden=false});
  await page.fill('[data-k="name"]','Футболка хлопок');await page.fill('[data-k="desc"]','Мягкая хлопковая футболка для ежедневной носки');
  await page.fill('[data-k="priceNum"]','250');await page.evaluate(()=>{window.testPrice=$('f-price').querySelector('input');$('sellPg').scrollTop=$('f-price').offsetTop-120;window.testY=$('sellPg').scrollTop});
  await page.click('[data-s="neg"]');assert.equal(await page.evaluate(()=>window.testPrice===$('f-price').querySelector('input')),true);assert.equal(await page.inputValue('[data-k="name"]'),'Футболка хлопок');assert.equal(await page.evaluate(()=>F.neg),true);
  assert.ok(Math.abs(await page.evaluate(()=>$('sellPg').scrollTop-window.testY))<10,'price click jumped form scroll');
  await page.click('[data-s="neg"]');assert.equal(await page.inputValue('[data-k="priceNum"]'),'250');
  for(const bazaar of ['Саховат','Сомон']){await page.click('[data-baz="'+bazaar+'"]');assert.equal(await page.locator('#f-sector').isVisible(),true);await page.fill('#sectorInput','б');assert.equal(await page.evaluate(()=>F.sector),'Б');assert.equal(await page.locator('#sectorInput').getAttribute('maxlength'),'1')}
  await page.click('[data-baz="Атуш"]');assert.equal(await page.locator('#f-sector').isVisible(),false);assert.equal(await page.evaluate(()=>F.sector),'');
  await page.selectOption('#sellPg .color-select','Красный');assert.equal(await page.evaluate(()=>F.a.color),'Красный');
  assert.equal(await page.locator('#sellPg .color-select').evaluate(e=>getComputedStyle(e).appearance),'none');
  await page.evaluate(()=>{$('sellPg').hidden=true;location.hash='filter'});await page.waitForSelector('#filterColor');await page.selectOption('#filterColor','Синий');assert.equal(await page.evaluate(()=>ft.f.color),'Синий');await page.click('#fok');await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>S.f.color),'Синий');
  await page.evaluate(()=>{S.f={};S.cat='all';location.hash='profile';renderProfile()});await page.waitForSelector('#pEdit');
  for(const width of [320,390,480]){await page.setViewportSize({width,height:820});await overflow();const r=await page.locator('.stat').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {y:r.y,w:r.width,x:r.x}}));assert.ok(r.every(x=>Math.abs(x.y-r[0].y)<1));assert.ok(r.every(x=>Math.abs(x.w-r[0].w)<1))}
  await page.setViewportSize({width:390,height:820});await page.waitForTimeout(350);await page.screenshot({path:'.local-build/919-profile-light.png'});
  assert.equal(await page.locator('#pAv').evaluate(e=>getComputedStyle(e,'::after').content),'none');await page.click('#pEdit');assert.equal(await page.locator('[data-profile-photo]').count(),1);
  const chooser=page.waitForEvent('filechooser');await page.click('[data-profile-photo]');await (await chooser).setFiles([]);await page.locator('#sheet [data-x]').click();
  await page.click('#pRev');assert.equal(await page.locator('.review-empty').isVisible(),true);await page.waitForTimeout(350);await page.screenshot({path:'.local-build/919-reviews-light.png'});await page.locator('#sheet [data-x]').click();
  await page.selectOption('#themeChoice','dark');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.waitForTimeout(350);await page.screenshot({path:'.local-build/919-profile-dark.png'});
  const btn=await page.locator('#pEdit').evaluate(e=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor}));assert.notEqual(btn.fg,btn.bg);
  await page.reload();await page.waitForSelector('#pEdit');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.selectOption('#themeChoice','system');await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await page.evaluate(()=>{location.hash='home';S.cat='all';S.f={};renderGrid()});await page.waitForSelector('#grid .card');
  offline=true;await context.setOffline(true);await page.evaluate(()=>toggleFav('match'));assert.equal(await page.evaluate(()=>favs.includes('match')),true);
  await page.evaluate(()=>location.hash='fav');await page.waitForSelector('#favGrid .card[data-id="match"]');
  await page.reload();await page.waitForSelector('#favGrid .card[data-id="match"]');assert.equal(await page.evaluate(()=>!!favoriteCards.match),true);await page.waitForTimeout(350);await page.screenshot({path:'.local-build/919-favorites-dark.png'});
  offline=false;await context.setOffline(false);await page.evaluate(()=>syncFavorites());await page.waitForFunction(()=>!favoritePending.match);
  let fav=await (await fetch(service.base+'/favorites',{headers:{authorization:'Bearer test-buyer'}})).json();assert.ok(fav.items.some(x=>x.id==='match'));
  offline=true;await context.setOffline(true);await page.evaluate(()=>toggleFav('match'));await page.reload();assert.equal(await page.evaluate(()=>favs.includes('match')),false);
  offline=false;await context.setOffline(false);await page.evaluate(()=>syncFavorites());await page.waitForFunction(()=>!favoritePending.match);fav=await (await fetch(service.base+'/favorites',{headers:{authorization:'Bearer test-buyer'}})).json();assert.ok(!fav.items.some(x=>x.id==='match'));
  await page.evaluate(()=>{F=blankForm();drawSell();$('sellPg').hidden=false;$('sellPg').scrollTop=$('f-a_color').offsetTop-70});await page.waitForTimeout(350);await page.screenshot({path:'.local-build/919-sell-dark.png'});await overflow();
  // 9.20: real custom choices, not a recolored Android system popup.
  await page.evaluate(()=>{F=blankForm();drawSell();$('sellPg').hidden=false});
  for(const theme of ['light','dark']){
   await page.evaluate(t=>{F=blankForm();drawSell();$('sellPg').hidden=false;SugdTheme.set(t)},theme);
   await page.click('[data-cat="suits"]');
   const bg=await page.locator('.ccells').evaluate(e=>getComputedStyle(e).backgroundColor);assert.equal(bg,'rgba(0, 0, 0, 0)');
   await page.click('[data-material-choice="sell"] summary');await page.click('[data-material-choice="sell"] [data-choice="Бамбук"]');await page.click('[data-material-choice="sell"] [data-choice="Флис"]');
   assert.equal(await page.evaluate(()=>F.a.mat),'Бамбук, Флис');
   await page.locator('[data-material-choice="sell"]').screenshot({path:'.local-build/920-materials-'+theme+'.png'});
   await page.click('[data-material-choice="sell"] .choice-done');
   await page.locator('#f-a_color summary').click();await page.locator('#f-a_color [data-choice="Розовый"]').click();assert.equal(await page.evaluate(()=>F.a.color),'Розовый');
   assert.equal(await page.locator('#f-a_color summary svg').count(),1);
   await page.locator('#f-cat').screenshot({path:'.local-build/920-categories-'+theme+'.png'});await overflow();
  }
  await page.evaluate(()=>{$('sellPg').hidden=true;location.hash='filter'});await page.waitForSelector('[data-material-choice="filter"]');
  await page.click('[data-material-choice="filter"] summary');await page.click('[data-material-choice="filter"] [data-choice="Хлопок"]');await page.click('[data-material-choice="filter"] .choice-done');
  await page.click('#fok');assert.equal(await page.evaluate(()=>S.f.mat),'Хлопок');
  await page.evaluate(()=>{S.f={};S.cat='all';location.hash='profile';renderProfile()});await page.waitForSelector('#pEdit');
  await page.click('#pEdit');await page.waitForSelector('#sheet.st>.shd');
  assert.equal(await page.locator('#sheet').evaluate(e=>getComputedStyle(e).overflowX),'hidden');
  const surfaces=await page.evaluate(()=>['#sheet','#sheet>.shd','#sheet .shead','#sheet .sbody'].map(s=>getComputedStyle(document.querySelector(s)).backgroundColor));assert.equal(new Set(surfaces).size,1);
  await page.locator('#sheet').screenshot({path:'.local-build/920-profile-sheet-dark.png'});await page.click('#sheet [data-x]');
  await page.locator('.theme-setting summary').click();assert.equal(await page.locator('.theme-setting summary svg').count(),1);await page.locator('.theme-setting [data-choice="dark"]').click();
  await page.evaluate(()=>{location.hash='home';resetFilters()});await page.waitForTimeout(150);assert.equal(await page.locator('.sugd-hero').count(),0);
  await page.evaluate(()=>{location.hash='item/base'});await page.waitForSelector('.gallery-actions');
  const buttons=await page.locator('.gallery-actions button').evaluateAll(es=>es.map(e=>{var r=e.getBoundingClientRect();return {left:r.left,right:r.right}}));assert.ok(buttons[1].left-buttons[0].right>=9);
  await page.click('[data-a="rev"]');await page.waitForSelector('#sheet .rvs');await page.locator('#sheet').screenshot({path:'.local-build/920-review-sheet-dark.png'});await page.click('#sheet [data-x]');
  // Render original vector artwork for matching Android launcher densities.
  const logo=await context.newPage();await logo.setViewportSize({width:512,height:512});await logo.setContent('<style>body{margin:0}svg{width:512px;height:512px}</style>'+fs.readFileSync('android-src/assets/www/sugd-logo.svg','utf8'));await logo.screenshot({path:'.local-build/919-launcher.png',omitBackground:true});await logo.close();
  assert.deepEqual(errors,[]);console.log('9.19 UI PASS: unchanged form nodes/scroll, filter colors, sectors, profile layout, theme persistence/system changes, photo control, offline favorite add/remove/reload/sync.');
 }finally{await browser.close();await service.stop()}
})().catch(e=>{console.error(e);process.exit(1)});
