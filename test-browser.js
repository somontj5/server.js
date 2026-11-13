// Local-only mobile regression: install playwright in .local-build, run with PLAYWRIGHT_BROWSERS_PATH set.
const { chromium } = require('./.local-build/node_modules/playwright');
const fs = require('fs');
const assert = require('assert/strict');
(async () => {
  const service=await require('./test-fixture').start(8091);
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||chromium.executablePath(),args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:320,height:700}});
    const page = await context.newPage(), errors = [];let networkDown=false;
    page.on('pageerror', e => { errors.push(e.message); console.error('Page error:',e.message); });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'gm.test' && url.pathname.startsWith('/api/')) {
        if(networkDown)return route.abort('internetdisconnected');
        const req = route.request(), response = await fetch((process.env.GM_TEST_API || 'http://127.0.0.1:8091') + url.pathname.slice(4) + url.search, {
          method:req.method(),headers:{'content-type':'application/json',authorization:'Bearer test-buyer'},body:req.postData()||undefined
        });
        return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
      }
      if (url.hostname === 'gm.test') {
        const file = ['validation.js','categories.js','sizes.js','sizes-ui.js','chat-media.js'].find(x=>url.pathname==='/'+x)||'index.html';
        return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':'text/html',body:fs.readFileSync('android-src/assets/www/'+file)});
      }
      if (/github/.test(url.hostname)) return route.fulfill({contentType:'text/plain',body:'https://gm.test/api'});
      return route.abort();
    });
    await page.addInitScript(() => {
      localStorage.setItem('gm_srv','https://gm.test/api');
      localStorage.setItem('gm_token','test-buyer');
      localStorage.setItem('gm_user',JSON.stringify({id:'buyer',name:'Buyer'}));
    });
    await page.goto('https://gm.test/');
    assert.ok(!(await page.locator('#grid').innerText()).includes('Разместите первое'));
    assert.equal(await page.evaluate(()=>GMValidation.error('person','Ҷамшед')),'');
    await page.waitForSelector('#grid .card',{timeout:10000});
    assert.equal(await page.locator('#cats [data-c]').count(),15);
    await page.click('[data-c="suits"]');
    await page.waitForSelector('#subcats [data-section="suits-two"]');
    assert.equal(await page.locator('#subcats button').count(),7);
    await page.click('[data-section="suits-two"]');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#grid .card').count(),2);
    await page.click('#grid .card[data-id="base"]');
    await page.waitForSelector('#sim .card');
    for (const width of [320,360,390,480]) {
      await page.setViewportSize({width,height:700});
      await page.waitForTimeout(180);
      const rects = await page.locator('.abar .btn').evaluateAll(els => els.map(e => {
        const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,sw:e.scrollWidth,cw:e.clientWidth};
      }));
      assert.equal(rects.length,3);
      assert.ok(rects.every(r=>r.x>=0&&r.x+r.w<=width+1&&r.sw<=r.cw+1));
      assert.ok(Math.abs(rects[0].w-rects[2].w)<1);
      assert.ok(rects.every(r=>r.y===rects[0].y));
      console.log('Contact layout PASS:',width);
    }
    assert.equal(await page.locator('#sim .card').first().getAttribute('data-id'),'match');
    await page.locator('#sim [data-fav="match"]').click();
    assert.ok((await page.locator('#sim [data-fav="match"]').getAttribute('class')).includes('on'));
    const scroll = await page.locator('#itemPg').evaluate(e=>{e.scrollTop=500;return e.scrollTop;});
    await page.evaluate(()=>refresh());
    assert.equal(await page.locator('#itemPg').evaluate(e=>e.scrollTop),scroll);
    await page.screenshot({path:'.local-build/item-480.png',fullPage:true});
    await page.evaluate(()=>location.hash='home');
    await page.waitForSelector('#cats');
    await page.click('#btnFilter');
    await page.waitForSelector('[data-fc="national"]');
    await page.click('[data-fc="national"]');
    await page.click('[data-fsection="national-atlas"]');
    await page.click('#fok');
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>S.section),'national-atlas');
    await page.evaluate(()=>{F=blankForm();photos=[[]];drawSell();$('sellPg').hidden=false;});
    await page.click('[data-cat="national"]');
    await page.click('[data-leaf="national-atlas"]');
    assert.equal(await page.evaluate(()=>F.section),'national-atlas');
    await page.click('[data-cat="shoes"]');
    assert.equal(await page.evaluate(()=>F.section),'');
    assert.equal(await page.locator('[data-leaf]').count(),7);
    // Children use contextual labels; multi-select sizes need no range mode.
    await page.click('[data-attr="ageGroup"][data-v="Детское"]');
    assert.equal(await page.locator('[data-size-system="shoe"]').count(),20);
    await page.click('[data-size-value="17"]');
    assert.equal(await page.locator('[data-size-action="range"]').count(),0);
    await page.click('[data-size-value="20"]');
    await page.click('[data-size-value="23"]');
    assert.deepEqual(await page.evaluate(()=>F.sizes.entries[0].values),['17','20','23']);
    await page.click('[data-attr="ageGroup"][data-v="Взрослое"]');
    await page.click('[data-attr="gender"][data-v="Женское"]');
    assert.equal(await page.locator('[data-size-system="shoe"]').count(),8);
    await page.click('[data-cat="dress"]');await page.click('[data-leaf="dress-dresses"]');
    await page.click('[data-size-system="number"][data-size-value="48"]');
    await page.click('[data-size-system="letter"][data-size-value="M"]');
    assert.equal(await page.evaluate(()=>F.sizes.entries.length),2);
    await page.click('[data-size-action="clear"]');
    assert.equal(await page.evaluate(()=>GMSizes.has(F.sizes)),false);
    await page.click('[data-size-action="standard"]');
    assert.equal(await page.locator('[data-size-range]').count(),0);
    assert.equal(await page.locator('#f-a_size [data-size-action="standard"]').innerText(),'Стандарт');
    await page.click('[data-attr="ageGroup"][data-v="Детское"]');
    assert.deepEqual(await page.locator('[data-attr="gender"]').allTextContents(),['Девочки','Мальчики','Для всех']);
    await page.click('[data-attr="ageGroup"][data-v="Взрослое"]');
    assert.deepEqual(await page.locator('[data-attr="gender"]').allTextContents(),['Женское','Мужское','Для всех']);
    await page.click('[data-cat="suits"]');
    await page.click('[data-attr="mat"][data-v="Бамбук"]');await page.click('[data-attr="mat"][data-v="Флис"]');
    assert.equal(await page.evaluate(()=>F.a.mat),'Бамбук, Флис');
    assert.equal(await page.locator('[data-attr="mat"].on').count(),2);
    await page.click('[data-attr="mat"][data-v="Бамбук"]');assert.equal(await page.evaluate(()=>F.a.mat),'Флис');
    await page.click('[data-attr="made"][data-v="Другая"]');assert.equal(await page.evaluate(()=>F.a.made),'Другая');
    await page.click('[data-cat="shoes"]');assert.equal(await page.evaluate(()=>F.a.mat),'');
    assert.equal(await page.locator('[data-attr="mat"][data-v="Резина"]').count(),1);
    assert.equal(await page.locator('[data-attr="mat"][data-v="Флис"]').count(),0);
    await page.click('[data-cat="under"]');await page.click('[data-leaf="under-socks"]');
    assert.equal(await page.locator('[data-attr="mat"][data-v="Шерсть"]').count(),1);
    await page.click('[data-attr="mat"][data-v="Шерсть"]');await page.click('[data-leaf="under-lingerie"]');
    assert.equal(await page.evaluate(()=>F.a.mat),'');assert.equal(await page.locator('[data-attr="mat"][data-v="Шерсть"]').count(),0);
    for(const cat of await page.evaluate(()=>CATS.map(x=>x.id))){await page.click('[data-cat="'+cat+'"]');assert.ok(!/[\\/()]/.test(await page.locator('#f-attrs').innerText()));}
    await page.click('[data-cat="bags"]');
    assert.equal(await page.locator('#f-a_size').count(),0);
    assert.equal(await page.locator('[data-size-action="parse"]').count(),0);
    assert.equal(await page.locator('select.color-select').count(),1);
    await page.selectOption('select.color-select','Синий');assert.equal(await page.evaluate(()=>F.a.color),'Синий');
    const phone=page.locator('#sellPg [data-k="phone"]');
    await phone.fill('901234567');await phone.press('End');
    for(let i=0;i<20;i++)await phone.press('Backspace');
    assert.equal(await phone.inputValue(),'');assert.equal(await page.evaluate(()=>F.phone),'');
    await phone.fill('+992 90 123 45 67');await phone.press('Home');
    for(let i=0;i<7;i++)await phone.press('ArrowRight');await phone.press('Backspace');
    assert.equal(await phone.inputValue(),'90123467');
    assert.equal(await page.locator('#f-phone .prefix').innerText(),'+992');
    await phone.fill('+992 90 123 45 67');assert.equal(await phone.inputValue(),'901234567');
    assert.equal(await page.evaluate(()=>F.phone),'+992901234567');
    await phone.fill('992123456');assert.equal(await phone.inputValue(),'992123456');
    await phone.fill('123456');assert.equal(await page.evaluate(()=>phOk(F.phone)),false);
    await page.evaluate(()=>{gmOpenListing('match')});
    await page.waitForFunction(()=>location.hash==='#item/match');
    await page.waitForSelector('#itemPg .ititle');
    assert.equal(await page.evaluate(()=>find('match').srv),1);
    await page.evaluate(()=>{F=blankForm();drawSell();$('sellPg').hidden=false;});
    assert.equal(await page.locator('[data-k="desc"]').getAttribute('minlength'),'20');
    assert.equal(await page.locator('[data-k="desc"]').getAttribute('maxlength'),'1500');
    await page.evaluate(()=>{$('sellPg').hidden=true;location.hash='home';});
    await page.waitForTimeout(200);
    await page.click('#btnFilter');
    await page.waitForSelector('[data-fc="dress"]');await page.click('[data-fc="dress"]');
    await page.click('[data-fsection="dress-dresses"]');
    await page.click('[data-size-system="number"][data-size-value="48"]');
    await page.click('#fok');
    await page.waitForTimeout(500);
    const sizeIds=await page.locator('#grid .card').evaluateAll(es=>es.map(e=>e.dataset.id));
    assert.ok(sizeIds.includes('size-exact'));assert.ok(sizeIds.includes('size-bounded'));
    assert.equal(sizeIds.at(-1),'size-unknown');assert.ok(!sizeIds.includes('size-letters'));
    assert.equal(await page.locator('#grid .card').last().getByText('Размер уточняйте').count(),1);
    await page.click('#btnFilter');await page.waitForSelector('[data-size-value="50"]');
    await page.click('[data-size-system="number"][data-size-value="50"]');
    await page.click('[data-close]');await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(()=>S.f.sizeSpec.entries[0].values),['48']);
    for(const width of [320,360,390]){await page.setViewportSize({width,height:700});await page.waitForTimeout(150);const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,items:Array.from(document.querySelectorAll('body *')).filter(e=>{var r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1}).slice(0,15).map(e=>({tag:e.tagName,cls:e.className,id:e.id,right:e.getBoundingClientRect().right}))}));assert.ok(overflow.scroll<=width,JSON.stringify(overflow))}
    await page.screenshot({path:'.local-build/size-search.png',fullPage:true});
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('#f-section').evaluate(e=>getComputedStyle(e).animationName),'none');
    // Search has a single clear control and individually removable history rows.
    await page.evaluate(()=>{resetFilters();location.hash='home';hist=['55','Платье'];jset(K.H,hist);});
    await page.waitForTimeout(200);await page.focus('#q');await page.waitForSelector('#hist:not([hidden])');
    assert.equal(await page.locator('[data-hr="55"]').count(),1);
    await page.locator('[data-hr="55"]').click();assert.deepEqual(await page.evaluate(()=>hist),['Платье']);
    await page.fill('#q','55');await page.click('#qClr');assert.equal(await page.inputValue('#q'),'');
    await page.screenshot({path:'.local-build/search-history-9.14.png'});
    await page.locator('#q').blur();
    // A real image is cached separately from message metadata, survives a cold offline reload,
    // remains downloadable offline, and missing cache entries offer explicit retry.
    const photo=await page.evaluate(()=>{var cv=document.createElement('canvas');cv.width=300;cv.height=180;var x=cv.getContext('2d');x.fillStyle='#dceeff';x.fillRect(0,0,300,180);x.fillStyle='#2373b9';x.fillRect(80,30,140,120);return cv.toDataURL('image/png')});
    const tid=await page.evaluate(async img=>{var th=await GM.api('POST','/listings/base/thread',{});await GM.api('POST','/threads/'+th.id+'/messages',{img:img});var c={id:'s_'+th.id,tid:th.id,msgs:[],name:'Тестовый продавец',title:'Товар',photo:img,lid:'base'};chats.push(c);saveChats();location.hash='chat/'+c.id;return th.id},photo);
    await page.waitForSelector('#cmsgs .mimg');await page.waitForFunction(()=>document.querySelector('#cmsgs .mimg').naturalWidth>0);
    const mk=await page.evaluate(()=>{var c=fchat($('chatPg').dataset.id),m=c.msgs.find(m=>m.img);return {id:mkey(m),key:mediaStoreKey(c,mkey(m))}});
    await page.waitForFunction(async key=>!!(await GMChatMedia.get(key)),mk.key);
    await page.waitForTimeout(400);networkDown=true;await context.setOffline(true);await page.reload();
    await page.waitForSelector('#cmsgs .mimg');await page.waitForFunction(()=>document.querySelector('#cmsgs .mimg').naturalWidth>0);
    assert.equal(await page.locator('#cmsgs .mimg').getAttribute('src'),photo);
    assert.equal(await page.locator('#cmsgs .bub').evaluate(e=>getComputedStyle(e).aspectRatio),'auto');
    assert.equal(await page.evaluate(()=>JSON.stringify(chats).includes('data:image/png;base64')),true); // listing preview only
    assert.equal(await page.evaluate(()=>fchat($('chatPg').dataset.id).msgs.find(m=>m.img).img),1);
    const download=page.waitForEvent('download');await page.click('#cmsgs .photo-action');const saved=await download;await saved.saveAs('.local-build/chat-photo-download.png');
    assert.ok(fs.statSync('.local-build/chat-photo-download.png').size>0);
    await page.screenshot({path:'.local-build/chat-offline-9.14.png'});
    await page.evaluate(async ({id,key})=>{await GMChatMedia.remove(key);delete MED[id];delete MEDIA_READ[key];$('cmsgs')._h='';drawMsgs()},mk);
    await page.waitForSelector('.photo-missing');await page.click('.photo-action');assert.ok((await page.locator('#toast').innerText()).includes('Нет интернета'));
    networkDown=false;await context.setOffline(false);await page.click('.photo-action');await page.waitForSelector('#cmsgs .mimg');
    await page.waitForFunction(()=>document.querySelector('#cmsgs .mimg').naturalWidth>0);
    // Per-account cache key cannot expose another user's photos.
    assert.equal(await page.evaluate(async key=>await GMChatMedia.get(key.replace('buyer/','seller/')),mk.key),null);
    await page.locator('.mimg').click();await page.waitForSelector('#zoom [data-save]');await page.click('[data-close-zoom]');
    await page.evaluate(()=>{location.hash='home'});await page.waitForTimeout(200);await page.setViewportSize({width:390,height:800});await page.screenshot({path:'.local-build/categories-9.14.png'});
    assert.notEqual(await page.evaluate(()=>P.national),await page.evaluate(()=>P.dress));
    await page.locator('#cats').evaluate(e=>{e.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:none;grid-auto-flow:row;grid-auto-columns:auto;overflow:visible';e.querySelectorAll('.cat').forEach(b=>b.style.height='100px')});
    await page.locator('#cats').screenshot({path:'.local-build/category-icons-9.14.png'});
    assert.deepEqual(errors,[]);
    console.log('Browser hierarchy, filters, form, similar, favourites, scroll and reduced motion PASS');
  } finally { await browser.close(); await service.stop(); }
})().catch(e=>{console.error(e);process.exit(1);});
