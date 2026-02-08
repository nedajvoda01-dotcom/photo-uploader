# Инструкция по доступу к Vercel и выполнению тестов

## Текущая ситуация

Я не могу напрямую получить доступ к:
1. ❌ Vercel deployment logs (firewall блокирует API)
2. ❌ GitHub Check Runs UI (нет браузера)
3. ❌ Preview deployment для запуска тестов
4. ❌ Выполнения browser-based тестов

## Что нужно сделать вручную

### 1. Получить ошибку из Vercel (если есть)

**Шаги:**
1. Открыть: https://github.com/nedajvoda01-dotcom/photo-uploader/pull/21
2. Прокрутить вниз до секции "Checks"
3. Найти "Vercel" deployment check
4. Нажать "Details"
5. В логах найти ПЕРВУЮ ошибку (обычно в секции Build или Runtime)
6. Скопировать 1-2 строки с ошибкой

**Пример того, что искать:**
```
Error: Cannot find module '@/lib/config'
  at Module._resolveFilename (internal/modules/cjs/loader.js:...)
```

или

```
TypeError: process.env.MAX_FILE_SIZE_MB is not defined
  at Object.<anonymous> (/vercel/path0/lib/config.ts:34:50)
```

**Записать в:** Секцию "1. Deployment Error" ниже

### 2. Получить Preview URL

**Шаги:**
1. В той же секции Checks на PR #21
2. Если деплой SUCCESS (зелёная галочка):
   - Нажать "Visit Preview" или
   - Скопировать URL из деталей
3. Если деплой FAILED:
   - Preview URL не будет доступен
   - Нужно сначала исправить ошибку деплоя

**Записать в:** Секцию "2. Preview URL" ниже

### 3. Выполнить тесты 3-8

Использовать Preview URL для запуска каждого теста.

Для каждого теста записать:
- **Endpoint** (полный URL запроса)
- **HTTP статус** (200, 404, 413, 500, и т.д.)
- **При FAIL** - кусок response body или error message

---

## Результаты (заполнить вручную)

### 1. Deployment Error

**Статус деплоя:** [FAILED / SUCCESS]

**Ошибка (если FAILED):**
```
[ВСТАВИТЬ ПЕРВЫЕ 1-2 СТРОКИ ОШИБКИ ИЗ VERCEL LOGS]
```

**Коммит, который это исправил:**
```
[ЕСЛИ БЫЛА ОШИБКА - УКАЗАТЬ COMMIT SHA ПОСЛЕ ФИКСА]
```

### 2. Preview URL

**URL:**
```
[ВСТАВИТЬ PREVIEW URL, например: https://photo-uploader-git-copilot-fix-vin-car-nedajvoda01-dotcom.vercel.app]
```

### 3. Тест 3: region=ALL VIN Access

**Описание:** Admin с region=ALL должен видеть авто из любого региона

**Процедура:**
1. Login как admin (email с region=ALL)
2. Открыть авто по VIN из региона R1
3. Открыть авто по VIN из региона R2

**Результаты:**

**Попытка 1 - VIN из региона R1:**
- Endpoint: `[PREVIEW_URL]/api/cars/vin/[VIN_HERE]`
- HTTP Status: `[ЗАПИСАТЬ]`
- Response (if FAIL): 
```
[ВСТАВИТЬ ERROR MESSAGE ИЛИ RESPONSE BODY]
```

**Попытка 2 - VIN из региона R2:**
- Endpoint: `[PREVIEW_URL]/api/cars/vin/[VIN_HERE]`
- HTTP Status: `[ЗАПИСАТЬ]`
- Response (if FAIL):
```
[ВСТАВИТЬ ERROR MESSAGE ИЛИ RESPONSE BODY]
```

**Итог теста 3:** [PASS / FAIL]

---

### 4. Тест 4: FK Constraint

**Описание:** Создание авто обычным пользователем не должно давать 500 FK error

**Процедура:**
1. Login как обычный user (НЕ admin)
2. Создать новое авто через UI или API POST /api/cars
3. Проверить статус ответа

**Результаты:**

- Endpoint: `[PREVIEW_URL]/api/cars`
- HTTP Status: `[ЗАПИСАТЬ]`
- User email: `[ЗАПИСАТЬ EMAIL ИСПОЛЬЗОВАННЫЙ]`
- User region: `[ЗАПИСАТЬ РЕГИОН]`
- Response (if FAIL):
```
[ВСТАВИТЬ ERROR MESSAGE, особенно если упоминается FK constraint]
```

**Итог теста 4:** [PASS / FAIL]

---

### 5. Тест 5: Upload Limits

**Описание:** Загрузка файлов > лимита должна возвращать 413

**Процедура:**
1. Попробовать загрузить файл > 50MB
2. Попробовать загрузить batch файлов общим размером > 200MB

**Результаты:**

**Попытка 1 - Один большой файл (>50MB):**
- Endpoint: `[PREVIEW_URL]/api/cars/[id]/upload` или `[PREVIEW_URL]/api/cars/vin/[vin]/upload`
- HTTP Status: `[ЗАПИСАТЬ]`
- File size: `[ЗАПИСАТЬ SIZE в MB]`
- Response (if not 413):
```
[ВСТАВИТЬ ERROR MESSAGE]
```

**Попытка 2 - Batch >200MB:**
- Endpoint: `[PREVIEW_URL]/api/cars/[id]/upload` или `[PREVIEW_URL]/api/cars/vin/[vin]/upload`
- HTTP Status: `[ЗАПИСАТЬ]`
- Total size: `[ЗАПИСАТЬ TOTAL SIZE в MB]`
- Number of files: `[ЗАПИСАТЬ]`
- Response (if not 413):
```
[ВСТАВИТЬ ERROR MESSAGE]
```

**Итог теста 5:** [PASS / FAIL]

---

### 6. Тест 6: Path Sanitization

**Описание:** Файлы с опасными именами должны быть нормализованы или отклонены

**Процедура:**
1. Попробовать загрузить файл с именем `../evil.jpg`
2. Попробовать загрузить файл с именем `test/file.jpg`
3. Проверить как сохраняется файл или возвращается ошибка

**Результаты:**

**Попытка 1 - Filename: `../evil.jpg`:**
- Endpoint: `[PREVIEW_URL]/api/cars/[id]/upload` или `[PREVIEW_URL]/api/cars/vin/[vin]/upload`
- HTTP Status: `[ЗАПИСАТЬ]`
- Saved as: `[ЗАПИСАТЬ РЕАЛЬНОЕ ИМЯ ФАЙЛА НА ДИСКЕ]`
- Or rejected with: 
```
[ЕСЛИ ОТКЛОНЁН - ВСТАВИТЬ ERROR]
```

**Попытка 2 - Filename: `test/file.jpg`:**
- Endpoint: `[PREVIEW_URL]/api/cars/[id]/upload` или `[PREVIEW_URL]/api/cars/vin/[vin]/upload`
- HTTP Status: `[ЗАПИСАТЬ]`
- Saved as: `[ЗАПИСАТЬ РЕАЛЬНОЕ ИМЯ]`
- Or rejected with:
```
[ЕСЛИ ОТКЛОНЁН - ВСТАВИТЬ ERROR]
```

**Итог теста 6:** [PASS / FAIL]

---

### 7. Тест 7: Upload Rollback

**Описание:** При ошибке в середине batch upload, все файлы должны откатиться

**Процедура:**
1. Создать batch с 3 валидными изображениями
2. Добавить 1 невалидный файл (например .txt или .exe)
3. Попробовать загрузить batch
4. Проверить, остались ли какие-то файлы на диске

**Результаты:**

- Endpoint: `[PREVIEW_URL]/api/cars/[id]/upload` или `[PREVIEW_URL]/api/cars/vin/[vin]/upload`
- HTTP Status: `[ЗАПИСАТЬ]`
- Valid files in batch: `[ЧИСЛО]`
- Invalid file: `[ИМЯ И ТИП]`
- Files persisted: `[YES/NO]`
- If YES, which: `[СПИСОК ФАЙЛОВ]`
- Response:
```
[ВСТАВИТЬ ERROR MESSAGE]
```

**Итог теста 7:** [PASS / FAIL]

---

### 8. Тест 8: Archive Consistency

**Описание:** При архивации, DB должна обновляться только после успешного move на диске

**Процедура:**
1. Выбрать авто для архивации
2. Заархивировать через UI или API DELETE /api/cars/vin/[vin]
3. Проверить логи на порядок операций
4. Проверить ответ API

**Результаты:**

- Endpoint: `[PREVIEW_URL]/api/cars/vin/[VIN]/route.ts` (DELETE)
- HTTP Status: `[ЗАПИСАТЬ]`
- Car VIN: `[ЗАПИСАТЬ VIN]`
- Archive successful: `[YES/NO]`
- Response:
```
[ВСТАВИТЬ RESPONSE BODY]
```

**Проверка логов (если доступны):**
```
[ВСТАВИТЬ RELEVANT LOG LINES показывающие порядок:
1. "Attempt 1/3: Moving..."
2. "Disk move successful"
3. "Marking car as deleted in DB"]
```

**Итог теста 8:** [PASS / FAIL]

---

## Итоговая таблица

| Тест | Статус | Детали |
|------|--------|--------|
| Deployment | [PASS/FAIL] | [Ошибка или "No errors"] |
| Preview URL | [AVAILABLE/NOT AVAILABLE] | [URL или причина недоступности] |
| Test 3: VIN Access | [PASS/FAIL] | [Endpoint + HTTP status] |
| Test 4: FK Constraint | [PASS/FAIL] | [Endpoint + HTTP status] |
| Test 5: Upload Limits | [PASS/FAIL] | [Endpoint + HTTP status] |
| Test 6: Path Sanitization | [PASS/FAIL] | [Endpoint + HTTP status] |
| Test 7: Upload Rollback | [PASS/FAIL] | [Endpoint + HTTP status] |
| Test 8: Archive Consistency | [PASS/FAIL] | [Endpoint + HTTP status] |

---

## Следующие шаги

1. **Заполнить все секции выше** с реальными данными из Vercel и Preview
2. **Если какой-то тест FAIL** - сообщить мне:
   - Endpoint
   - HTTP status
   - Error message
   - Я исправлю проблему
3. **Если все PASS** - обновить PR description и перевести из Draft в Ready

---

**Дата создания:** 2026-02-07
**Commit:** ef7dc27
**Branch:** copilot/fix-vin-car-card-loading
**PR:** #21
