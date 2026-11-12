/* Shared offline catalog: stable legacy group IDs, leaf IDs stored in section. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GMCatalog=factory()})(this,function(){
'use strict';
var items=[{"id":"suits","n":"Двойки и тройки","children":[{"id":"suits-two","n":"Двойки"},{"id":"suits-three","n":"Тройки"},{"id":"suits-matching","n":"Парные комплекты"},{"id":"suits-skirt-set","n":"Кофты с юбкой"},{"id":"suits-robe-set","n":"Халаты-двойки"},{"id":"suits-classic","n":"Классические костюмы"}]},{"id":"national","n":"Национальная одежда","children":[{"id":"national-atlas","n":"Атласные платья"},{"id":"national-men","n":"Мужская одежда"},{"id":"national-other","n":"Другое"}]},{"id":"outer","n":"Верхняя одежда","children":[{"id":"outer-jackets","n":"Куртки и ветровки"},{"id":"outer-bombers","n":"Бомберы"},{"id":"outer-fur","n":"Шубы и шубки"},{"id":"outer-vests","n":"Жилеты и безрукавки"},{"id":"outer-leather","n":"Кожаные куртки"},{"id":"outer-coats","n":"Пальто и плащи"},{"id":"outer-down","n":"Пуховики"}]},{"id":"dress","n":"Платья и юбки","children":[{"id":"dress-dresses","n":"Платья"},{"id":"dress-skirts","n":"Юбки"},{"id":"dress-sundresses","n":"Сарафаны"}]},{"id":"tops","n":"Футболки и рубашки","children":[{"id":"tops-tees","n":"Футболки"},{"id":"tops-polo","n":"Тенниски и поло"},{"id":"tops-longsleeves","n":"Лонгсливы"},{"id":"tops-shirts","n":"Рубашки"},{"id":"tops-blouses","n":"Блузки"}]},{"id":"knit","n":"Кофты и свитера","children":[{"id":"knit-sweaters","n":"Свитера"},{"id":"knit-knits","n":"Кофты"},{"id":"knit-tunics","n":"Туники"},{"id":"knit-hoodies","n":"Худи и толстовки"},{"id":"knit-cardigans","n":"Кардиганы"}]},{"id":"pants","n":"Брюки и джинсы","children":[{"id":"pants-trousers","n":"Брюки"},{"id":"pants-jeans","n":"Джинсы"},{"id":"pants-leggings","n":"Леггинсы"},{"id":"pants-shorts","n":"Шорты"},{"id":"pants-sweatpants","n":"Спортивные брюки"}]},{"id":"home","n":"Домашняя одежда","children":[{"id":"home-robes","n":"Халаты"},{"id":"home-pajamas","n":"Пижамы"},{"id":"home-nightwear","n":"Ночные сорочки"}]},{"id":"sport","n":"Спортивная одежда","children":[{"id":"sport-sets","n":"Костюмы"},{"id":"sport-tops","n":"Футболки и топы"},{"id":"sport-pants","n":"Штаны"}]},{"id":"under","n":"Нижнее бельё и носки","children":[{"id":"under-lingerie","n":"Бельё"},{"id":"under-tights","n":"Колготки"},{"id":"under-socks","n":"Носки"}]},{"id":"headwear","n":"Платки и головные уборы","children":[{"id":"headwear-scarves","n":"Платки и шарфы"},{"id":"headwear-hijabs","n":"Хиджабы"},{"id":"headwear-hats","n":"Шапки"},{"id":"headwear-caps","n":"Кепки"},{"id":"headwear-skullcaps","n":"Тюбетейки"}]},{"id":"shoes","n":"Обувь","children":[{"id":"shoes-sneakers","n":"Кроссовки и кеды"},{"id":"shoes-formal","n":"Туфли"},{"id":"shoes-sandals","n":"Босоножки и сандалии"},{"id":"shoes-boots","n":"Ботинки"},{"id":"shoes-winter","n":"Сапоги"},{"id":"shoes-slippers","n":"Тапочки и шлёпанцы"},{"id":"shoes-other","n":"Другое"}]},{"id":"bags","n":"Сумки и рюкзаки","children":[]},{"id":"acc","n":"Аксессуары","children":[{"id":"acc-belts","n":"Ремни"},{"id":"acc-gloves","n":"Перчатки"},{"id":"acc-jewelry","n":"Украшения"},{"id":"acc-glasses","n":"Очки"}]},{"id":"other","n":"Другое","children":[]}];
function group(id){return items.find(function(c){return c.id===id})}
function leaf(id){for(var i=0;i<items.length;i++){var c=items[i].children.find(function(x){return x.id===id});if(c)return c}return null}
function valid(parent,child){var c=group(parent);return !!(c&&c.children.some(function(x){return x.id===child}))}
function normalize(l){
 var sub=group(l.sub)?l.sub:(group(l.cat)?l.cat:'other'),section=valid(sub,l.section)?l.section:'';
 var text=String(l.name||'')+' '+String(l.desc||'');text=text.toLowerCase().replace(/ё/g,'е');
 // Only confident legacy migrations: atlas dresses and newly separated headwear.
 if((sub==='dress'&&/атлас|адрас|чакан/.test(text))||(!section&&/плать[а-я]*[ -]+атлас|атлас[а-я]*[ -]+плать/.test(text))){sub='national';section='national-atlas'}
 if(!section&&sub==='acc'){
  var rules=[['hijabs',/хиджаб/],['skullcaps',/тюбетей|токи/],['caps',/кепк|бейсболк/],['hats',/шапк/],['scarves',/платок|платки|шарф/]];
  for(var i=0;i<rules.length;i++)if(rules[i][1].test(text)){sub='headwear';section='headwear-'+rules[i][0];break}
 }
 return {sub:sub,section:section};
}
// Canonical labels are shared with the server; legacy aliases remain readable.
var aliases={'Джинса (деним)':'Джинс','Трикотаж':'Трикотаж и вязка','Трикотаж/вязка':'Трикотаж и вязка','Синтетика (полиэстер)':'Синтетика','Смешанная ткань (хлопок + синтетика)':'Смесовая','Искусственная кожа (экокожа)':'Экокожа','Пуховик (пух/перо)':'Пух и перо','Синтепон / утеплитель':'Синтепон и утеплитель','Текстиль (ткань)':'Текстиль','Бархат':'Бархат и велюр','Бархат/велюр':'Бархат и велюр','Махровая':'Махровая ткань','Кожа/экокожа':'Кожа и экокожа'};
var materialSets={
 suits:'Бамбук|Бархат и велюр|Флис|Кашемир|Ангора|Махровая ткань|Хлопок|Трикотаж и вязка|Смесовая|Другое',
 national:'Атлас|Шёлк|Бархат и велюр|Хлопок|Другое',
 outer:'Натуральная кожа|Экокожа|Замша|Натуральный мех|Искусственный мех|Пух и перо|Синтепон и утеплитель|Шерсть|Синтетика|Джинс|Флис|Ангора|Хлопок|Другое',
 dress:'Хлопок|Шёлк|Лён|Вискоза|Трикотаж и вязка|Атлас|Бархат и велюр|Синтетика|Смесовая|Другое',
 knit:'Трикотаж и вязка|Шерсть|Ангора|Кашемир|Флис|Хлопок|Бамбук|Махровая ткань|Смесовая|Другое',
 pants:'Джинс|Хлопок|Трикотаж и вязка|Синтетика|Смесовая|Кожа и экокожа|Другое',
 sport:'Хлопок|Трикотаж и вязка|Синтетика|Бамбук|Флис|Смесовая',
 headwear:'Хлопок|Шёлк|Шерсть|Вискоза|Трикотаж и вязка|Искусственный мех|Синтетика',
 shoes:'Натуральная кожа|Экокожа|Замша|Текстиль|Резина|Синтетика',
 bags:'Натуральная кожа|Экокожа|Текстиль|Синтетика',
 acc:'Хлопок|Шерсть|Натуральная кожа|Экокожа|Металл|Пластик|Другое',
 other:'Хлопок|Шерсть|Натуральная кожа|Экокожа|Металл|Пластик|Другое'
};
materialSets.home=materialSets.suits;materialSets.tops=materialSets.dress;materialSets.under=materialSets.sport;
function materialList(value){var a=Array.isArray(value)?value:String(value||'').split(',');return a.reduce(function(r,v){v=String(v).trim();v=aliases[v]||v;if(v&&r.indexOf(v)<0)r.push(v);return r},[])}
function materialOptions(cat,section){if(!cat||cat==='all')return Object.keys(materialSets).reduce(function(r,k){materialSets[k].split('|').forEach(function(v){if(r.indexOf(v)<0)r.push(v)});return r},[]);var a=(materialSets[cat]||materialSets.other).split('|');if(cat==='under'&&section==='under-socks')a.splice(a.length-1,0,'Шерсть');return a}
function genderLabel(value,attrs){if(value==='Унисекс'||value==='Для всех')return 'Для всех';if(attrs&&(attrs.ageGroup==='Детское'||attrs.gender==='Детское'))return value==='Женское'?'Девочки':value==='Мужское'?'Мальчики':value;return value}
return {items:items,group:group,leaf:leaf,valid:valid,normalize:normalize,materialList:materialList,materialOptions:materialOptions,genderLabel:genderLabel};
});
