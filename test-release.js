const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const V=require('./android-src/assets/www/validation'),{start}=require('./test-fixture');
test('Descriptions accept Unicode and emoji; personal names stay concise and validated',()=>{
 for(const text of ['Ҷомаи тоҷикӣ барои ҳар рӯз, андозаи 48.','Oʻzbek koʻylak, paxta va yaxshi sifat.','Русская одежда: хлопок 100%, размер 48.','Cotton shirt, great everyday condition.','Описание товара \u{1F389} хорошее качество','Длинное описание с 汉字 и العربية','Состав: хлопок \u00a9 \u2122 • размер \u00b150 \u{1F469}\u200d\u{1F4BB}'])assert.equal(V.error('desc',text),'',text);
 for(const text of ['', 'Коротко', 'Длинное описание с \u202Eподменой', 'а'.repeat(30),'Описание товара с \u0000 управлением'])assert.ok(V.error('desc',text),text);
 for(const name of ['Ҷамшед','Oʻtkir','Анна-Мария','John O’Neil'])assert.equal(V.error('person',name),'',name);
 for(const name of ['', 'Я', 'Имя123','User_name','\u{1F916} Робот','Абвгдежзийклмнопрстуфхцчш','Имя\nФамилия'])assert.ok(V.error('person',name),name);
 assert.match(V.error('person','Абвгдежзийклмнопрстуфхцчш'),/24/);
 assert.ok(V.error('title','12'));assert.ok(V.error('title','Футболка 汉字'));
 assert.equal(V.error('title','Футболка Oʻzbek 100% хлопок'),'');
});
test('Client scripts parse, size-recognition action removed, native links compiled from source',()=>{
 const html=fs.readFileSync('android-src/assets/www/index.html','utf8');
 for(const x of html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(x[1]);
 assert.ok(html.includes('id="f-desc"'));assert.ok(html.includes('minlength="20"'));assert.ok(html.includes('select class="inp color-select"'));
 assert.ok(!fs.readFileSync('android-src/assets/www/sizes-ui.js','utf8').includes('Распознать'));
 const manifest=fs.readFileSync('android-src/AndroidManifest.xml','utf8');assert.ok(manifest.includes('android:scheme="glassmarket"'));assert.ok(manifest.includes('versionName="9.24"'));assert.ok(manifest.includes('versionCode="114"'));
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
  for(const desc of [undefined,'Коротко','Описание с управляющим \u0000 символом'])assert.equal((await api('/listings','POST',{...draft,desc})).status,400);
  assert.equal((await api('/listings','POST',{...draft,name:'Рубашка 🎉'})).status,400);
  const desc=('Хлопок мягкий, удобная посадка. '.repeat(48)).slice(0,1450),made=await api('/listings','POST',{...draft,desc});assert.equal(made.status,200,JSON.stringify(made.data));assert.equal(made.data.desc,desc.trim());
  const unicode='Мягкая футболка \u{1F389} состав: хлопок • \u2122 汉字';assert.equal((await api('/listings','POST',{...draft,desc:unicode})).data.desc,unicode);
  assert.equal((await api('/me','PUT',{phone:'992123456'})).data.phone,'+992 99 212 34 56');
  assert.equal((await api('/me','PUT',{name:'Анна',phone:'123'})).status,400);assert.notEqual((await api('/me')).data.name,'Анна');
  const id=made.data.id;assert.equal((await api('/listings/'+id,'PUT',{name:'Новое имя',desc:'Коротко'})).status,400);assert.equal((await api('/listings/'+id)).data.name,draft.name);
  assert.equal((await api('/listings/'+id,'PUT',{phone:'123',name:'Другое название'})).status,400);assert.equal((await api('/listings/'+id)).data.name,draft.name);
  const old=(await api('/me')).data.name;assert.equal((await api('/me','PUT',{name:'Fake123',row:'555'})).status,400);assert.equal((await api('/me')).data.name,old);
  assert.equal((await api('/me','PUT',{name:'Ҷамшед Oʻtkir'})).status,200);
  await api('/me/interests','DELETE',undefined,'test-buyer');await api('/listings/'+id,'GET',undefined,'test-buyer');const before=(await api('/me/interests','GET',undefined,'test-buyer')).data;
  await api('/listings/'+id,'GET',undefined,'test-buyer');const after=(await api('/me/interests','GET',undefined,'test-buyer')).data;assert.deepEqual(after,before);
  const page=await fetch(s.base+'/l/'+id),html=await page.text();assert.equal(page.status,200);assert.ok(html.includes('glassmarket://listing/'+id));assert.ok(html.includes('package=ru.glassmarket.app'));assert.ok(html.includes('Скачать SUGD.TJ 9.24'));
  await api('/listings/'+id+'/archive','POST');assert.equal((await fetch(s.base+'/l/'+id)).status,404);
 }finally{await s.stop()}
});

test('Chat photo retries enforce membership and deletion, reject oversized media explicitly',async()=>{
 const s=await start(19800+Math.floor(Math.random()*100));
 async function api(path,method='GET',body,token='test-buyer'){const r=await fetch(s.base+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 try{
  const thread=(await api('/listings/base/thread','POST',{})).data.id;
  const img=require('./test-fixture').fixture().listings.base.photos[0],path='/threads/'+thread+'/messages';
  const made=await api(path,'POST',{img});assert.equal(made.status,200);const photo=path+'/'+made.data.id+'/photo';
  assert.equal((await api(photo)).data.img,img);assert.equal((await api(photo,'GET',undefined,'test-seller')).data.img,img);
  assert.equal((await api(photo,'GET',undefined,'test-admin')).status,403);assert.equal((await api(photo,'GET',undefined,'')).status,401);
  assert.equal((await api(path,'POST',{text:'Привет',img:'invalid'})).status,400);
  assert.equal((await api(path,'POST',{text:'Привет',img:'data:image/jpeg;base64,'+'A'.repeat(900001)})).status,400);
  assert.equal((await api(path+'/'+made.data.id,'DELETE')).status,200);assert.equal((await api(photo)).status,404);
 }finally{await s.stop()}
});

test('Message retries are idempotent, media stays private, audio can be restored after reload',async()=>{
 const s=await start(20400+Math.floor(Math.random()*100));
 async function api(path,method='GET',body,token='test-buyer'){const r=await fetch(s.base+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 try{
  const tid=(await api('/listings/base/thread','POST',{})).data.id,path='/threads/'+tid+'/messages',voice='data:audio/webm;base64,QUJDRA==';
  const body={text:'Проверка записи',voice,dur:4,clientId:'retry_voice_001'};
  const responses=await Promise.all(Array.from({length:4},()=>api(path,'POST',body)));assert.ok(responses.every(r=>r.status===200));assert.equal(new Set(responses.map(r=>r.data.id)).size,1);
  const id=responses[0].data.id;assert.equal((await api('/threads/'+tid)).data.messages.length,1);
  assert.equal((await api('/threads','GET',undefined,'test-seller')).data.unread,1);
  assert.equal((await api(path,'POST',{...body,text:'Подмена'})).status,409);
  const restore=path+'/'+id+'/voice';assert.equal((await api(restore)).data.voice,voice);assert.equal((await api(restore,'GET',undefined,'test-admin')).status,403);assert.equal((await api(restore,'GET',undefined,'')).status,401);
  const preview=(await api('/threads')).data.items.find(t=>t.id===tid).last;assert.equal(preview.voice,1);assert.ok(!JSON.stringify(preview).includes(voice));
  assert.equal((await api(path,'POST',{voice:'invalid'})).status,400);
  await api(path+'/'+id,'DELETE');assert.equal((await api(restore)).status,404);assert.equal((await api(path,'POST',body)).data.del,1);
  const img=require('./test-fixture').fixture().listings.base.photos[0],photo=await api(path,'POST',{img,clientId:'retry_photo_002'});assert.equal(photo.status,200);
  const reply=await api(path,'POST',{text:'О размере',re:photo.data.id,clientId:'reply_photo_003'});assert.equal(reply.data.re.id,photo.data.id);
  assert.equal((await api('/threads','GET',undefined,'test-admin')).data.items.length,0);
 }finally{await s.stop()}
});
test('Messenger sources parse and native message notifications use private MessagingStyle without polling clutter',()=>{
 new vm.Script(fs.readFileSync('android-src/assets/www/messenger.js','utf8'));
 const native=fs.readFileSync('android-src/src/ru/glassmarket/app/MsgService.java','utf8');assert.ok(native.includes('Notification.MessagingStyle'));assert.ok(native.includes('VISIBILITY_PRIVATE'));assert.ok(!native.includes('setOngoing(true)'));assert.ok(native.includes('POLLING.set(false)'));

 const css=fs.readFileSync('android-src/assets/www/messenger.css','utf8');assert.ok(css.includes('prefers-reduced-motion'));assert.ok(css.includes('Animation inventory'));
});

test('SUGD guest: private resumable identity, full marketplace access, no privilege escalation',async()=>{
 const s=await start(0);
 async function api(path,method='GET',body,token=''){const r=await fetch(s.base+path,{method,headers:{'content-type':'application/json',authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 try{
  assert.equal((await api('/auth/guest','POST',{})).status,400);
  const key='a'.repeat(64),g=await api('/auth/guest','POST',{deviceKey:key,admin:true,userId:'seller'});assert.equal(g.status,200);assert.ok(g.data.token);assert.equal(g.data.user.guest,true);assert.notEqual(g.data.user.id,'seller');assert.ok(!JSON.stringify(g.data).includes(key));
  const token=g.data.token,uid=g.data.user.id;
  assert.equal((await api('/auth/guest','POST',{deviceKey:key})).data.token,token);
  const other=(await api('/auth/guest','POST',{deviceKey:'b'.repeat(64)})).data;assert.notEqual(other.user.id,uid);
  assert.equal((await api('/me','GET',null,token)).data.id,uid);
  assert.equal((await api('/tags','GET',null,token)).status,403);
  assert.equal((await api('/listings/base','PUT',{name:'Чужая вещь'},token)).status,403);
  assert.equal((await api('/favorites/base','POST',{},token)).status,200);
  assert.equal((await api('/favorites','GET',null,token)).data.items.length,1);
  const tid=(await api('/listings/base/thread','POST',{},token)).data.id;assert.ok(tid);
  assert.equal((await api('/threads/'+tid+'/messages','POST',{text:'Здравствуйте! Можно замеры?'},token)).status,200);
  assert.equal((await api('/threads/'+tid,'GET',null,other.token)).status,403);
  const draft={name:'Хлопковая футболка',desc:'Мягкая хлопковая футболка для повседневной носки.',cat:'clothes',sub:'tops',section:'tops-tees',row:'2',shopNum:'9876',shopName:'Мой магазин',photos:['data:image/png;base64,AA=='],ways:[]};
  const made=await api('/listings','POST',draft,token);assert.equal(made.status,200,JSON.stringify(made.data));assert.equal(made.data.sellerId,uid);
  assert.equal((await api('/my/stats','GET',null,token)).status,200);
  assert.equal((await api('/me','PUT',{name:'Фарид'},token)).status,200);
  await api('/auth/logout','POST',{},token);assert.equal((await api('/me','GET',null,token)).status,401);
  const resume=(await api('/auth/guest','POST',{deviceKey:key})).data;assert.equal(resume.user.id,uid);assert.equal(resume.user.name,'Фарид');assert.notEqual(resume.token,token);
 }finally{await s.stop()}
});

test('9.21 sector is exactly one supported letter, persists and rejects invalid updates atomically',async()=>{
 const s=await start(19900+Math.floor(Math.random()*50));
 async function api(path,method='GET',body){const r=await fetch(s.base+path,{method,headers:{authorization:'Bearer test-seller','content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 try{
  const V=require('./android-src/assets/www/validation');
  for(const x of ['А','Б','A','Ғ','Ў'])assert.equal(V.sectorError(x),'');
  for(const x of ['','12','AB','АБ','3','🎉'])assert.ok(V.sectorError(x));
  const draft={name:'Хлопковая футболка',desc:'Мягкая футболка из хлопка для повседневной носки.',cat:'clothes',sub:'tops',section:'tops-tees',shopName:'Тест',row:'1',shopNum:'1',photos:['data:image/png;base64,AA=='],bazaar:'Саховат',sector:'б'};
  const created=await api('/listings','POST',draft);assert.equal(created.status,200,JSON.stringify(created.data));assert.equal(created.data.sector,'Б');
  const id=created.data.id;
  const invalid=await api('/listings/'+id,'PUT',{name:'Нельзя сохранить',sector:'АБ'});assert.equal(invalid.status,400);assert.equal((await api('/listings/'+id)).data.name,draft.name);
  assert.equal((await api('/listings/'+id,'PUT',{bazaar:'Сомон',sector:'A'})).data.sector,'A');
  assert.equal((await api('/me')).data.sector,'A');
  assert.equal((await api('/me','PUT',{sector:'AA',name:'Новое имя'})).status,400);assert.notEqual((await api('/me')).data.name,'Новое имя');
  assert.equal((await api('/me','PUT',{bazaar:'Сомон',sector:'қ'})).data.sector,'Қ');
  assert.equal((await api('/listings/'+id,'PUT',{bazaar:'Атуш',sector:''})).data.sector,'');
 }finally{await s.stop()}
});


test('9.21 tags separate materials, respect children and negation, and never infer outfits from quantities',()=>{
 const T=require('./tags');
 const a=T.layer1({sub:'suits',a:{ageGroup:'Детское',gender:'Женское',mat:'Бамбук, Флис'}});
 assert.ok(a.includes('детское'));assert.ok(!a.includes('взрослое'));assert.ok(a.includes('бамбук'));assert.ok(a.includes('флис'));assert.ok(!a.includes('бамбук флис'));
 assert.ok(!T.layer2('Рубашка хлопок 2 штуки, 3 цвета').tags.includes('двойка'));
 assert.ok(T.layer2('2 омад флисовая двойка с вышивкой').tags.includes('двойка'));
 assert.ok(T.layer2('Флисовая кофта с вышивкой').tags.includes('флис'));
 assert.ok(!T.layer2('Хлопковая футболка без вышивки').tags.includes('вышивка'));
 assert.ok(!T.layer2('шуберт бамбуковоз').tags.includes('шуба'));
});
test('9.21 similar listings exclude cross-category material/country matches and preserve dictionary synonyms',async()=>{
 const s=await start(0);async function api(path,method='GET',body,token='test-seller'){const r=await fetch(s.base+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(r.status,200,await r.clone().text());return r.json()}
 try{
  const draft={cat:'clothes',sub:'tops',section:'tops-tees',name:'Хлопковая футболка',desc:'Удобная хлопковая футболка для повседневной носки',shopName:'Тест',row:'1',shopNum:'1',photos:['data:image/png;base64,AA=='],material:'Хлопок',a:{gender:'Женское',ageGroup:'Взрослое',mat:'Хлопок',made:'Турция'}};
  const top=await api('/listings','POST',draft),similar=await api('/listings','POST',{...draft,name:'Футболка женская'});
  const wrong=await api('/listings','POST',{...draft,sub:'pants',section:'pants-trousers',name:'Хлопковые брюки'});
  const kid=await api('/listings','POST',{...draft,name:'Футболка детская',a:{...draft.a,ageGroup:'Детское'}});
  const ids=(await api('/listings/'+top.id+'/similar','GET',undefined,'test-buyer')).items.map(x=>x.id);
  assert.ok(ids.includes(similar.id));assert.ok(!ids.includes(top.id));assert.ok(!ids.includes(wrong.id));assert.ok(!ids.includes(kid.id));
  await api('/events','POST',{type:'hide',listingId:similar.id},'test-buyer');assert.ok(!(await api('/listings/'+top.id+'/similar','GET',undefined,'test-buyer')).items.some(x=>x.id===similar.id));
  assert.equal((await api('/listings/'+top.id+'/similar')).items.length,0);
 }finally{await s.stop()}
});
