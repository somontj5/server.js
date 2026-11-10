/* ===== Автотеги объявлений: слой 1 (из формы) + слой 2 (словарь) + слой 3 (ИИ) ===== */
const fs = require('fs');
const DICT_FILE = require('path').join(__dirname, 'tags.json');
let DICT = {}, VARS = [];
const MAX = 8;

/* шумовые слова: не теги и не «неизвестные» */
const NOISE = new Set(('новинка новый новая новое новинки нав навва омад омади омадӣ ҳаст хаст'
  + ' в наличии наличии наличие качество аъло сифат люкс премиум'
  + ' нарх нархаш нархи нархн цена ценаси цены стоимость пул пули сомон сомонӣ сомони руб рублей сом рубл'
  + ' оригинал сорт заказ лс личка'
  + ' шт штук штука размер размеры размерҳо р раҳ'
  + ' акция скидка распродажа арзон арзони фурӯш фуруш фурушам фурӯшам продам продаю продажа савдо'
  + ' расонидан расондан доставка'
  + ' материал материалы материалӣ мато ткань ткани ткан'
  + ' без стандарт стандартӣ сола солаи сол зебо ширин ороиш ранг ранги хуб навӣ'
  + ' барои для ба то аз дар ва бо ин он ҳама хама'
  + ' 1ш 2ш 3ш with and the из от на по для'
).split(/\s+/).filter(Boolean));

const CAT_RU = { transport:'Транспорт', realty:'Недвижимость', electronics:'Электроника', clothes:'Одежда', home:'Дом и сад', animals:'Животные', food:'Продукты', other:'Другое',
  outer:'Верхняя одежда', knit:'Трикотаж', tops:'Топы и рубашки', pants:'Брюки', dress:'Платья', suits:'Костюмы', sport:'Спорт', under:'Бельё', shoes:'Обувь', bags:'Сумки', acc:'Аксессуары' };
const FLAGS = { '🇨🇳':'китай', '🇹🇷':'турция', '🇺🇿':'узбекистан', '🇰🇬':'киргизия', '🇰🇿':'казахстан', '🇷🇺':'россия', '🇹🇯':'таджикистан' };

/* нормализация: флаги → слова, нижний регистр, ё→е, тадж. буквы → рус., убрать эмодзи/знаки */
function norm(s) {
  s = String(s == null ? '' : s);
  for (const f in FLAGS) s = s.split(f).join(' ' + FLAGS[f] + ' ');
  s = s.toLowerCase().replace(/ё/g, 'е')
    .replace(/ӯ|ў/g, 'у').replace(/қ/g, 'к').replace(/ҳ/g, 'х').replace(/ҷ/g, 'ж').replace(/ӣ/g, 'и').replace(/ғ/g, 'г')
    .replace(/[’'`ʼ]/g, '')
    .replace(/[^a-zа-я0-9]+/g, ' ');
  return ' ' + s.replace(/\s+/g, ' ').trim() + ' ';
}
function tokens(text) { const t = norm(text).trim(); return t ? t.split(' ') : []; }

/* загрузка словаря (можно править tags.json без кода, reload без перезапуска) */
function loadDict(file) {
  DICT = JSON.parse(fs.readFileSync(file || DICT_FILE, 'utf8'));
  const seen = new Set(); VARS = [];
  for (const tag in DICT) for (const v of [tag, ...DICT[tag]]) {
    const nv = norm(v).trim().replace(/\s+/g, ' ');
    if (!nv || seen.has(nv)) continue;
    seen.add(nv); VARS.push([nv, String(tag)]);
  }
  VARS.sort((a, b) => b[0].length - a[0].length);   // длинные варианты раньше коротких
  return Object.keys(DICT).length;
}
loadDict();
const allowed = () => Object.keys(DICT);

/* слой 1: поля формы → теги (без поиска по тексту) */
function canonical(value) {
  const n = norm(value).trim();
  for (const [v, tag] of VARS) if (v === n) return tag;
  return n;
}
function layer1(l) {
  const out = [], a = l.a || {}, add = t => { if (t && !out.includes(t)) out.push(t); };
  add(CAT_RU[l.sub] || CAT_RU[l.cat]);
  const g = norm(a.gender || '').trim(), age = norm(a.age || l.ageGroup || '').trim();
  if (/дет|кудак/.test(g + ' ' + age) || l.sub === 'kids') add('детское');
  else if (/взрос/.test(age) || /муж|жен|унисекс/.test(g)) add('взрослое');
  if (g.includes('муж')) add('мужское');
  else if (g.includes('жен')) add('женское');
  else if (g.includes('унисекс')) add('унисекс');
  for (const value of [l.material, a.mat]) if (value) add(canonical(value));
  if (a.size) add('размер ' + String(a.size).toLowerCase());
  if (a.season) add(canonical(a.season));
  if (a.made) add(canonical(a.made));
  return out;
}

/* слой 2: поиск по словарю. Возвращает {tags, unknown} */
function layer2(text) {
  const toks = tokens(text), hay = toks, tags = [], unknown = [];
  const used = new Array(hay.length).fill(false);
  for (const [v, tag] of VARS) {
    const vw = v.split(' ');
    let hit = false;
    if (vw.length === 1) {
      for (let i = 0; i < hay.length; i++) {
        if (used[i]) continue;
        const t = hay[i];
        if (t === v || (v.length >= 4 && t.startsWith(v) && /^(а|и|ы|у|е|ой|ая|ый|ые|ое|ом|ов|ам|ах|ами|ча|чаи)$/.test(t.slice(v.length)))) { used[i] = true; hit = true; }
      }
    } else {
      for (let i = 0; i + vw.length <= hay.length; i++) {
        let ok = true;
        for (let k = 0; k < vw.length; k++) if (used[i + k] || hay[i + k] !== vw[k]) { ok = false; break; }
        if (!ok) continue;
        for (let k = 0; k < vw.length; k++) used[i + k] = true;
        hit = true;
      }
    }
    if (hit && tags.indexOf(tag) < 0) tags.push(tag);
  }
  for (let i = 0; i < hay.length; i++) {
    const w = hay[i];
    if (used[i] || NOISE.has(w)) continue;
    if (/^\d/.test(w)) continue;          // 170с, 46, 100 — не слова
    if (w.length < 3 || w.length > 24) continue;
    if (unknown.indexOf(w) < 0) unknown.push(w);
  }
  return { tags, unknown };
}

/* видимые теги объявления: слой1 + слой2 + ИИ, минус скрытые продавцом, max 8 */
function visible(l) {
  const t1 = layer1(l);
  const t2 = layer2((l.name || '') + ' ' + (l.desc || '') + ' ' + (l.material || '') + ' ' + (l.mtags || '')).tags;
  const hide = new Set(l.hideTags || []), out = [];
  for (const t of t1.concat(t2)) if (!hide.has(t) && out.indexOf(t) < 0) out.push(t);
  const permitted = new Set(allowed().concat(t1));
  (Array.isArray(l.ai2) ? l.ai2 : []).forEach(t => { if (permitted.has(t) && !hide.has(t) && !out.includes(t)) out.push(t); });
  return out.slice(0, MAX);
}

/* индекс объявления для поиска и «похожих»: синонимы находят друг друга */
function indexTags(l) {
  const t = new Set();
  visible(l).forEach(x => {
    t.add('k:' + x);
    tokens(x).forEach(w => { if (w.length > 2 && !NOISE.has(w)) t.add('w:' + w); });
  });
  return [...t];
}

/* текст запроса → ключи тегов словаря (чтобы «2 омад» находило «двойка») */
function queryTags(q) { return layer2(q).tags.map(t => 'k:' + t); }

module.exports = { norm, tokens, loadDict, allowed, canonical, layer1, layer2, visible, indexTags, queryTags, DICT: () => DICT, NOISE };
