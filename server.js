// СтеклоМаркет — тестовый сервер. Без зависимостей, Node 20+.
// Вход: через Telegram-бота (подтверждение номера телефона). Уведомления — тоже в Telegram.
const http = require('http'), fs = require('fs'), crypto = require('crypto');
const PORT = +process.env.PORT || 8080;
const TOKEN = process.env.BOT_TOKEN || '';
const PUB = process.env.PUBLIC_URL || '';
const DB_FILE = 'data/db.json';
const CATS = ['transport','realty','electronics','clothes','home','animals','food','other'];

let db = { users:{}, sessions:{}, codes:{}, listings:{}, threads:{}, reviews:[], searches:{} };
try { Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); console.log('БД загружена'); } catch {}
let dirty = false;
const touch = () => { dirty = true; };
function flush() { if (!dirty) return; fs.mkdirSync('data', { recursive:true }); fs.writeFileSync(DB_FILE, JSON.stringify(db)); dirty = false; }
setInterval(flush, 3000);
['SIGINT','SIGTERM'].forEach(s => process.on(s, () => { dirty = true; flush(); process.exit(0); }));

const rid = (n=6) => crypto.randomBytes(n).toString('hex');
const now = () => Date.now();
const str = (v, max=200) => (v == null ? '' : String(v)).trim().slice(0, max);
const priceNum = p => { const m = String(p||'').replace(/\s/g,'').match(/\d+([.,]\d+)?/); return m ? parseFloat(m[0].replace(',','.')) : null; };
const isTop = l => l.boostedUntil && l.boostedUntil > now();

/* ================= Telegram ================= */
let BOT = '';
async function tg(method, body) {
  if (!TOKEN) return { ok:false };
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body||{}) });
    return await r.json();
  } catch (e) { return { ok:false, description:String(e) }; }
}
const say = (chat_id, text, extra) => chat_id && tg('sendMessage', Object.assign({ chat_id, text }, extra||{}));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function botLoop() {
  if (!TOKEN) { console.log('⚠️ BOT_TOKEN не задан — вход через Telegram отключён'); return; }
  const me = await tg('getMe'); BOT = me.result && me.result.username;
  await tg('deleteWebhook', { drop_pending_updates:false });
  console.log('Бот: @' + BOT);
  let offset = 0;
  for (;;) {
    const r = await tg('getUpdates', { offset, timeout:50, allowed_updates:['message'] });
    if (!r.ok) { await sleep(3000); continue; }
    for (const u of r.result) { offset = u.update_id + 1; try { await onMessage(u.message); } catch (e) { console.error(e); } }
  }
}
async function onMessage(m) {
  if (!m) return;
  const chat = m.chat.id, text = m.text || '';
  if (m.contact) {
    if (m.contact.user_id !== m.from.id) return say(chat, '❌ Отправьте свой номер, а не чужой контакт.');
    const user = Object.values(db.users).find(x => x.tgId === m.from.id);
    if (!user) return say(chat, 'Сначала нажмите «Войти через Telegram» в приложении.', { reply_markup:{ remove_keyboard:true } });
    user.chatId = chat; user.phone = '+' + String(m.contact.phone_number).replace(/\D/g,''); touch();
    return say(chat, '✅ Номер ' + user.phone + ' сохранён в профиле.', { reply_markup:{ remove_keyboard:true } });
  }
  if (text.startsWith('/start')) {
    const code = text.split(' ')[1];
    if (code && db.codes[code] && db.codes[code].status === 'wait') {
      // Вход в одно касание: нажал «Старт» — и уже вошёл (номер не обязателен)
      let user = Object.values(db.users).find(x => x.tgId === m.from.id);
      if (!user) { user = { id: rid(5), tgId: m.from.id, createdAt: now(), shopName:'', row:'', shopNum:'', phone:'' }; db.users[user.id] = user; }
      user.chatId = chat; user.username = m.from.username || '';
      user.name = user.name || [m.from.first_name, m.from.last_name].filter(Boolean).join(' ');
      Object.assign(db.codes[code], { chat, status:'ok', userId:user.id }); touch();
      await say(chat, '✅ Вы вошли в СтеклоМаркет как ' + (user.name || 'пользователь') + '.\nВернитесь в приложение — вход уже выполнен.');
      if (!user.phone) return say(chat, 'Хотите, чтобы покупатели могли позвонить? Поделитесь номером (необязательно) 👇', {
        reply_markup:{ keyboard:[[{ text:'📱 Поделиться номером', request_contact:true }]], resize_keyboard:true, one_time_keyboard:true } });
      return;
    }
    return say(chat, 'Это бот входа в СтеклоМаркет.\nНажмите «Войти через Telegram» в приложении.' + (PUB ? '\n\nАдрес сервера: ' + PUB : ''));
  }
  if (text === '/url') return say(chat, PUB || 'Адрес сервера не задан');
  if (text === '/stop') { const u = Object.values(db.users).find(x => x.tgId === m.from.id); if (u) { u.mute = true; touch(); } return say(chat, '🔕 Уведомления выключены. /notify — включить.'); }
  if (text === '/notify') { const u = Object.values(db.users).find(x => x.tgId === m.from.id); if (u) { u.mute = false; touch(); } return say(chat, '🔔 Уведомления включены.'); }
}
function notify(userId, text) { const u = db.users[userId]; if (u && !u.mute) say(u.chatId, text); }

/* ================= Скрытые теги и рекомендации ================= */
// Теги объявления скрыты от клиента: слова из названия/описания (грубый стемминг),
// категория, ценовой диапазон, магазин/ряд. Интересы пользователя — веса тегов
// с затуханием (половина за 7 дней), копятся по действиям: просмотр, избранное, чат, поиск.
const STOP = new Set('для или при без под над все это как что так его она они уже еще очень новый новая новое продам продаю цена торг срочно'.split(' '));
const stem = w => w.length > 6 ? w.slice(0, w.length - 2) : w;   // «стеклянный» ≈ «стеклянная»
function words(t) { return (String(t||'').toLowerCase().replace(/ё/g,'е').match(/[a-zа-я0-9]{3,}/g) || []).filter(w => !STOP.has(w) && !/^\d+$/.test(w)).map(stem); }
function priceTag(p) { const n = priceNum(p); if (n == null) return null; return 'p:' + (n < 500 ? 0 : n < 2000 ? 1 : n < 10000 ? 2 : n < 50000 ? 3 : 4); }
function makeTags(l) {
  const t = new Set(['c:' + l.cat]);
  words(l.name).forEach(w => t.add('w:' + w));
  words(l.desc).slice(0, 30).forEach(w => t.add('w:' + w));
  const pt = priceTag(l.price); if (pt) t.add(pt);
  if (l.sellerId) t.add('s:' + l.sellerId);
  if (l.row) t.add('r:' + String(l.row).toLowerCase());
  return [...t].slice(0, 60);
}
const HALF = 7 * 864e5, W = { view:1, fav:4, unfav:-3, chat:6, search:2, saved:3, hide:-8 };
function decayed(e, t) { return e[0] * Math.pow(0.5, (t - e[1]) / HALF); }
function learn(u, tags, kind) {
  if (!u || !tags || !tags.length) return;
  const w = W[kind] || 1, t = now(), I = u.interests = u.interests || {};
  for (const tag of tags) {
    const k = tag.startsWith('w:') ? 1 : tag.startsWith('c:') ? 0.7 : tag.startsWith('s:') ? 0.8 : 0.5; // слова весомее
    const v = (I[tag] ? decayed(I[tag], t) : 0) + w * k;
    I[tag] = [+Math.max(-20, Math.min(50, v)).toFixed(3), t];
  }
  const keys = Object.keys(I);                       // держим профиль компактным
  if (keys.length > 300) keys.sort((a,b) => Math.abs(decayed(I[a],t)) - Math.abs(decayed(I[b],t))).slice(0, keys.length - 300).forEach(k => delete I[k]);
  touch();
}
function learnListing(u, l, kind) {
  if (!u || !l || l.sellerId === u.id) return;
  learn(u, l.tags || (l.tags = makeTags(l)), kind);
  if (kind === 'view') { u.seen = (u.seen || []).filter(x => x !== l.id); u.seen.push(l.id); if (u.seen.length > 200) u.seen.shift(); }
  if (kind === 'hide') { u.hidden = u.hidden || []; if (!u.hidden.includes(l.id)) u.hidden.push(l.id); if (u.hidden.length > 500) u.hidden.shift(); }
}
const learnQuery = (u, s, kind) => learn(u, [...words(s.q).map(w => 'w:' + w), ...(s.cat && s.cat !== 'all' ? ['c:' + s.cat] : [])], kind);
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; }
function recommend(arr, u) {
  const t = now(), I = (u && u.interests) || {}, day = Math.floor(t / 864e5);
  const hidden = new Set((u && u.hidden) || []), seen = new Map(((u && u.seen) || []).map((id, i, a) => [id, a.length - i]));
  const cold = !Object.keys(I).length;
  const scored = arr.filter(l => !hidden.has(l.id)).map(l => {
    const tags = l.tags || (l.tags = makeTags(l));
    let aff = 0; if (!cold) for (const g of tags) if (I[g]) aff += decayed(I[g], t);
    const ageD = (t - l.createdAt) / 864e5;
    let sc = 6 * Math.tanh(aff / 8)                   // персональный интерес
      + 3 * Math.exp(-ageD / 5)                        // свежесть
      + (isTop(l) ? 2.5 : 0)                           // платный ТОП
      + Math.min(1, (l.views || 0) / 200)              // популярность
      + 1.2 * hash((u ? u.id : 'anon') + l.id + day);  // перемешивание: у каждого своя лента, меняется раз в сутки
    if (seen.has(l.id)) sc -= seen.get(l.id) <= 20 ? 2.5 : 1.5;   // уже смотрел — ниже (недавно — сильнее)
    if (u && l.sellerId === u.id) sc -= 4;
    return { l, sc, aff };
  }).sort((a,b) => b.sc - a.sc);
  if (cold) return scored.map(x => x.l);
  // разнообразие: каждая 5-я позиция — «открытие» вне интересов, не больше 3 подряд из одной категории
  const main = scored.filter(x => x.aff > 0.5), explore = scored.filter(x => x.aff <= 0.5), out = [];
  while (main.length || explore.length) {
    let src = (out.length % 5 === 4 && explore.length) || !main.length ? explore : main;
    let i = 0;
    if (src === main && out.length >= 3 && out.slice(-3).every(l => l.cat === out[out.length-1].cat)) { const j = main.findIndex(x => x.l.cat !== out[out.length-1].cat); if (j >= 0) i = j; }
    out.push(src.splice(i, 1)[0].l);
  }
  return out;
}
// миграция: проставить теги старым объявлениям
for (const l of Object.values(db.listings)) if (!l.tags) { l.tags = makeTags(l); touch(); }

/* ================= Представления ================= */
const pubUser = u => u && ({ id:u.id, name:u.name, shopName:u.shopName, row:u.row, shopNum:u.shopNum, about:u.about||'', rating: rating(u.id) });
const meUser = u => Object.assign(pubUser(u), { phone:u.phone });
function rating(uid) { const a = db.reviews.filter(r => r.sellerId === uid); return { n:a.length, avg: a.length ? +(a.reduce((s,r)=>s+r.stars,0)/a.length).toFixed(2) : 0 }; }
function listingOut(l, full) {
  const s = db.users[l.sellerId] || {};
  const o = Object.assign({}, l, { top: isTop(l), seller: pubUser(s) }); delete o.tags;
  if (!full) { o.photo = l.photos[0] || null; o.photoCount = l.photos.length; delete o.photos; delete o.desc; }
  if (!(l.contact === 'both' || l.contact === 'phone' || l.contact === 'wa' || l.contact === 'tg')) o.phone = '';
  else o.phone = l.phone || s.phone || '';
  return o;
}
function matches(l, s) {
  if (l.archived) return false;
  if (s.cat && s.cat !== 'all' && l.cat !== s.cat) return false;
  if (s.q && (l.name + ' ' + l.shopName + ' ' + l.desc).toLowerCase().indexOf(String(s.q).toLowerCase()) < 0) return false;
  const p = priceNum(l.price), a = parseFloat(s.min), b = parseFloat(s.max);
  if (!isNaN(a) || !isNaN(b)) { if (p == null) return false; if (!isNaN(a) && p < a) return false; if (!isNaN(b) && p > b) return false; }
  return true;
}
function cleanListing(b, l) {
  l = l || {};
  if (b.cat !== undefined) l.cat = CATS.includes(b.cat) ? b.cat : 'other';
  ['name','price','row','shopNum','shopName','phone'].forEach(k => { if (b[k] !== undefined) l[k] = str(b[k], 80); });
  if (b.desc !== undefined) l.desc = str(b.desc, 1000);
  if (b.contact !== undefined) l.contact = ['chat','both','phone','wa','tg'].includes(b.contact) ? b.contact : 'chat';
  if (Array.isArray(b.photos)) l.photos = b.photos.filter(p => typeof p === 'string' && (p.startsWith('data:image/') || p.startsWith('http'))).slice(0, 16);
  return l;
}
function threadOut(t, uid) {
  const l = db.listings[t.listingId], last = t.messages[t.messages.length-1];
  const other = db.users[uid === t.buyerId ? t.sellerId : t.buyerId];
  return { id:t.id, listingId:t.listingId, listing: l ? { id:l.id, name:l.name, price:l.price, photo:l.photos[0]||null, archived:!!l.archived } : null,
    role: uid === t.buyerId ? 'buyer' : 'seller', other: pubUser(other), last: last || null,
    unread: uid === t.buyerId ? t.uB : t.uS, updatedAt: last ? last.t : t.createdAt };
}

/* ================= HTTP ================= */
const routes = [];
const route = (m, p, auth, h) => routes.push({ m, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), auth, h });
class E extends Error { constructor(c, m) { super(m); this.code = c; } }
const need = (c, m) => { throw new E(c, m); };

route('GET', '/', 0, () => ({ ok:true, app:'GlassMarket', bot: BOT ? '@' + BOT : null, time: now() }));
route('GET', '/health', 0, () => ({ ok:true }));

// --- Вход через Telegram ---
route('POST', '/auth/start', 0, () => {
  if (!BOT) need(503, 'Бот не запущен');
  const code = rid(8); db.codes[code] = { status:'wait', createdAt: now() }; touch();
  return { code, link: `https://t.me/${BOT}?start=${code}`, tgLink: `tg://resolve?domain=${BOT}&start=${code}`, expiresIn: 600 };
});
route('GET', '/auth/check', 0, (q) => {
  const c = db.codes[q.code]; if (!c) need(404, 'Код не найден');
  if (now() - c.createdAt > 600e3) { delete db.codes[q.code]; touch(); need(410, 'Код устарел'); }
  if (c.status !== 'ok') return { status:'pending' };
  const token = rid(24); db.sessions[token] = { userId:c.userId, createdAt: now() }; delete db.codes[q.code]; touch();
  return { status:'ok', token, user: meUser(db.users[c.userId]) };
});
route('POST', '/auth/logout', 1, (q, b, u, req) => { delete db.sessions[req.token]; touch(); return { ok:true }; });

// --- Профиль ---
route('GET', '/me', 1, (q, b, u) => meUser(u));
route('PUT', '/me', 1, (q, b, u) => { ['name','shopName','row','shopNum','phone'].forEach(k => { if (b[k] !== undefined) u[k] = str(b[k], 60); }); if (b.about !== undefined) u.about = str(b.about, 200); touch(); return meUser(u); });
route('GET', '/users/:id', 0, (q, b, u, r, p) => pubUser(db.users[p.id]) || need(404, 'Нет пользователя'));

// --- Объявления ---
route('GET', '/listings', 0, (q, b, u) => {
  let arr = Object.values(db.listings);
  if (q.seller) { arr = arr.filter(l => l.sellerId === (q.seller === 'me' && u ? u.id : q.seller)); if (q.archived !== undefined) arr = arr.filter(l => !!l.archived === (q.archived === '1')); else if (!(u && q.seller === 'me')) arr = arr.filter(l => !l.archived); }
  else { arr = arr.filter(l => matches(l, q)); if (u && q.q && !+q.offset) learnQuery(u, q, 'search'); }
  const s = q.sort || 'rec';
  if (s === 'new') arr.sort((a,b) => b.createdAt - a.createdAt);
  else if (s === 'cheap') arr.sort((a,b) => (priceNum(a.price) ?? 1e15) - (priceNum(b.price) ?? 1e15));
  else if (s === 'exp') arr.sort((a,b) => (priceNum(b.price) ?? -1) - (priceNum(a.price) ?? -1));
  else if (q.seller) arr.sort((a,b) => b.createdAt - a.createdAt);
  else arr = recommend(arr, u);
  const off = +q.offset || 0, lim = Math.min(+q.limit || 40, 100);
  return { total: arr.length, items: arr.slice(off, off + lim).map(l => listingOut(l)) };
});
route('GET', '/listings/:id', 0, (q, b, u, r, p) => { const l = db.listings[p.id] || need(404, 'Объявление не найдено'); l.views = (l.views||0) + 1; learnListing(u, l, 'view'); touch(); return listingOut(l, true); });
route('POST', '/listings', 1, (q, b, u) => {
  const l = cleanListing(b, { id: rid(5), sellerId: u.id, createdAt: now(), views:0, contact:'chat', photos:[] });
  if (!l.name || l.name.length < 3) need(400, 'Название от 3 символов');
  if (!l.cat) need(400, 'Выберите категорию');
  if (!l.photos.length) need(400, 'Добавьте фото');
  if (!l.row || !l.shopNum || !l.shopName) need(400, 'Укажите ряд, номер и название магазина');
  l.tags = makeTags(l); db.listings[l.id] = l;
  if (!u.shopName) { u.shopName = l.shopName; u.row = l.row; u.shopNum = l.shopNum; }
  touch();
  // уведомления по сохранённым поискам
  for (const s of Object.values(db.searches)) if (s.userId !== u.id && matches(l, s)) notify(s.userId, `🔔 Новое по вашему поиску «${s.title}»:\n${l.name} — ${l.price || 'цена не указана'}\nРяд ${l.row}, магазин №${l.shopNum}`);
  return listingOut(l, true);
});
function own(p, u) { const l = db.listings[p.id] || need(404, 'Объявление не найдено'); if (l.sellerId !== u.id) need(403, 'Это не ваше объявление'); return l; }
route('PUT', '/listings/:id', 1, (q, b, u, r, p) => { const l = cleanListing(b, own(p, u)); l.updatedAt = now(); l.tags = makeTags(l); touch(); return listingOut(l, true); });
route('POST', '/listings/:id/archive', 1, (q, b, u, r, p) => { const l = own(p, u); l.archived = true; touch(); return listingOut(l, true); });
route('POST', '/listings/:id/restore', 1, (q, b, u, r, p) => { const l = own(p, u); l.archived = false; l.createdAt = now(); touch(); return listingOut(l, true); });
route('POST', '/listings/:id/rise', 1, (q, b, u, r, p) => { const l = own(p, u); l.boostedUntil = now() + 7*864e5; l.freeRiseUsed = true; touch(); return listingOut(l, true); });
route('DELETE', '/listings/:id', 1, (q, b, u, r, p) => { own(p, u); delete db.listings[p.id]; for (const t of Object.values(db.threads)) if (t.listingId === p.id) delete db.threads[t.id]; touch(); return { ok:true }; });

// --- Избранное ---
route('GET', '/favorites', 1, (q, b, u) => ({ items: (u.favs||[]).map(id => db.listings[id]).filter(Boolean).map(l => listingOut(l)) }));
route('POST', '/favorites/:id', 1, (q, b, u, r, p) => { u.favs = u.favs || []; if (!u.favs.includes(p.id)) { u.favs.push(p.id); learnListing(u, db.listings[p.id], 'fav'); } touch(); return { ok:true, favs:u.favs }; });
route('DELETE', '/favorites/:id', 1, (q, b, u, r, p) => { if ((u.favs||[]).includes(p.id)) learnListing(u, db.listings[p.id], 'unfav'); u.favs = (u.favs||[]).filter(x => x !== p.id); touch(); return { ok:true, favs:u.favs }; });

// --- Сообщения ---
route('GET', '/threads', 1, (q, b, u) => {
  const a = Object.values(db.threads).filter(t => (t.buyerId === u.id || t.sellerId === u.id) && t.messages.length).map(t => threadOut(t, u.id)).sort((x,y) => y.updatedAt - x.updatedAt);
  return { unread: a.reduce((s,t) => s + t.unread, 0), items: a };
});
route('POST', '/listings/:id/thread', 1, (q, b, u, r, p) => {   // открыть/создать диалог покупателя
  const l = db.listings[p.id] || need(404, 'Объявление не найдено');
  if (l.sellerId === u.id) need(400, 'Это ваше объявление');
  const tid = l.id + '_' + u.id;
  if (!db.threads[tid]) learnListing(u, l, 'chat');
  if (!db.threads[tid]) { db.threads[tid] = { id: tid, listingId: l.id, buyerId: u.id, sellerId: l.sellerId, messages: [], uB:0, uS:0, createdAt: now() }; touch(); }
  return threadOut(db.threads[tid], u.id);
});
function myThread(p, u) { const t = db.threads[p.id] || need(404, 'Диалог не найден'); if (t.buyerId !== u.id && t.sellerId !== u.id) need(403, 'Нет доступа'); return t; }
route('GET', '/threads/:id', 1, (q, b, u, r, p) => {
  const t = myThread(p, u); if (u.id === t.buyerId) t.uB = 0; else t.uS = 0; touch();
  const since = +q.since || 0;
  return Object.assign(threadOut(t, u.id), { messages: t.messages.filter(m => m.t > since).map(m => ({ id:m.id, text:m.text, t:m.t, mine: m.from === u.id })) });
});
route('POST', '/threads/:id/messages', 1, (q, b, u, r, p) => {
  const t = myThread(p, u), text = str(b.text, 1000); if (!text) need(400, 'Пустое сообщение');
  const m = { id: rid(4), from: u.id, text, t: now() }; t.messages.push(m);
  const toBuyer = u.id === t.sellerId; if (toBuyer) t.uB++; else t.uS++; touch();
  const l = db.listings[t.listingId] || {};
  notify(toBuyer ? t.buyerId : t.sellerId, `💬 ${u.name || 'Пользователь'} · «${l.name || ''}»\n${text}`);
  return { id:m.id, text:m.text, t:m.t, mine:true };
});

// --- Отзывы ---
route('GET', '/users/:id/reviews', 0, (q, b, u, r, p) => {
  const a = db.reviews.filter(x => x.sellerId === p.id).sort((x,y) => y.t - x.t);
  return Object.assign(rating(p.id), { dist: [5,4,3,2,1].map(s => a.filter(x => x.stars === s).length),
    items: a.map(x => ({ id:x.id, stars:x.stars, text:x.text, t:x.t, author: (db.users[x.authorId]||{}).name || (db.users[x.authorId]||{}).shopName || 'Покупатель', listingName: x.listingName })) });
});
route('POST', '/users/:id/reviews', 1, (q, b, u, r, p) => {
  if (p.id === u.id) need(400, 'Нельзя оценить себя');
  if (!db.users[p.id]) need(404, 'Нет продавца');
  const t = Object.values(db.threads).find(t => t.sellerId === p.id && t.buyerId === u.id) || { listingId: b.listingId };
  const stars = Math.max(1, Math.min(5, Math.round(+b.stars || 0))), text = str(b.text, 500);
  if (!stars) need(400, 'Поставьте оценку 1–5');
  db.reviews = db.reviews.filter(x => !(x.sellerId === p.id && x.authorId === u.id));
  db.reviews.push({ id: rid(4), sellerId: p.id, authorId: u.id, stars, text, t: now(), listingName: (db.listings[t.listingId]||{}).name || '' }); touch();
  notify(p.id, `⭐ Новый отзыв (${stars}/5): ${text}`);
  return rating(p.id);
});

// --- Сохранённые поиски ---
route('GET', '/searches', 1, (q, b, u) => ({ items: Object.values(db.searches).filter(s => s.userId === u.id).map(s => Object.assign({}, s, {
  total: Object.values(db.listings).filter(l => matches(l, s)).length,
  fresh: Object.values(db.listings).filter(l => matches(l, s) && l.createdAt > s.seen).length })) }));
route('POST', '/searches', 1, (q, b, u) => {
  const s = { id: rid(4), userId: u.id, q: str(b.q, 60), cat: CATS.includes(b.cat) ? b.cat : 'all', min: str(b.min, 12), max: str(b.max, 12), sort: str(b.sort, 8) || 'rec', seen: now(), createdAt: now() };
  s.title = [s.q && '«' + s.q + '»', s.cat !== 'all' && s.cat, (s.min || s.max) && `${s.min ? 'от ' + s.min : ''} ${s.max ? 'до ' + s.max : ''} ₽`].filter(Boolean).join(', ') || 'Все объявления';
  db.searches[s.id] = s; learnQuery(u, s, 'saved'); touch(); return s;
});
route('POST', '/searches/:id/seen', 1, (q, b, u, r, p) => { const s = db.searches[p.id]; if (!s || s.userId !== u.id) need(404, 'Нет поиска'); s.seen = now(); touch(); return { ok:true }; });
route('DELETE', '/searches/:id', 1, (q, b, u, r, p) => { const s = db.searches[p.id]; if (s && s.userId === u.id) { delete db.searches[p.id]; touch(); } return { ok:true }; });

// --- Рекомендации ---
// Явные сигналы из приложения (необязательно): {type:'hide'|'view'|'fav', listingId}
route('POST', '/events', 1, (q, b, u) => {
  const l = db.listings[b.listingId] || need(404, 'Объявление не найдено');
  if (!['hide','view','fav'].includes(b.type)) need(400, 'Неизвестное событие');
  learnListing(u, l, b.type); return { ok:true };
});
route('GET', '/recs', 0, (q, b, u) => {   // короткая подборка «Для вас»
  const ex = q.exclude ? String(q.exclude).split(',') : [];
  const arr = recommend(Object.values(db.listings).filter(l => !l.archived && !ex.includes(l.id) && (!u || l.sellerId !== u.id)), u);
  return { personal: !!(u && u.interests && Object.keys(u.interests).length), items: arr.slice(0, Math.min(+q.limit || 20, 50)).map(l => listingOut(l)) };
});
route('GET', '/me/interests', 1, (q, b, u) => {   // отладка: что система «думает» о пользователе
  const t = now(), I = u.interests || {};
  return { items: Object.keys(I).map(k => ({ tag:k, w:+decayed(I[k], t).toFixed(2) })).sort((a,b) => b.w - a.w).slice(0, 30) };
});
route('DELETE', '/me/interests', 1, (q, b, u) => { u.interests = {}; u.seen = []; u.hidden = []; touch(); return { ok:true }; });

function send(res, code, obj) {
  res.writeHead(code, { 'content-type':'application/json; charset=utf-8', 'access-control-allow-origin':'*',
    'access-control-allow-headers':'content-type, authorization', 'access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS' });
  res.end(JSON.stringify(obj));
}
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, 'http://x'), q = Object.fromEntries(url.searchParams);
  const rt = routes.find(r => r.m === req.method && r.re.test(url.pathname));
  if (!rt) return send(res, 404, { error:'Не найдено' });
  let size = 0, chunks = [];
  req.on('data', c => { size += c.length; if (size > 20e6) { send(res, 413, { error:'Слишком большой запрос (фото)' }); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    try {
      let b = {}; if (chunks.length) { try { b = JSON.parse(Buffer.concat(chunks).toString()); } catch { need(400, 'Неверный JSON'); } }
      const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, ''); req.token = tok;
      const s = db.sessions[tok], u = s && db.users[s.userId];
      if (rt.auth && !u) need(401, 'Требуется вход');
      send(res, 200, rt.h(q, b, u, req, url.pathname.match(rt.re).groups || {}));
    } catch (e) { if (!(e instanceof E)) console.error(e); send(res, e.code || 500, { error: e.message || 'Ошибка сервера' }); }
  });
}).listen(PORT, '0.0.0.0', () => console.log(`Сервер: http://0.0.0.0:${PORT}` + (PUB ? `  публичный: ${PUB}` : '')));

// чистка просроченных кодов входа
setInterval(() => { for (const c in db.codes) if (now() - db.codes[c].createdAt > 600e3) { delete db.codes[c]; touch(); } }, 60e3);
botLoop();
