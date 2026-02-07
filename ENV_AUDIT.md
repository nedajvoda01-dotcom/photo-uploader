# Аудит переменных окружения (ENV Audit)

## Дата аудита
7 февраля 2026

## Методология
Просканирован весь репозиторий с поиском всех обращений к `process.env.*`, анализом файла `lib/config.ts` (единый источник истины для всех ENV), и проверкой документации.

---

## 1. КРИТИЧЕСКИЕ ПЕРЕМЕННЫЕ (обязательные в продакшене)

### 1.1. AUTH_SECRET
- **Назначение**: Секретный ключ для подписи JWT токенов сессий
- **Где используется**: 
  - `lib/config.ts:7` - импорт из ENV
  - `lib/auth.ts` - для создания и верификации JWT токенов
- **Обязательность**: ОБЯЗАТЕЛЬНАЯ
- **Формат**: Строка (рекомендуется 64 hex символа)
- **Дефолт**: НЕТ (приложение падает если не задана)
- **Генерация**: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **Пример**: `4161d8b6cb61f42e56c991ee16ba6e280052ac67e2edbf11e4cd0fcd3bf470ee`

### 1.2. YANDEX_DISK_TOKEN
- **Назначение**: OAuth токен для доступа к Yandex Disk API
- **Где используется**:
  - `lib/config.ts:8` - импорт из ENV
  - `lib/yandexDisk.ts` - для всех операций с Yandex Disk (создание папок, загрузка файлов, получение ссылок)
- **Обязательность**: ОБЯЗАТЕЛЬНАЯ
- **Формат**: Строка (OAuth token от Yandex)
- **Дефолт**: НЕТ (приложение падает если не задана)
- **Получение**: https://yandex.ru/dev/disk/poligon/

### 1.3. REGIONS
- **Назначение**: Список регионов, с которыми работает система
- **Где используется**:
  - `lib/config.ts:34-38` - парсинг и валидация
  - Во всех компонентах работающих с регионами (создание машин, доступ пользователей)
- **Обязательность**: ОБЯЗАТЕЛЬНАЯ
- **Формат**: Строка, список через запятую
- **Дефолт**: НЕТ (приложение падает если не задана или пустая)
- **Пример**: `R1,R2,R3,K1,V,S1,S2` или `MSK,SPB,EKB`

---

## 2. ПОЛЬЗОВАТЕЛИ И АВТОРИЗАЦИЯ

### 2.1. Динамические REGION_<REGION>_USERS
- **Назначение**: Списки email пользователей для каждого региона
- **Где используется**:
  - `lib/config.ts:86-98` - формирование объекта REGION_USERS
  - `lib/config.ts:207-214` - функция getRegionForUser()
  - `lib/userAuth.ts` - аутентификация пользователей
- **Обязательность**: УСЛОВНО ОБЯЗАТЕЛЬНАЯ (если нужны пользователи без БД)
- **Формат**: Строка, список email через запятую (без пробелов)
- **Дефолт**: Пустой массив для каждого региона
- **Примеры переменных**:
  - `REGION_R1_USERS=user1@example.com,user2@example.com`
  - `REGION_R2_USERS=user3@example.com`
  - `REGION_K1_USERS=user5@example.com`
- **Примечание**: Для каждого региона из REGIONS автоматически читается `REGION_${region}_USERS`

### 2.2. USER_PASSWORD_MAP
- **Назначение**: Мапа паролей для пользователей из REGION_*_USERS
- **Где используется**:
  - `lib/config.ts:107-124` - парсинг и валидация
  - `lib/config.ts:142-144` - валидация что у каждого пользователя есть пароль
  - `lib/userAuth.ts:118-172` - функция checkRegionUser()
- **Обязательность**: ОБЯЗАТЕЛЬНАЯ если заданы REGION_*_USERS
- **Формат**: Строка, пары email:пароль через запятую
- **Валидация**: Пароль ОБЯЗАН быть ровно 5 цифр (проверка regex `^\d{5}$`)
- **Дефолт**: Пустой объект
- **Пример**: `user1@example.com:12345,user2@example.com:54321,user3@example.com:11111`

### 2.3. ADMIN_REGION
- **Назначение**: Регион для bootstrap admin аккаунтов
- **Где используется**:
  - `lib/config.ts:45` - импорт из ENV
  - `lib/config.ts:186` - в функции getBootstrapAdmins()
  - `lib/userAuth.ts:205` - фоллбэк для file-based auth
- **Обязательность**: Опциональная
- **Формат**: Строка (код региона или "ALL")
- **Дефолт**: "ALL" (доступ ко всем регионам)
- **Пример**: `ALL`, `R1`, `MSK`

### 2.4. ADMIN_EMAIL + ADMIN_PASSWORD (пара #1)
- **Назначение**: Bootstrap admin учетка (первая пара)
- **Где используется**:
  - `lib/config.ts:49-50` - импорт из ENV
  - `lib/config.ts:59` - валидация что есть хотя бы одна admin пара или БД
  - `lib/config.ts:180-188` - функция getBootstrapAdmins()
  - `lib/userAuth.ts:33-112` - функция checkBootstrapAdmin()
- **Обязательность**: УСЛОВНО ОБЯЗАТЕЛЬНАЯ (если нет ADMIN_PASSWORD_HASH или POSTGRES_URL)
- **Формат**: 
  - ADMIN_EMAIL: строка (email)
  - ADMIN_PASSWORD: строка (открытый пароль)
- **Дефолт**: null для обоих
- **Пример**: 
  - `ADMIN_EMAIL=admin@example.com`
  - `ADMIN_PASSWORD=SecurePassword123`

### 2.5. ADMIN_PASSWORD_HASH (альтернатива ADMIN_PASSWORD)
- **Назначение**: Bcrypt хеш пароля для admin (безопаснее чем открытый пароль)
- **Где используется**:
  - `lib/config.ts:51` - импорт из ENV
  - `lib/config.ts:59` - валидация
  - `lib/config.ts:184` - в getBootstrapAdmins()
  - `lib/userAuth.ts:91-104` - проверка bcrypt хеша
- **Обязательность**: УСЛОВНО ОБЯЗАТЕЛЬНАЯ (альтернатива ADMIN_PASSWORD)
- **Формат**: Строка (bcrypt hash)
- **Дефолт**: null
- **Генерация**: `node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('your-password', 10, (err, hash) => { console.log(hash); });"`
- **Пример**: `$2b$10$XAFke6qJqObeuIa.1kC3T.ufP4078lWsDvwLIfMCWBhdT2gAFD3Gi`
- **Важно**: В .env.local файлах нужно экранировать `$` → `\$`, в Vercel UI - без экранирования

### 2.6. ADMIN_EMAIL_2 + ADMIN_PASSWORD_2 (пара #2)
- **Назначение**: Bootstrap admin учетка (вторая опциональная пара)
- **Где используется**:
  - `lib/config.ts:54-55` - импорт из ENV
  - `lib/config.ts:60` - валидация
  - `lib/config.ts:190-198` - функция getBootstrapAdmins()
  - `lib/userAuth.ts:33-112` - функция checkBootstrapAdmin()
- **Обязательность**: Опциональная (но поддержка в коде обязательна)
- **Формат**: Аналогично паре #1
- **Дефолт**: null для обоих
- **Пример**: 
  - `ADMIN_EMAIL_2=admin2@example.com`
  - `ADMIN_PASSWORD_2=AnotherPassword456`

### 2.7. ADMIN_PASSWORD_HASH_2 (альтернатива ADMIN_PASSWORD_2)
- **Назначение**: Bcrypt хеш для второго admin
- **Где используется**: Аналогично ADMIN_PASSWORD_HASH
- **Обязательность**: Опциональная (альтернатива ADMIN_PASSWORD_2)
- **Формат**: Строка (bcrypt hash)
- **Дефолт**: null

---

## 3. КОНФИГУРАЦИЯ YANDEX DISK

### 3.1. YANDEX_DISK_BASE_DIR
- **Назначение**: Базовая директория на Yandex Disk (SSOT для построения путей)
- **Где используется**:
  - `lib/config.ts:27` - импорт из ENV
  - `lib/diskPaths.ts` - построение всех путей к папкам машин
  - Все API эндпоинты работающие с файлами
- **Обязательность**: Опциональная
- **Формат**: Строка (путь на Yandex Disk)
- **Дефолт**: "/Фото"
- **Пример**: `/Фото` или `/PhotoUploads` или `/Cars`
- **Примечание**: Все папки машин создаются как `${YANDEX_DISK_BASE_DIR}/${region}/...`

---

## 4. ЛИМИТЫ ZIP ЗАГРУЗОК (Step 3)

### 4.1. ZIP_MAX_FILES
- **Назначение**: Максимальное количество файлов в одном ZIP архиве
- **Где используется**:
  - `lib/config.ts:30` - импорт из ENV
  - `lib/config.ts:261-280` - функция validateZipLimits()
  - `app/api/cars/[id]/download/route.ts` - валидация перед созданием ZIP
  - `app/api/cars/vin/[vin]/download/route.ts` - аналогично
- **Обязательность**: Опциональная
- **Формат**: Число (строка парсится в int)
- **Дефолт**: 500
- **Пример**: `500` или `1000`

### 4.2. ZIP_MAX_TOTAL_MB
- **Назначение**: Максимальный размер ZIP архива в мегабайтах
- **Где используется**:
  - `lib/config.ts:31` - импорт из ENV
  - `lib/config.ts:261-280` - функция validateZipLimits()
  - `app/api/cars/[id]/download/route.ts` - валидация
  - `app/api/cars/vin/[vin]/download/route.ts` - аналогично
- **Обязательность**: Опциональная
- **Формат**: Число (строка парсится в int)
- **Дефолт**: 1500
- **Пример**: `1500` или `2000`

---

## 5. БАЗА ДАННЫХ (PostgreSQL в Vercel)

### 5.1. POSTGRES_URL
- **Назначение**: Connection string для подключения к Postgres (pooled)
- **Где используется**:
  - `lib/config.ts:24` - импорт из ENV
  - `lib/db.ts:14-22` - определение типа соединения
  - `@vercel/postgres` - автоматически используется библиотекой
- **Обязательность**: УСЛОВНО ОБЯЗАТЕЛЬНАЯ (для database mode)
- **Формат**: Строка (postgres connection URI)
- **Дефолт**: null
- **Пример**: `postgres://user:pass@host-pooler.region.vercel-storage.com:5432/db`
- **Примечание**: Автоматически добавляется Vercel при создании Postgres storage

### 5.2. POSTGRES_URL_NON_POOLING
- **Назначение**: Direct connection string (без пулинга, предпочтительнее)
- **Где используется**:
  - `lib/config.ts:157` - импорт из ENV
  - `lib/db.ts:11-13` - приоритетный выбор соединения
- **Обязательность**: Опциональная (но рекомендуется)
- **Формат**: Строка (postgres connection URI)
- **Дефолт**: null
- **Пример**: `postgres://user:pass@host.region.vercel-storage.com:5432/db`
- **Примечание**: Автоматически добавляется Vercel, используется в приоритете перед POSTGRES_URL

### 5.3. Дополнительные Vercel Postgres переменные
Следующие переменные автоматически добавляются Vercel, но **НЕ ИСПОЛЬЗУЮТСЯ** в коде:
- `POSTGRES_PRISMA_URL` - не используется (нет Prisma ORM)
- `POSTGRES_URL_NO_SSL` - не используется
- `POSTGRES_USER` - не используется (логин в connection string)
- `POSTGRES_HOST` - не используется (хост в connection string)
- `POSTGRES_PASSWORD` - не используется (пароль в connection string)
- `POSTGRES_DATABASE` - не используется (имя БД в connection string)

**Статус**: Можно оставить (не мешают), но код их не читает

---

## 6. LEGACY ПЕРЕМЕННЫЕ (обратная совместимость)

### 6.1. UPLOAD_DIR
- **Назначение**: Legacy директория для старого /api/upload эндпоинта
- **Где используется**:
  - `lib/config.ts:161` - импорт с пометкой "LEGACY"
  - `app/api/upload/route.ts` - старый upload эндпоинт (не SSOT)
- **Обязательность**: Опциональная
- **Формат**: Строка (путь)
- **Дефолт**: "/mvp_uploads"
- **Статус**: **DEPRECATED** - новый код должен использовать YANDEX_DISK_BASE_DIR
- **Рекомендация**: Оставить для совместимости, но не использовать в новом коде

### 6.2. UPLOAD_MAX_MB
- **Назначение**: Максимальный размер файла для загрузки (MB)
- **Где используется**:
  - `lib/config.ts:162` - импорт из ENV
  - `app/api/upload/route.ts` - legacy upload endpoint
  - Валидация размера файлов
- **Обязательность**: Опциональная
- **Формат**: Число (строка парсится в int)
- **Дефолт**: 20
- **Статус**: Используется, не устарело

---

## 7. DEBUG И СИСТЕМНЫЕ ПЕРЕМЕННЫЕ

### 7.1. AUTH_DEBUG
- **Назначение**: Включение debug логирования для аутентификации
- **Где используется**:
  - `lib/config.ts:74` - импорт из ENV (поддерживает "1" и "true")
  - `lib/auth.ts` - условное логирование в процессе авторизации
- **Обязательность**: Опциональная
- **Формат**: Строка ("1" или "true" для включения)
- **Дефолт**: false
- **Пример**: `AUTH_DEBUG=1` или `AUTH_DEBUG=true`

### 7.2. NODE_ENV
- **Назначение**: Окружение Node.js (development/production)
- **Где используется**:
  - `lib/config.ts:77` - импорт из ENV
  - `middleware.ts:36` - установка secure cookie flag
  - `lib/users.ts:18` - решение загружать ли users.json
- **Обязательность**: Автоматически устанавливается
- **Формат**: Строка ("development" или "production")
- **Дефолт**: "development"
- **Примечание**: Автоматически устанавливается Next.js и Vercel

### 7.3. NEXT_PHASE
- **Назначение**: Фаза билда Next.js (используется для пропуска валидации во время сборки)
- **Где используется**:
  - `lib/config.ts:11` - проверка `process.env.NEXT_PHASE === 'phase-production-build'`
  - Используется для отключения валидации ENV на этапе билда
- **Обязательность**: Автоматически устанавливается Next.js
- **Формат**: Строка
- **Примечание**: Внутренняя переменная Next.js, не требует настройки

---

## 8. МЕРТВЫЕ/НЕИСПОЛЬЗУЕМЫЕ ПЕРЕМЕННЫЕ

### 8.1. DEFAULT_REGION
- **Статус**: **МЕРТВАЯ ПЕРЕМЕННАЯ**
- **Где упоминается**: 
  - `DEPLOYMENT.md:62` - в документации как "required"
  - `MIGRATION.md`, `QUICKSTART.md` - в примерах
  - `lib/userAuth.ts:205` - в комментарии "Use ADMIN_REGION instead of DEFAULT_REGION"
- **Где НЕ используется**: 
  - **НЕТ** в `lib/config.ts`
  - **НЕТ** обращений `process.env.DEFAULT_REGION`
- **Вывод**: Переменная упоминается в документации, но **полностью заменена на ADMIN_REGION** в коде
- **Рекомендация**: Удалить из документации, использовать ADMIN_REGION

---

## 9. ПЕРЕМЕННЫЕ ИЗ VERCEL, КОТОРЫЕ КОД НЕ ЧИТАЕТ

По документации Vercel при добавлении Postgres storage автоматически добавляются:

**Используются кодом:**
- ✅ `POSTGRES_URL` - используется в lib/db.ts
- ✅ `POSTGRES_URL_NON_POOLING` - используется в lib/db.ts (в приоритете)

**НЕ используются кодом:**
- ❌ `POSTGRES_PRISMA_URL` - код не использует Prisma ORM
- ❌ `POSTGRES_URL_NO_SSL` - не используется
- ❌ `POSTGRES_USER` - не используется (данные в connection string)
- ❌ `POSTGRES_HOST` - не используется (данные в connection string)
- ❌ `POSTGRES_PASSWORD` - не используется (данные в connection string)
- ❌ `POSTGRES_DATABASE` - не используется (данные в connection string)

**Вывод**: Эти переменные можно оставить (Vercel их добавляет автоматически), но код их не читает. Удалять не обязательно.

---

## 10. КАНОНИЧЕСКИЙ СПИСОК ENV ДЛЯ ПРОДАКШЕНА

### 10.1. Минимальная конфигурация (без БД, только ENV users)

```bash
# === ОБЯЗАТЕЛЬНЫЕ ===
AUTH_SECRET=<64-hex-characters>
YANDEX_DISK_TOKEN=<yandex-oauth-token>
REGIONS=R1,R2,R3,K1,V,S1,S2

# === ПОЛЬЗОВАТЕЛИ (регионы) ===
REGION_R1_USERS=user1@example.com,user2@example.com
REGION_R2_USERS=user3@example.com
REGION_R3_USERS=user4@example.com
REGION_K1_USERS=user5@example.com
REGION_V_USERS=user6@example.com
REGION_S1_USERS=user7@example.com
REGION_S2_USERS=user8@example.com

USER_PASSWORD_MAP=user1@example.com:12345,user2@example.com:54321,user3@example.com:11111,user4@example.com:22222,user5@example.com:33333,user6@example.com:44444,user7@example.com:55555,user8@example.com:66666

# === ADMIN (минимум один способ) ===
ADMIN_REGION=ALL
ADMIN_EMAIL=admin@example.com
# Вариант A: открытый пароль
ADMIN_PASSWORD=SecurePassword123
# Вариант B: bcrypt hash (безопаснее)
# ADMIN_PASSWORD_HASH=$2b$10$XAFke6qJqObeuIa.1kC3T.ufP4078lWsDvwLIfMCWBhdT2gAFD3Gi

# === ОПЦИОНАЛЬНО ===
YANDEX_DISK_BASE_DIR=/Фото
ZIP_MAX_FILES=500
ZIP_MAX_TOTAL_MB=1500
UPLOAD_MAX_MB=20
```

### 10.2. Продакшен конфигурация (с Postgres)

```bash
# === ОБЯЗАТЕЛЬНЫЕ ===
AUTH_SECRET=<64-hex-characters>
YANDEX_DISK_TOKEN=<yandex-oauth-token>
REGIONS=R1,R2,R3,K1,V,S1,S2

# === DATABASE (автоматически от Vercel Postgres) ===
POSTGRES_URL=postgres://user:pass@host-pooler.region.vercel-storage.com:5432/db
POSTGRES_URL_NON_POOLING=postgres://user:pass@host.region.vercel-storage.com:5432/db

# === FALLBACK ADMIN (опционально, на случай проблем с БД) ===
ADMIN_REGION=ALL
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH=$2b$10$XAFke6qJqObeuIa.1kC3T.ufP4078lWsDvwLIfMCWBhdT2gAFD3Gi

# === ОПЦИОНАЛЬНО ===
YANDEX_DISK_BASE_DIR=/Фото
ZIP_MAX_FILES=500
ZIP_MAX_TOTAL_MB=1500
UPLOAD_MAX_MB=20
```

### 10.3. Что НЕ нужно в продакшене

```bash
# ❌ НЕ нужны:
# DEFAULT_REGION - устарело, используется ADMIN_REGION
# AUTH_DEBUG - только для dev, в prod не нужно
# NODE_ENV - автоматически устанавливается
# NEXT_PHASE - автоматически устанавливается
# UPLOAD_DIR - legacy, не нужно в новых проектах

# ❌ НЕ используются (но автоматически от Vercel):
# POSTGRES_PRISMA_URL
# POSTGRES_URL_NO_SSL  
# POSTGRES_USER
# POSTGRES_HOST
# POSTGRES_PASSWORD
# POSTGRES_DATABASE
```

---

## 11. ИТОГОВАЯ СТАТИСТИКА

### Всего переменных окружения: 25+

**По категориям:**
- Критические обязательные: 3 (AUTH_SECRET, YANDEX_DISK_TOKEN, REGIONS)
- Пользователи и авторизация: 7+ (REGION_*_USERS динамические, USER_PASSWORD_MAP, ADMIN_*)
- Yandex Disk: 1 (YANDEX_DISK_BASE_DIR)
- ZIP лимиты: 2 (ZIP_MAX_FILES, ZIP_MAX_TOTAL_MB)
- База данных: 2 используются (POSTGRES_URL, POSTGRES_URL_NON_POOLING) + 6 не используются
- Legacy: 2 (UPLOAD_DIR, UPLOAD_MAX_MB)
- Debug/System: 3 (AUTH_DEBUG, NODE_ENV, NEXT_PHASE)
- Мертвые: 1 (DEFAULT_REGION)

**По статусу:**
- ✅ Активно используются: 18-19
- ⚠️ Legacy (используются, но deprecated): 1 (UPLOAD_DIR)
- ❌ Мертвые: 1 (DEFAULT_REGION)
- ⚪ Не используются кодом: 6 (Postgres дополнительные)

---

## 12. РЕКОМЕНДАЦИИ

### 12.1. Критичные действия
1. ❌ Удалить упоминания `DEFAULT_REGION` из всей документации
2. ✅ Везде заменить на `ADMIN_REGION` в примерах
3. ⚠️ Пометить `UPLOAD_DIR` как deprecated в .env.example

### 12.2. Документация
1. Обновить DEPLOYMENT.md - убрать DEFAULT_REGION
2. Обновить MIGRATION.md - убрать DEFAULT_REGION  
3. Обновить QUICKSTART.md - убрать DEFAULT_REGION
4. Добавить этот ENV_AUDIT.md в корень проекта

### 12.3. Безопасность
1. ✅ Все критические ENV проверяются на старте (в config.ts)
2. ✅ Поддержка bcrypt хешей для паролей
3. ✅ Валидация формата паролей (5 цифр для region users)
4. ✅ Fail-fast если отсутствуют критические переменные (кроме build time)

---

## ЗАКЛЮЧЕНИЕ

**Канонический production список:** 3 обязательные + 1-7+ для пользователей + 2 для БД + 5 опциональных = **11-17 переменных**

Код хорошо структурирован, единая точка истины (`lib/config.ts`), все ENV читаются централизованно. Найдена одна мертвая переменная (DEFAULT_REGION), которую нужно удалить из документации.
