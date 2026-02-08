# Manual Verification Guide

## Overview
This document provides manual verification steps and curl commands to validate the architectural refactoring and authentication fixes.

## Prerequisites
```bash
# Set your server URL
export BASE_URL="http://localhost:3000"  # or your deployment URL

# Set test credentials
export ADMIN_EMAIL="admin@example.com"
export ADMIN_PASSWORD="your-admin-password"
export USER_EMAIL="user@example.com"
export USER_PASSWORD="wrong-password"
```

## Test 1: Successful Login (Admin)

**Expected**: 200 OK with session cookie

```bash
curl -i -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}"
```

**Expected Response**:
```
HTTP/1.1 200 OK
Set-Cookie: session=<JWT_TOKEN>; Path=/; HttpOnly; SameSite=Lax
Content-Type: application/json

{"success":true,"message":"Login successful"}
```

**Verify**:
- ✅ Status is 200
- ✅ Session cookie is set
- ✅ Response is JSON (not HTML redirect)

---

## Test 2: Failed Login (Wrong Password)

**Expected**: 401 Unauthorized with JSON error

```bash
curl -i -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${USER_EMAIL}\",\"password\":\"wrong-password-123\"}"
```

**Expected Response**:
```
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"error":"Invalid email or password"}
```

**Verify**:
- ✅ Status is 401
- ✅ No session cookie is set
- ✅ Response is JSON (not HTML redirect)
- ✅ Error message is clear

---

## Test 3: Protected API Without Authentication

**Expected**: 401 Unauthorized with JSON error (no HTML redirect)

```bash
curl -i "${BASE_URL}/api/me"
```

**Expected Response**:
```
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"error":"Authentication required"}
```

**Verify**:
- ✅ Status is 401
- ✅ Response is JSON (not HTML)
- ✅ No redirect to /login page
- ✅ Middleware returns JSON for API routes

---

## Test 4: Legacy /api/login Endpoint

**Expected**: 308 Permanent Redirect with deprecation message (no cookie setting)

```bash
curl -i -X POST "${BASE_URL}/api/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}"
```

**Expected Response**:
```
HTTP/1.1 308 Permanent Redirect
Content-Type: application/json

{
  "error":"This endpoint is deprecated. Please use /api/auth/login instead.",
  "redirect":"http://localhost:3000/api/auth/login"
}
```

**Verify**:
- ✅ Status is 308
- ✅ NO session cookie is set
- ✅ Response tells client to use /api/auth/login
- ✅ Legacy endpoint does NOT authenticate users

---

## Test 5: Protected API With Valid Session

**Expected**: 200 OK with user data

```bash
# First, login and save the session cookie
SESSION_COOKIE=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
  -c - | grep session | awk '{print $7}')

# Then, use the session to access protected endpoint
curl -i "${BASE_URL}/api/me" \
  -H "Cookie: session=${SESSION_COOKIE}"
```

**Expected Response**:
```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "email":"admin@example.com",
  "region":"ALL",
  "role":"admin",
  "userId":<negative_number>
}
```

**Verify**:
- ✅ Status is 200
- ✅ User data returned
- ✅ userId is NOT 0 (should be negative for ENV users, positive for DB users)
- ✅ role is correct (admin for ADMIN_EMAIL)

---

## Additional Verification

### Check No userId=0 in Codebase
```bash
cd /path/to/photo-uploader
npm run ci-gates
```

**Expected**: All gates pass ✅

### Run All Tests
```bash
npm run test
```

**Expected**: All test suites pass ✅

### Build Verification
```bash
npm run build
```

**Expected**: Build succeeds without errors ✅

---

## Key Files Changed

### Authentication & Session
- `src/app/api/auth/login/route.ts` - Main login endpoint
- `src/lib/application/auth/loginUseCase.ts` - Login business logic
- `src/lib/infrastructure/auth/jwt.ts` - JWT signing/verification
- `src/middleware.ts` - Authentication middleware

### Legacy Endpoint
- `src/app/api/login/route.ts` - Deprecated, returns redirect without cookies

### Configuration
- `src/lib/config/auth.ts` - Auth configuration (AUTH_SECRET, admin setup)
- `src/lib/config/regions.ts` - Region configuration with normalization
- `src/lib/domain/region/validation.ts` - Region normalization logic

### Database
- `src/lib/infrastructure/db/usersRepo.ts` - User repository with upsert
- `src/lib/infrastructure/dev/usersJson.ts` - Dev-only users.json (blocked in prod)

### Tests
- `src/lib/__tests__/auth.test.ts` - Authentication tests
- `src/lib/__tests__/strict-requirements.test.ts` - Requirement validation
- `scripts/ci-gates.sh` - CI gates for anti-garbage checks

### Project Structure
- `tsconfig.json` - Updated paths to `@/* → ./src/*`
- All code moved from `app/`, `lib/` → `src/app/`, `src/lib/`

---

## Success Criteria

✅ All blocking fixes (A1-A4) implemented
✅ Architecture restructured to src/ directory (B1)
✅ Clean architecture layers maintained (B2)
✅ SSOT Disk + DB cache working (B3)
✅ All tests passing (C1)
✅ CI gates implemented and passing (C2)
✅ Manual verification documented (C3)

---

## Notes

- The system now uses `/api/auth/login` as the single source of truth for authentication
- Legacy `/api/login` returns a deprecation message and does NOT set cookies
- All ENV users get stable negative IDs (never 0)
- Admin role is only assigned to users in ADMIN_EMAIL/ADMIN_EMAIL_2
- Region users get role: "user" by default
- No password re-hashing on subsequent logins (ON CONFLICT DO NOTHING)
- All configuration is centralized in `src/lib/config/`
- CI gates prevent regressions
