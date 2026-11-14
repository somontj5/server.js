const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const Sizes=require('./android-src/assets/www/sizes');
const {start}=require('./test-fixture');
const adult=(cat='dress',section='dress-dresses',gender='Женское')=>({cat,section,a:{gender,ageGroup:'Взрослое'}});
const kid=(cat='dress',section='dress-dresses')=>({cat,section,a:{gender:'Унисекс',ageGroup:'Детское'}});
const values=(l,id)=>Sizes.options(l).groups.find(x=>x.id===id)?.values;
const spec=(system,...v)=>({entries:[{system,values:v}],standard:false});
test('Context-dependent sets, no size required for bags/scarves/accessories',()=>{
 assert.deepEqual(values(adult(),'number'),['42','44','46','48','50','52','54','56','58','60','62']);
 assert.equal(values(adult('outer'),'letter').at(-1),'8XL');
 assert.equal(values(adult('shoes','','Женское'),'shoe').at(-1),'42');
 assert.equal(values(adult('shoes','','Мужское'),'shoe')[0],'39');
 assert.equal(values(adult('shoes','','Унисекс'),'shoe').at(-1),'47');
 assert.deepEqual(values(kid('shoes'),'shoe'),Array.from({length:20},(_,i)=>String(17+i)));
 assert.equal(values(kid(),'height').at(-1),'170');
 assert.equal(Sizes.options(kid('national')).groups.length,1);
 assert.deepEqual(values(adult('under','under-socks'),'sock'),['36-40','41-46']);
 for(const cat of ['bags','acc','other','headwear'])assert.equal(Sizes.options(adult(cat)).required,false);
 assert.deepEqual(Sizes.options(adult('headwear','headwear-scarves')).groups,[]);
 assert.equal(Sizes.options(adult('sport')).standard,false);
});
test('Text parsing is contextual, bounded, Tajik age and Cyrillic letters supported',()=>{
 assert.deepEqual(Sizes.parse('46-48-50-52',adult()).entries,spec('number','46','48','50','52').entries);
 assert.deepEqual(Sizes.parse('46-52',adult()).entries,spec('number','46','48','50','52').entries);
 assert.deepEqual(Sizes.parse('ХЛ',adult()).entries,spec('letter','XL').entries);
 assert.deepEqual(Sizes.parse('XXL',adult()).entries,spec('letter','2XL').entries);
 assert.deepEqual(Sizes.parse('30',adult('pants')).entries,spec('waist','30').entries);
 assert.deepEqual(Sizes.parse('120',kid()).entries,spec('height','120').entries);
 assert.equal(Sizes.has(Sizes.parse('120',adult())),false);
 assert.deepEqual(Sizes.parse('2 то 9 сола',kid()).entries,spec('age','2','3','4','5','6','7','8','9').entries);
 assert.deepEqual(Sizes.parse('3-6 мес',kid()).entries,spec('age','3-6 мес').entries);
 assert.deepEqual(Sizes.parse('стандарт 46-52',adult()),{entries:[],standard:true,standardRange:{system:'number',from:'46',to:'52'}});
 assert.equal(Sizes.has(Sizes.parse('SMALL',adult())),false);
});
test('Exact/bounded standard first, unspecified standard last; never M=46',()=>{
 const q=spec('number','48'),ctx=adult();
 assert.equal(Sizes.rank({...ctx,sizes:q},q),2);
 assert.equal(Sizes.rank({...ctx,sizes:{entries:[],standard:true,standardRange:{system:'number',from:'46',to:'52'}}},q),2);
 assert.equal(Sizes.rank({...ctx,sizes:{entries:[],standard:true}},q),1);
 assert.equal(Sizes.rank({...ctx,sizes:spec('letter','M')},q),0);
 assert.equal(Sizes.rank({...ctx,a:{size:'стандарт 46-52'}},q),2);
 assert.equal(Sizes.rank({...ctx,sizes:spec('number','54')},q),0);
 assert.throws(()=>Sizes.clean(spec('shoe','47'),adult('shoes')));
 assert.throws(()=>Sizes.clean({entries:[],standard:true,standardRange:{system:'number',from:'52',to:'46'}},ctx));
 assert.throws(()=>Sizes.query('{bad'));
});
test('Live isolated API: persistence, validation, size sorting, legacy suites',async()=>{
 const service=await start(18100+Math.floor(Math.random()*500));
 async function api(path,method='GET',body,token='test-seller'){const r=await fetch(service.base+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 try{
 const q=encodeURIComponent(JSON.stringify(spec('number','48'))),path='/listings?cat=clothes&sub=dress&section=dress-dresses&sizes='+q;
 for(const sort of ['rec','cheap','new']){const r=await api(path+'&sort='+sort);assert.equal(r.status,200);const ids=r.data.items.map(x=>x.id);assert.equal(ids.at(-1),'size-unknown');assert.ok(ids.includes('size-exact'));assert.ok(ids.includes('size-bounded'));assert.ok(!ids.includes('size-letters'));assert.ok(!ids.includes('size-child'))}
 assert.equal((await api('/listings?sizes=%7Bbad')).status,400);
 assert.equal((await api('/listings?cat=clothes&sub=dress&size=48')).data.total,3);
 const draft={desc:'Качественное платье для повседневной носки',name:'Платье тест размера',cat:'clothes',sub:'dress',section:'dress-dresses',a:{gender:'Женское',ageGroup:'Взрослое'},row:'1',shopNum:'1',shopName:'Тест',photos:['data:image/png;base64,AA=='],sizes:spec('number','48','50')};
 const made=await api('/listings','POST',draft);assert.equal(made.status,200);assert.deepEqual(made.data.sizes,draft.sizes);
 assert.equal((await api('/listings/'+made.data.id)).data.a.size,'48, 50');
 assert.equal((await api('/listings/'+made.data.id,'PUT',{sizes:spec('number','44')})).status,200);
 assert.equal((await api('/listings/'+made.data.id,'PUT',{sizes:spec('shoe','38')})).status,400);
 assert.deepEqual((await api('/listings/'+made.data.id)).data.sizes,spec('number','44'));
 assert.equal((await api('/listings','POST',{...draft,sizes:Sizes.empty()})).status,400);
 assert.equal((await api('/listings','POST',{...draft,sub:'bags',section:'',sizes:Sizes.empty()})).status,200);
 // An old client without structured sizes remains backward compatible.
 assert.equal((await api('/listings','POST',{...draft,sizes:undefined,a:{size:'48'}})).status,200);
 const env={...process.env,GM_TEST_API:service.base,TEST_API:service.base};delete env.NODE_TEST_CONTEXT;
 const old=spawnSync(process.execPath,['--test','test-marketplace.js','test-tags.js'],{cwd:__dirname,env,encoding:'utf8',timeout:30000});
 // spawnSync would block this process only, the fixture server is a separate process.
 assert.equal(old.status,0,old.stdout+'\n'+old.stderr);
 console.log(old.stdout);
 }finally{await service.stop()}
});

const Catalog=require('./android-src/assets/www/categories');
test('Materials are contextual, aliases preserved, labels have no slashes or parentheses',()=>{
 const common=['Бамбук','Бархат и велюр','Флис','Кашемир','Ангора','Махровая ткань','Хлопок','Трикотаж и вязка','Смесовая','Другое'];
 assert.deepEqual(Catalog.materialOptions('suits'),common);assert.deepEqual(Catalog.materialOptions('home'),common);
 assert.deepEqual(Catalog.materialOptions('national'),['Атлас','Шёлк','Бархат и велюр','Хлопок','Другое']);
 assert.deepEqual(Catalog.materialList('Джинса (деним), Трикотаж, Смешанная ткань (хлопок + синтетика)'),['Джинс','Трикотаж и вязка','Смесовая']);
 assert.deepEqual(Catalog.materialList(['Бархат','Бархат/велюр','Флис']),['Бархат и велюр','Флис']);
 assert.deepEqual(Catalog.materialList('Синтепон / утеплитель, Текстиль (ткань), Пуховик (пух/перо)'),['Синтепон и утеплитель','Текстиль','Пух и перо']);
 for(const cat of Catalog.items){const opts=Catalog.materialOptions(cat.id);assert.equal(new Set(opts).size,opts.length);for(const v of opts)assert.ok(!/[\\/()]/.test(v),v);assert.equal(opts.includes('Резина'),cat.id==='shoes');assert.equal(opts.includes('Текстиль'),['shoes','bags'].includes(cat.id));assert.equal(opts.includes('Синтепон и утеплитель'),cat.id==='outer');}
 assert.ok(Catalog.materialOptions('under','under-socks').includes('Шерсть'));assert.ok(!Catalog.materialOptions('under','under-lingerie').includes('Шерсть'));
 for(const cat of ['dress','tops'])for(const v of ['Лён','Вискоза'])assert.ok(Catalog.materialOptions(cat).includes(v));
 for(const cat of ['outer','suits','home','knit','pants','sport','shoes','bags'])assert.ok(!Catalog.materialOptions(cat).includes('Лён'));
 assert.equal(Catalog.genderLabel('Женское',{ageGroup:'Детское'}),'Девочки');assert.equal(Catalog.genderLabel('Мужское',{ageGroup:'Детское'}),'Мальчики');assert.equal(Catalog.genderLabel('Унисекс',{}),'Для всех');
 assert.equal(Sizes.label({entries:[],standard:true}),'Стандарт');assert.equal(Sizes.canonical('Единый'),'Стандарт');
});
test('API keeps multiple materials without truncation, accepts other production and legacy names',async()=>{
 const service=await start(18700+Math.floor(Math.random()*200));
 async function api(path,method='GET',body){const r=await fetch(service.base+path,{method,headers:{authorization:'Bearer test-seller','content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 try{
  const mat=Catalog.materialOptions('suits').join(', '),draft={desc:'Качественная одежда для повседневной носки',name:'Тест материалов',cat:'clothes',sub:'suits',section:'suits-two',a:{gender:'Унисекс',ageGroup:'Детское',made:'Другая',mat},material:mat,row:'1',shopNum:'1',shopName:'Тест',photos:['data:image/png;base64,AA=='],sizes:spec('age','3','4')};
  const r=await api('/listings','POST',draft);assert.equal(r.status,200);assert.equal(r.data.a.mat,mat);assert.equal(r.data.material,mat);assert.equal(r.data.a.made,'Другая');
  assert.equal((await api('/listings/'+r.data.id)).data.a.mat,mat);
  const updated=await api('/listings/'+r.data.id,'PUT',{a:{...draft.a,mat:'Джинса (деним), Трикотаж, Флис'},material:'Джинса (деним), Трикотаж, Флис'});
  assert.equal(updated.status,200);assert.equal(updated.data.a.mat,'Джинс, Трикотаж и вязка, Флис');assert.equal(updated.data.material,updated.data.a.mat);
  const all=await api('/listings?sub=suits&ageGroup='+encodeURIComponent('Детское'));assert.ok(all.data.items.some(x=>x.id===r.data.id));
 }finally{await service.stop()}
});
