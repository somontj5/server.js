/* Size picker shared by publishing and search. State is committed only on Apply. */
function sizeContext(model,filter){return {cat:model.cat,section:model.section,a:filter?model.f:model.a}}
function sizeValue(model,filter){if(filter)return model.f.sizeSpec||GMSizes.empty();if(!model.sizes)model.sizes=GMSizes.read(model);return model.sizes}
function clearSizes(model,filter){if(filter){delete model.f.sizeSpec;delete model.f.size}else{model.sizes=GMSizes.empty();model.a.size=''}delete model._sizeAnchor;delete model._sizeRange;delete model._pendingSizeSystem}
function sizePicker(model,filter){var ctx=sizeContext(model,filter),o=GMSizes.options(ctx),s=sizeValue(model,filter),tag=filter?'search':'sell';
 if(!o.groups.length&&!o.standard)return '';
 var h='<div class="fl" id="'+(filter?'filter-size':'f-a_size')+'"><label>Размер'+(!filter&&!o.required?' <i>необязательно</i>':'')+'</label><div class="sub2">Можно выбрать несколько. Для диапазона включите «От–до» и нажмите две границы. Буквы не переводятся в числа.</div>'
 +'<div class="units"><button class="chip'+(model._sizeRange?' on':'')+'" data-size-action="range">От–до'+(model._sizeAnchor?' · выберите конец':'')+'</button><button class="chip" data-size-action="clear">Очистить</button>'+(filter?'':'<button class="chip" data-size-action="parse">Распознать текст размеров</button>')+'</div>';
 o.groups.forEach(function(g){var entry=s.entries.find(function(x){return x.system===g.id});h+='<div class="sub2">'+esc(g.name)+(g.id==='age'?' · числа указаны в годах':'')+'</div><div class="units">'+g.values.map(function(v){var selected=entry&&entry.values.indexOf(v)>=0;return '<button class="chip'+(selected?' on':'')+'" aria-pressed="'+!!selected+'" data-size-system="'+g.id+'" data-size-value="'+esc(v)+'">'+esc(v)+'</button>'}).join('')+'</div>'});
 if(o.standard){h+='<div class="units"><button class="chip'+(s.standard?' on':'')+'" data-size-action="standard">Единый</button></div>';
 if(s.standard&&!filter){var rg=s.standardRange||{},sys=rg.system||model._pendingSizeSystem||o.groups[0].id,g=o.groups.find(function(x){return x.id===sys})||o.groups[0];
 h+='<div class="sub2">Подходит на размеры — необязательно. Без диапазона покупатель увидит «Размер уточняйте».</div><select class="inp" data-size-range="system">'+o.groups.map(function(x){return '<option value="'+x.id+'"'+(x.id===sys?' selected':'')+'>'+esc(x.name)+'</option>'}).join('')+'</select><div class="row2">';
 ['from','to'].forEach(function(k){h+='<select class="inp" aria-label="'+(k==='from'?'Единый размер от':'Единый размер до')+'" data-size-range="'+k+'"><option value="">'+(k==='from'?'От':'До')+'</option>'+g.values.map(function(v){return '<option'+(rg[k]===v?' selected':'')+'>'+esc(v)+'</option>'}).join('')+'</select>'});h+='</div>';
 }}
 if(ctx.cat==='national'&&ctx.section==='national-atlas')h+='<div class="sub2">У атласных платьев уточните систему у продавца. Укажите фактический размер и замеры в описании.</div>';
 if(ctx.cat==='headwear')h+='<div class="sub2">Для тюбетеек укажите обхват головы, для хиджабов — размер производителя или единый.</div>';
 h+='<div class="sub2" aria-live="polite">Выбрано: '+esc(GMSizes.label(s)||'не выбрано')+'</div><div class="ehint">Выберите размер или единый размер</div></div>';return h;
}
function sizeClick(e,model,filter){var b=e.target.closest('[data-size-action],[data-size-value]');if(!b)return false;var s=sizeValue(model,filter),action=b.dataset.sizeAction;
 if(action==='clear'){clearSizes(model,filter);s=GMSizes.empty()}
 else if(action==='range'){model._sizeRange=!model._sizeRange;delete model._sizeAnchor}
 else if(action==='standard'){s.standard=!s.standard;if(!s.standard)delete s.standardRange}
 else if(action==='parse'){var text=prompt('Вставьте только размеры (без цены и номера телефона). Например: 46-52, XL или 2 то 9 сола',model.a.size||'');if(text!==null){s=GMSizes.parse(text,sizeContext(model,filter));if(!GMSizes.has(s))toast('Размеры не распознаны. Выберите кнопками.')}}
 else{var sys=b.dataset.sizeSystem,v=b.dataset.sizeValue,g=GMSizes.options(sizeContext(model,filter)).groups.find(function(x){return x.id===sys}),entry=s.entries.find(function(x){return x.system===sys});
 if(!entry){entry={system:sys,values:[]};s.entries.push(entry)}
 if(model._sizeRange){if(!model._sizeAnchor||model._sizeAnchor.system!==sys){model._sizeAnchor={system:sys,value:v}}else{var a=g.values.indexOf(model._sizeAnchor.value),z=g.values.indexOf(v);g.values.slice(Math.min(a,z),Math.max(a,z)+1).forEach(function(x){if(entry.values.indexOf(x)<0)entry.values.push(x)});delete model._sizeAnchor;model._sizeRange=false}}
 else{var i=entry.values.indexOf(v);if(i<0)entry.values.push(v);else entry.values.splice(i,1)}
 entry.values=g.values.filter(function(x){return entry.values.indexOf(x)>=0});s.entries=s.entries.filter(function(x){return x.values.length})}
 if(filter){if(GMSizes.has(s))model.f.sizeSpec=s;else delete model.f.sizeSpec}else{model.sizes=s;model.a.size=GMSizes.label(s)}return true;
}
function sizeRangeChange(e,model){var el=e.target;if(!el.dataset.sizeRange)return false;var box=el.closest('#f-a_size'),sys=box.querySelector('[data-size-range="system"]').value;
 if(el.dataset.sizeRange==='system'){delete model.sizes.standardRange;model._pendingSizeSystem=sys;return true}
 var from=box.querySelector('[data-size-range="from"]').value,to=box.querySelector('[data-size-range="to"]').value;
 if(from&&to){var g=GMSizes.options(model).groups.find(function(x){return x.id===sys});if(g.values.indexOf(from)>g.values.indexOf(to)){toast('Начало диапазона должно быть не больше конца');delete model.sizes.standardRange;return false}model.sizes.standardRange={system:sys,from:from,to:to}}else delete model.sizes.standardRange;
 model.a.size=GMSizes.label(model.sizes);return false;
}
function sizeSearchRank(l){return GMSizes.rank(l,S.f.sizeSpec)}
function sortSizeMatches(arr){return GMSizes.has(S.f.sizeSpec)?arr.sort(function(a,b){return sizeSearchRank(b)-sizeSearchRank(a)}):arr}
