// Local-only mobile regression: install playwright in .local-build, run with PLAYWRIGHT_BROWSERS_PATH set.
const { chromium } = require('./.local-build/node_modules/playwright');
const fs = require('fs');
const assert = require('assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:320,height:700}});
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error('Page error:',e.message); });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'gm.test' && url.pathname.startsWith('/api/')) {
        const req = route.request(), response = await fetch((process.env.GM_TEST_API || 'http://127.0.0.1:8091') + url.pathname.slice(4) + url.search, {
          method:req.method(),headers:{'content-type':'application/json',authorization:'Bearer test-buyer'},body:req.postData()||undefined
        });
        return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
      }
      if (url.hostname === 'gm.test') {
        const file = url.pathname === '/categories.js' ? 'categories.js' : 'index.html';
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
    await page.waitForSelector('#grid .card',{timeout:10000});
    assert.equal(await page.locator('#cats [data-c]').count(),15);
    await page.click('[data-c="suits"]');
    await page.waitForSelector('#subcats [data-section="suits-two"]');
    assert.equal(await page.locator('#subcats button').count(),7);
    await page.click('[data-section="suits-two"]');
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
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('#f-section').evaluate(e=>getComputedStyle(e).animationName),'none');
    assert.deepEqual(errors,[]);
    console.log('Browser hierarchy, filters, form, similar, favourites, scroll and reduced motion PASS');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
