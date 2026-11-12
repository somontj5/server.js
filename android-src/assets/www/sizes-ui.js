/* Size picker shared by publishing and search. State is committed only on Apply. */
function sizeContext(model,filter){return {cat:model.cat,section:model.section,a:filter?model.f:model.a}}
function sizeValue(model,filter){if(filter)return model.f.sizeSpec||GMSizes.empty();if(!model.sizes)model.sizes=GMSizes.read(model);return model.sizes}
function clearSizes(model,filter){if(filter){delete model.f.sizeSpec;delete model.f.size}else{model.sizes=GMSizes.empty();model.a.size=''}delete model._sizeAnchor;delete model._sizeRange;delete model._pendingSizeSystem}
function sizePicker(model,filter){var ctx=sizeContext(model,filter),o=GMSizes.options(ctx),s=sizeValue(model,filter),tag=filter?'search':'sell';
 if(!o.groups.length&&!o.standard)return '';
 var h='<div class="fl" id="'+(filter?'filter-size':'f-a_size')+'"><label>Размер'+(!filter&&!o.required?' <i>необязательно</i>':'')+'</label><div class="sub2">Можно выбрать несколько размеров</div>'
 +'<div class="units"><button class="chip" data-size-action="clear">Очистить</button>'+(filter?'':'<button class="chip" data-size-action="parse">Распознать текст размеров</button>')+'</div>';
 o.groups.forEach(function(g){var entry=s.entries.find(function(x){return x.system===g.id});h+='<div class="sub2">'+esc(g.name)+(g.id==='age'?' · числа указаны в годах':'')+'</div><div class="units">'+g.values.map(function(v){var selected=entry&&entry.values.indexOf(v)>=0;return '<button class="chip'+(selected?' on':'')+'" aria-pressed="'+!!selected+'" data-size-system="'+g.id+'" data-size-value="'+esc(v)+'">'+esc(v)+'</button>'}).join('')+'</div>'});
 if(o.standard)h+='<div class="units"><button class="chip'+(s.standard?' on':'')+'" aria-pressed="'+!!s.standard+'" data-size-action="standard">Стандарт</button></div>';
 if(ctx.cat==='national'&&ctx.section==='national-atlas')h+='<div class="sub2">У атласных платьев уточните систему у продавца. Укажите фактический размер и замеры в описании.</div>';
 if(ctx.cat==='headwear')h+='<div class="sub2">Для тюбетеек укажите обхват головы, для хиджабов — размер производителя или стандарт.</div>';
 h+='<div class="sub2" aria-live="polite">Выбрано: '+esc(GMSizes.label(s)||'не выбрано')+'</div><div class="ehint">Выберите размер или стандарт</div></div>';return h;
}
function sizeClick(e,model,filter){var b=e.target.closest('[data-size-action],[data-size-value]');if(!b)return false;var s=sizeValue(model,filter),action=b.dataset.sizeAction;
 if(action==='clear'){clearSizes(model,filter);s=GMSizes.empty()}
 else if(action==='standard'){s.standard=!s.standard;if(!s.standard)delete s.standardRange}
 else if(action==='parse'){var text=prompt('Вставьте размеры без цены и телефона. Например: 46, 48, XL',model.a.size||'');if(text!==null){s=GMSizes.parse(text,sizeContext(model,filter));if(!GMSizes.has(s))toast('Размеры не распознаны. Выберите кнопками.')}}
 else{var sys=b.dataset.sizeSystem,v=b.dataset.sizeValue,g=GMSizes.options(sizeContext(model,filter)).groups.find(function(x){return x.id===sys}),entry=s.entries.find(function(x){return x.system===sys});
 if(!entry){entry={system:sys,values:[]};s.entries.push(entry)}
 var i=entry.values.indexOf(v);if(i<0)entry.values.push(v);else entry.values.splice(i,1);
 entry.values=g.values.filter(function(x){return entry.values.indexOf(x)>=0});s.entries=s.entries.filter(function(x){return x.values.length})}
 if(filter){if(GMSizes.has(s))model.f.sizeSpec=s;else delete model.f.sizeSpec}else{model.sizes=s;model.a.size=GMSizes.label(s)}return true;
}
function sizeSearchRank(l){return GMSizes.rank(l,S.f.sizeSpec)}
function sortSizeMatches(arr){return GMSizes.has(S.f.sizeSpec)?arr.sort(function(a,b){return sizeSearchRank(b)-sizeSearchRank(a)}):arr}
