# СтеклоМаркет — тестовый сервер

Node.js 20, без зависимостей. Вход через Telegram-бота с подтверждением номера телефона. Уведомления о сообщениях, отзывах и новых объявлениях по сохранённым поискам приходят в Telegram.

## Запуск на GitHub (6 часов)
1. Создайте бота у @BotFather (`/newbot`) и скопируйте токен.
2. В репозитории откройте **Settings → Secrets and variables → Actions → New repository secret**: имя `BOT_TOKEN`, значение — токен бота.
3. Откройте **Actions → «GlassMarket test server (6h)» → Run workflow**.
4. Адрес сервера (`https://….trycloudflare.com`) появится в Summary запуска. Ещё его можно получить командой `/url` у бота.

Адрес меняется при каждом запуске. База данных сохраняется между запусками через кэш Actions.

Запуск локально: `BOT_TOKEN=... node server.js` (порт 8080).

## Вход (из приложения)
1. `POST /auth/start` → `{code, link}`. Откройте `link` и нажмите «Старт» — вход выполняется сразу (номер можно передать позже, по желанию).
2. Раз в 2 секунды вызывайте `GET /auth/check?code=…`. После подтверждения придёт `{status:"ok", token, user}`.
3. Дальше передавайте заголовок `Authorization: Bearer <token>`.

## API (JSON, 🔒 = нужен токен)
| Метод | Путь | Описание |
|---|---|---|
| GET | /listings?q=&cat=&min=&max=&sort=rec\|new\|cheap\|exp&offset=&limit= | поиск |
| GET | /listings?seller=me&archived=0\|1 🔒 | мои активные / архив |
| GET | /listings/:id | объявление целиком |
| POST/PUT | /listings, /listings/:id 🔒 | создать / изменить `{cat,name,photos[],price,desc,material,row,shopNum,shopName,contact,phone}` |
| POST | /listings/:id/archive \| restore \| rise 🔒 | в архив / вернуть / ТОП на 7 дней |
| DELETE | /listings/:id 🔒 | удалить |
| GET/POST/DELETE | /favorites, /favorites/:id 🔒 | избранное |
| POST | /listings/:id/thread 🔒 | открыть диалог с продавцом |
| GET | /threads 🔒 | список диалогов + `unread` |
| GET | /threads/:id?since=ts 🔒 | сообщения (отмечает прочитанными) |
| POST | /threads/:id/messages 🔒 | `{text, img?, voice?, dur?, re?}` — фото (data:image), голосовое (data:audio), ответ на сообщение |
| GET | /my/stats 🔒 | аналитика продавца: просмотры, избранное, диалоги по объявлениям + по дням (14 дн.) |
| GET | /users/:id/reviews | рейтинг и отзывы |
| POST | /users/:id/reviews 🔒 | `{stars,text}`, только после переписки |
| GET/POST/DELETE | /searches, /searches/:id 🔒 | сохранённые поиски (`fresh` — новые) |
| POST | /searches/:id/seen 🔒 | отметить новые просмотренными |
| GET/PUT | /me 🔒 | профиль `{name,shopName,row,shopNum}` |
| GET | /suggest?q= | подсказки поиска (популярные запросы + названия), пустой q — «часто ищут» |
| PUT/DELETE | /threads/:id/messages/:mid 🔒 | изменить `{text}` (48 ч) / удалить у всех |
| POST | /threads/:id/pin 🔒 | `{id}` закрепить, `{id:null}` открепить |
| GET | /recs?limit=&exclude=id,id | подборка «Для вас» |
| POST | /events 🔒 | `{type:'hide'\|'view'\|'fav', listingId}` — явный сигнал («не интересно» = hide) |
| GET/DELETE | /me/interests 🔒 | топ интересов (отладка) / сброс рекомендаций |

## Рекомендации (скрытые теги)
У каждого объявления сервер хранит скрытые теги (`tags`, клиенту не отдаются): слова из названия/описания, категория, ценовой диапазон, продавец, ряд. Действия пользователя (просмотр +1, поиск +2, сохр. поиск +3, избранное +4, чат +6, «не интересно» −8) увеличивают веса его интересов; веса затухают вдвое за 7 дней. Лента `sort=rec` = интерес + свежесть + ТОП + популярность + личный шум (своя лента у каждого, меняется раз в сутки). Каждая 5-я карточка — вне интересов, не больше 3 подряд из одной категории, уже просмотренное опускается ниже. Для анонимов лента общая. Приложение менять не нужно: достаточно передавать токен в `GET /listings`.

Команды бота: `/url` — адрес сервера, `/stop` — выключить уведомления, `/notify` — включить.
