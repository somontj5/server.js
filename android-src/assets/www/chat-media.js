/* Private, bounded photo cache. Binary payloads must never fill localStorage. */
(function(root){
'use strict';
var opening,MAX=32*1024*1024;
function valid(src){return typeof src==='string'&&src.length<=900000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src)}
function db(){if(!opening)opening=new Promise(function(resolve,reject){
 if(!root.indexedDB){reject(Error('Cache unavailable'));return}
 var r=indexedDB.open('gm-chat-photos',1);
 r.onupgradeneeded=function(){r.result.createObjectStore('photos',{keyPath:'key'})};
 r.onsuccess=function(){resolve(r.result)};r.onerror=function(){reject(r.error)};
 });return opening}
function get(key){return db().then(function(d){return new Promise(function(resolve,reject){var r=d.transaction('photos').objectStore('photos').get(key);r.onsuccess=function(){resolve(r.result&&valid(r.result.img)?r.result.img:null)};r.onerror=function(){reject(r.error)}})})}
function put(key,img){if(!valid(img))return Promise.resolve(false);return db().then(function(d){return new Promise(function(resolve,reject){
 var tx=d.transaction('photos','readwrite'),store=tx.objectStore('photos'),r=store.getAll();
 r.onsuccess=function(){var entries=r.result.filter(function(x){return x.key!==key}).sort(function(a,b){return a.t-b.t}),bytes=img.length*2;entries.forEach(function(x){bytes+=x.img.length*2});
  while(bytes>MAX&&entries.length){var old=entries.shift();store.delete(old.key);bytes-=old.img.length*2}
  store.put({key:key,img:img,t:Date.now()})};
 tx.oncomplete=function(){resolve(true)};tx.onabort=tx.onerror=function(){reject(tx.error||Error('Cache full'))};
 })})}
function remove(key){return db().then(function(d){return new Promise(function(resolve,reject){var tx=d.transaction('photos','readwrite');tx.objectStore('photos').delete(key);tx.oncomplete=function(){resolve()};tx.onabort=tx.onerror=function(){reject(tx.error)}})}).catch(function(){})}
function download(src){return Promise.resolve().then(function(){
 if(!valid(src))throw Error('Invalid photo');
 if(root.Android&&typeof Android.saveImage==='function'){Android.saveImage(src);return}
 var parts=src.split(','),raw=atob(parts[1]),bytes=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 var mime=parts[0].slice(5).split(';')[0],url=URL.createObjectURL(new Blob([bytes],{type:mime})),a=document.createElement('a');a.href=url;a.download='GlassMarket_'+Date.now()+'.'+(mime==='image/jpeg'?'jpg':mime.split('/')[1]);document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},30000);
 })}
root.GMChatMedia={valid:valid,get:get,put:put,remove:remove,download:download};
})(window);
