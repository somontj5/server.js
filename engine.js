/* ===================== умный поиск и теги (GM Engine) ===================== */
var GME=(function(){
var STOP={'для':1,'без':1,'под':1,'над':1,'при':1,'это':1,'как':1,'так':1,'или':1,'все':1,'очень':1,'новый':0,'продам':1,'продаю':1,'есть':1,'наличии':1,'наличие':1,'размер':1,'размеры':1,'цена':1,'руб':1,'рублей':1,'шт':1,'отличном':1,'состоянии':1,'хорошем':1,'пишите':1,'звоните':1,'магазин':1,'ряд':1,'товар':1,'фото':1,'реальные':1,'самый':1,'том':1,'что':1,'его':1,'она':1,'они':1,'the':1,'and':1,'for':1};
/* группы синонимов: [категория, слова...] */
var SYN=[
 ['outer','куртка','пуховик','парка','ветровка','бомбер','косуха','пальто','плащ','тренч','шуба','дубленка','жилет','анорак','пуховка','курточка','полупальто','кожанка'],
 ['knit','худи','толстовка','свитшот','кофта','свитер','джемпер','кардиган','водолазка','лонгслив','пуловер','олимпийка','зипка','hoodie'],
 ['tops','футболка','майка','тишка','поло','рубашка','блузка','блуза','топ','сорочка','туника','кроп','tshirt','футболочка'],
 ['pants','джинсы','брюки','штаны','шорты','леггинсы','лосины','чиносы','карго','джоггеры','бриджи','деним','клеш','скинни','jeans'],
 ['dress','платье','сарафан','юбка','мини','макси','миди','платьице','юбочка'],
 ['suits','костюм','пиджак','жакет','двойка','тройка','смокинг','блейзер'],
 ['sport','спортивный','спорт','тренировочный','рашгард','велосипедки','фитнес','спортивка','adidas','nike','puma'],
 ['under','белье','трусы','бюстгальтер','лифчик','боксеры','носки','колготки','купальник','плавки','чулки','бра'],
 ['home','пижама','халат','домашний','сорочка','тапочки','тапки'],
 ['shoes','кроссовки','кеды','сникерсы','ботинки','сапоги','туфли','лоферы','босоножки','сандалии','шлепанцы','угги','мокасины','балетки','кросы','кроссы','обувь','берцы','челси','полусапоги','ботильоны','слипоны'],
 ['bags','сумка','рюкзак','портфель','клатч','барсетка','шоппер','кошелек','сумочка','бананка','поясная'],
 ['acc','шапка','кепка','бейсболка','шарф','перчатки','варежки','ремень','очки','панама','платок','бандана','галстук','часы','бижутерия','снуд','берет','украшения']
];
var COLOR={'черн':'Чёрный','black':'Чёрный','бел':'Белый','white':'Белый','сер':'Серый','grey':'Серый','gray':'Серый','беж':'Бежевый','корич':'Коричневый','шоколад':'Коричневый','син':'Синий','темно-син':'Синий','голуб':'Голубой','зелен':'Зелёный','хаки':'Зелёный','олив':'Зелёный','красн':'Красный','бордо':'Красный','розов':'Розовый','желт':'Жёлтый','фиолет':'Фиолетовый','сирен':'Фиолетовый','разноцвет':'Разноцветный','принт':'Разноцветный'};
var GEND={'женск':'Женское','женщин':'Женское','девушк':'Женское','мужск':'Мужское','мужчин':'Мужское','парн':'Мужское','детск':'Детское','ребен':'Детское','девочк':'Детское','мальчик':'Детское','унисекс':'Унисекс','unisex':'Унисекс'};
var SEAS={'летн':'Лето','лето':'Лето','зимн':'Зима','зима':'Зима','теплый':'Зима','утеплен':'Зима','демисезон':'Демисезон','осен':'Демисезон','весен':'Демисезон','всесезон':'Всесезон'};
var COND={'бирк':'Новое с биркой','бу':'Б/у','поношен':'Б/у'};
var EN='qwertyuiop[]asdfghjkl;\'zxcvbnm,.`',RU='йцукенгшщзхъфывапролджэячсмитьбюё';
function norm(s){return String(s==null?'':s).toLowerCase().replace(/ё/g,'е').replace(/б\/у/g,'бу')}
function toks(s){return norm(s).match(/[a-zа-я0-9]+/g)||[]}
var END=/(иями|ями|ами|ого|его|ому|ему|ыми|ими|ейший|ая|яя|ое|ее|ые|ие|ый|ий|ой|ей|ом|ем|ах|ях|ов|ев|ам|ям|ую|юю|ию|ия|ья|ье|ам|а|я|о|е|ы|и|у|ю|ь|й)$/;
function stem(w){if(/^[0-9]+$/.test(w)||w.length<4)return w;var s=w.replace(END,'');if(s.length<3)s=w.slice(0,3);if(s.length>4&&/(к|ч)$/.test(s)&&/(чк|ок|ек)$/.test(s)){} return s}
var W2C={},W2G={};
SYN.forEach(function(g,i){for(var j=1;j<g.length;j++){var s=stem(norm(g[j]));W2C[s]=g[0];(W2G[s]=W2G[s]||[]).push(i)}});
function lay(q){var r='',ch=0;for(var i=0;i<q.length;i++){var c=q[i],k=EN.indexOf(c);if(k>=0){r+=RU[k];ch=1}else r+=c}return ch?r:null}
function dict(m,w){for(var k in m)if(w.indexOf(k)===0)return m[k];return null}
/* расширение слова: синонимы из той же группы */
function syns(st){var o=[];(W2G[st]||[]).forEach(function(i){for(var j=1;j<SYN[i].length;j++)o.push(stem(norm(SYN[i][j])))});return o}
/* автотеги объявления */
function autoTags(l){var t=toks((l.tags||'')+' '+(l.name||'')),o={};
 t.forEach(function(w){if(STOP[w])return;var s=stem(w);if(s.length<2)return;o[s]=1;var c=W2C[s];if(c)o['c:'+c]=1});
 if(l.cat)o['c:'+l.cat]=1;var a=l.a||{};Object.keys(a).forEach(function(k){if(a[k]&&a[k]!=='Без размера')o['a:'+k+':'+a[k]]=1});
 return Object.keys(o)}
/* индекс объявления для поиска */
function idx(l){var key=(l.name||'')+'|'+(l.tags||'')+'|'+(l.desc||'').length+'|'+(l.cat||'')+'|'+JSON.stringify(l.a||{});if(l._gx&&l._gk===key)return l._gx;
 var F={n:5,t:4,a:3,c:3,s:2,d:1},X={},cn=(window.cat?cat(l.cat).n:'');
 function add(txt,w){toks(txt).forEach(function(x){if(STOP[x]&&w<5)return;var s=stem(x);if(!X[s]||X[s]<w)X[s]=w})}
 add(l.name,F.n);add(l.tags,F.t);add(cn,F.c);add(Object.keys(l.a||{}).map(function(k){return l.a[k]}).join(' '),F.a);add(l.shopName,F.s);add((l.desc||'').slice(0,600),F.d);
 if(l.cat)SYN.forEach(function(g){if(g[0]===l.cat){var s=stem(norm(g[1]));if(!X[s])X[s]=1.5}});
 l._gk=key;return l._gx=X}
function lev(a,b,m){if(Math.abs(a.length-b.length)>m)return m+1;var p=[],i,j;for(j=0;j<=b.length;j++)p[j]=j;
 for(i=1;i<=a.length;i++){var c=[i],mn=i;for(j=1;j<=b.length;j++){c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));if(c[j]<mn)mn=c[j]}if(mn>m)return m+1;p=c}return p[b.length]}
/* разбор запроса: цена, атрибуты, категории, слова */
function parse(q){var r={a:{},cat:null,pmin:null,pmax:null,words:[],last:''};var s=norm(q);
 s=s.replace(/(до|дешевле|не дороже)\s*(\d[\d\s]*)\s*(к|т|тыс)?\s*(р|руб|₽)?/g,function(m,a,n,k){r.pmax=parseInt(n.replace(/\s/g,''))*(k?1000:1);return ' '});
 s=s.replace(/(от|дороже)\s*(\d[\d\s]*)\s*(к|т|тыс)?\s*(р|руб|₽)?/g,function(m,a,n,k){r.pmin=parseInt(n.replace(/\s/g,''))*(k?1000:1);return ' '});
 var t=toks(s);r.endSp=/\s$/.test(q);
 t.forEach(function(w,i){var v;
  if(/^(xs|s|m|l|xl|xxl|xxxl|3xl)$/.test(w)){r.a.size=w==='xxxl'?'3XL+':w.toUpperCase();return}
  if(/^(3[5-9]|4[0-6])$/.test(w)&&t.length>1){r.sz=w;}
  if((v=dict(GEND,w))){r.a.gender=v;return}
  if((v=dict(COLOR,w))&&w.length>=3){r.a.color=v;return}
  if((v=dict(SEAS,w))){r.a.season=v;r.soft=1}
  if(w==='бу'||dict(COND,w)){r.a.cond=dict(COND,w)||'Б/у';return}
  if(w==='новое'||w==='новый'||w==='новая'||w==='новые'){r.a.cond='Новое';r.condSoft=1;return}
  if(STOP[w])return;var st=stem(w);if(W2C[st]&&!r.cat)r.cat=W2C[st];r.words.push({w:w,s:st,pre:i===t.length-1&&!r.endSp})});
 return r}
function wordScore(X,qw,vocab){var best=0,s=qw.s;
 if(X[s])best=X[s]*1.0;
 if(!best&&qw.pre){for(var k in X)if(k.indexOf(qw.w)===0||k.indexOf(s)===0){best=Math.max(best,X[k]*0.9)}}
 if(!best){var sy=syns(s);for(var i=0;i<sy.length;i++)if(X[sy[i]])best=Math.max(best,X[sy[i]]*0.6)}
 if(!best&&s.length>=4){var m=s.length>=7?2:1;for(var k2 in X)if(k2.length>=3&&lev(s,k2,m)<=m)best=Math.max(best,X[k2]*0.5)}
 return best}
/* основная функция поиска: возвращает {list, note} */
function search(arr,q){var P=parse(q),res=[],soft=[];
 arr.forEach(function(l){var X=idx(l),a=l.a||{},sc=0,miss=0,am=0;
  P.words.forEach(function(w){var v=wordScore(X,w);if(v)sc+=v;else miss++});
  for(var k in P.a){if(a[k]===P.a[k]){sc+=3;am++}else if(a[k]&&!(k==='cond'&&P.condSoft)&&!(k==='season'&&P.soft)&&!(k==='size'&&a[k]==='Без размера'))miss+=(k==='color'?.6:1)}
  if(P.sz&&a.size===P.sz)sc+=3;
  if(P.cat&&l.cat===P.cat)sc+=2;
  var x=num(l);if(P.pmax!=null&&(x==null||x>P.pmax))return;if(P.pmin!=null&&(x==null||x<P.pmin))return;
  if(!P.words.length&&!Object.keys(P.a).length&&!P.cat&&(P.pmin!=null||P.pmax!=null))sc=1;
  if(sc<=0)return;var it={l:l,s:sc+(isTop(l)?.5:0)+iscore(l)*.3};if(!miss)res.push(it);else if(sc>=3)soft.push({l:l,s:sc-miss*2});});
 var note='';if(!res.length&&soft.length){res=soft;note='Точных совпадений нет — показаны похожие'}
 res.sort(function(x,y){return y.s-x.s||y.l.createdAt-x.l.createdAt});
 return{list:res.map(function(r){return r.l}),note:note,P:P}}
/* подсказки при вводе */
function suggest(q,arr){var n=norm(q).trim();if(!n)return[];var t=toks(n),last=t[t.length-1]||'',head=t.slice(0,-1).join(' '),cnt={},sl=stem(last);
 function cand(phrase,w){var p=norm(phrase).trim();if(!p||p===n)return;cnt[p]=(cnt[p]||0)+w}
 arr.forEach(function(l){var nm=norm(l.name).replace(/[^a-zа-я0-9 ]/g,' ').replace(/\s+/g,' ').trim(),wd=nm.split(' ');
  if(nm.indexOf(n)===0)cand(wd.slice(0,Math.min(wd.length,t.length+2)).join(' '),3);
  wd.forEach(function(w){if(w.length>=3&&w.indexOf(last)===0)cand((head?head+' ':'')+w,2)});
  toks(l.tags).forEach(function(w){if(w.length>=3&&w.indexOf(last)===0)cand((head?head+' ':'')+w,1.5)})});
 SYN.forEach(function(g){for(var j=1;j<g.length;j++)if(last.length>=2&&norm(g[j]).indexOf(last)===0&&!head)cand(g[j],0.5)});
 (window.hist||[]).forEach(function(h){if(norm(h).indexOf(n)===0)cand(h,4)});
 return Object.keys(cnt).sort(function(a,b){return cnt[b]-cnt[a]||a.length-b.length}).slice(0,7)}
return{norm:norm,toks:toks,stem:stem,lay:lay,autoTags:autoTags,search:search,suggest:suggest,parse:parse,W2C:W2C,STOP:STOP,syns:syns};
})();
