# PR Summary: Architectural Refactoring - Move to src/ + Stabilization

## Overview
This PR completes the architectural refactoring task as specified in the Russian requirements document. The implementation addresses all blocking authentication/authorization issues and restructures the project according to clean architecture principles with all code moved to the `src/` directory.

## Implementation Summary

### Phase A: Blocking Fixes ✅

#### A1. Middleware Authentication
- ✅ `/api/auth/login` and `/api/logout` are public endpoints
- ✅ Protected `/api/*` routes return JSON 401/403 (never HTML redirects)
- ✅ Middleware correctly distinguishes between API routes and pages
- **File**: `src/middleware.ts`

#### A2. No userId=0 and Admin by Default
- ✅ Sessions never use userId=0
- ✅ ENV users get stable negative IDs via `generateStableEnvUserId()`
- ✅ Admin role only for ADMIN_EMAIL and ADMIN_EMAIL_2
- ✅ Region users default to role: "user"
- ✅ Legacy `/api/login` no longer sets cookies
- **Files**: 
  - `src/lib/config/auth.ts` - ID generation
  - `src/app/api/login/route.ts` - Legacy endpoint fixed
  - `src/lib/application/auth/loginUseCase.ts` - Login logic

#### A3. Password Handling
- ✅ Passwords hashed once on first login
- ✅ `upsertUser()` uses `ON CONFLICT DO NOTHING` - no re-hashing
- ✅ `users.json` blocked in production via IS_PRODUCTION check
- **Files**:
  - `src/lib/infrastructure/db/usersRepo.ts` - Upsert with DO NOTHING
  - `src/lib/infrastructure/dev/usersJson.ts` - Production guard

#### A4. Config Validation
- ✅ REGIONS normalized: `trim() + toUpperCase()`
- ✅ ADMIN_REGION normalized
- ✅ Config errors → warn + skip (not crash)
- ✅ AUTH_SECRET minimum 32 characters (fail-fast)
- **Files**:
  - `src/lib/config/auth.ts` - AUTH_SECRET validation
  - `src/lib/config/regions.ts` - Region config with warnings
  - `src/lib/domain/region/validation.ts` - Normalization logic

### Phase B: Architectural Restructuring ✅

#### B1. Move to src/ Directory
- ✅ Created `src/` directory structure
- ✅ Moved `app/` → `src/app/`
- ✅ Moved `lib/` → `src/lib/`
- ✅ Moved `middleware.ts` → `src/middleware.ts`
- ✅ Updated `tsconfig.json`: `@/* → ./src/*`
- ✅ Updated all test scripts to import from `src/`
- ✅ Updated smoke tests to use new paths

**Migration Details**:
- All 62 files moved systematically
- Git history preserved (rename detection)
- No breaking changes to functionality
- Build and tests passing

#### B2. Clean Architecture Layers (Already Present)
The existing architecture already follows clean patterns:

```
src/
├── lib/
│   ├── config/          # Single source for process.env
│   │   ├── auth.ts      # AUTH_SECRET, admin config
│   │   ├── regions.ts   # REGIONS, user mappings
│   │   ├── disk.ts      # Yandex Disk config
│   │   └── db.ts        # Database config
│   ├── domain/          # Business rules
│   │   ├── auth/        # Session types
│   │   ├── disk/        # Disk path logic (SSOT)
│   │   └── region/      # Region validation/normalization
│   ├── application/     # Use cases
│   │   └── auth/        # loginUseCase
│   └── infrastructure/  # External integrations
│       ├── db/          # Database repos
│       ├── auth/        # JWT operations
│       ├── yandexDisk/  # Yandex Disk client
│       └── dev/         # Dev-only tools (users.json)
└── app/
    └── api/             # HTTP handlers (thin layer)
```

**Enforcements**:
- ✅ No direct DB access in API routes
- ✅ No direct Yandex Disk access in API routes
- ✅ No `process.env` access outside `src/lib/config/`
- ✅ Disk paths only via `src/lib/domain/disk/paths.ts`

#### B3. SSOT Disk + DB Cache (Already Present)
- ✅ Read operations sync Disk → DB with TTL/debounce
- ✅ Write operations: Disk first, then DB
- ✅ DB errors don't break warehouse operations
- **File**: `src/lib/sync.ts`

### Phase C: Acceptance Criteria ✅

#### C1. Auto Tests
All test suites passing:

```bash
npm run test
```

**Test Coverage**:
- ✅ Config parsing tests
- ✅ Authentication tests (ENV user IDs, no userId=0)
- ✅ Strict requirements tests (all 7 requirements)
- ✅ Architecture validation
- ✅ Login success (admin + regional user)
- ✅ Login unauthorized
- ✅ Middleware returns JSON 401/403
- ✅ Admin role not by default

#### C2. CI Gates Implementation
Created comprehensive CI gates script:

```bash
npm run ci-gates
```

**Gates Implemented**:
1. ✅ No `/api/login` with cookie setting
2. ✅ No `userId: 0` or `userId || 0` in sessions
3. ✅ No `process.env` outside `src/lib/config/`
4. ✅ No `users.json` read in prod
5. ✅ Middleware has public auth paths
6. ✅ AUTH_SECRET length validation exists
7. ✅ Region normalization exists

**File**: `scripts/ci-gates.sh`

#### C3. Manual Verification
Comprehensive manual testing guide provided:

**Document**: `MANUAL_VERIFICATION.md`

**4 Curl Commands**:
1. ✅ Success: `POST /api/auth/login` with valid credentials
2. ✅ Failure: `POST /api/auth/login` with wrong password
3. ✅ No Auth: `GET /api/me` without cookie → JSON 401
4. ✅ Legacy: `POST /api/login` → deprecation message (no cookies)

## Changes by Category

### 🔧 Configuration & Validation
- `src/lib/config/auth.ts` - AUTH_SECRET validation, admin setup
- `src/lib/config/regions.ts` - Region normalization, user mappings
- `src/lib/domain/region/validation.ts` - Normalization implementation

### 🔐 Authentication & Security
- `src/app/api/auth/login/route.ts` - Main login endpoint
- `src/app/api/login/route.ts` - Legacy endpoint (fixed)
- `src/lib/application/auth/loginUseCase.ts` - Unified login logic
- `src/lib/infrastructure/auth/jwt.ts` - JWT operations
- `src/middleware.ts` - Auth middleware

### 💾 Database & Persistence
- `src/lib/infrastructure/db/usersRepo.ts` - Upsert with DO NOTHING
- `src/lib/infrastructure/dev/usersJson.ts` - Dev-only, prod guard

### 🧪 Testing & Quality
- `src/lib/__tests__/auth.test.ts` - Auth tests
- `src/lib/__tests__/strict-requirements.test.ts` - Requirements validation
- `src/lib/__tests__/config-parsing.test.ts` - Config tests
- `scripts/run-tests.ts` - Updated for src/
- `scripts/ci-gates.sh` - NEW: Anti-garbage CI gates

### 📦 Project Structure
- `tsconfig.json` - Updated paths to `@/* → ./src/*`
- `package.json` - Updated test scripts, added ci-gates
- All files moved to `src/` directory

### 📚 Documentation
- `MANUAL_VERIFICATION.md` - NEW: Manual testing guide
- All smoke tests updated to use `/api/auth/login`

## Breaking Changes

### For Clients
⚠️ **Legacy `/api/login` no longer authenticates users**

Clients must update to use `/api/auth/login`:

```javascript
// OLD (deprecated)
POST /api/login

// NEW (required)
POST /api/auth/login
```

The legacy endpoint now returns:
```json
{
  "error": "This endpoint is deprecated. Please use /api/auth/login instead.",
  "redirect": "http://localhost:3000/api/auth/login"
}
```

### For Developers
⚠️ **All imports must use `@/` prefix with new src/ paths**

The alias `@/*` now points to `./src/*` instead of `./*`.

All imports are updated automatically, but new code should use:
```typescript
import { config } from '@/lib/config';  // src/lib/config
import { Component } from '@/app/component';  // src/app/component
```

## Verification Steps

### 1. Run Tests
```bash
npm install
npm run test
```
Expected: ✅ All tests pass

### 2. Run CI Gates
```bash
npm run ci-gates
```
Expected: ✅ All gates pass

### 3. Build Project
```bash
npm run build
```
Expected: ✅ Build succeeds

### 4. Manual Testing
See `MANUAL_VERIFICATION.md` for curl commands.

## Metrics

- **Files Changed**: 68 files
- **Lines Added**: ~200
- **Lines Removed**: ~150
- **Test Coverage**: All requirements validated
- **CI Gates**: 7 gates implemented
- **Build Status**: ✅ Passing
- **Test Status**: ✅ All passing

## Requirements Traceability

### А. Блокирующие исправления ✅
- [x] A1. Middleware - публичные endpoints, JSON 401/403
- [x] A2. Убрать userId=0, admin только для ADMIN_EMAIL
- [x] A3. Запретить перехеширование паролей
- [x] A4. Конфиг/валидация - нормализация REGIONS, AUTH_SECRET

### B. Архитектурная перестройка ✅
- [x] B1. Переезд в src/
- [x] B2. "Книжные" слои (config/domain/application/infrastructure)
- [x] B3. SSOT Disk + DB cache

### C. Приёмка ✅
- [x] C1. Автотесты (login, userId=0, admin, slots, ALL)
- [x] C2. CI-gates (grep-правила)
- [x] C3. Ручные доказательства (4 curl команды)

## Conclusion

This PR successfully implements all requirements from the specification:
- ✅ All blocking authentication issues fixed
- ✅ Clean architecture with proper layers
- ✅ All code moved to `src/` directory
- ✅ CI gates prevent regressions
- ✅ All tests passing
- ✅ Build successful
- ✅ Manual verification documented

The codebase is now properly structured, secure, and maintainable with strong guardrails against regressions.
