# Testing Guide - Photo Uploader System

## Prerequisites

1. **Neon Database** - Get a Postgres connection string from [Neon](https://neon.tech)
2. **Yandex Disk Token** - Get OAuth token from [Yandex Disk API](https://yandex.ru/dev/disk/poligon/)

## Environment Setup

Create a `.env.local` file with the following:

```bash
# Authentication
AUTH_SECRET=your-random-64-char-secret-here
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Yandex Disk
YANDEX_DISK_TOKEN=your-yandex-disk-oauth-token
YANDEX_DISK_BASE_DIR=/Фото

# Database (from Neon)
POSTGRES_URL=postgres://...
POSTGRES_URL_NON_POOLING=postgres://...

# Regions
REGIONS=R1,R2,R3,K1,V,S1,S2

# Admin credentials
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
ADMIN_REGION=ALL

# Region users (photographers)
REGION_R1_USERS=r1@photouploader.ru
REGION_R2_USERS=r2@photouploader.ru

# User passwords (5 digits)
USER_PASSWORD_MAP=r1@photouploader.ru:48392,r2@photouploader.ru:12345

# ZIP limits
ZIP_MAX_FILES=500
ZIP_MAX_TOTAL_MB=1500

# Debug (optional)
AUTH_DEBUG=1
```

## Running the Application

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open browser
http://localhost:3000
```

## End-to-End Smoke Test

### 1. Database Auto-Initialization ✅

**Test:** On fresh/empty Neon database, first API call creates schema automatically.

```bash
# Should return 200 with empty array (not 500 error)
curl http://localhost:3000/api/cars
```

**Expected:**
- No "relation 'cars' does not exist" error
- Returns: `{"success":true,"cars":[]}`
- Console shows: "Database schema initialized successfully"

### 2. Admin Login ✅

**Test:** Admin can login and access all regions.

1. Go to http://localhost:3000/login
2. Enter:
   - Email: `admin@example.com`
   - Password: `admin123`
3. Click "Login"

**Expected:**
- Redirects to /cars
- Shows region selector dropdown with R1, R2, R3, K1, V, S1, S2
- Shows "+ New Car" button (admin only)

### 3. User Login ✅

**Test:** Regular user (photographer) can login with normalized email.

1. Go to http://localhost:3000/login
2. Enter:
   - Email: `r1@photouploader.ru` (try with spaces or caps to test normalization)
   - Password: `48392`
3. Click "Login"

**Expected:**
- Redirects to /cars
- Shows "Region: R1" badge (no selector)
- NO "+ New Car" button (users can't create cars)
- Email normalization works regardless of case/whitespace

### 4. Admin Region Selection ✅

**Test:** Admin can switch regions and see different cars.

1. Login as admin
2. Select "R1" from region dropdown
3. Note the cars shown
4. Select "R2" from region dropdown
5. Cars list should update

**Expected:**
- Region selector works
- Cars list updates on region change
- Query param `?region=X` is passed to API

### 5. Create Car (Admin) ✅

**Test:** Admin can create a car in selected region.

1. Login as admin
2. Select region "R1"
3. Click "+ New Car"
4. Enter:
   - Make: `Toyota`
   - Model: `Camry`
   - VIN: `1HGBH41JXMN109186`
5. Click "Create Car"

**Expected:**
- Creates car in R1
- Creates folder on Yandex Disk: `/Фото/Фото/R1/Toyota Camry 1HGBH41JXMN109186/`
- Creates 14 slot folders (1 dealer + 8 buyout + 5 dummies)
- Creates `_CAR.json` metadata file
- Redirects to car details page
- Shows 14 empty slots

### 6. Upload Photos (User) ✅

**Test:** User can upload photos to empty slot.

1. Login as user (r1@photouploader.ru)
2. Open a car in R1 region
3. Find an empty slot
4. Click "Choose files" and select photos
5. Click "Upload"

**Expected:**
- Photos upload to Yandex Disk
- Creates `_LOCK.json` file in slot folder
- Slot status changes to "Filled"
- Shows file count and upload date
- Slot becomes locked (no re-upload)

### 7. Download ZIP (Any User) ✅

**Test:** Any user can download locked slots as ZIP.

1. Login (admin or user)
2. Open a car with locked slots
3. Find a filled slot
4. Click "Download ZIP"

**Expected:**
- Downloads ZIP file with all photos
- Excludes `_LOCK.json` from ZIP
- Respects ZIP_MAX_FILES and ZIP_MAX_TOTAL_MB limits
- Returns 413 if limits exceeded
- Returns 409 if slot not locked

### 8. Toggle "Used" Status (Admin Only) ✅

**Test:** Admin can mark slots as "used".

1. Login as admin
2. Open a car
3. Find a filled slot
4. Click "Mark as Used"
5. Confirm

**Expected:**
- Slot shows "Used" badge
- Updates `is_used` flag in database
- Button changes to "Mark as Unused"
- Regular users don't see this button

### 9. Links Management (Admin Only) ✅

**Test:** Admin can add/delete external links.

1. Login as admin
2. Open a car
3. Scroll to "External Links" section
4. Enter:
   - Label: `Avito Listing`
   - URL: `https://avito.ru/...`
5. Click "Add Link"

**Expected:**
- Link appears in list
- Clickable and opens in new tab
- Can delete with × button
- Regular users don't see links section

### 10. Delete Car (Admin Only) ✅

**Test:** Admin can delete car.

1. Login as admin
2. Open a car
3. Click "Delete Car" (if button exists)
4. Confirm deletion

**Expected:**
- Soft deletes car in database (sets `deleted_at`)
- Removes folder from Yandex Disk
- CASCADE deletes slots and links
- Car disappears from list

### 11. On-Read Sync ✅

**Test:** System syncs from disk (SSOT) on every read.

1. Login as admin
2. Create a car
3. Go to Yandex Disk manually
4. Delete the car folder
5. Refresh /cars page

**Expected:**
- Car marked as deleted in database
- Disappears from UI (excluded by `WHERE deleted_at IS NULL`)
- Console logs: "Syncing region before listing cars"

### 12. Lock Status Sync ✅

**Test:** Slot lock status syncs from disk.

1. Upload photos to a slot (creates `_LOCK.json`)
2. Go to Yandex Disk manually
3. Delete `_LOCK.json` file
4. Refresh car details page

**Expected:**
- Slot status changes from "Filled" to "Empty"
- Database `locked` field updates to `false`
- Slot becomes uploadable again

## Common Issues

### Issue: "relation 'cars' does not exist"

**Cause:** Database schema not initialized.

**Fix:** The fix is already implemented! `ensureDbSchema()` is now called automatically on first API request.

### Issue: "user_not_found" on login

**Cause:** Email normalization mismatch.

**Fix:** Already implemented! All emails are normalized with `.trim().toLowerCase()`.

**Debug:**
1. Enable `AUTH_DEBUG=1` in .env.local
2. Check server logs for diagnostic info
3. Verify email matches exactly in REGION_*_USERS

### Issue: "region_required" error for admin

**Cause:** Admin with region=ALL must specify region.

**Fix:** Already implemented! UI shows region selector for admins.

**Workaround:** Always select a region before operations.

### Issue: Admin can't see region selector

**Cause:** User info not loaded or role not recognized.

**Fix:** Check:
1. `/api/me` returns correct role
2. User role is exactly "admin"
3. Browser console for errors

## API Testing with curl

### Get user info
```bash
curl -H "Cookie: session=..." http://localhost:3000/api/me
```

### List cars (admin with region)
```bash
curl -H "Cookie: session=..." http://localhost:3000/api/cars?region=R1
```

### Create car (admin)
```bash
curl -X POST \
  -H "Cookie: session=..." \
  -H "Content-Type: application/json" \
  -d '{"make":"Toyota","model":"Camry","vin":"1HGBH41JXMN109186","region":"R1"}' \
  http://localhost:3000/api/cars
```

### Get car by VIN
```bash
curl -H "Cookie: session=..." \
  http://localhost:3000/api/cars/vin/1HGBH41JXMN109186
```

## Success Criteria

- ✅ Empty database auto-creates schema (no manual SQL needed)
- ✅ Admin and user login works with normalized emails
- ✅ Admin sees region selector, user sees region badge
- ✅ Admin can create cars in selected region
- ✅ Users can upload photos to their region only
- ✅ Download ZIP works for locked slots
- ✅ Admin can toggle "used" status
- ✅ Admin can manage links
- ✅ Admin can delete cars
- ✅ On-read sync keeps database in sync with disk
- ✅ All operations respect RBAC (role-based access control)
