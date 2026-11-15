/* 9.17 messenger: keyed bubbles, explicit retries and recording drafts bound to a conversation. */
(function(){
'use strict';
var pg=$('chatPg'),record=null,permissionRequest=0,preview=null,photoDraft=null,saving={},restoring={},playing=null;
function active(c){return c&&!pg.hidden&&pg.dataset.id===c.id}
function repaint(c){if(active(c))drawMsgs();saveChats()}
function wave(){var h='';for(var i=0;i<32;i++)h+='<i style="height:'+(5+(i*17+i*i*7)%24)+'px"></i>';return h}
function icon(name){if(name==='mic')return MIC;if(name==='pause')return '<svg class="i" viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>';if(name==='play')return '<svg class="i" viewBox="0 0 24 24"><path d="m9 5 10 7-10 7z"/></svg>';return ic(name)}
function mediaKey(c,m,type){return mediaStoreKey(c,mkey(m))+(type==='voice'?'/voice':'')}
function cacheMedia(c,m,type,value){var key=mediaKey(c,m,type);var fingerprint=value.length+value.slice(-32);if(saving[key]===fingerprint)return;saving[key]=fingerprint;GMChatMedia.put(key,value).catch(function(){delete saving[key]})}
function cachedMedia(c,m,type){var k=mkey(m),value=(MED[k]||{})[type];if(value){cacheMedia(c,m,type,value);return value}
 var key=mediaKey(c,m,type);if(!restoring[key]){restoring[key]=1;GMChatMedia.get(key).then(function(v){if(!v||m.del)return;(MED[k]=MED[k]||{})[type]=v;if(active(c))drawMsgs()}).catch(function(){})}return ''}
function loadVoice(c,m){var src=cachedMedia(c,m,'voice');if(src)return Promise.resolve(src);if(!m.sid||!c.tid)return Promise.reject(Error('Запись недоступна'));
 return GM.api('GET','/threads/'+encodeURIComponent(c.tid)+'/messages/'+encodeURIComponent(m.sid)+'/voice').then(function(r){if(m.del||!r||!GMChatMedia.validAudio(r.voice))throw Error('Запись недоступна');(MED[mkey(m)]=MED[mkey(m)]||{}).voice=r.voice;cacheMedia(c,m,'voice',r.voice);return r.voice})}
window.mprev=function(m){return m.del?'Сообщение удалено':m.text||(m.img?'Фото':m.voice?'Голосовое сообщение':m.lid?'Объявление':'')};
function status(m,c){if(!m.me||m.del)return '';if(m.failed)return '<span class="msg-failed">Не отправлено</span>';if(m.pending)return '<span class="tk" aria-label="Отправляется">'+ic('clock')+'</span>';return '<span class="'+((c.oread||0)>=m.t?'rd':'tk')+'" aria-label="'+((c.oread||0)>=m.t?'Прочитано':'Отправлено')+'">'+((c.oread||0)>=m.t?'✓✓':'✓')+'</span>'}
function messageBody(c,m,i){var k=mkey(m),md=MED[k]||{};
 if(m.del)return '<div class="mdel">Сообщение удалено</div>';
 var h=m.re?'<button class="mre" data-jump="'+esc(m.re.id)+'"><b>'+esc(m.re.mine?'Вы':c.name||'Собеседник')+'</b><span>'+esc(m.re.text||'Сообщение')+'</span></button>':'';
 if(m.img)h+=chatPhoto(c,m,k,md);
 if(m.voice){cachedMedia(c,m,'voice');h+='<div class="mvc" data-play="'+i+'" data-voice-key="'+esc(k)+'"><button class="vpl" aria-label="Воспроизвести голосовое">'+icon('play')+'</button><div class="voice-track"><div class="voice-wave" aria-hidden="true">'+wave()+'</div><input type="range" class="voice-seek" data-voice-seek="'+esc(k)+'" min="0" max="100" value="0" aria-label="Позиция голосового сообщения"></div><span class="voice-time">'+vdur(m.dur)+'</span></div>'}
 if(m.lid&&window.lcard)h+=lcard(m.lid);
 if(m.text)h+='<div class="msg-text">'+esc(m.text)+'</div>';
 return h}
window.drawMsgs=function(){var c=fchat(pg.dataset.id),box=$('cmsgs');if(!c||!box)return;if(playing&&!c.msgs.some(function(m){return mkey(m)===playing.key&&!m.del}))stopPlayback();
 var atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<100,first=!box.dataset.drawn,anchor=box.scrollHeight,top=box.scrollTop;
 var pin=$('cpin');if(pin){pin.hidden=!(c.pin&&c.pin.id);if(!pin.hidden){var pm=c.msgs.find(function(m){return m.sid===c.pin.id});var text=pm?mprev(pm):c.pin.text||'';var ph='<div class="pi"><b>Закреплённое сообщение</b><div>'+esc(text)+'</div></div><button data-unpin="1" aria-label="Открепить">'+ic('x')+'</button>';if(pin._h!==ph){pin._h=ph;pin.innerHTML=ph}pin.dataset.jump=c.pin.id}}
 var old={};Array.from(box.children).forEach(function(el){if(el.dataset.key)old[el.dataset.key]=el});var keep={},lastDay='',cursor=box.firstChild,unread=0;
 function place(el,key){el.dataset.key=key;keep[key]=true;if(el!==cursor)box.insertBefore(el,cursor);cursor=el.nextSibling}
 c.msgs.forEach(function(m,i){var d=cday(m.t),key=mkey(m),domKey=m.tk||key;if(d!==lastDay){var dk='day:'+d,day=old[dk]||document.createElement('div');day.className='cday';day.textContent=d;place(day,dk);lastDay=d}
 var el=old[domKey]||document.createElement('div'),fresh=!old[domKey];el.id='m_'+key;el.dataset.i=i;
 el.className='bub'+(m.me?' me':'')+(m.img&&!m.del?' has-photo':'')+(m.voice&&!m.del?' has-voice':'')+(fresh&&!first?' nw':'')+(m.img&&!m.text&&!m.del&&!m.re?' photo-only':'')+(m.failed?' failed':'');
 var body=messageBody(c,m,i),meta='<time>'+(m.ed&&!m.del?'изменено · ':'')+hm(m.t)+status(m,c)+'</time>'+(m.failed?'<button class="msg-retry" data-retry="'+esc(key)+'">'+ic('refresh')+'Повторить отправку</button>':'');
 var signature=body+meta;if(el._signature!==signature){
  // A read receipt or another message must never recreate a playing audio control.
  var content=el.querySelector('.msg-content'),foot=el.querySelector('.msg-meta');
  if(!content){el.innerHTML='<div class="msg-content"></div><div class="msg-meta"></div>';content=el.firstChild;foot=el.lastChild}
  if(content._h!==body){content.innerHTML=body;content._h=body}if(foot._h!==meta){foot.innerHTML=meta;foot._h=meta}el._signature=signature;
 }
 place(el,domKey);if(fresh&&!first&&!m.me)unread++;
 });
 Array.from(box.children).forEach(function(el){if(!keep[el.dataset.key])el.remove()});
 if(!c.msgs.length){var empty=document.createElement('div');empty.className='cempty';empty.innerHTML=ic('msg')+'<b>Начните разговор</b><span>Уточните размер, наличие или договоритесь о встрече</span>';box.appendChild(empty)}
 box.dataset.drawn='1';box._h='keyed';var qr=$('qrep');if(qr){var questions=c.msgs.length||!c.lid?'':QR.map(function(q){return '<button class="chip" data-q="'+esc(q)+'">'+esc(q)+'</button>'}).join('');if(qr._h!==questions){qr.innerHTML=questions;qr._h=questions}qr.hidden=!questions}
 box.querySelectorAll('.mimg').forEach(function(img){img.onload=function(){if(first||atBottom)box.scrollTop=box.scrollHeight};img.onerror=function(){if(img.dataset.failed)return;img.dataset.failed='1';var k=img.dataset.zoom;PHOTO_BAD[k]=1;delete MED[k];GMChatMedia.remove(mediaStoreKey(c,k));MEDIA_READ[mediaStoreKey(c,k)]=1;drawMsgs()}});
 if(first||atBottom)box.scrollTop=box.scrollHeight;else box.scrollTop=top+(box.scrollHeight<anchor?box.scrollHeight-anchor:0);
 var jump=$('chatJump');if(jump){if(unread&&!atBottom)jump.dataset.count=String(+(jump.dataset.count||0)+unread);jump.hidden=atBottom||first;jump.textContent=jump.dataset.count?'Новых сообщений: '+jump.dataset.count:'К последним сообщениям'}
 updatePlayback();
};
function updatePlayback(){if(!playing)return;var el=pg.querySelector('[data-voice-key="'+playing.key+'"]');if(!el)return;var a=playing.audio,d=isFinite(a.duration)&&a.duration?a.duration:playing.dur||1,percent=Math.min(100,a.currentTime/d*100);el.querySelector('.vpl').innerHTML=icon(a.paused?'play':'pause');el.querySelector('.vpl').setAttribute('aria-label',a.paused?'Продолжить голосовое':'Пауза');el.querySelector('.voice-seek').value=percent;el.querySelector('.voice-track').style.setProperty('--progress',percent+'%');el.querySelector('.voice-time').textContent=vdur(a.currentTime||playing.dur)}
function stopPlayback(){if(playing){playing.audio.pause();playing.audio.src='';playing=null}if(AU){AU.pause();AU=null}}
window.playV=function(i,el){var c=fchat(pg.dataset.id),m=c&&c.msgs[i];if(!m||m.del)return;var key=mkey(m);if(playing&&playing.key===key){if(playing.audio.paused)playing.audio.play().catch(function(){toast('Не удалось воспроизвести')});else playing.audio.pause();return}
 stopPlayback();el.querySelector('.vpl').disabled=true;loadVoice(c,m).then(function(src){if(!active(c)||m.del)return;var a=new Audio(src);playing={key:key,audio:a,dur:m.dur};a.ontimeupdate=updatePlayback;a.onplay=updatePlayback;a.onpause=updatePlayback;a.onended=function(){a.currentTime=0;updatePlayback()};a.onerror=function(){toast('Не удалось воспроизвести запись')};return a.play()}).catch(function(){toast('Запись не загружена. Проверьте интернет и повторите')}).then(function(){if(el.isConnected)el.querySelector('.vpl').disabled=false})};
function draftMedia(c,m){return Promise.all(['img','voice'].map(function(type){if(!m[type])return '';var value=(MED[mkey(m)]||{})[type];if(value)return value;return GMChatMedia.get(mediaKey(c,m,type)).then(function(v){if(!v)throw Error('Файл не сохранился. Прикрепите его заново');(MED[mkey(m)]=MED[mkey(m)]||{})[type]=v;return v})}))}
function deliver(c,m){if(m._sending)return;m._sending=true;m.pending=1;delete m.failed;repaint(c);
 draftMedia(c,m).then(function(values){var body={clientId:m.tk,text:m.text||''};if(values[0])body.img=values[0];if(values[1]){body.voice=values[1];body.dur=m.dur}if(m.re)body.re=m.re.id;
 return GM.api('POST','/threads/'+encodeURIComponent(c.tid)+'/messages',body)
 }).then(function(r){if(!r||!r.id)throw Error(r&&r.error||'Нет связи');var old=mkey(m),duplicate=c.msgs.find(function(x){return x!==m&&x.sid===r.id});if(duplicate)c.msgs.splice(c.msgs.indexOf(duplicate),1);if(MED[old]){MED[r.id]=MED[old];if(old!==r.id)delete MED[old]}m.sid=r.id;m.t=r.t;m.del=!!r.del;if(m.del){m.img=0;m.voice=0;delete MED[r.id];GMChatMedia.remove(mediaStoreKey(c,r.id));GMChatMedia.remove(mediaStoreKey(c,r.id)+'/voice')}m.pending=0;m._sending=false;delete m.failed;if(m.img&&(MED[r.id]||{}).img)rememberPhoto(c,r.id,MED[r.id].img);if(m.voice&&(MED[r.id]||{}).voice)cacheMedia(c,m,'voice',MED[r.id].voice);repaint(c)
 }).catch(function(e){if(m.sid){m.pending=0;m._sending=false;delete m.failed;repaint(c);return}m.pending=0;m.failed=1;m._sending=false;repaint(c);toast(e.message&&e.message.length<90?e.message:'Не отправлено. Нажмите повторить')})}
var originalSend=window.sendMsg;
window.sendMsg=function(txt,img,voice,dur,target,reply){var c=target?fchat(target):fchat(pg.dataset.id),ta=$('cta');if(!c)return false;if(!c.tid){toast('Откройте чат с зарегистрированным пользователем');return false}
 var text=String(txt!=null?txt:ta&&ta.value||'').trim();if(!text&&!img&&!voice)return false;if(text.length>2000){toast('Сообщение не должно быть длиннее 2000 символов');return false}
 if(CS.ed&&txt==null&&!img&&!voice){originalSend();return true}
 var re=reply===undefined?(active(c)?CS.re:null):reply,tk='msg_'+Date.now()+'_'+Math.random().toString(36).slice(2,12),m={tk:tk,me:true,text:text,img:img?1:0,voice:voice?1:0,dur:dur||0,re:re,t:Date.now(),pending:1};
 if(img||voice){MED[tk]={};if(img){MED[tk].img=img;cacheMedia(c,m,'img',img)}if(voice){MED[tk].voice=voice;cacheMedia(c,m,'voice',voice)}}
 c.msgs.push(m);c.t=m.t;if(active(c)){CS.re=null;CS.ed=null;crepDraw();if(txt==null&&ta){ta.value='';ta.oninput()}var box=$('cmsgs');if(box)box.scrollTop=box.scrollHeight}deliver(c,m);return true};
window.chatPreviewPhoto=function(src,target){var c=fchat(target);if(!c||!active(c)){toast('Фото не отправлено: чат был закрыт');return}if(!GMChatMedia.valid(src)){toast('Фото слишком большое. Выберите другое');return}
 photoDraft={src:src,target:target,reply:CS.re};var panel=document.createElement('div');panel.id='photoDraft';panel.className='media-draft';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Фото перед отправкой');panel.innerHTML='<div class="draft-head"><button class="ibtn" data-photo-cancel aria-label="Отменить">'+ic('x')+'</button><b>Фото для '+esc(c.name)+'</b></div><img src="'+esc(src)+'" alt="Фото перед отправкой"><div class="draft-caption"><textarea id="photoCaption" maxlength="2000" rows="2" placeholder="Добавьте подпись"></textarea><button class="ibtn snd" data-photo-send aria-label="Отправить фото">'+ic('send')+'</button></div>';document.body.appendChild(panel)};
function closePhoto(){var el=$('photoDraft');if(el)el.remove();photoDraft=null}
var originalOpen=window.openChat;
window.openChat=function(id){if(pg.dataset.id&&pg.dataset.id!==id)leaveChat();originalOpen(id);var box=$('cmsgs');if(!box)return;calmEnter(box);var jump=document.createElement('button');jump.id='chatJump';jump.className='chat-jump';jump.hidden=true;jump.textContent='К последним сообщениям';box.after(jump);jump.onclick=function(){box.scrollTo({top:box.scrollHeight,behavior:motionScroll()});jump.hidden=true;jump.dataset.count=''};box.addEventListener('scroll',function(){if(box.scrollHeight-box.scrollTop-box.clientHeight<90){jump.hidden=true;jump.dataset.count=''}else jump.hidden=false},{passive:true});var ta=$('cta'),c=fchat(id);ta.maxLength=2000;ta.value=c.draft||'';var input=ta.oninput;ta.oninput=function(){input();c.draft=ta.value;saveChats()};ta.oninput();
 var rec=$('crec');rec.innerHTML='<div class="rec-timeline"><span class="rdot"></span><b id="rtm">0:00</b><div class="rec-wave" aria-hidden="true">'+wave()+'</div><span id="recState">Запись</span></div><div class="rec-controls"><button class="rec-delete" data-rec="cancel" aria-label="Удалить запись">'+ic('trash')+'</button><button class="rec-preview" data-rec="preview" hidden aria-label="Прослушать запись">'+icon('play')+'</button><button class="rec-pause" data-rec="pause">'+icon('pause')+'<span>Пауза</span></button><button class="rec-send" data-rec="send" aria-label="Отправить голосовое">'+ic('send')+'</button></div>';
};
function elapsed(r){return r.total+(r.running?Date.now()-r.started:0)}
function stopPreview(){if(preview){preview.pause();preview.src='';preview=null}if(record&&record.url){URL.revokeObjectURL(record.url);record.url=''}}
function liveFrame(){var r=record;if(!r)return;if(r.analyser&&r.running&&!document.hidden){var data=new Uint8Array(r.analyser.fftSize);r.analyser.getByteTimeDomainData(data);var energy=data.reduce(function(sum,v){return sum+Math.abs(v-128)},0)/data.length;var bars=pg.querySelectorAll('.rec-wave i');bars.forEach(function(bar,i){bar.style.height=Math.max(4,Math.min(30,energy*3+(i*11)%10))+'px'})}}
function recordUi(){var r=record,el=$('crec');if(!r||!el)return;var opening=el.hidden;el.hidden=false;pg.classList.add('is-recording');if(opening&&$('cmsgs'))$('cmsgs').scrollTop=$('cmsgs').scrollHeight;el.classList.toggle('paused',!r.running);var button=el.querySelector('[data-rec="pause"]');button.innerHTML=icon(r.running?'pause':'mic')+'<span>'+(r.running?'Пауза':'Продолжить')+'</span>';el.querySelector('[data-rec="preview"]').hidden=r.running;el.querySelector('[data-rec="send"]').disabled=r.finishing;$('recState').textContent=r.finishing?'Подготовка…':r.running?'Запись':'На паузе';$('rtm').textContent=vdur(elapsed(r)/1000)}
function release(r){clearInterval(r.timer);if(r.context)r.context.close().catch(function(){});r.stream.getTracks().forEach(function(t){t.stop()});stopPreview();var el=$('crec');if(el)el.hidden=true;pg.classList.remove('is-recording');record=null;REC=null}
function finishRecord(send){var r=record;if(!r||r.finishing)return;r.finishing=true;r.send=send;if(r.running){r.total+=Date.now()-r.started;r.running=false}recordUi();try{r.mr.stop()}catch(e){release(r);toast('Не удалось завершить запись')}}
window.recStart=function(){if(record)return;var c=fchat(pg.dataset.id);if(!c||!c.tid){toast('Откройте чат с пользователем');return}if(!navigator.mediaDevices||!window.MediaRecorder){toast('Запись не поддерживается на этом устройстве');return}
 var request=++permissionRequest,target=c.id;stopPlayback();navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}).then(function(stream){if(request!==permissionRequest||!active(c)||record){stream.getTracks().forEach(function(t){t.stop()});return}
 var mt=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(function(t){return MediaRecorder.isTypeSupported(t)}),mr;
 try{mr=new MediaRecorder(stream,mt?{mimeType:mt,audioBitsPerSecond:32000}:{audioBitsPerSecond:32000})}catch(e){stream.getTracks().forEach(function(t){t.stop()});throw e}
 var r={mr:mr,stream:stream,target:target,reply:CS.re,chunks:[],total:0,started:Date.now(),running:true,send:false};record=r;REC=r;
 try{var A=window.AudioContext||window.webkitAudioContext;r.context=new A();r.analyser=r.context.createAnalyser();r.analyser.fftSize=128;r.context.createMediaStreamSource(stream).connect(r.analyser)}catch(e){}
 mr.ondataavailable=function(e){if(e.data&&e.data.size)r.chunks.push(e.data);if(r.wantPreview){r.wantPreview=false;previewRecord(r)}};
 mr.onerror=function(){if(record===r){r.send=false;try{mr.stop()}catch(e){release(r)}toast('Запись прервана. Попробуйте снова')}};
 mr.onstop=function(){var seconds=elapsed(r)/1000,blob=new Blob(r.chunks,{type:String(mr.mimeType||mt||'audio/webm').split(';')[0]}),send=r.send,target=r.target,reply=r.reply;release(r);if(!send)return;if(seconds<1||blob.size<100){toast('Запишите голосовое не короче секунды');return}if(blob.size>1050000){toast('Запись слишком большая. Запишите короче');return}var reader=new FileReader();reader.onload=function(){sendMsg('',null,reader.result,Math.round(seconds),target,reply)};reader.onerror=function(){toast('Не удалось подготовить запись')};reader.readAsDataURL(blob)};
 mr.start(250);r.timer=setInterval(function(){if(record!==r)return;recordUi();liveFrame();if(elapsed(r)>=180000){pauseRecord();toast('Достигнут лимит три минуты. Прослушайте и отправьте запись')}},120);recordUi();
 }).catch(function(){toast('Нет доступа к микрофону. Разрешите запись в настройках')})};
function pauseRecord(){var r=record;if(!r||r.finishing)return;stopPreview();if(r.running){r.total+=Date.now()-r.started;r.running=false;try{r.mr.pause();r.stream.getAudioTracks().forEach(function(t){t.enabled=false})}catch(e){finishRecord(false);return}}else{if(r.total>=180000){toast('Достигнут лимит три минуты');return}r.started=Date.now();r.running=true;r.stream.getAudioTracks().forEach(function(t){t.enabled=true});r.mr.resume()}recordUi()}
function previewRecord(r){if(record!==r||r.running||!r.chunks.length)return;stopPreview();var blob=new Blob(r.chunks,{type:String(r.mr.mimeType).split(';')[0]});r.url=URL.createObjectURL(blob);preview=new Audio(r.url);preview.onended=function(){var b=pg.querySelector('[data-rec="preview"]');if(b)b.innerHTML=icon('play')};preview.play().then(function(){pg.querySelector('[data-rec="preview"]').innerHTML=icon('pause')}).catch(function(){toast('Прослушивание пока недоступно. Можно продолжить или отправить запись')})}
window.recStop=finishRecord;
window.gmPauseMedia=function(){permissionRequest++;if(record&&record.running)pauseRecord();if(playing)playing.audio.pause();if(preview)preview.pause()};
window.gmHandleBack=function(){if(photoDraft){closePhoto();return true}if(record){confirm('Удалить незавершённую запись?',function(){finishRecord(false);history.back()});return true}var zoom=$('zoom');if(zoom){zoom.remove();return true}if(!$('modal').hidden){if(location.hash==='#filter')history.back();else hideModal();return true}return false};
pg.addEventListener('click',function(e){if(e.target.closest('[data-c="back"]')&&record){e.stopImmediatePropagation();gmHandleBack();return}var b=e.target.closest('[data-rec]');if(b){e.stopImmediatePropagation();var action=b.dataset.rec;if(action==='cancel'){permissionRequest++;finishRecord(false)}if(action==='send')finishRecord(true);if(action==='pause')pauseRecord();if(action==='preview'&&record){if(preview&&!preview.paused){stopPreview();b.innerHTML=icon('play')}else{record.wantPreview=true;try{record.mr.requestData()}catch(err){record.wantPreview=false;previewRecord(record)}}}return}
 b=e.target.closest('[data-retry]');if(b){e.stopImmediatePropagation();var c=fchat(pg.dataset.id),m=c&&c.msgs.find(function(x){return mkey(x)===b.dataset.retry});if(m)deliver(c,m)}if(e.target.closest('[data-voice-seek]'))e.stopImmediatePropagation();
},true);
pg.addEventListener('input',function(e){var key=e.target.dataset.voiceSeek;if(!key||!playing||playing.key!==key)return;var d=playing.audio.duration;if(isFinite(d))playing.audio.currentTime=d*e.target.value/100;updatePlayback()});
document.addEventListener('click',function(e){if(e.target.closest('[data-photo-cancel]'))closePhoto();if(e.target.closest('[data-photo-send]')&&photoDraft){var d=photoDraft,c=fchat(d.target);if(!active(c)){closePhoto();return}var text=$('photoCaption').value;if(sendMsg(text,d.src,null,0,d.target,d.reply))closePhoto()}});
function leaveChat(){permissionRequest++;if(record)finishRecord(false);stopPlayback();closePhoto()}
window.addEventListener('hashchange',function(){if(!location.hash.startsWith('#chat/'))leaveChat();else if(record&&record.target!==pg.dataset.id)leaveChat()});
document.addEventListener('visibilitychange',function(){if(document.hidden)gmPauseMedia()});
window.addEventListener('pagehide',leaveChat);
// Old unsent metadata is never silently replayed after restarting the application.
chats.forEach(function(c){c.msgs.forEach(function(m){if(m.pending){m.pending=0;m.failed=1}delete m._sending})});
var scrollPositions={},show=window.showTab;
window.showTab=function(v){var previous=S.view;if(previous!==v)scrollPositions[previous]=window.scrollY;show(v);if(previous!==v){window.scrollTo(0,scrollPositions[v]||0);var tab=$('v-'+v);if(tab){tab.classList.remove('gm-tab-enter');void tab.offsetWidth;tab.classList.add('gm-tab-enter')}}};
window.GMTransitions=['Вкладки','Содержимое чата','Карточка товара','Поиск','Меню действий','Просмотр фото','Ответ на сообщение','Новое сообщение','Панель записи'];
if(!pg.hidden&&pg.dataset.id)window.openChat(pg.dataset.id);
window.GMMessenger={pauseRecording:pauseRecord,recording:function(){return record},stopPlayback:stopPlayback};
})();
