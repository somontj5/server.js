'use strict';
// Inbound only: no Graph API calls, access tokens or outgoing WhatsApp messages.
const crypto = require('node:crypto');
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
const random = n => crypto.randomBytes(n).toString('hex');
const equal = (a,b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
module.exports = function whatsappAuth({db, persist, userOut, env=process.env, clock=Date.now}) {
  const ttl=300000, verify=env.VERIFY_TOKEN||'', secret=env.APP_SECRET||'';
  const number=env.WA_LOGIN_NUMBER||'', phoneId=env.WA_PHONE_NUMBER_ID||'';
  const enabled=!!(verify && secret && /^[1-9]\d{7,14}$/.test(number) && /^\d+$/.test(phoneId));
  const state=db.whatsappAuth=db.whatsappAuth||{sessions:{},limits:{}};
  const fail=(code,message)=>{const e=new Error(message);e.code=code;throw e};
  function clean(){const t=clock();for(const [id,s] of Object.entries(state.sessions))if(s.expiresAt<=t)delete state.sessions[id];for(const [k,v] of Object.entries(state.limits))if(v.until<=t)delete state.limits[k]}
  function limit(key,max,ms=900000){
    const k=crypto.createHmac('sha256',secret).update(key).digest('hex');
    let v=state.limits[k];if(!v||v.until<=clock()){
      if(Object.keys(state.limits).length>=20000)fail(429,'Слишком много запросов. Повторите позже.');
      v=state.limits[k]={count:0,until:clock()+ms};
    }
    if(++v.count>max)fail(429,'Слишком много попыток. Подождите 15 минут.');
  }
  function ip(req){
    const peer=req.socket.remoteAddress||'unknown';
    // Trust only cloudflared on the same machine, never arbitrary forwarded headers.
    const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer);
    const cf=req.headers['cf-connecting-ip'];
    return env.TRUST_CF_PROXY==='true'&&local&&typeof cf==='string'&&require('node:net').isIP(cf)?cf:peer;
  }
  function ready(){if(!enabled)fail(503,'Вход WhatsApp ещё не настроен владельцем. Используйте Telegram.');}
  function start(req){
    ready();clean();limit('start:'+ip(req),10);
    if(Object.keys(state.sessions).length>=10000)fail(429,'Повторите позже');
    const id=random(16),proof=random(32),code='ATUSH '+random(12).toUpperCase();
    state.sessions[id]={proofHash:hash(proof),codeHash:hash(code),status:'pending',createdAt:clock(),expiresAt:clock()+ttl};
    persist();return {sessionId:id,sessionSecret:proof,code,expiresIn:300,expiresAt:clock()+ttl,link:'https://wa.me/'+number+'?text='+encodeURIComponent(code)};
  }
  function check(req,body){
    ready();clean();limit('poll:'+ip(req),1200);
    const id=body.sessionId,proof=req.headers['x-wa-session'];
    if(typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id)||typeof proof!=='string'||!/^[a-f0-9]{64}$/.test(proof))fail(401,'Неверная сессия');
    const s=state.sessions[id];if(!s)fail(410,'Время входа истекло');
    if(!equal(s.proofHash,hash(proof)))fail(401,'Неверная сессия');
    if(s.status!=='confirmed')return {status:'pending',expiresAt:s.expiresAt};
    // Retrying a lost HTTP response returns the SAME token to the SAME secret holder.
    // Identity is a verified WA sender, never an editable contact phone in a profile.
    let u=Object.values(db.users).find(u=>u.waPhone===s.phone);
    if(!u){u={id:random(10),waPhone:s.phone,phone:'+'+s.phone,createdAt:clock(),name:'',shopName:'',row:'',shopNum:''};db.users[u.id]=u;}
    if(!s.token){s.token=random(32);db.sessions[s.token]={userId:u.id,createdAt:clock(),provider:'whatsapp'};}
    if(!db.sessions[s.token])fail(410,'Сессия завершена. Войдите снова.');
    persist();return {status:'ok',token:s.token,user:userOut(u)};
  }
  function receive(event){
    if(event.object!=='whatsapp_business_account')return;
    clean();let count=0;
    for(const entry of event.entry||[])for(const change of entry.changes||[]){
      const v=change.value||{};
      if(change.field!=='messages'||!v.metadata||v.metadata.phone_number_id!==phoneId)continue;
      for(const m of v.messages||[]){
        if(++count>100)return;
        if(m.type!=='text'||typeof m.from!=='string'||!/^\d{8,15}$/.test(m.from)||!m.id)continue;
        const text=m.text&&m.text.body;
        if(typeof text!=='string'||!/^ATUSH [A-F0-9]{24}$/.test(text.trim()))continue;
        // Ignore old replays even if Meta delivers a signed retry.
        const ts=Number(m.timestamp)*1000;if(!Number.isFinite(ts)||ts<clock()-ttl||ts>clock()+60000)continue;
        try{limit('phone:'+m.from,10);}catch(e){if(e.code===429)continue;throw e;}
        const codeHash=hash(text.trim());
        const s=Object.values(state.sessions).find(s=>s.status==='pending'&&s.codeHash===codeHash&&s.expiresAt>clock());
        if(!s)continue;
        s.phone=m.from;s.status='confirmed';s.confirmedAt=clock();delete s.codeHash;
      }
    }
    persist();
  }
  function webhook(req,res,url){
    const reply=(status,text)=>{res.writeHead(status,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});res.end(text)};
    if(req.method==='GET'){
      if(!verify)return reply(503,'Not configured');
      const q=url.searchParams;
      if(q.get('hub.mode')!=='subscribe'||!equal(q.get('hub.verify_token'),verify))return reply(403,'Forbidden');
      return reply(200,q.get('hub.challenge')||'');
    }
    if(req.method!=='POST')return reply(405,'Method not allowed');
    if(!enabled)return reply(503,'Not configured');
    const sig=req.headers['x-hub-signature-256'];
    if(typeof sig!=='string'||!/^sha256=[a-f0-9]{64}$/.test(sig)){req.resume();return reply(403,'Invalid signature');}
    let size=0,chunks=[],large=false;
    req.on('data',c=>{size+=c.length;if(size>262144){if(!large){large=true;chunks=[];reply(413,'Too large');}}else if(!large)chunks.push(c)});
    req.on('end',()=>{
      if(large)return;
      const raw=Buffer.concat(chunks),expected='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
      if(!equal(sig,expected))return reply(403,'Invalid signature');
      let event;try{event=JSON.parse(raw.toString('utf8'));if(!event||typeof event!=='object')throw Error();}catch{return reply(400,'Invalid JSON');}
      // Only local state mutation + atomic disk commit before acknowledgement. No network work.
      try{receive(event);reply(200,'EVENT_RECEIVED');}catch{reply(500,'Retry later');}
    });
    req.on('error',()=>{});
  }
  return {start,check,webhook,clean,enabled};
};
