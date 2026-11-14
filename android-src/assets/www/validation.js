/* One validation policy shared by Android WebView and the API. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GMValidation=factory()})(this,function(){
'use strict';
var letters='A-Za-zА-Яа-яЁёҒғҚқҲҳҶҷӢӣӮӯЎў';
var letter=new RegExp('['+letters+']','g');
var textAllowed=new RegExp('^[ '+letters+'0-9\\n\\r.,!?;:()\\[\\]%+\\/\\-№₽$€@#&"\'«»—–=*ʼʻ‘’]+$');
var personalAllowed=new RegExp('^['+letters+' \\-\'ʼʻ‘’]+$');
function clean(v){return String(v==null?'':v).normalize('NFC').trim()}
function error(kind,value){
 var v=clean(value),name=kind==='person',min=kind==='desc'?20:kind==='title'?3:2,max=kind==='desc'?1500:kind==='title'?80:name?24:60;
 if(Array.from(v).length<min||Array.from(v).length>max)return (kind==='desc'?'Описание':kind==='title'?'Название':name?'Имя':'Название магазина')+': от '+min+' до '+max+' символов';
 if(kind==='desc'){
  if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/u.test(v))return 'Уберите управляющие символы';
  if((v.match(/\p{L}/gu)||[]).length<10)return 'Добавьте описание товара: не менее 10 букв';
  if(/(\p{L})\1{6,}/u.test(v))return 'Уберите повторяющиеся буквы';
  return '';
 }
 if(!(name?personalAllowed:textAllowed).test(v))return 'Допустимы русский, таджикский, узбекский и английский; без эмодзи и посторонних символов';
 if((v.match(letter)||[]).length<(kind==='desc'?10:kind==='title'?3:2))return 'Добавьте осмысленный текст, а не только цифры и знаки';
 if(/(.)\1{6,}/u.test(v)||/[^\sA-Za-zА-Яа-яЁёҒғҚқҲҳҶҷӢӣӮӯЎў0-9]{5,}/u.test(v))return 'Уберите повторяющиеся символы';
 if(name&&(v.split(/\s+/).length>5||/[-'ʼʻ‘’]{2,}/.test(v)))return 'Укажите настоящее имя, без лишних слов и знаков';
 return '';
}
return {clean:clean,error:error};
});
