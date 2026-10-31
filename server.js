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
// Таджикистан: +992 и ровно 9 цифр; ряд и магазин — только цифры
const onlyDigits = v => String(v == null ? '' : v).replace(/\D/g, '');
function tjPhone(v) { let d = onlyDigits(v); if (!d) return ''; if (d.startsWith('992')) d = d.slice(3); if (d.length !== 9) need(400, 'Номер телефона: +992 и 9 цифр'); return '+992 ' + d.slice(0,2) + ' ' + d.slice(2,5) + ' ' + d.slice(5,7) + ' ' + d.slice(7); }
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
    if (code && code.startsWith('l_')) return sendCard(chat, code.slice(2));
    return say(chat, 'Это бот входа в СтеклоМаркет.\nНажмите «Войти через Telegram» в приложении.' + (PUB ? '\n\nАдрес сервера: ' + PUB : ''));
  }
  if (text === '/url') return say(chat, PUB || 'Адрес сервера не задан');
  if (text === '/stop') { const u = Object.values(db.users).find(x => x.tgId === m.from.id); if (u) { u.mute = true; touch(); } return say(chat, '🔕 Уведомления выключены. /notify — включить.'); }
  if (text === '/notify') { const u = Object.values(db.users).find(x => x.tgId === m.from.id); if (u) { u.mute = false; touch(); } return say(chat, '🔔 Уведомления включены.'); }
}
// Карточка объявления в Telegram (ссылка «поделиться» ведёт сюда — она постоянная, в отличие от адреса туннеля)
async function sendCard(chat, id) {
  const l = db.listings[id];
  if (!l || l.archived) return say(chat, '😔 Объявление снято с публикации или удалено.');
  const s = db.users[l.sellerId] || {}, ph = l.contact && l.contact !== 'chat' ? (l.phone || s.phone || '') : '';
  const cap = `${l.name}\n💰 ${l.price || 'цена не указана'}\n📍 Ряд ${l.row}, магазин №${l.shopNum} (${l.shopName})` + (ph ? `\n📞 ${ph}` : '') + (l.desc ? `\n\n${l.desc.slice(0, 600)}` : '') + '\n\nНаписать продавцу можно в приложении СтеклоМаркет.';
  const p = l.photos[0];
  try {
    if (p && p.startsWith('http')) { const r = await tg('sendPhoto', { chat_id: chat, photo: p, caption: cap.slice(0, 1024) }); if (r.ok) return; }
    else if (p && TOKEN) {
      const m = p.match(/^data:(image\/\w+);base64,(.+)$/);
      if (m) { const f = new FormData(); f.append('chat_id', String(chat)); f.append('caption', cap.slice(0, 1024)); f.append('photo', new Blob([Buffer.from(m[2], 'base64')], { type: m[1] }), 'photo.jpg');
        const r = await (await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, { method: 'POST', body: f })).json(); if (r.ok) return; }
    }
  } catch (e) { console.error(e); }
  return say(chat, cap);
}
const shareUrl = id => BOT ? `https://t.me/${BOT}?start=l_${id}` : (PUB ? `${PUB}/l/${id}` : '');
function notify(userId, text) { const u = db.users[userId]; if (u && !u.mute) say(u.chatId, text); }

/* ================= Скрытые теги и рекомендации ================= */
// Теги объявления скрыты от клиента: слова из названия/описания (грубый стемминг),
// категория, ценовой диапазон, магазин/ряд. Интересы пользователя — веса тегов
// с затуханием (половина за 7 дней), копятся по действиям: просмотр, избранное, чат, поиск.
const STOP = new Set('для или при без под над все это как что так его она они уже еще очень новый новая новое продам продаю цена торг срочно'.split(' '));
const stem = w => w.length > 6 ? w.slice(0, w.length - 2) : w;   // «стеклянный» ≈ «стеклянная»
function words(t) { return (String(t||'').toLowerCase().replace(/ё/g,'е').match(/[a-zа-я0-9]{3,}/g) || []).filter(w => !STOP.has(w) && !/^\d+$/.test(w)).map(stem); }
// Одежда: подкатегория приложения (outer, knit, tops…) + группы синонимов, чтобы «худи» ≈ «толстовка», «кросы» ≈ «кроссовки»
const SUBS = ['outer','dress','tops','knit','pants','suits','sport','under','home','shoes','bags','acc','kids','other'];
const SYN = {
  outer:'куртк пуховик парк ветровк бомбер косух пальто плащ тренч шуб дублен жилет анорак кожанк',
  knit:'худи толстовк свитшот кофт свитер джемпер кардиган водолазк лонгслив пуловер олимпийк зипк',
  tops:'футболк майк поло рубашк блузк блуз топ туник кроп',
  pants:'джинс брюк штан шорт леггинс лосин чинос карго джоггер бридж',
  dress:'плать сарафан юбк',
  suits:'костюм пиджак жакет двойк тройк блейзер',
  sport:'спорт тренировоч рашгард велосипедк фитнес adidas nike puma',
  under:'бель трус бюстгальтер лифчик боксер носк колготк купальник плавк',
  home:'пижам халат домашн тапочк тапк',
  shoes:'кроссовк кед сникерс ботинк сапог туфл лофер босоножк сандал шлепан угг мокасин балетк крос обув берц челси',
  bags:'сумк рюкзак портфел клатч барсетк шоппер кошел бананк',
  acc:'шапк кепк бейсболк шарф перчатк варежк ремен очк панам платок бандан галстук час снуд берет'
};
const W2S = []; for (const k in SYN) for (const r of SYN[k].split(' ')) W2S.push([r, k]);
const subOf = w => { for (const [r, k] of W2S) if (w.startsWith(r) || (w.length >= 5 && r.startsWith(w))) return k; return null; };
const ATTR = { gender:1, color:1, season:1, size:1, mat:1, style:1, cond:1 };
function priceTag(p) { const n = priceNum(p); if (n == null) return null; return 'p:' + (n < 500 ? 0 : n < 2000 ? 1 : n < 10000 ? 2 : n < 50000 ? 3 : 4); }
function makeTags(l) {
  const t = new Set(['c:' + l.cat]);
  words(l.name).forEach(w => t.add('w:' + w));
  words(l.desc).slice(0, 30).forEach(w => t.add('w:' + w));
  words(l.material).forEach(w => t.add('w:' + w));
  if (l.sub) t.add('g:' + l.sub);
  for (const w of words(l.name)) { const g = subOf(w); if (g) t.add('g:' + g); }       // «Худи оверсайз» → g:knit, даже если подкатегория не указана
  const a = l.a || {}; for (const k in a) if (ATTR[k] && a[k] && a[k] !== 'Без размера') t.add('a:' + k + ':' + String(a[k]).toLowerCase());
  (l.ai || []).forEach(x => { t.add('x:' + x); words(x).forEach(w => t.add('w:' + w)); });
  if (l.aiSub) t.add('g:' + l.aiSub); if (l.aiGender) t.add('a:gender:' + l.aiGender); if (l.aiSeason) t.add('a:season:' + l.aiSeason);
  for (const w of words(l.desc).slice(0, 30)) { const g = subOf(w); if (g && !l.sub) t.add('g:' + g); }                                            // теги от Gemini (если включён)
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
    const k = { w:1, g:1.3, x:1.1, c:0.4, s:0.8, a:0.7 }[tag[0]] || 0.5; if (tag.startsWith('a:size') || tag.startsWith('a:gender')) { /* пол и размер — стабильные предпочтения */ }
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
const learnQuery = (u, s, kind) => { const ws = words(s.q); learn(u, [...ws.map(w => 'w:' + w), ...ws.map(subOf).filter(Boolean).map(g => 'g:' + g), ...(s.cat && SUBS.includes(s.cat) ? ['g:' + s.cat] : [])], kind); };
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
    if (src === main && out.length >= 3 && out.slice(-3).every(l => (l.sub||l.cat) === (out[out.length-1].sub||out[out.length-1].cat))) { const j = main.findIndex(x => (x.l.sub||x.l.cat) !== (out[out.length-1].sub||out[out.length-1].cat)); if (j >= 0) i = j; }
    out.push(src.splice(i, 1)[0].l);
  }
  return out;
}
// Gemini (необязательно, нужен GEMINI_API_KEY): 3–6 скрытых тегов стиля/назначения, напр. «оверсайз», «офис», «вечерний»
const GKEY = process.env.GEMINI_API_KEY || '';
async function aiTags(l) {
  if (!GKEY || l.aiAt) return; l.aiAt = now();
  try {
    const prompt = `Ты классификатор маркетплейса одежды. Верни JSON {"tags":[4-8 коротких тегов на русском в нижнем регистре: стиль, назначение, фасон, посадка, для кого, синонимы товара, как ищут покупатели],"sub":одно из ${SUBS.join('|')},"gender":"Женское|Мужское|Детское|Унисекс","season":"Лето|Зима|Демисезон|Всесезон"}. Название: ${l.name}. Описание: ${(l.desc||'').slice(0,400)}. Материал: ${l.material||''}`;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-2.0-flash'}:generateContent?key=${GKEY}`, { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }], generationConfig:{ responseMimeType:'application/json', temperature:0.2 } }) });
    const j = await r.json(), res = JSON.parse(j.candidates[0].content.parts[0].text), arr = Array.isArray(res) ? res : (res.tags || []);
    if (res.sub && SUBS.includes(res.sub) && !l.sub) l.aiSub = res.sub;
    l.a = l.a || {}; if (res.gender && !l.a.gender) l.aiGender = String(res.gender).toLowerCase(); if (res.season && !l.a.season) l.aiSeason = String(res.season).toLowerCase();
    if (Array.isArray(arr)) { l.ai = arr.map(x => stem(str(x, 24).toLowerCase())).filter(Boolean).slice(0, 8); l.tags = makeTags(l); touch(); }
  } catch (e) { console.error('gemini', e.message); }
}
setInterval(() => { if (GKEY) { const l = Object.values(db.listings).find(x => !x.aiAt && !x.archived); if (l) aiTags(l); } }, 5000);
// миграция: проставить теги старым объявлениям
for (const l of Object.values(db.listings)) { l.tags = makeTags(l); touch(); }   // пересчёт при старте (новые правила тегов)

/* ================= Представления ================= */
const pubUser = u => u && ({ id:u.id, name:u.name, shopName:u.shopName, row:u.row, shopNum:u.shopNum, about:u.about||'', rating: rating(u.id), ig: u.ig || '', igInfo: u.ig ? igPub(u.ig) : null, avatar: u.avatar ? '/u/' + u.id + '/avatar?v=' + (u.avTs || 0) : '' });
// ===== Instagram: плашка аккаунта продавца (публичные данные профиля, кэш 12 ч) =====
const IGC = {}; // username -> { t, d:{ name, pic, followers, following, posts, bio, verified, priv } | null }
function igNorm(v) { let s = String(v == null ? '' : v).trim(); const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i); if (m) s = m[1]; s = s.replace(/^@+/, '').toLowerCase();
  if (!s) return ''; if (!/^[a-z0-9._]{1,30}$/.test(s)) need(400, 'Instagram: латиница, цифры, точка и _ (до 30 символов)'); return s; }
function igPub(un) { const c = IGC[un]; if (!c || now() - c.t > 12 * 3600e3) igLoad(un); const d = c && c.d; if (!d) return null;
  const o = Object.assign({}, d, { pic: d.picBuf ? '/ig/' + un + '/pic' : '' }); delete o.picBuf; delete o.picType; return o; }
async function igLoad(un) {
  if (IGC[un] && IGC[un].busy) return; IGC[un] = Object.assign(IGC[un] || { t: 0, d: null }, { busy: 1 });
  const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
  let d = null;
  try { // 1) JSON-эндпоинт веб-версии
    const r = await fetch('https://i.instagram.com/api/v1/users/web_profile_info/?username=' + un, { headers: { 'x-ig-app-id': '936619743392459', 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
    if (r.ok) { const u = ((await r.json()).data || {}).user; if (u) d = { name: u.full_name || '', picUrl: u.profile_pic_url_hd || u.profile_pic_url, followers: u.edge_followed_by && u.edge_followed_by.count,
      following: u.edge_follow && u.edge_follow.count, posts: u.edge_owner_to_timeline_media && u.edge_owner_to_timeline_media.count, bio: (u.biography || '').slice(0, 160), verified: !!u.is_verified, priv: !!u.is_private }; }
  } catch {}
  if (!d) try { // 2) запасной путь: og-теги страницы профиля
    const h = await (await fetch('https://www.instagram.com/' + un + '/', { headers: { 'user-agent': 'facebookexternalhit/1.1' }, signal: AbortSignal.timeout(8000) })).text();
    const og = k => { const m = h.match(new RegExp('property="og:' + k + '" content="([^"]*)"')); return m ? m[1].replace(/&amp;/g, '&').replace(/&#064;/g, '@').replace(/&quot;/g, '"') : ''; };
    const desc = og('description'), img = og('image'); const num = re => { const m = desc.match(re); if (!m) return undefined; let x = parseFloat(m[1].replace(/,/g, '')); if (/K/i.test(m[2])) x *= 1e3; if (/M/i.test(m[2])) x *= 1e6; return Math.round(x); };
    if (img || desc) d = { name: (og('title').split(/\s*\(@/)[0] || '').trim(), picUrl: img, followers: num(/([\d.,]+)([KM]?)\s+Followers/i), following: num(/([\d.,]+)([KM]?)\s+Following/i), posts: num(/([\d.,]+)([KM]?)\s+Posts/i), bio: '', verified: false, priv: false };
  } catch {}
  if (d && d.picUrl) try { // аватар храним у себя (ссылки CDN Instagram протухают)
    const r = await fetch(d.picUrl, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
    if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); if (b.length < 600e3) { d.picBuf = b; d.picType = r.headers.get('content-type') || 'image/jpeg'; } }
  } catch {}
  if (d) delete d.picUrl;
  IGC[un] = { t: now(), d: d || (IGC[un] && IGC[un].d) || null }; // при ошибке оставляем прошлые данные
}
const meUser = u => Object.assign(pubUser(u), { phone:u.phone });
function rating(uid) { const a = db.reviews.filter(r => r.sellerId === uid); return { n:a.length, avg: a.length ? +(a.reduce((s,r)=>s+r.stars,0)/a.length).toFixed(2) : 0 }; }
const dayKey = () => new Date().toISOString().slice(0,10);
function bump(l, k) { if (!l) return; l.st = l.st || {}; const d = dayKey(); const o = l.st[d] = l.st[d] || {}; o[k] = (o[k]||0) + 1;
  const ks = Object.keys(l.st); if (ks.length > 60) { ks.sort(); delete l.st[ks[0]]; } }
function favRecount() { const c = {}; for (const u of Object.values(db.users)) for (const id of (u.favs||[])) c[id] = (c[id]||0) + 1; for (const l of Object.values(db.listings)) l.favCount = c[l.id] || 0; }
favRecount();
function listingOut(l, full) {
  const s = db.users[l.sellerId] || {};
  const o = Object.assign({}, l, { top: isTop(l), seller: pubUser(s), shareUrl: shareUrl(l.id) }); delete o.tags; delete o.st; o.favCount = l.favCount || 0; o.views = l.views || 0; delete o.ai; delete o.aiAt; delete o.aiSub; delete o.aiGender; delete o.aiSeason;
  if (!full) { o.photo = l.photos[0] || null; o.photoCount = l.photos.length; delete o.photos; delete o.desc; }
  if (!(l.contact === 'both' || l.contact === 'phone' || l.contact === 'wa' || l.contact === 'tg')) o.phone = '';
  else o.phone = l.phone || s.phone || '';
  return o;
}
const lev1 = (a, b) => { if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, e = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } } return e + (a.length - i) + (b.length - j) <= 1; };
// релевантность слова запроса к тегам объявления: точное 3, префикс 2, синоним 1.5, опечатка 1
function wordRel(tg, arr, w) {
  if (tg.has('w:' + w)) return 3;
  const p = w.slice(0, Math.max(3, Math.min(5, w.length - 1)));
  if (arr.some(x => x.startsWith('w:' + p))) return 2;
  const g = subOf(w); if (g && tg.has('g:' + g)) return 1.5;
  if (tg.has('x:' + w)) return 1.5;
  if (w.length >= 4 && arr.some(x => x[0] === 'w' && lev1(x.slice(2), w))) return 1;
  return 0;
}
function relevance(l, qs) {
  const tg = new Set(l.tags || (l.tags = makeTags(l))), arr = [...tg]; let sc = 0, miss = 0;
  for (const w of qs) { const r = wordRel(tg, arr, w); if (r) sc += r; else miss++; }
  const nm = String(l.name || '').toLowerCase().replace(/ё/g, 'е');
  if (qs.length && words(nm).slice(0, qs.length).join(' ') === qs.join(' ')) sc += 2;   // название начинается с запроса
  return miss === 0 ? sc : (qs.length >= 3 && miss === 1 && sc >= 4 ? sc / 2 : 0);    // длинный запрос: допускаем 1 несовпадение
}
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.", RU = 'йцукенгшщзхъфывапролджэячсмитьбю';
const swapLayout = q => /[a-z]/i.test(q) && !/[а-я]/i.test(q) ? String(q).toLowerCase().split('').map(c => { const i = EN.indexOf(c); return i >= 0 ? RU[i] : c; }).join('') : null;
function matches(l, s) {
  if (l.archived) return false;
  if (s.cat && s.cat !== 'all' && l.cat !== s.cat) return false;
  if (s.q) { const qs = words(s.q); if (qs.length && !relevance(l, qs)) return false; }
  const p = priceNum(l.price), a = parseFloat(s.min), b = parseFloat(s.max);
  if (!isNaN(a) || !isNaN(b)) { if (p == null) return false; if (!isNaN(a) && p < a) return false; if (!isNaN(b) && p > b) return false; }
  return true;
}
function cleanListing(b, l) {
  l = l || {};
  if (b.cat !== undefined) l.cat = CATS.includes(b.cat) ? b.cat : 'other';
  ['name','price','shopName'].forEach(k => { if (b[k] !== undefined) l[k] = str(b[k], 80); });
  if (b.row !== undefined) l.row = onlyDigits(b.row).slice(0, 4);
  if (b.shopNum !== undefined) l.shopNum = onlyDigits(b.shopNum).replace(/^0+/, '').slice(0, 4); // контейнер 1..9999
  if (b.phone !== undefined) { try { l.phone = tjPhone(b.phone); } catch { l.phone = ''; } } // старые номера (не +992) просто сбрасываем
  if (b.desc !== undefined) l.desc = str(b.desc, 1000);
  if (b.sub !== undefined) l.sub = SUBS.includes(b.sub) ? b.sub : '';
  if (b.a && typeof b.a === 'object') { l.a = {}; for (const k in b.a) if (ATTR[k]) l.a[k] = str(b.a[k], 30); }
  if (b.material !== undefined) l.material = str(b.material, 60); // материал товара (понятное название: «Хлопок», «Натуральная кожа» и т.п.)
  if (b.contact !== undefined) l.contact = ['chat','both','phone','wa','tg'].includes(b.contact) ? b.contact : 'chat';
  if (Array.isArray(b.photos)) l.photos = b.photos.filter(p => typeof p === 'string' && (p.startsWith('data:image/') || p.startsWith('http'))).slice(0, 16);
  return l;
}
function threadOut(t, uid) {
  const l = db.listings[t.listingId], last = t.messages[t.messages.length-1];
  const other = db.users[uid === t.buyerId ? t.sellerId : t.buyerId];
  return { id:t.id, listingId:t.listingId, listing: l ? { id:l.id, name:l.name, price:l.price, photo:l.photos[0]||null, archived:!!l.archived } : null,
    role: uid === t.buyerId ? 'buyer' : 'seller', other: pubUser(other), last: last ? Object.assign(shortMsg(last), { mine: last.from === uid }) : null, pin: t.pin || null,
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
route('PUT', '/me', 1, (q, b, u) => { ['name','shopName'].forEach(k => { if (b[k] !== undefined) u[k] = str(b[k], 60); });
  if (b.row !== undefined) u.row = onlyDigits(b.row).slice(0, 4); if (b.shopNum !== undefined) { const sn = onlyDigits(b.shopNum).replace(/^0+/, '').slice(0, 4); checkShop(sn, u.id, u.shopNum); u.shopNum = sn; } if (b.phone !== undefined) u.phone = tjPhone(b.phone); if (b.about !== undefined) u.about = str(b.about, 200); if (b.ig !== undefined) { u.ig = igNorm(b.ig); if (u.ig) igLoad(u.ig); } if (b.avatar !== undefined) { if (!b.avatar) { delete u.avatar; } else { if (!/^data:image\/(jpeg|png|webp);base64,/.test(b.avatar) || b.avatar.length > 400e3) need(400, 'Фото слишком большое'); u.avatar = b.avatar; u.avTs = now(); } } touch(); return meUser(u); });
route('GET', '/ig/:name', 0, async (q, b, u, r, p) => { const un = igNorm(p.name); if (!un) need(400, 'Пустой ник'); if (!IGC[un] || !IGC[un].d) await igLoad(un); return { ig: un, igInfo: igPub(un) }; });
route('GET', '/users/:id', 0, (q, b, u, r, p) => pubUser(db.users[p.id]) || need(404, 'Нет пользователя'));

// --- Объявления ---
route('GET', '/listings', 0, (q, b, u) => {
  let arr = Object.values(db.listings);
  if (q.seller) { arr = arr.filter(l => l.sellerId === (q.seller === 'me' && u ? u.id : q.seller)); if (q.archived !== undefined) arr = arr.filter(l => !!l.archived === (q.archived === '1')); else if (!(u && q.seller === 'me')) arr = arr.filter(l => !l.archived); }
  else { let qq = q, all = arr; arr = all.filter(l => matches(l, qq));
    if (!arr.length && q.q) { const sw = swapLayout(q.q); if (sw) { qq = Object.assign({}, q, { q: sw }); arr = all.filter(l => matches(l, qq)); if (arr.length) var fixedQ = sw; } }
    if (q.q && !+q.offset) { const k = String(qq.q).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50); if (k && arr.length) { db.qlog = db.qlog || {}; db.qlog[k] = (db.qlog[k] || 0) + 1; } if (u) learnQuery(u, qq, 'search'); }
    if (qq.q && (q.sort || 'rec') === 'rec') { const qs = words(qq.q), rec = recommend(arr, u), pos = new Map(rec.map((l, i) => [l.id, i]));
      arr = rec.map(l => [l, relevance(l, qs) * 2 - pos.get(l.id) / Math.max(10, rec.length) * 3]).sort((a, b) => b[1] - a[1]).map(x => x[0]); var ranked = 1; } }
  const s = q.sort || 'rec';
  if (s === 'new') arr.sort((a,b) => b.createdAt - a.createdAt);
  else if (s === 'cheap') arr.sort((a,b) => (priceNum(a.price) ?? 1e15) - (priceNum(b.price) ?? 1e15));
  else if (s === 'exp') arr.sort((a,b) => (priceNum(b.price) ?? -1) - (priceNum(a.price) ?? -1));
  else if (q.seller) arr.sort((a,b) => b.createdAt - a.createdAt);
  else if (!ranked) arr = recommend(arr, u);
  const off = +q.offset || 0, lim = Math.min(+q.limit || 40, 300);
  return { total: arr.length, fixedQ: fixedQ || undefined, items: arr.slice(off, off + lim).map(l => listingOut(l)) };
});
// подсказки как в Авито/WB: популярные запросы + названия/подкатегории по префиксу
route('GET', '/suggest', 0, (q) => {
  const raw = String(q.q || '').toLowerCase().replace(/ё/g, 'е').trim().slice(0, 60); if (!raw) return { items: Object.entries(db.qlog || {}).sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]) };
  const n = swapLayout(raw) && !Object.keys(db.qlog || {}).some(k => k.startsWith(raw)) ? swapLayout(raw) : raw, cnt = {};
  const add = (p, w) => { p = p.replace(/\s+/g, ' ').trim(); if (p && p !== n && p.startsWith(n.split(' ')[0].slice(0, 2))) cnt[p] = (cnt[p] || 0) + w; };
  for (const [k, c] of Object.entries(db.qlog || {})) if (k.startsWith(n)) add(k, 3 + Math.log2(1 + c));
  const t = n.split(' '), last = t.pop(), head = t.join(' ');
  for (const l of Object.values(db.listings)) { if (l.archived) continue; const nm = String(l.name || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (nm.startsWith(n)) add(nm.split(' ').slice(0, t.length + 3).join(' '), 2);
    else for (const w of nm.split(' ')) if (w.length >= 3 && last && w.startsWith(last)) add((head ? head + ' ' : '') + w, 1); }
  return { items: Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || a.length - b.length).slice(0, 8), q: n !== raw ? n : undefined };
});
route('GET', '/listings/:id', 0, (q, b, u, r, p) => { const l = db.listings[p.id] || need(404, 'Объявление не найдено'); l.views = (l.views||0) + 1; bump(l, 'v'); learnListing(u, l, 'view'); touch(); return listingOut(l, true); });
// Контейнер (магазин №): 1..9999, один номер — один продавец
function shopOwner(num, exceptId) {
  if (!num) return null;
  for (const x of Object.values(db.users)) if (x.id !== exceptId && x.shopNum === num) return x;
  for (const x of Object.values(db.listings)) if (x.sellerId !== exceptId && !x.archived && x.shopNum === num) return db.users[x.sellerId] || { id: x.sellerId };
  return null;
}
function checkShop(num, uid, cur) {
  if (!num || num === cur) return; // свой текущий номер не проверяем (старые данные)
  const n = +num; if (!(n >= 1 && n <= 9999)) need(400, 'Номер контейнера: от 1 до 9999');
  if (shopOwner(num, uid)) need(409, `Контейнер №${num} уже занят другим продавцом`);
}
function fillAddr(b, u) { // адрес продавца, указанный один раз, подставляется автоматически
  for (const k of ['row', 'shopNum', 'shopName']) if (!String(b[k] == null ? '' : b[k]).trim() && u[k]) b[k] = u[k];
  if (!String(b.phone || '').trim() && u.phone) b.phone = u.phone;
}
function saveAddr(u, l) { u.shopName = l.shopName; u.row = l.row; u.shopNum = l.shopNum; if (l.phone && !u.phone) u.phone = l.phone; }
route('POST', '/listings', 1, (q, b, u) => {
  fillAddr(b, u);
  const l = cleanListing(b, { id: rid(5), sellerId: u.id, createdAt: now(), views:0, contact:'chat', photos:[] });
  if (!l.name || l.name.length < 3) need(400, 'Название от 3 символов');
  if (!l.cat) need(400, 'Выберите категорию');
  if (!l.photos.length) need(400, 'Добавьте фото');
  if (!l.row || !l.shopNum || !l.shopName) need(400, 'Укажите ряд, номер и название магазина');
  checkShop(l.shopNum, u.id, u.shopNum);
  l.tags = makeTags(l); db.listings[l.id] = l;
  saveAddr(u, l);
  touch();
  // уведомления по сохранённым поискам
  for (const s of Object.values(db.searches)) if (s.userId !== u.id && matches(l, s)) notify(s.userId, `🔔 Новое по вашему поиску «${s.title}»:\n${l.name} — ${l.price || 'цена не указана'}\nРяд ${l.row}, магазин №${l.shopNum}`);
  return listingOut(l, true);
});
function own(p, u) { const l = db.listings[p.id] || need(404, 'Объявление не найдено'); if (l.sellerId !== u.id) need(403, 'Это не ваше объявление'); return l; }
route('PUT', '/listings/:id', 1, (q, b, u, r, p) => { fillAddr(b, u); if (b.shopNum !== undefined) checkShop(onlyDigits(b.shopNum).replace(/^0+/, '').slice(0, 4), u.id, u.shopNum); const l = cleanListing(b, own(p, u)); saveAddr(u, l); l.updatedAt = now(); l.aiAt = 0; l.tags = makeTags(l); touch(); return listingOut(l, true); });
route('POST', '/listings/:id/archive', 1, (q, b, u, r, p) => { const l = own(p, u); l.archived = true; touch(); return listingOut(l, true); });
route('POST', '/listings/:id/restore', 1, (q, b, u, r, p) => { const l = own(p, u); l.archived = false; l.createdAt = now(); touch(); return listingOut(l, true); });
route('POST', '/listings/:id/rise', 1, (q, b, u, r, p) => { const l = own(p, u); l.boostedUntil = now() + 7*864e5; l.freeRiseUsed = true; touch(); return listingOut(l, true); });
route('DELETE', '/listings/:id', 1, (q, b, u, r, p) => { own(p, u); delete db.listings[p.id]; for (const t of Object.values(db.threads)) if (t.listingId === p.id) delete db.threads[t.id]; touch(); return { ok:true }; });

// --- Избранное ---
// аналитика продавца: просмотры, избранное, диалоги по каждому объявлению + по дням (14 дней)
route('GET', '/my/stats', 1, (q, b, u) => {
  const days = []; for (let i = 13; i >= 0; i--) days.push(new Date(Date.now() - i*864e5).toISOString().slice(0,10));
  const items = Object.values(db.listings).filter(l => l.sellerId === u.id).map(l => {
    const st = l.st || {}, chats = Object.values(db.threads).filter(t => t.listingId === l.id).length;
    return { id:l.id, name:l.name, price:l.price, photo:l.photos[0]||null, archived:!!l.archived, createdAt:l.createdAt,
      views:l.views||0, favCount:l.favCount||0, chats, daily: days.map(d => ({ d, v:(st[d]||{}).v||0, f:(st[d]||{}).f||0, c:(st[d]||{}).c||0 })) };
  }).sort((a,b) => b.views - a.views);
  const sum = k => items.reduce((s,x) => s + x[k], 0);
  return { days, total: { views:sum('views'), favs:sum('favCount'), chats:sum('chats'), listings:items.length }, items };
});
route('GET', '/favorites', 1, (q, b, u) => ({ items: (u.favs||[]).map(id => db.listings[id]).filter(Boolean).map(l => listingOut(l)) }));
route('POST', '/favorites/:id', 1, (q, b, u, r, p) => { u.favs = u.favs || []; if (!u.favs.includes(p.id)) { u.favs.push(p.id); const fl = db.listings[p.id]; if (fl) { fl.favCount = (fl.favCount||0) + 1; bump(fl, 'f'); } learnListing(u, db.listings[p.id], 'fav'); } touch(); return { ok:true, favs:u.favs }; });
route('DELETE', '/favorites/:id', 1, (q, b, u, r, p) => { if ((u.favs||[]).includes(p.id)) { learnListing(u, db.listings[p.id], 'unfav'); const fl = db.listings[p.id]; if (fl) fl.favCount = Math.max(0, (fl.favCount||0) - 1); } u.favs = (u.favs||[]).filter(x => x !== p.id); touch(); return { ok:true, favs:u.favs }; });

// --- Сообщения ---
route('GET', '/threads', 1, (q, b, u) => {
  const a = Object.values(db.threads).filter(t => (t.buyerId === u.id || t.sellerId === u.id) && t.messages.length).map(t => threadOut(t, u.id)).sort((x,y) => y.updatedAt - x.updatedAt);
  return { unread: a.reduce((s,t) => s + t.unread, 0), items: a };
});
route('POST', '/listings/:id/thread', 1, (q, b, u, r, p) => {   // открыть/создать диалог покупателя
  const l = db.listings[p.id] || need(404, 'Объявление не найдено');
  if (l.sellerId === u.id) need(400, 'Это ваше объявление');
  const tid = l.id + '_' + u.id;
  if (!db.threads[tid]) { learnListing(u, l, 'chat'); bump(l, 'c'); }
  if (!db.threads[tid]) { db.threads[tid] = { id: tid, listingId: l.id, buyerId: u.id, sellerId: l.sellerId, messages: [], uB:0, uS:0, createdAt: now() }; touch(); }
  return threadOut(db.threads[tid], u.id);
});
function myThread(p, u) { const t = db.threads[p.id] || need(404, 'Диалог не найден'); if (t.buyerId !== u.id && t.sellerId !== u.id) need(403, 'Нет доступа'); return t; }
// сообщение для клиента: фото/голосовые, ответ, правка, удаление, закреп, прочтение
const msgOut = (m, uid) => ({ id:m.id, text:m.del ? '' : m.text, t:m.t, u:m.u || m.t, lid:m.lid, mine: m.from === uid, img: m.del ? undefined : m.img, voice: m.del ? undefined : m.voice, dur: m.dur, re: m.re && { id:m.re.id, text:m.re.text, mine: m.re.mine === uid }, ed: m.ed ? 1 : undefined, del: m.del ? 1 : undefined });
const shortMsg = m => m && Object.assign({}, m, { re: undefined, img: m.img ? 1 : undefined, voice: m.voice ? 1 : undefined, text: m.del ? 'Сообщение удалено' : (m.text || (m.img ? '📷 Фото' : m.voice ? '🎤 Голосовое' : '')) });
route('GET', '/threads/:id', 1, (q, b, u, r, p) => {
  const t = myThread(p, u), me = u.id === t.buyerId; if (me) { t.uB = 0; t.rB = now(); } else { t.uS = 0; t.rS = now(); } touch();
  const since = +q.since || 0;
  return Object.assign(threadOut(t, u.id), { pin: t.pin || null, otherRead: (me ? t.rS : t.rB) || 0,
    messages: t.messages.filter(m => m.t > since || (m.u || 0) > since).map(m => msgOut(m, u.id)) });
});
const MEDIA = (v, re, max) => typeof v === 'string' && re.test(v) && v.length <= max ? v : '';
route('POST', '/threads/:id/messages', 1, (q, b, u, r, p) => {
  const t = myThread(p, u), text = str(b.text, 2000), img = MEDIA(b.img, /^data:image\/(jpeg|png|webp);base64,/, 900e3), voice = MEDIA(b.voice, /^data:audio\/[\w.+-]+(;codecs=[\w]+)?;base64,/, 1.5e6);
  if (!text && !img && !voice) need(400, 'Пустое сообщение');
  const m = { id: rid(4), from: u.id, text, t: now() }; if (b.listingId && db.listings[b.listingId]) m.lid = String(b.listingId);
  if (img) m.img = img; if (voice) { m.voice = voice; m.dur = Math.min(600, Math.max(0, +b.dur || 0)); }
  if (b.re) { const o = t.messages.find(x => x.id === b.re); if (o) m.re = { id:o.id, text: o.del ? 'Сообщение удалено' : str(o.text || (o.img ? '📷 Фото' : o.voice ? '🎤 Голосовое' : ''), 120), mine: o.from }; }
  t.messages.push(m); if (t.messages.length > 3000) t.messages.splice(0, t.messages.length - 3000);
  const toBuyer = u.id === t.sellerId; if (toBuyer) t.uB++; else t.uS++; touch();
  const l = db.listings[t.listingId] || {};
  notify(toBuyer ? t.buyerId : t.sellerId, `💬 ${u.name || 'Пользователь'}${l.name ? ' · «' + l.name + '»' : ''}\n${text || (img ? '📷 Фото' : '🎤 Голосовое сообщение')}`);
  return msgOut(m, u.id);
});
function myMsg(t, id, u, own) { const m = t.messages.find(x => x.id === id) || need(404, 'Сообщение не найдено'); if (own && m.from !== u.id) need(403, 'Можно менять только свои сообщения'); return m; }
route('PUT', '/threads/:id/messages/:mid', 1, (q, b, u, r, p) => {   // редактировать (48 часов)
  const t = myThread(p, u), m = myMsg(t, p.mid, u, 1), text = str(b.text, 2000); if (!text || m.del) need(400, 'Пустое сообщение');
  if (now() - m.t > 48 * 36e5) need(400, 'Изменить можно в течение 48 часов'); m.text = text; m.ed = 1; m.u = now(); touch(); return msgOut(m, u.id);
});
route('DELETE', '/threads/:id/messages/:mid', 1, (q, b, u, r, p) => {  // удалить у всех
  const t = myThread(p, u), m = myMsg(t, p.mid, u, 1); m.del = 1; m.text = ''; delete m.img; delete m.voice; m.u = now();
  if (t.pin && t.pin.id === m.id) t.pin = null; touch(); return msgOut(m, u.id);
});
route('POST', '/threads/:id/pin', 1, (q, b, u, r, p) => {            // закрепить / открепить (b.id = null)
  const t = myThread(p, u); if (!b.id) t.pin = null; else { const m = myMsg(t, b.id, u); t.pin = { id:m.id, text: m.text || (m.img ? '📷 Фото' : m.voice ? '🎤 Голосовое' : ''), t: now() }; }
  const last = t.messages[t.messages.length - 1]; if (last) last.u = now(); touch(); return { pin: t.pin };
});

// --- Новые входящие сообщения для системных уведомлений Android (фоновая служба приложения) ---
route('GET', '/updates', 1, (q, b, u) => {
  const since = +q.since || 0, items = [];
  for (const t of Object.values(db.threads)) {
    if (t.buyerId !== u.id && t.sellerId !== u.id) continue;
    const ms = t.messages.filter(m => m.t > since && m.from !== u.id);
    if (!ms.length) continue;
    const o = db.users[ms[ms.length-1].from] || {}, l = db.listings[t.listingId] || {};
    items.push({ tid: t.id, name: o.shopName || o.name || 'Пользователь', item: l.name || '', messages: ms.slice(-5).map(m => m.del ? 'Сообщение удалено' : m.text || (m.img ? '📷 Фото' : m.voice ? '🎤 Голосовое' : m.lid ? 'Объявление' : 'Сообщение')) });
  }
  return { now: now(), items };
});

// --- Контакты и личные чаты (без объявления) ---
route('GET', '/contacts', 1, (q, b, u) => {
  const seen = {}, items = [];
  Object.values(db.threads).sort((x,y) => (y.messages.length ? y.messages[y.messages.length-1].t : y.createdAt) - (x.messages.length ? x.messages[x.messages.length-1].t : x.createdAt)).forEach(t => {
    if (t.buyerId !== u.id && t.sellerId !== u.id) return;
    const oid = t.buyerId === u.id ? t.sellerId : t.buyerId;
    if (!oid || oid === u.id || seen[oid] || !db.users[oid]) return; seen[oid] = 1; items.push(pubUser(db.users[oid]));
  });
  return { items };
});
route('GET', '/contacts/find', 1, (q, b, u) => {
  const d = onlyDigits(q.phone).slice(-9); if (d.length < 9) need(400, 'Введите номер полностью: +992 и 9 цифр');
  const f = Object.values(db.users).find(x => x.id !== u.id && onlyDigits(x.phone).slice(-9) === d);
  return f ? pubUser(f) : need(404, 'Пользователь с таким номером не найден');
});
route('POST', '/users/:id/thread', 1, (q, b, u, r, p) => {
  const o = db.users[p.id] || need(404, 'Нет пользователя'); if (o.id === u.id) need(400, 'Это вы');
  const tid = 'd_' + [u.id, o.id].sort().join('_');
  if (!db.threads[tid]) { db.threads[tid] = { id: tid, listingId: null, buyerId: u.id, sellerId: o.id, messages: [], uB:0, uS:0, createdAt: now() }; touch(); }
  return threadOut(db.threads[tid], u.id);
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

// --- Поделиться ---
route('GET', '/listings/:id/share', 0, (q, b, u, r, p) => {
  const l = db.listings[p.id] || need(404, 'Объявление не найдено');
  const url = shareUrl(l.id);
  return { url, text: `${l.name} — ${l.price || 'цена не указана'}\nРяд ${l.row}, магазин №${l.shopNum} (${l.shopName})` + (url ? `\n${url}` : '') };
});

// --- Рекомендации ---
// Явные сигналы из приложения (необязательно): {type:'hide'|'view'|'fav', listingId}
route('POST', '/events', 1, (q, b, u) => {
  if (b.type === 'search') { learnQuery(u, { q: str(b.q, 80) }, 'search'); return { ok:true }; }
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
  if (res.headersSent || res.writableEnded) return;
  const body = JSON.stringify(obj), ae = (res.req && res.req.headers['accept-encoding']) || '', gz = body.length > 1024 && /gzip/.test(ae);
  const h = { 'content-type':'application/json; charset=utf-8', 'access-control-allow-origin':'*', 'cache-control':'no-store',
    'access-control-allow-headers':'content-type, authorization', 'access-control-allow-methods':'GET, POST, PUT, DELETE, OPTIONS' };
  if (gz) { h['content-encoding'] = 'gzip'; h.vary = 'accept-encoding'; }
  res.writeHead(code, h); res.end(gz ? require('zlib').gzipSync(body, { level: 4 }) : body);
}
process.on('uncaughtException', e => console.error('uncaught:', e));
process.on('unhandledRejection', e => console.error('unhandled:', e));
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, 'http://x'), q = Object.fromEntries(url.searchParams);
  const lm = req.method === 'GET' && url.pathname.match(/^\/l\/([\w-]+)$/);
  if (lm) {
    const l = db.listings[lm[1]], esc = v => String(v || '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[c]);
    const tgl = l && BOT ? `https://t.me/${BOT}?start=l_${l.id}` : '';
    const html = l && !l.archived ? `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${esc(l.name)}</title><meta property="og:title" content="${esc(l.name + ' — ' + (l.price||''))}"><meta property="og:description" content="${esc('Ряд ' + l.row + ', магазин №' + l.shopNum)}">
<body style="font-family:sans-serif;max-width:520px;margin:auto;padding:12px">${l.photos[0] ? `<img src="/l/${esc(l.id)}/photo" style="width:100%;border-radius:12px">` : ''}<h2>${esc(l.name)}</h2><h3>${esc(l.price || 'цена не указана')}</h3><p>📍 Ряд ${esc(l.row)}, магазин №${esc(l.shopNum)} (${esc(l.shopName)})</p>${l.material ? `<p>🧵 Материал: ${esc(l.material)}</p>` : ''}<p style="white-space:pre-wrap">${esc(l.desc)}</p>${tgl ? `<a href="${tgl}" style="display:block;text-align:center;background:#2aabee;color:#fff;padding:14px;border-radius:12px;text-decoration:none">Открыть в Telegram</a>` : ''}</body>`
      : '<!doctype html><meta charset=utf-8><h3 style="font-family:sans-serif">Объявление снято с публикации</h3>';
    res.writeHead(l ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' }); return res.end(html);
  }
  const pm = req.method === 'GET' && url.pathname.match(/^\/l\/([\w-]+)\/photo$/);
  if (pm) { const l = db.listings[pm[1]], ph = l && l.photos[0], m = ph && ph.match(/^data:(image\/\w+);base64,(.+)$/);
    if (m) { res.writeHead(200, { 'content-type': m[1], 'cache-control': 'max-age=86400' }); return res.end(Buffer.from(m[2], 'base64')); }
    if (ph) { res.writeHead(302, { location: ph }); return res.end(); } res.writeHead(404); return res.end(); }
  const im = req.method === 'GET' && url.pathname.match(/^\/ig\/([a-z0-9._]{1,30})\/pic$/);
  if (im) { const d = IGC[im[1]] && IGC[im[1]].d; if (d && d.picBuf) { res.writeHead(200, { 'content-type': d.picType, 'cache-control': 'max-age=43200', 'access-control-allow-origin': '*' }); return res.end(d.picBuf); } res.writeHead(404); return res.end(); }
  const am = req.method === 'GET' && url.pathname.match(/^\/u\/([\w-]+)\/avatar$/);
  if (am) { const au = db.users[am[1]], m = au && au.avatar && au.avatar.match(/^data:(image\/\w+);base64,(.+)$/);
    if (m) { res.writeHead(200, { 'content-type': m[1], 'cache-control': 'max-age=86400', 'access-control-allow-origin': '*' }); return res.end(Buffer.from(m[2], 'base64')); } res.writeHead(404); return res.end(); }
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
      const out = rt.h(q, b, u, req, url.pathname.match(rt.re).groups || {});
      if (out && typeof out.then === 'function') return out.then(v => send(res, 200, v), e => { if (!(e instanceof E)) console.error(e); send(res, e.code || 500, { error: e.message || 'Ошибка сервера' }); });
      send(res, 200, out);
    } catch (e) { if (!(e instanceof E)) console.error(e); send(res, e.code || 500, { error: e.message || 'Ошибка сервера' }); }
  });
}).listen(PORT, '0.0.0.0', () => console.log(`Сервер: http://0.0.0.0:${PORT}` + (PUB ? `  публичный: ${PUB}` : '')));

// чистка просроченных кодов входа
setInterval(() => { for (const c in db.codes) if (now() - db.codes[c].createdAt > 600e3) { delete db.codes[c]; touch(); } }, 60e3);
botLoop();
