const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const V=require('./android-src/assets/www/validation'),{start}=require('./test-fixture');
test('RU TJ UZ EN text, limits and useful punctuation; no emoji or other alphabets',()=>{
 for(const text of ['Ҷомаи тоҷикӣ барои ҳар рӯз, андозаи 48.','Oʻzbek koʻylak, paxta va yaxshi sifat.','Русская одежда: хлопок 100%, размер 48.','Cotton shirt, great everyday condition.'])assert.equal(V.error('desc',text),'',text);
 for(const text of ['', 'Коротко', 'Длинное описание с emoji 🎉', 'Длинное описание с 汉字', 'Длинное описание с العربية', 'Длинное описание с \u202Eподменой', '!!!!!!!!!!!!!!! текст описания', 'а'.repeat(30)])assert.ok(V.error('desc',text),text);
 for(const name of ['Ҷамшед','Oʻtkir','Анна-Мария','John O’Neil'])assert.equal(V.error('person',name),'',name);
 for(const name of ['', 'Я', 'Имя123','User_name','🤖 Робот','а'.repeat(41),'Имя\nФамилия'])assert.ok(V.error('person',name),name);
 assert.ok(V.error('title','12'));assert.ok(V.error('title','Футболка 汉字'));
 assert.equal(V.error('title','Футболка Oʻzbek 100% хлопок'),'');
});
test('Client scripts parse, size-recognition action removed, native links compiled from source',()=>{
 const html=fs.readFileSync('android-src/assets/www/index.html','utf8');
 for(const x of html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(x[1]);
 assert.ok(html.includes('id="f-desc"'));assert.ok(html.includes('minlength="20"'));assert.ok(html.includes('select class="inp color-select"'));
 assert.ok(!fs.readFileSync('android-src/assets/www/sizes-ui.js','utf8').includes('Распознать'));
 const manifest=fs.readFileSync('android-src/AndroidManifest.xml','utf8');assert.ok(manifest.includes('android:scheme="glassmarket"'));assert.ok(manifest.includes('versionName="9.13"'));
});
test('Cold and warm recommendations avoid seller/category monopolies when alternatives exist',()=>{
 const code=fs.readFileSync('server.js','utf8'),a=code.indexOf('function recommend('),b=code.indexOf('// Gemini вызывается',a);
 const t=Date.now(),context=vm.createContext({now:()=>t,decayed:x=>x[0],isTop:()=>false,hash:()=>0,makeTags:l=>l.tags});vm.runInContext(code.slice(a,b),context);
 const listings=Array.from({length:15},(_,i)=>({id:String(i),sellerId:'s'+i%4,sub:'c'+i%3,createdAt:t-i,tags:['w:shirt']}));
 for(const user of [null,{id:'u',interests:{'w:shirt':[5,t]},hidden:['2'],seen:[]}]){
  const out=context.recommend(listings,user);assert.equal(new Set(out.map(x=>x.id)).size,out.length);
  assert.ok(out.slice(1,10).every((l,i)=>l.sellerId!==out[i].sellerId));
  assert.ok(out.slice(3,10).every((l,i)=>!out.slice(i,i+3).every(x=>x.sub===l.sub)));
  if(user)assert.ok(!out.some(x=>x.id==='2'));
 }
});
test('Live API validates create/update/profile atomically, keeps long descriptions and deduplicates views',async()=>{
 const s=await start(19200+Math.floor(Math.random()*300));
 async function api(path,method='GET',body,token='test-seller'){const r=await fetch(s.base+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 try{
  const draft={name:'Хлопковая футболка',desc:'Мягкая хлопковая футболка для повседневной носки.',cat:'clothes',sub:'tops',section:'tops-tees',shopName:'Тест',row:'1',shopNum:'1',photos:['data:image/png;base64,AA==']};
  for(const desc of [undefined,'Коротко','Описание с чужими символами 汉字'])assert.equal((await api('/listings','POST',{...draft,desc})).status,400);
  assert.equal((await api('/listings','POST',{...draft,name:'Рубашка 🎉'})).status,400);
  const desc=('Хлопок мягкий, удобная посадка. '.repeat(48)).slice(0,1450),made=await api('/listings','POST',{...draft,desc});assert.equal(made.status,200,JSON.stringify(made.data));assert.equal(made.data.desc,desc.trim());
  const id=made.data.id;assert.equal((await api('/listings/'+id,'PUT',{name:'Новое имя',desc:'Коротко'})).status,400);assert.equal((await api('/listings/'+id)).data.name,draft.name);
  const old=(await api('/me')).data.name;assert.equal((await api('/me','PUT',{name:'Fake123',row:'555'})).status,400);assert.equal((await api('/me')).data.name,old);
  assert.equal((await api('/me','PUT',{name:'Ҷамшед Oʻtkir'})).status,200);
  await api('/me/interests','DELETE',undefined,'test-buyer');await api('/listings/'+id,'GET',undefined,'test-buyer');const before=(await api('/me/interests','GET',undefined,'test-buyer')).data;
  await api('/listings/'+id,'GET',undefined,'test-buyer');const after=(await api('/me/interests','GET',undefined,'test-buyer')).data;assert.deepEqual(after,before);
  const page=await fetch(s.base+'/l/'+id),html=await page.text();assert.equal(page.status,200);assert.ok(html.includes('glassmarket://listing/'+id));assert.ok(html.includes('package=ru.glassmarket.app'));assert.ok(html.includes('Скачать приложение 9.13'));
  await api('/listings/'+id+'/archive','POST');assert.equal((await fetch(s.base+'/l/'+id)).status,404);
 }finally{await s.stop()}
});
