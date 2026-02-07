# Regression Test Plan - Task #2 Cleanup

This document describes the smoke tests that should be run to verify all functionality works after the cleanup and optimization changes.

## Test Environment Setup

1. **Environment Variables Required:**
   - `AUTH_SECRET` - JWT signing secret
   - `YANDEX_DISK_TOKEN` - Yandex Disk API token
   - `REGIONS` - Comma-separated list (e.g., "R1,R2,R3")
   - `ADMIN_EMAIL` + `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH`
   - `REGION_<REGION>_USERS` - User emails per region
   - `USER_PASSWORD_MAP` - User password mappings (5 digits each)
   - Optional: `POSTGRES_URL` for database mode

2. **Start the application:**
   ```bash
   npm run dev
   ```

## Test Cases

### 1. Authentication Tests

#### Test 1.1: Admin Login (ENV-based)
**Steps:**
1. Navigate to `/login`
2. Enter admin email from `ADMIN_EMAIL`
3. Enter admin password from `ADMIN_PASSWORD`
4. Click login

**Expected:**
- Successful login
- Redirect to home page
- Session cookie set
- Can access admin-only features

#### Test 1.2: User Login (Region-based)
**Steps:**
1. Navigate to `/login`
2. Enter user email from `REGION_R1_USERS`
3. Enter 5-digit password from `USER_PASSWORD_MAP`
4. Click login

**Expected:**
- Successful login
- Redirect to home page
- Session limited to user's region
- Cannot access admin-only features

### 2. Car Management Tests

#### Test 2.1: List Cars with Sync Caching
**Steps:**
1. Login as admin or user
2. Navigate to `/cars` or call `GET /api/cars`
3. Observe console logs for sync behavior
4. Refresh page immediately (within 30 seconds)

**Expected:**
- First request: "[Sync] Starting fresh sync for region..."
- Second request (within 30s): "[Sync] Using cached sync for region..."
- Cars list displayed correctly
- Progress shown for each car (slots filled/locked/used)

#### Test 2.2: Region Switching (Admin Only)
**Steps:**
1. Login as admin (region=ALL)
2. Call `GET /api/cars?region=R1`
3. Call `GET /api/cars?region=R2`
4. Verify different car lists

**Expected:**
- Admin can switch between regions
- Each region shows its own cars
- Sync cache is per-region (separate TTL)

#### Test 2.3: Create Car (Admin Only)
**Steps:**
1. Login as admin
2. Navigate to `/cars/new`
3. Enter: Make="Toyota", Model="Camry", VIN="12345678901234567"
4. Submit form

**Expected:**
- Car created in database
- Root folder created on Yandex Disk: `/Фото/Фото/<REGION>/Toyota Camry 12345678901234567`
- 14 slot folders created:
  - `1. Дилер фото/Toyota Camry 12345678901234567`
  - `2. Выкуп фото/1. Toyota Camry 12345678901234567` (through 8)
  - `3. Муляги фото/1. Toyota Camry 12345678901234567` (through 5)
- Car appears in car list

### 3. Upload Tests

#### Test 3.1: Upload to Slot
**Steps:**
1. Login as user or admin
2. Navigate to car detail page
3. Select an empty slot (e.g., dealer slot)
4. Upload 3-5 photos
5. Verify upload progress

**Expected:**
- Photos uploaded to correct slot path on Yandex Disk
- Slot status updates in database
- File count and size tracked
- UI shows uploaded photos

#### Test 3.2: Lock Slot (Automatic on 10+ Photos)
**Steps:**
1. Upload 10 or more photos to a slot
2. Observe slot status change

**Expected:**
- After 10th photo, `_LOCK.json` created on disk
- Slot marked as `locked=true` in database
- Slot shows as locked in UI
- No more uploads allowed to that slot

### 4. Download Tests

#### Test 4.1: Download ZIP
**Steps:**
1. Navigate to car with uploaded photos
2. Click "Download All Photos" or call `GET /api/cars/:id/download`
3. Wait for ZIP generation

**Expected:**
- ZIP file generated with all photos
- File count and size limits enforced (max 500 files, 1500MB)
- Photos organized by slot in ZIP
- Download starts automatically

### 5. Admin-Only Tests

#### Test 5.1: Toggle Used Flag
**Steps:**
1. Login as admin
2. Navigate to car detail page
3. Toggle "mark as used" on a slot
4. Refresh page

**Expected:**
- PATCH request to `/api/cars/:id/slots/:slotType/:slotIndex`
- Slot `is_used` flag updated in database
- UI reflects change
- Only admin can perform this action (403 for users)

#### Test 5.2: Manage Links
**Steps:**
1. Login as admin
2. Navigate to car detail page
3. Add a new link: label="Photos", url="https://example.com/photos"
4. Delete the link
5. Test redirect via `GET /api/links/:linkId`

**Expected:**
- Link created in database with label and URL
- Link displayed in car detail
- Redirect works via short link
- Link can be deleted
- Only admin can manage links (403 for users)

#### Test 5.3: Delete Car
**Steps:**
1. Login as admin
2. Navigate to car list
3. Click "Delete" on a car
4. Confirm deletion

**Expected:**
- Car soft-deleted (deleted_at timestamp set)
- Car no longer appears in list
- Folder remains on Yandex Disk (no automatic deletion)
- Only admin can delete cars (403 for users)

### 6. Sync Tests

#### Test 6.1: Auto-Sync on Folder Deletion
**Steps:**
1. Manually delete a car folder on Yandex Disk
2. Wait for next sync or trigger manually
3. Refresh car list

**Expected:**
- Sync detects missing folder
- Car marked as deleted in database
- Car disappears from UI
- Console logs: "[Sync] Car <VIN> not found on disk, marking as deleted"

#### Test 6.2: Optimize with _LOCK.json
**Steps:**
1. Check console logs during sync for a locked slot
2. Observe optimization behavior

**Expected:**
- Console log: "[Sync] Using cached stats from _LOCK.json for <path>"
- No folder listing call made for slots with valid _LOCK.json
- Faster sync performance

## Configuration Verification

### Startup Logs Check
**Steps:**
1. Start the application with all ENV vars configured
2. Check console output

**Expected:**
```
========================================
APPLICATION CONFIGURATION
========================================
Environment: development
Auth Debug: disabled

Auth Mode: Database
  - Using POSTGRES_URL (pooled)

Bootstrap Admins: 1
  1. admin@example.com (region: ALL)

Regions: 3
  R1, R2, R3

Region Users: 5
  R1: 2 user(s)
  R2: 2 user(s)
  R3: 1 user(s)

Yandex Disk:
  Base Dir: /Фото
  Token: configured

ZIP Download Limits:
  Max Files: 500
  Max Total Size: 1500 MB
========================================
```

### No process.env Outside Config
**Steps:**
1. Run: `grep -r "process\.env\." lib/ app/ --include="*.ts" --include="*.tsx" | grep -v lib/config.ts`

**Expected:**
- No results (all ENV access centralized in config.ts)

### Build Verification
**Steps:**
1. Run: `npm run build`
2. Run: `npm run lint`

**Expected:**
- Build completes without errors
- No TypeScript errors
- No ESLint warnings or errors

## Performance Checks

### Sync TTL Verification
**Steps:**
1. Call `GET /api/cars` (triggers sync)
2. Immediately call `GET /api/cars` again
3. Wait 31+ seconds
4. Call `GET /api/cars` again

**Expected:**
- First call: Full sync, logs "[Sync] Starting fresh sync..."
- Second call: Cache hit, logs "[Sync] Using cached sync... (age: <30s)"
- Third call: Cache expired, logs "[Sync] Starting fresh sync..."

### API Response Times
**Steps:**
1. Measure response time for `GET /api/cars` with sync
2. Measure response time for `GET /api/cars` with cache hit

**Expected:**
- First call: 1-3 seconds (depends on number of cars and disk latency)
- Cached call: <100ms (no disk access)
- Significant performance improvement with caching

## Summary

All tests should pass without errors. Any failures indicate a regression that needs to be fixed before deployment.

### Key Improvements Verified:
- ✅ ENV configuration centralized
- ✅ No inline admin checks
- ✅ Sync performance improved with TTL
- ✅ Path construction centralized
- ✅ No code duplication
- ✅ Clean build and lint
