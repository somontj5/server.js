const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const TAGS = require('./tags');
const { classify } = require('./ai-worker');
const examples = [
  ['Двойка 2️⃣ омад в наличии! Ткань флис Тедди! Без размер стандарт! Вышивка 🪡 Цена 170с!', ['двойка', 'флис', 'вышивка']],
  ['новинка двойка халат Материал бамбук Размер 46-48-50-52 Цена 100 сомон', ['двойка', 'халат', 'бамбук']],
  ['Шубачаи зебо барои кӯдакон Материал: ангорка Размер 1-сола то 6-7-сола Нарх 80 сомонӣ', ['шуба', 'ангора', 'детское']]
];
for (const [text, tags] of examples) test(`Requested example: ${tags.join(', ')}`, () => {
  const found = TAGS.layer2(text);
  assert.deepEqual(new Set(found.tags), new Set(tags));
  assert.deepEqual(found.unknown, []);
});
test('Flags, Tajik letters, keycap emoji and compound synonyms', () => {
  assert.deepEqual(new Set(TAGS.layer2('🇨🇳 🇹🇷 ҷинс 2️⃣ омад остиндароз').tags), new Set(['Китай', 'Турция', 'джинс', 'двойка', 'длинный рукав']));
  assert.deepEqual(TAGS.layer2('новинка ҳаст нархаш заказ в ЛС качество аъло').unknown, []);
  assert.equal(TAGS.layer2('халатность').tags.includes('халат'), false);
  assert.deepEqual(TAGS.layer2('незнакомка').unknown, ['незнакомка']);
});
test('Form fields canonicalized; children do not automatically mean girls', () => {
  const tags = TAGS.layer1({ cat: 'clothes', material: 'Тедди', a: { mat: 'флис', gender: 'Детское', made: 'Китай', size: '46', season: 'Зима' } });
  assert.equal(tags.filter(x => x === 'флис').length, 1);
  for (const t of ['Одежда', 'детское', 'Китай', 'размер 46', 'зима']) assert.ok(tags.includes(t));
  assert.ok(!tags.includes('девочки'));
  assert.ok(TAGS.layer1({ a: { gender: 'Женское' } }).includes('взрослое'));
});
test('Max 8, strict AI allowlist and seller removals also affect index', () => {
  const l = { name: 'двойка флис вышивка', hideTags: ['флис'], ai2: ['invented', 'Китай'] };
  assert.ok(!TAGS.visible(l).includes('invented'));
  assert.ok(TAGS.visible(l).includes('Китай'));
  assert.ok(!TAGS.visible(l).includes('флис'));
  assert.ok(!TAGS.indexTags(l).includes('k:флис'));
  assert.ok(TAGS.visible({ name: TAGS.allowed().join(' ') }).length <= 8);
  assert.deepEqual(TAGS.queryTags('жилетка'), ['k:безрукавка']);
});
const job = { id: 'a', version: 'v', allowed: ['Китай', 'флис'], text: 'Тедди хитой', unknown: ['неясно'] };
const response = (status, value) => ({ ok: status === 200, status, json: async () => value });
test('Gemini JSON: canonical casing, hallucinations rejected, key not in URL', async () => {
  const result = await classify(job, 'test-key', async (url, options) => {
    assert.ok(!url.includes('test-key'));
    assert.equal(options.headers['x-goog-api-key'], 'test-key');
    return response(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ tags: ['китай', 'флис', 'invented', 'флис'], unknown: ['неясно', 'madeup'] }) }] } }] });
  });
  assert.deepEqual(result.tags, ['Китай', 'флис']);
  assert.deepEqual(result.unknown, ['неясно']);
});
test('Model fallback ONLY on 404; quota errors never trigger extra calls', async () => {
  let calls = 0;
  const result = await classify(job, 'key', async () => ++calls === 1 ? response(404, {}) : response(200, { candidates: [{ content: { parts: [{ text: '{"tags":[],"unknown":[]}' }] } }] }));
  assert.equal(calls, 2); assert.equal(result.model, 'gemini-3.5-flash-lite');
  calls = 0;
  await assert.rejects(() => classify(job, 'key', async () => { calls++; return response(429, {}); }), /HTTP 429/);
  assert.equal(calls, 1);
});
test('Malformed AI JSON is not marked successful', async () => {
  await assert.rejects(() => classify(job, 'key', async () => response(200, { candidates: [{ content: { parts: [{ text: '{"tags":"флис","unknown":[]}' }] } }] })), /Invalid AI JSON/);
});
test('WhatsApp: TJ normalization, encoded context, invalid number blocked; client JS parses', () => {
  const html = fs.readFileSync('android-src/assets/www/index.html', 'utf8');
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
  const context = vm.createContext({ window: {}, encodeURIComponent });
  const helper = html.slice(html.indexOf('function digits('), html.indexOf('/* Таджикистан:', html.indexOf('function digits(')));
  vm.runInContext(helper, context);
  const link = context.waLink({ phone: '90 123 45 67', name: 'Двойка & флис', shareUrl: 'https://example.com/l/1' });
  assert.equal(new URL(link).pathname, '/992901234567');
  assert.ok(new URL(link).searchParams.get('text').includes('Двойка & флис'));
  assert.equal(context.waLink({ phone: '123' }), '');
  assert.ok(!html.includes("btns=btns.filter(function(b){return b.indexOf('Позвонить')"));
  assert.ok(html.includes('contact:ct,ways:w.slice()'));
});

const apiBase = process.env.TEST_API;
test('Live isolated API: auth, synonyms, version conflicts, idempotency, hiding, contact sync', { skip: !apiBase }, async () => {
  async function api(path, method = 'GET', body, token = 'test-seller') {
    const res = await fetch(apiBase + path, { method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, value: await res.json() };
  }
  assert.equal((await api('/internal/ai/jobs')).status, 401);
  assert.equal((await api('/internal/ai/jobs', 'GET', null, '')).status, 401);
  let created = await api('/listings', 'POST', { name: 'Жилетка загадочное', cat: 'clothes', sub: 'outer', photos: ['data:image/png;base64,AA=='], row: '1', shopNum: '1', shopName: 'Тест', phone: '+992 90 123 45 67', contact: 'both', ways: ['phone', 'wa'] });
  assert.equal(created.status, 200);
  const id = created.value.id;
  assert.deepEqual(created.value.ways, ['phone', 'wa']);
  const searched = await api('/listings?q=' + encodeURIComponent('безрукавка'));
  assert.ok(searched.value.items.some(l => l.id === id));
  const oldJob = (await api('/internal/ai/jobs', 'GET', null, 'test-worker')).value.jobs.find(l => l.id === id);
  assert.ok(oldJob);
  await api('/listings/' + id, 'PUT', { desc: 'обновление загадочное' });
  const stale = await api('/internal/ai/results', 'POST', { results: [{ id, version: oldJob.version, tags: ['флис'], unknown: [] }] }, 'test-worker');
  assert.equal(stale.value.stale, 1);
  const fresh = (await api('/internal/ai/jobs', 'GET', null, 'test-worker')).value.jobs.find(l => l.id === id);
  const result = { id, version: fresh.version, tags: ['флис', 'invented', 'китай'], unknown: ['invented'], model: 'gemini-3.1-flash-lite' };
  assert.equal((await api('/internal/ai/results', 'POST', { results: [result] }, 'test-worker')).value.applied, 1);
  assert.equal((await api('/internal/ai/results', 'POST', { results: [result] }, 'test-worker')).value.applied, 0);
  const listing = (await api('/listings/' + id)).value;
  assertPrivate(listing);
  for (const q of ['Китай','флис']) assert.ok((await api('/listings?q='+encodeURIComponent(q))).value.items.some(l => l.id === id));
  await api('/listings/' + id + '/tag-hide', 'POST', { tag: 'флис' });
  assertPrivate((await api('/listings/' + id)).value);
  assert.ok(!(await api('/listings?q='+encodeURIComponent('флис'))).value.items.some(l => l.id === id));
  const unknown = (await api('/tags/unknown', 'GET', null, 'test-admin')).value.items;
  assert.equal(unknown.find(w => w.word === 'загадочное').count, 1);
  assert.ok(!unknown.some(w => w.word === 'invented'));
  assert.ok(!(await api('/internal/ai/jobs', 'GET', null, 'test-worker')).value.jobs.some(l => l.id === id));
  assert.equal((await api('/tags', 'GET', null, 'test-admin')).value.ai.state, 'ok');
});

function assertPrivate(listing) {
  for (const k of ['tags','atags','tt','tu','nu','mtags','hideTags','ai','ai2','aiVersion','aiModel','unknownCounted'])
    assert.ok(!(k in listing), 'Leaked field: ' + k);
}
test('Client: no seller tag UI or Telegram contact/share, legacy ways sanitized', () => {
  const html = fs.readFileSync('android-src/assets/www/index.html', 'utf8');
  for (const text of ['id="tagPrev"','id="aiTags"','data-k="tags"','Теги товара','Написать в Telegram','https://t.me/+','data-m="tg"']) assert.ok(!html.includes(text), text);
  assert.ok(html.includes('Войти через Telegram'));
  const context = vm.createContext({});
  vm.runInContext(html.slice(html.indexOf('function contactWays('), html.indexOf('function motionScroll(')), context);
  for (const [input, expected] of [[{ways:['wa','tg','phone','wa']},['wa','phone']], [{contact:'tg'},[]], [{contact:'both'},['phone','wa']], [{ways:[],contact:'both'},[]]]) {
    assert.deepEqual(Array.from(context.contactWays(input)), expected);
  }
  assert.ok(html.includes('behavior:motionScroll()'));
  assert.ok(html.includes('animation:none!important;transition:none!important;scroll-behavior:auto!important'));
});
test('API privacy on owner/buyer/anonymous paths; legacy Telegram removed without enabling WhatsApp', { skip: !apiBase }, async () => {
  async function api(path, token = 'test-seller', method = 'GET', body) {
    const r = await fetch(apiBase+path, {method, headers:{authorization:'Bearer '+token,'content-type':'application/json'}, body:body?JSON.stringify(body):undefined});
    return {status:r.status, value:await r.json()};
  }
  const made = await api('/listings','test-seller','POST',{name:'Двойка флис',cat:'clothes',photos:['data:image/png;base64,AA=='],row:'1',shopNum:'1',shopName:'Тест',phone:'+992 90 123 45 67',ways:['tg','wa','phone','wa'],contact:'tg'});
  assert.equal(made.status,200); const id = made.value.id;
  assert.deepEqual(made.value.ways,['wa','phone']); assert.equal(made.value.contact,'both'); assertPrivate(made.value);
  for (const token of ['test-seller','test-buyer','']) {
    assertPrivate((await api('/listings/'+id,token)).value);
    for (const path of ['/listings','/listings?seller=me','/recs','/listings/'+id+'/similar']) {
      const r = await api(path,token); assert.equal(r.status,200); r.value.items.forEach(assertPrivate);
    }
    for (const path of ['/tags','/tags/unknown','/tags/resolve?text=флис']) assert.equal((await api(path,token)).status,token?403:401);
  }
  const changed = await api('/listings/'+id,'test-seller','PUT',{ways:['tg'],contact:'tg'});
  assert.deepEqual(changed.value.ways,[]); assert.equal(changed.value.phone,''); assert.equal(changed.value.contact,'chat');
  const legacy = (await api('/listings/legacy-tg')).value;
  assert.deepEqual(legacy.ways,[]); assert.equal(legacy.phone,''); assert.equal(legacy.contact,'chat');
  const optedOut = (await api('/listings/legacy-optout')).value;
  assert.deepEqual(optedOut.ways,[]); assert.equal(optedOut.phone,'');
  const waOnly = (await api('/listings/legacy-wa')).value;
  assert.deepEqual(waOnly.ways,['wa']); assert.ok(waOnly.phone);
});
