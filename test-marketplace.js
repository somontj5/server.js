// Run API checks against an isolated fixture server: GM_TEST_API=http://127.0.0.1:8091 node --test test-marketplace.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Catalog = require('./android-src/assets/www/categories.js');
const Tags = require('./tags.js');
const base = process.env.GM_TEST_API;
async function api(path, method = 'GET', body, token = 'test-buyer') {
  const response = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
function privateFields(l) {
  for (const key of ['tags','tt','tu','nu','atags','ai','ai2','mtags','hideTags']) assert.ok(!(key in l), key);
}
test('15 stable categories, unique valid leaves, no presentation notes', () => {
  assert.equal(Catalog.items.length, 15);
  const ids = new Set();
  for (const c of Catalog.items) {
    assert.ok(!ids.has(c.id)); ids.add(c.id);
    for (const leaf of c.children) {
      assert.ok(!ids.has(leaf.id)); ids.add(leaf.id);
      assert.ok(Catalog.valid(c.id, leaf.id));
      assert.ok(!/[()]/.test(leaf.n));
      assert.equal(Catalog.leaf(leaf.id).n, leaf.n);
    }
  }
  assert.equal(Catalog.valid('dress', 'suits-two'), false);
});
test('Legacy atlas/headwear migration is idempotent; ordinary dresses stay put', () => {
  for (const [input, expected] of [
    [{cat:'clothes',sub:'dress',name:'Атласное платье'}, {sub:'national',section:'national-atlas'}],
    [{cat:'clothes',sub:'dress',section:'dress-dresses',name:'Атласное платье'}, {sub:'national',section:'national-atlas'}],
    [{cat:'dress',name:'Обычное платье'}, {sub:'dress',section:''}],
    [{cat:'acc',name:'Хиджаб'}, {sub:'headwear',section:'headwear-hijabs'}],
    [{cat:'home',section:'home-robes',name:'Халат'}, {sub:'home',section:'home-robes'}],
  ]) {
    assert.deepEqual(Catalog.normalize(input), expected);
    assert.deepEqual(Catalog.normalize({...input,...expected}), expected);
  }
});
test('Leaf category contributes internal tags without dropping form/material tags', () => {
  const tags = Tags.visible({cat:'clothes',sub:'suits',section:'suits-two',material:'флис',a:{gender:'Женское'}});
  assert.ok(tags.includes('Двойки')); assert.ok(tags.includes('флис')); assert.ok(tags.includes('женское'));
});
test('Server card adapter maps clothes/sub to UI group and retains leaf', () => {
  const html = fs.readFileSync('android-src/assets/www/index.html','utf8');
  const start = html.indexOf('function fix(l){'), end = html.indexOf('\nwindow.SFix=fix;',start);
  const context = vm.createContext({GMCatalog:Catalog, contactWays:()=>['phone','wa']});
  vm.runInContext(html.slice(start,end),context);
  const l = context.fix({id:'x',cat:'clothes',sub:'suits',section:'suits-two',photos:[],tags:['private']});
  assert.equal(l.cat,'suits'); assert.equal(l.section,'suits-two'); assert.ok(!('tags' in l));
});
test('API: category filters, migration, personalization, hidden/archive exclusion, safe updates', {skip:!base}, async () => {
  assert.equal((await api('/categories')).data.items.length,15);
  assert.equal((await api('/listings/atlas')).data.sub,'national');
  assert.equal((await api('/listings/scarf')).data.sub,'headwear');
  assert.equal((await api('/listings/legacy-home')).data.cat,'home');
  assert.equal((await api('/listings/legacy-other')).data.cat,'other');
  const filtered = (await api('/listings?cat=clothes&sub=suits&section=suits-two')).data.items;
  assert.ok(filtered.length >= 2); assert.ok(filtered.every(l => l.sub==='suits' && l.section==='suits-two'));
  await api('/me/interests','DELETE');
  const similar = (await api('/listings/base/similar')).data.items;
  assert.equal(similar[0].id,'match');
  assert.ok(!similar.some(l=>['base','archived','unrelated'].includes(l.id))); similar.forEach(privateFields);
  await api('/events','POST',{type:'hide',listingId:'match'});
  assert.ok(!(await api('/listings/base/similar')).data.items.some(l=>l.id==='match'));
  assert.ok(!(await api('/recs')).data.items.some(l=>l.id==='match'));
  await api('/me/interests','DELETE');
  await api('/events','POST',{type:'search',sub:'suits',section:'suits-two'});
  const interests = (await api('/me/interests')).data.items;
  assert.ok(interests.some(x=>x.tag==='g:suits'&&x.w>0));
  assert.ok(interests.some(x=>x.tag==='d:suits-two'&&x.w>0));
  assert.equal((await api('/recs')).data.personal,true);
  const invalid = await api('/listings/base','PUT',{sub:'dress',section:'suits-two'},'test-seller');
  assert.equal(invalid.status,400);
  const unchanged = (await api('/listings/base')).data;
  assert.equal(unchanged.sub,'suits'); assert.equal(unchanged.section,'suits-two');
  const saved = await api('/searches','POST',{cat:'clothes',sub:'suits',section:'suits-two'});
  assert.equal(saved.data.section,'suits-two');
  await api('/searches/'+saved.data.id,'DELETE');
  for(const path of ['/listings','/recs','/listings/base/similar']) (await api(path)).data.items.forEach(privateFields);
});
