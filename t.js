global.window=global;global.cat=function(){return{n:'Обувь'}};global.num=function(l){return l.priceNum};global.isTop=()=>false;global.iscore=()=>0;
eval(require('fs').readFileSync('engine.js','utf8')+';global.GME=GME');
var L=[{name:'Кроссовки Nike Air',cat:'shoes',a:{gender:'Мужское',size:'42',color:'Белый'},priceNum:5000,tags:'',createdAt:1},
{name:'Худи оверсайз черное',cat:'knit',a:{gender:'Унисекс',size:'L',color:'Чёрный'},priceNum:2500,tags:'толстовка хлопок',createdAt:2},
{name:'Пуховик зимний женский',cat:'outer',a:{gender:'Женское',size:'M',color:'Бежевый',season:'Зима'},priceNum:9000,createdAt:3},
{name:'Джинсы скинни',cat:'pants',a:{gender:'Женское',size:'S',color:'Синий'},priceNum:1800,createdAt:4}];
['кросовки','кроссовки до 6000','толстовка','черная худи','женская куртка','джинс','rhjccjdrb','зимняя одежда','кофта L','мужские 42'].forEach(q=>console.log(q,'=>',GME.search(L,q).list.map(l=>l.name).join('; '),GME.search(L,q).note||''));
var lq=GME.lay('rhjccjdrb');console.log(lq,GME.search(L,lq).list.map(l=>l.name));
console.log(GME.suggest('кр',L),GME.suggest('худи о',L));console.log(GME.autoTags(L[1]));
