# Authentication & Regions Security Fixes - CHANGELOG

## Issues Fixed

### Critical Security Issues ✅

#### 1. **Sessions with userId = 0 (CRITICAL)**
- **Problem**: Bootstrap admins and ENV users were assigned `userId: 0` in sessions
- **Impact**: 
  - All ENV users shared the same ID
  - Potential privilege escalation
  - Database foreign key constraints broken
- **Fix**: 
  - Implemented stable negative IDs for ENV users using email hash
  - Added validation to forbid sessions with `userId = 0`
  - Each ENV user now gets a unique, deterministic negative ID

#### 2. **Default Admin Role Assignment (HIGH)**
- **Problem**: File-based users automatically got `role: "admin"`
- **Impact**: Unauthorized privilege escalation
- **Fix**: 
  - ENV region users now get `role: "user"` by default
  - Only bootstrap admins (ADMIN_EMAIL) get `role: "admin"`
  - File-based users.json fallback blocked in production

#### 3. **Password Re-hashing on Every Login (MEDIUM)**
- **Problem**: Passwords were hashed on every login and DB updated
- **Impact**: 
  - Performance degradation
  - Unnecessary database writes
  - Password hashes constantly changing
- **Fix**: 
  - Hash password once in authentication check
  - `upsertUser` now checks if user exists before inserting
  - No password update on subsequent logins

#### 4. **Middleware Not Protecting /api/auth/login (MEDIUM)**
- **Problem**: Public auth endpoints not in allowlist
- **Impact**: Infinite redirect loops, unable to login
- **Fix**: Added `/api/auth/login` and `/api/logout` to public paths

#### 5. **HTML Redirects for API Routes (MEDIUM)**
- **Problem**: Middleware redirected failed `/api/*` requests to `/login`
- **Impact**: API clients received HTML instead of JSON
- **Fix**: Return JSON 401/403 for all `/api/*` routes

### Configuration & Validation Improvements ✅

#### 6. **5-Digit Password Requirement (MEDIUM)**
- **Problem**: `USER_PASSWORD_MAP` enforced exactly 5 digits
- **Impact**: Inflexible password policy, blocked normal passwords
- **Fix**: Removed digit-only requirement, allows any password format

#### 7. **Region Normalization (LOW)**
- **Problem**: Regions not normalized (case-sensitive, whitespace)
- **Impact**: Configuration errors, mismatched region lookups
- **Fix**: All regions normalized with `trim().toUpperCase()`

#### 8. **YANDEX_DISK_TOKEN Bootstrap Check (LOW)**
- **Problem**: Required at startup, blocked server start
- **Impact**: Server couldn't start without token (even for testing)
- **Fix**: Changed to warning, validation deferred to upload code

#### 9. **AUTH_SECRET Validation (HIGH)**
- **Problem**: No length validation on secret key
- **Impact**: Weak secrets could compromise JWT security
- **Fix**: Require minimum 32 characters, fail-fast with helpful message

#### 10. **ENV Validation Error Handling (LOW)**
- **Problem**: Missing passwords or duplicates threw errors, blocked startup
- **Impact**: Service couldn't start with partial configuration
- **Fix**: Changed to warnings, service starts but users can't login

### Legacy Code Cleanup ✅

#### 11. **Duplicate Login Endpoints (MEDIUM)**
- **Problem**: Both `/api/login` and `/api/auth/login` existed
- **Impact**: Confusion, inconsistent behavior
- **Fix**: `/api/login` now redirects to `/api/auth/login`

## Technical Changes

### Authentication Flow
1. **Check Bootstrap Admins** (ENV: ADMIN_EMAIL + ADMIN_PASSWORD)
   - Generate stable negative ENV ID
   - Hash password once
   - Try DB upsert (silent fail if DB unavailable)

2. **Check Region Users** (ENV: REGION_*_USERS + USER_PASSWORD_MAP)
   - Generate stable negative ENV ID
   - Hash password once
   - Try DB upsert (silent fail if DB unavailable)

3. **Check Database Users** (via lib/models/users.getUserByEmail)
   - Use existing password hash
   - No re-hashing

4. **Check File Users (dev only)** (data/users.json)
   - Blocked in production
   - Falls back to ENV admins if file missing

### Session Creation
- **Validation**: Reject `userId = 0 or null`
- **ENV Users**: Stable negative IDs (deterministic from email)
- **DB Users**: Positive IDs from database
- **Distinction**: Easy to tell ENV users (negative) from DB users (positive)

### Database Upsert Strategy
- Check if user exists first
- Insert only if user doesn't exist
- Never update existing users (prevents password re-hashing)
- Handles race conditions gracefully

## Migration Notes

### Breaking Changes
⚠️ **ENV Users with Old Sessions**
- Old sessions with `userId: 0` are now invalid
- Users will need to log in again
- New sessions will have stable negative IDs

⚠️ **Password Format**
- `USER_PASSWORD_MAP` no longer requires 5 digits
- Existing 5-digit passwords still work
- New passwords can be any format

### Non-Breaking Changes
✅ **Regions**
- All regions normalized to uppercase
- `r1` → `R1`, `test` → `TEST`
- Existing uppercase regions unaffected

✅ **Bootstrap Admins**
- Same behavior, now get negative IDs
- Will auto-upsert to DB on first login
- Subsequent logins use DB record

## Testing Checklist

- [x] Stable ENV user IDs generated (negative, unique, deterministic)
- [x] No sessions with `userId = 0` created
- [x] Password hashing logic (once per user, not per login)
- [ ] Integration: POST /api/auth/login → JSON 200/401 (manual)
- [ ] Integration: Region user login successful (manual)
- [ ] Integration: Non-existent user → 401 (manual)
- [ ] Integration: Missing password warning (manual)
- [ ] Integration: Two users → different sessions (manual)

## Documentation

See:
- [ENV_SETUP.md](./ENV_SETUP.md) - Environment variable guide
- [SECURITY_REVIEW.md](./SECURITY_REVIEW.md) - Security audit results
- [lib/__tests__/auth.test.ts](./lib/__tests__/auth.test.ts) - Unit tests
