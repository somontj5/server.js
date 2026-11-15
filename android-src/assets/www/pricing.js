/* Shared price contract: priceNum = original; discountPrice = optional sale price. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GMPrice=factory()})(this,function(){
'use strict';
function parse(v){if(v==null||v==='')return null;var s=String(v).trim().replace(/\s/g,'').replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;var n=Number(s);return Number.isFinite(n)&&n>0&&n<=1e9?n:null}
function legacy(v){var m=String(v||'').replace(/\s/g,'').match(/\d+(?:[.,]\d+)?/);return m?parse(m[0]):null}
function original(l){return l.priceNum!=null&&l.priceNum!==''?parse(l.priceNum):legacy(l.price)}
function sale(l){var base=original(l),n=parse(l.discountPrice);return base!==null&&n!==null&&n<base?n:null}
function effective(l){var n=sale(l);return n===null?original(l):n}
function format(n){return Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2})}
function text(l){var n=effective(l);return n===null?(l.price||'Цена не указана'):format(n)+' ₽'+(l.unit?' '+l.unit:'')}
function clean(b,l){var out=Object.assign({},l),has=Object.prototype.hasOwnProperty;
 if(has.call(b,'priceNum')){var v=b.priceNum;if(v!==''&&v!==null&&parse(v)===null)throw Error('Укажите корректную цену больше нуля');out.priceNum=parse(v);out.price=out.priceNum===null?(b.price||'Цена не указана'):String(out.priceNum)}
 else if(has.call(b,'price')){out.price=String(b.price||'');out.priceNum=legacy(b.price)}
 if(has.call(b,'discountPrice')){var d=b.discountPrice;if(d!==''&&d!==null&&parse(d)===null)throw Error('Укажите корректную скидочную цену');out.discountPrice=parse(d)}
 if(out.discountPrice!=null&&sale(out)===null)throw Error('Скидочная цена должна быть меньше обычной цены');
 if(has.call(b,'unit'))out.unit=String(b.unit||'').slice(0,30);
 return out}
return {parse:parse,original:original,sale:sale,effective:effective,format:format,text:text,clean:clean};
});
