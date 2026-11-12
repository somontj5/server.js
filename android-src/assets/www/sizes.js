/* Shared size rules for WebView and Node. Units never convert implicitly. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GMSizes=factory()})(this,function(){
'use strict';
function seq(a,b,step){var r=[];for(var i=a;i<=b;i+=step||1)r.push(String(i));return r}
var sets={number:{name:'Числовой размер',values:seq(42,62,2)},letter:{name:'Буквенный размер',values:['XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL+']},waist:{name:'Талия, дюймы',values:seq(28,40)},shoe:{name:'Размер обуви',values:seq(35,47)},age:{name:'Возраст',values:['0-3 мес','3-6 мес','6-12 мес','1','1.5'].concat(seq(2,14),['15-18'])},height:{name:'Рост, см',values:seq(50,170,10)},sock:{name:'Размер носков',values:['36-40','41-46']},head:{name:'Обхват головы, см',values:seq(48,64)},standard:{name:'Стандарт',values:['Стандарт']}};
function context(l){var a=l.a||{},cat=l.cat==='clothes'?l.sub:l.cat;return {cat:cat||l.sub||'',section:l.section||'',kids:a.ageGroup==='Детское'||a.gender==='Детское',gender:a.gender||''}}
function options(l){var c=context(l),ids=[],required=true,standard=false;
 if(!c.cat||c.cat==='all')return {groups:[],required:false,standard:false};
 if(c.cat==='bags'||c.cat==='other')required=false;
 else if(c.cat==='acc'){required=false;if(/-(belts|gloves)$/.test(c.section))ids=['letter']}
 else if(c.cat==='headwear'){required=false;if(/-(hats|caps|skullcaps)$/.test(c.section)){ids=['head'];standard=true}else if(/-hijabs$/.test(c.section)){ids=['letter'];standard=true}}
 else if(c.cat==='shoes')ids=['shoe'];
 else if(c.kids)ids=(c.cat==='national'||c.cat==='home'||c.cat==='under')?['age']:['age','height'];
 else if(c.cat==='under'){
  if(/-socks$/.test(c.section))ids=['sock'];
  else if(/-tights$/.test(c.section)){ids=['letter'];standard=true}
  else ids=['letter','number'];
 }else if(c.cat==='pants')ids=['waist','number','letter'];
 else if(c.cat==='sport')ids=['letter','number'];
 else{ids=c.cat==='tops'?['letter','number']:['number','letter'];standard=true}
 var groups=ids.map(function(id){var v=sets[id].values.slice();if(id==='shoe')v=c.kids?seq(17,36):(c.gender==='Женское'?seq(35,42):c.gender==='Мужское'?seq(39,47):seq(35,47));if(id==='letter'&&c.cat==='outer')v=v.concat(['7XL','8XL']);return {id:id,name:sets[id].name,values:v}});
 return {groups:groups,required:required,standard:standard};
}
function empty(){return {entries:[],standard:false}}
function canonical(v){var s=String(v==null?'':v).trim().toUpperCase().replace(/[Хх]/g,'X').replace(/[Лл]/g,'L').replace(/ХЛ/g,'XL').replace(/,/g,'.').replace(/[–—]/g,'-');if(s==='XXL')s='2XL';if(s==='XXXL'||s==='3XL+')s='3XL';if(/^(СТАНДАРТ|ЕДИНЫЙ|ONE SIZE|ONESIZE)$/.test(s))s='Стандарт';return s}
function clean(spec,l){if(!spec||typeof spec!=='object'||Array.isArray(spec))throw Error('Некорректные размеры');var o=options(l),r=empty();
 if(!Array.isArray(spec.entries)||spec.entries.length>10)throw Error('Некорректный список размеров');
 spec.entries.forEach(function(e){var g=e&&o.groups.find(function(x){return x.id===e.system});if(!g||!Array.isArray(e.values)||e.values.length>100)throw Error('Система размеров не подходит категории');var vals=e.values.map(canonical);if(vals.some(function(v){return g.values.indexOf(v)<0}))throw Error('Размер не подходит категории или возрасту');var old=r.entries.find(function(x){return x.system===g.id});if(!old){old={system:g.id,values:[]};r.entries.push(old)}old.values=g.values.filter(function(v){return old.values.indexOf(v)>=0||vals.indexOf(v)>=0})});
 r.entries=r.entries.filter(function(e){return e.values.length});
 if(spec.standard){if(!o.standard)throw Error('Стандарт не подходит категории');r.standard=true}
 if(spec.standardRange){if(!r.standard)throw Error('Диапазон доступен только для стандарта');var range=spec.standardRange,g=o.groups.find(function(x){return x.id===range.system}),a=canonical(range.from),b=canonical(range.to);if(!g||g.values.indexOf(a)<0||g.values.indexOf(b)<0||g.values.indexOf(a)>g.values.indexOf(b))throw Error('Проверьте границы стандарта');r.standardRange={system:g.id,from:a,to:b}}
 return r;
}
function has(s){return !!(s&&(s.standard||(s.entries||[]).some(function(e){return e.values.length}))) }
function parse(text,l){var r=empty(),o=options(l),s=String(text||'').slice(0,1500).replace(/[–—]/g,'-').replace(/,/g,'.'),upper=canonical(s),hint='';
 if(/стандарт|единый|one\s?size/i.test(s)&&o.standard)r.standard=true;
 if(/рост|см(?:\s|$|[.,;])/i.test(s))hint='height';else if(/сола|лет|года?|мес|возраст/i.test(s))hint='age';else if(/талия|дюйм/i.test(s))hint='waist';
 var ageRange=s.match(/(\d+(?:\.\d+)?)\s*(?:то|до|-)\s*(\d+(?:\.\d+)?)\s*(?:сола|лет|года?)/i);
 o.groups.forEach(function(g){if(hint&&hint!==g.id)return;var vals=[],isLetter=g.id==='letter';
  if(isLetter){var tokens=upper.split(/[^A-Z0-9+]+/).filter(Boolean).map(canonical);vals=g.values.filter(function(v){return tokens.indexOf(v)>=0})}
  else if(g.id==='age'){
   g.values.forEach(function(v){if(v.indexOf('мес')>=0){if(s.indexOf(v)>=0)vals.push(v)}else if(v==='15-18'){if(/15\s*-\s*18/.test(s))vals.push(v)}else if(new RegExp('(^|[^0-9.])'+v.replace('.','\\.')+'(?=$|[^0-9.])').test(s.replace(/\d+\s*-\s*\d+\s*мес/gi,'')))vals.push(v)});
   if(ageRange)vals=g.values.filter(function(v){return (v==='15-18'&&+ageRange[1]<=15&&+ageRange[2]>=18)||(/^\d+(\.\d+)?$/.test(v)&&+v>=+ageRange[1]&&+v<=+ageRange[2])});
  }else if(g.id==='sock'){vals=g.values.filter(function(v){return s.indexOf(v)>=0})}
  else{var nums=s.match(/\d+(?:\.\d+)?/g)||[];vals=g.values.filter(function(v){return nums.indexOf(v)>=0});
   var range=s.match(/(?:^|[^\d])(\d+)\s*-\s*(\d+)(?!\s*-\s*\d)/);if(range&&s.match(/\d+\s*[-]\s*\d+/g).length===1&&!/\d+\s*-\s*\d+\s*-/.test(s)){var ai=g.values.indexOf(range[1]),bi=g.values.indexOf(range[2]);if(ai>=0&&bi>=ai){if(r.standard){r.standardRange={system:g.id,from:range[1],to:range[2]};vals=[]}else vals=g.values.slice(ai,bi+1)}}
  }
  if(vals.length)r.entries.push({system:g.id,values:vals});
 });return r;
}
function read(l){if(l.sizes){try{return clean(l.sizes,l)}catch(e){return empty()}}return parse((l.a||{}).size||'',l)}
function label(s){if(!s)return '';var parts=(s.entries||[]).map(function(e){var g=sets[e.system];return (e.system==='age'?'Возраст: ':e.system==='height'?'Рост: ':e.system==='waist'?'Талия: ':e.system==='head'?'Обхват головы: ':'')+e.values.join(', ')+(e.system==='height'||e.system==='head'?' см':'')});if(s.standard)parts.push('Стандарт'+(s.standardRange?' '+s.standardRange.from+'–'+s.standardRange.to:''));return parts.join('; ')}
// 2 = explicit or bounded standard match, 1 = unknown standard (last), 0 = no match.
function rank(l,query){if(!has(query))return 2;var own=read(l),result=0;
 (query.entries||[]).forEach(function(q){var e=own.entries.find(function(x){return x.system===q.system});if(e&&q.values.some(function(v){return e.values.indexOf(v)>=0}))result=2;
 if(own.standardRange&&own.standardRange.system===q.system){var range=own.standardRange,g=options(l).groups.find(function(x){return x.id===q.system});if(g&&q.values.some(function(v){var i=g.values.indexOf(v);return i>=g.values.indexOf(range.from)&&i<=g.values.indexOf(range.to)}))result=2}
 });if(query.standard&&own.standard)result=2;if(!result&&own.standard&&!own.standardRange)result=1;return result;
}
function query(q){if(!q)return empty();if(typeof q==='string'){if(q.length>5000)throw Error('Слишком много размеров');try{q=JSON.parse(q)}catch(e){throw Error('Некорректный фильтр размеров')}}if(!q||!Array.isArray(q.entries)||q.entries.length>10)throw Error('Некорректный фильтр размеров');var r=empty();q.entries.forEach(function(e){if(!e||!Object.prototype.hasOwnProperty.call(sets,e.system)||!Array.isArray(e.values)||e.values.length>100)throw Error('Некорректный фильтр размеров');var universe=e.system==='shoe'?seq(17,47):e.system==='letter'?sets.letter.values.concat(['7XL','8XL']):sets[e.system].values;var v=e.values.map(canonical);if(v.some(function(x){return universe.indexOf(x)<0}))throw Error('Неизвестный размер');r.entries.push({system:e.system,values:v})});r.standard=!!q.standard;return r}
return {sets:sets,context:context,options:options,empty:empty,clean:clean,has:has,parse:parse,read:read,label:label,rank:rank,query:query,canonical:canonical};
});
