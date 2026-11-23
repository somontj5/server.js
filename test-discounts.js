const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Price=require('./android-src/assets/www/pricing'),Tags=require('./tags'),{start}=require('./test-fixture');
test('Shared discount contract handles legacy prices, decimals, removal and rejects invalid sales',()=>{
 for(const value of ['-1','0','NaN','Infinity','1000000001','1.234','<script>'])assert.equal(Price.parse(value),null,value);
 const l=Price.clean({priceNum:'1 200',discountPrice:'899,50'},{});assert.equal(Price.original(l),1200);assert.equal(Price.effective(l),899.5);assert.match(Price.text(l),/899,5/);
 assert.equal(Price.effective({price:'1 500 ₽'}),1500);assert.equal(Price.sale({price:'Договорная',discountPrice:10}),null);
 for(const discountPrice of [0,-1,1200,1300,'bad'])assert.throws(()=>Price.clean({discountPrice},l));
 assert.equal(Price.effective(Price.clean({discountPrice:''},l)),1200);
 assert.throws(()=>Price.clean({priceNum:100},l));assert.equal(Price.effective(l),899.5);
});
test('Semantic index is not truncated to visible labels and retains form characteristics',()=>{
 const l={cat:'clothes',sub:'tops',section:'tops-tees',name:'Футболка',desc:'Хлопковая футболка оверсайз флис турция лето',a:{gender:'Женское',ageGroup:'Взрослое',mat:'Хлопок',size:'48',season:'Лето',color:'Красный',cond:'Новое',style:'Оверсайз',made:'Турция'}};
 assert.equal(Tags.visible(l).length,8);const all=Tags.semantic(l),index=Tags.indexTags(l);assert.ok(all.length>8);assert.ok(index.includes('k:флис'));assert.ok(index.some(t=>t==='w:красныи'||t==='w:красный'));assert.ok(index.includes('k:Турция'));
 assert.ok(!Tags.layer2('без флиса, не хлопок').tags.includes('флис'));
 assert.deepEqual(Tags.layer2('Ҷома').tags,Tags.layer2('жома').tags);
});
test('API validates discounts atomically and searches full descriptions/attributes without leaking tags',async()=>{
 const s=await start(0);async function api(path,method='GET',body,token='test-seller'){const r=await fetch(s.base+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 try{
 const draft={name:'Футболка повседневная',desc:'Мягкая футболка для прогулок и отдыха. Внутри особая подкладка алькантара.',cat:'clothes',sub:'tops',section:'tops-tees',shopName:'Тест',row:'1',shopNum:'1',priceNum:1200,discountPrice:700,a:{color:'Бирюзовый',gender:'Женское',ageGroup:'Взрослое',cond:'Новое'},photos:['data:image/png;base64,AA==']};
 const made=await api('/listings','POST',draft);assert.equal(made.status,200,JSON.stringify(made));const id=made.data.id;
 assert.equal(made.data.priceNum,1200);assert.equal(made.data.discountPrice,700);assert.equal(made.data.effectivePrice,700);
 for(const discountPrice of [0,1200,-1,'<script>'])assert.equal((await api('/listings/'+id,'PUT',{name:'Испорченное имя',discountPrice})).status,400);
 const unchanged=(await api('/listings/'+id)).data;assert.equal(unchanged.name,draft.name);assert.equal(unchanged.discountPrice,700);
 for(const query of ['алькантара','бирюзовый']){const result=(await api('/listings?q='+encodeURIComponent(query))).data;assert.ok(result.items.some(l=>l.id===id),query);assert.ok(!('desc' in result.items[0]));assert.ok(!('tags' in result.items[0]));}
 const filtered=(await api('/listings?min=650&max=750&sort=cheap')).data.items;assert.ok(filtered.some(l=>l.id===id));assert.ok(!(await api('/listings?min=1000')).data.items.some(l=>l.id===id));
 const chat=await api('/listings/'+id+'/thread','POST',{},'test-buyer');assert.equal(chat.status,200);assert.equal(chat.data.listing.discountPrice,700);
 const tid=chat.data.id;await api('/threads/'+tid+'/messages','POST',{text:'Здравствуйте, товар есть?'},'test-buyer');
 assert.ok((await api('/updates?since=0')).data.items.some(x=>x.tid===tid));
 await api('/threads/'+tid);assert.ok(!(await api('/updates?since=0')).data.items.some(x=>x.tid===tid));
 await api('/me/interests','DELETE',undefined,'test-buyer');
 await api('/listings?q='+encodeURIComponent('алькантара'),'GET',undefined,'test-buyer');const learned=(await api('/me/interests','GET',undefined,'test-buyer')).data;
 await api('/listings?q='+encodeURIComponent('алькантара'),'GET',undefined,'test-buyer');assert.deepEqual((await api('/me/interests','GET',undefined,'test-buyer')).data,learned);

 await api('/listings/'+id,'PUT',{discountPrice:null});assert.equal((await api('/listings/'+id)).data.effectivePrice,1200);
 await api('/listings/'+id,'PUT',{priceNum:null,price:'Договорная',discountPrice:null});assert.equal((await api('/listings/'+id)).data.effectivePrice,null);
 }finally{await s.stop()}
});
test('Client uses server query results, SVG controls and price-first cards',()=>{
 const html=fs.readFileSync('android-src/assets/www/index.html','utf8');for(const x of html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(x[1]);
 const card=html.slice(html.indexOf('function card(l)'),html.indexOf('function emptyBox'));assert.ok(card.indexOf('priceHtml(l)')<card.indexOf('esc(l.name)'));
 assert.ok(html.includes("p.push('q='+encodeURIComponent(S.q.trim()))"));assert.ok(html.includes('remote.concat(R.list)'));assert.ok(html.includes('data-k="discountPrice"'));
 for(const f of ['index.html','messenger.js','sugd.css','ui-controls.js'])assert.ok(!/[\u{1F300}-\u{1FAFF}✓✔★☆🕓]/u.test(fs.readFileSync('android-src/assets/www/'+f,'utf8')),f);
});
