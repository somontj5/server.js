// Слой 3: ИИ-разметка объявлений вне сервера — запускается из GitHub Actions после публикации.
// Берём объявления, где остались «неизвестные» слова, спрашиваем Gemini (бесплатный тариф,
// flash-lite), теги принимаем ТОЛЬКО из разрешённого списка (tags.json + теги формы).
// Результат складываем в data/ai-tags.json (его читает server.js) и обновляем счётчики неизвестных слов.
//
// Запуск:  GEMINI_API_KEY=... node ai-worker.js            (по одному объявлению, лимит AI_LIMIT=40)
// Флаги:   AI_MODEL=gemini-3.1-flash-lite  AI_FALLBACK=gemini-3.5-flash-lite  AI_DRY=1
const fs = require('fs');
const TAGS = require('./tags.js');
const DB_FILE = process.env.DB_FILE || 'data/db.json';
const OUT_FILE = process.env.AI_OUT || 'data/ai-tags.json';
const KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.AI_MODEL || 'gemini-3.1-flash-lite';
const FALLBACK = process.env.AI_FALLBACK || 'gemini-3.5-flash-lite';
const LIMIT = Math.max(1, Math.min(+process.env.AI_LIMIT || 40, 200));
const DRY = !!process.env.AI_DRY;

TAGS.loadDict(process.env.TAGS_FILE || __dirname + '/tags.json');

const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const out = (() => { try { return JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); } catch { return {}; } })();
db.unknown = db.unknown || {};

const text = l => [l.name, l.desc, l.material, l.a && l.a.mat].filter(Boolean).join('. ');

async function ask(model, prompt) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
    { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } }) });
  const j = await r.json();
  if (!j.candidates) throw new Error((j.error && j.error.message) || 'нет ответа ' + r.status);
  return JSON.parse(j.candidates[0].content.parts[0].text);
}

(async () => {
  if (!KEY && !DRY) { console.log('Нет GEMINI_API_KEY — слой 3 пропущен'); return; }
  const all = Object.values(db.listings).filter(l => !l.archived);
  const todo = all.filter(l => (l.tu || []).length && (!out[l.id] || out[l.id].v !== (l.updatedAt || l.createdAt)))
    .concat(all.filter(l => !(l.tu || []).length && !l.ai2 && (!out[l.id] || out[l.id].v !== (l.updatedAt || l.createdAt))))
    .slice(0, LIMIT);
  console.log('к разметке:', todo.length, 'модель:', MODEL);
  let ok = 0, bad = 0;
  for (const l of todo) {
    const allowed = TAGS.allowed().concat(TAGS.layer1(l)).filter((x, i, a) => a.indexOf(x) === i);
    const prompt = `Ты размечаешь объявления маркетплейса одежды (русский + таджикский, опечатки, эмодзи).`
      + ` Выбери подходящие теги ТОЛЬКО из списка, ничего не придумывай: ${JSON.stringify(allowed)}.`
      + ` Шум игнорируй: новинка, омад, ҳаст, в наличии, качество, люкс, нарх, цена, оригинал, сорт, заказ в ЛС.`
      + ` Верни JSON {"tags":[до 8 тегов из списка],"unknown":[слова из текста, которых нет в словаре, максимум 10]}.`
      + ` Не понимаешь слово — не угадывай, добавь в unknown.`
      + ` Текст: ${text(l).slice(0, 700)}`;
    try {
      let res;
      try { res = await ask(MODEL, prompt); } catch (e) { console.log('fallback', l.id, e.message); res = await ask(FALLBACK, prompt); }
      const tags = (res.tags || []).map(x => String(x).toLowerCase().trim()).filter(x => allowed.indexOf(x) >= 0).slice(0, 8);
      const unknown = (res.unknown || []).map(x => TAGS.norm(x).trim()).filter(x => x.length >= 3 && x.length <= 24);
      for (const w of unknown.concat(l.tu || [])) { const r = db.unknown[w] || (db.unknown[w] = { c: 0 }); r.c++; r.t = Date.now(); r.ai = 1; }
      out[l.id] = { v: l.updatedAt || l.createdAt, tags, unknown, at: Date.now(), model: MODEL };
      ok++;
      console.log('ok', l.id, JSON.stringify(tags));
    } catch (e) { bad++; console.log('fail', l.id, e.message); }
  }
  if (!DRY) {
    fs.writeFileSync(OUT_FILE, JSON.stringify(out));
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
  }
  const top = Object.entries(db.unknown).sort((a, b) => b[1].c - a[1].c).slice(0, 30);
  console.log('\nразмечено:', ok, 'ошибок:', bad);
  console.log('частые неизвестные слова:', top.map(x => x[0] + '×' + x[1].c).join(', ') || '—');
})();
