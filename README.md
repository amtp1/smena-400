# Смена 400

Тренажёр проводника ВСМ. Одна смена — три ветвящихся события с таймером, шкалами лояльности и безопасности, профилем, отметками и рейтингом бригады, депо и компании.

Смена — это прогулка по составу: рация зовёт в вагон, таймер стартует у точки инцидента. Сервер ведёт сессию по WebSocket, заново проигрывает журнал решений, начисляет очки компетенций и отдаёт API для HR и LMS. В демо только синтетические позывные: паспорта, телефоны и почта не принимаются.

## Запуск в Docker

```bash
docker compose up --build
```

Приложение: http://localhost:4000  
Спецификация API: http://localhost:4000/api/openapi.yaml

Данные лежат в томе `smena-data`.

## Локально без Docker

Нужен Node.js 22.13+ (в разработке проверялось на 24).

```bash
npm install
npm run dev:all
```

Интерфейс: http://localhost:4000  
API: http://localhost:4001  

Только интерфейс, с запасным профилем в браузере:

```bash
npm run dev
```

Проверка движка веток:

```bash
npm run check
```

## Ключ интеграции

Заголовок `X-Integration-Key`. Локально: `demo-vsm-integration`. Свой ключ задаётся переменной `INTEGRATION_KEY`.

Пример приёма состава:

```bash
curl -X POST http://localhost:4001/api/integrations/hr/roster \
  -H "content-type: application/json" \
  -H "X-Integration-Key: demo-vsm-integration" \
  -d "{\"employees\":[{\"externalId\":\"SYN-2048\",\"displayName\":\"К. Лебедев\",\"brigade\":\"Бригада 7\",\"depot\":\"Депо Санкт-Петербург\"}]}"
```

Выгрузка в LMS: `GET /api/integrations/lms/results?since=0` с тем же ключом.

## Документация

- [Архитектура](docs/architecture.md)
- [Пользовательский сценарий](docs/user-flow.md)
- [OpenAPI](docs/openapi.yaml)
