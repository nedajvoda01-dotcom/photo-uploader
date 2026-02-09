# Manual Verification Guide

This document provides step-by-step instructions for manually verifying the photo uploader system works correctly, especially without a Postgres database.

## Prerequisites

- Node.js 18+ installed
- Yandex Disk account and API token
- Environment variables configured (see below)

## Required Environment Variables

```bash
# Authentication (Required)
AUTH_SECRET="your_secret_key_here_min_32_chars"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="your_admin_password"

# Yandex Disk (Required)
YANDEX_DISK_TOKEN="your_yandex_disk_token"
YANDEX_DISK_BASE_DIR="/Фото"

# Regions (Required)
REGIONS="R1,R2,K1"

# Database (Optional - system works WITHOUT these)
# POSTGRES_URL=
# POSTGRES_URL_NON_POOLING=

# Debug (Optional)
# DEBUG_DISK_CALLS=1
```

## Verification Steps

### 1. Deploy with No Postgres

**Objective:** Verify the system starts and operates without database connection.

**Steps:**

1. Ensure NO Postgres environment variables are set:
   ```bash
   unset POSTGRES_URL
   unset POSTGRES_URL_NON_POOLING
   unset POSTGRES_PRISMA_URL
   unset POSTGRES_URL_NO_SSL
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. **Expected Output:**
   ```
   [Database] WARNING: No database configured - using ENV/file-based auth only
   [Database] Connection configuration:
     - Type: not configured
     - Source: none
   ```

4. **Verify:** No crash, no `missing_connection_string` errors in logs.

### 2. Test Authentication Without Database

**Objective:** Verify login works with bootstrap admin (no DB required).

**Steps:**

1. Call the login endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "admin@example.com",
       "password": "your_admin_password"
     }'
   ```

2. **Expected Response:** `200 OK` with session token
   ```json
   {
     "ok": true,
     "userId": -1,
     "email": "admin@example.com",
     "role": "admin",
     "region": "ALL"
   }
   ```

3. **Verify:** No database connection errors in server logs.

### 3. Create a Car

**Objective:** Verify car creation and _CAR.json generation.

**Steps:**

1. Login and get session token (from step 2).

2. Create a car:
   ```bash
   curl -X POST http://localhost:3000/api/cars \
     -H "Content-Type: application/json" \
     -H "Cookie: session=YOUR_SESSION_TOKEN" \
     -d '{
       "make": "Toyota",
       "model": "Camry",
       "vin": "1HGBH41JXMN109186",
       "region": "R1"
     }'
   ```

3. **Expected Response:** `201 Created`
   ```json
   {
     "ok": true,
     "car": {
       "region": "R1",
       "make": "Toyota",
       "model": "Camry",
       "vin": "1HGBH41JXMN109186"
     }
   }
   ```

4. **Verify on Yandex Disk:**
   - Folder exists: `/Фото/R1/Toyota Camry 1HGBH41JXMN109186/`
   - File exists: `_CAR.json` in the car folder
   - 3 slot type folders created: `1. Дилер фото/`, `2. Выкуп фото/`, `3. Муляги фото/`

### 4. Open Car (Fast Initial Load)

**Objective:** Verify Phase 1 optimization - instant card render with O(1) calls.

**Steps:**

1. Get car details:
   ```bash
   curl http://localhost:3000/api/cars/vin/1HGBH41JXMN109186 \
     -H "Cookie: session=YOUR_SESSION_TOKEN"
   ```

2. **Expected Response:** Car with slots (stats_loaded=false)
   ```json
   {
     "ok": true,
     "car": { ... },
     "slots": [
       {
         "slot_type": "dealer",
         "slot_index": 1,
         "locked": false,
         "file_count": 0,
         "stats_loaded": false
       }
     ]
   }
   ```

3. **Check Logs with DEBUG_DISK_CALLS=1:**
   ```
   [DISK_CALLS] {
     requestId: "req_...",
     route: "/api/cars/vin/[vin]",
     totalCalls: 1,
     diskCalls: {
       downloadFile: 1,  // _CAR.json only
       listFolder: 0,    // No slot scanning
       ...
     }
   }
   ```

4. **Verify:** O(1) calls, no per-slot listFolder operations.

### 5. Upload Photos (Test Limit and Index Updates)

**Objective:** Verify uploads work, 40-photo limit enforced, indexes updated.

**Steps:**

1. Upload first photo:
   ```bash
   curl -X POST http://localhost:3000/api/cars/vin/1HGBH41JXMN109186/upload \
     -H "Cookie: session=YOUR_SESSION_TOKEN" \
     -F "slotType=dealer" \
     -F "slotIndex=1" \
     -F "file0=@photo1.jpg"
   ```

2. **Expected Response:** `200 OK` with slot details

3. **Verify on Yandex Disk:**
   - Photo uploaded to slot folder
   - `_LOCK.json` created with metadata
   - `_SLOT.json` created/updated: `{count: 1, cover: "photo1.jpg", ...}`
   - `_PHOTOS.json` created/updated: `{count: 1, items: [{name: "photo1.jpg", ...}]}`

4. Upload 39 more photos (to reach limit).

5. Try uploading 41st photo:
   ```bash
   curl -X POST http://localhost:3000/api/cars/vin/1HGBH41JXMN109186/upload \
     -H "Cookie: session=YOUR_SESSION_TOKEN" \
     -F "slotType=dealer" \
     -F "slotIndex=1" \
     -F "file0=@photo41.jpg"
   ```

6. **Expected Response:** `413 Payload Too Large`
   ```json
   {
     "ok": false,
     "code": "VALIDATION_ERROR",
     "message": "Slot photo limit reached. Maximum 40 photos per slot. Current: 40, attempting to add: 1",
     "currentCount": 40,
     "maxPhotos": 40
   }
   ```

7. **Verify:** Upload rejected BEFORE processing, no wasted bandwidth.

### 6. Test Index Consistency

**Objective:** Verify _SLOT.json and _PHOTOS.json stay consistent.

**Steps:**

1. Check both index files on Yandex Disk:
   ```
   /Фото/R1/Toyota Camry .../1. Дилер фото/.../
     ├── _SLOT.json
     ├── _PHOTOS.json
     └── photos...
   ```

2. Download and compare:
   ```bash
   # Get _SLOT.json
   curl https://cloud-api.yandex.net/v1/disk/resources/download?path=/Фото/R1/.../SLOT.json \
     -H "Authorization: OAuth YOUR_TOKEN"
   
   # Get _PHOTOS.json
   curl https://cloud-api.yandex.net/v1/disk/resources/download?path=/Фото/R1/.../_PHOTOS.json \
     -H "Authorization: OAuth YOUR_TOKEN"
   ```

3. **Verify Fields Match:**
   - `_SLOT.json.count` === `_PHOTOS.json.count`
   - `_SLOT.json.cover` === `_PHOTOS.json.cover`
   - `_SLOT.json.updated_at` and `_PHOTOS.json.updatedAt` are recent
   - `_PHOTOS.json.items.length` === `count`

### 7. Test Reconcile Endpoint

**Objective:** Verify self-healing reconcile repairs corrupted/missing indexes.

**Steps:**

1. Manually delete `_PHOTOS.json` on Yandex Disk (simulate corruption).

2. Call reconcile endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/internal/reconcile \
     -H "Content-Type: application/json" \
     -H "Cookie: session=YOUR_SESSION_TOKEN" \
     -d '{
       "slot": {
         "path": "/Фото/R1/Toyota Camry .../1. Дилер фото/Toyota Camry ..."
       }
     }'
   ```

3. **Expected Response:**
   ```json
   {
     "ok": true,
     "scope": "slot",
     "path": "...",
     "actionsPerformed": [
       "Reconciling slot: ...",
       "Rebuilt slot indexes (40 photos)"
     ],
     "repairedFiles": [
       ".../SLOT.json",
       ".../_PHOTOS.json"
     ],
     "errors": []
   }
   ```

4. **Verify on Yandex Disk:**
   - `_PHOTOS.json` recreated with correct data
   - All 40 photos listed in items array

### 8. Test Region List Optimization

**Objective:** Verify region list uses _REGION.json or minimal calls.

**Steps:**

1. Enable debug mode:
   ```bash
   DEBUG_DISK_CALLS=1 npm run dev
   ```

2. List cars in region:
   ```bash
   curl http://localhost:3000/api/cars?region=R1 \
     -H "Cookie: session=YOUR_SESSION_TOKEN"
   ```

3. **Check Logs:**
   ```
   [DISK_CALLS] {
     requestId: "req_...",
     route: "/api/cars",
     totalCalls: ~N+1 or 1,  // N cars + 1 region list, OR 1 _REGION.json read
     diskCalls: {
       listFolder: 1,      // Region folder only (or 0 if _REGION.json exists)
       downloadFile: N,    // N × _CAR.json (or 1 if _REGION.json exists)
       ...
     }
   }
   ```

4. **Verify:** No nested listFolder into slot folders, NO recursive scanning.

### 9. Test Path Normalization

**Objective:** Verify no disk: or /disk: prefixes pass through.

**Steps:**

1. Check test output:
   ```bash
   npm test 2>&1 | grep -A 5 "disk:"
   ```

2. **Expected:**
   ```
   ✓ normalizeDiskPath strips disk:/ prefix
   ✓ normalizeDiskPath strips /disk:/ prefix
   ✓ normalizeDiskPath strips disk:/ prefix case insensitive
   ✓ normalizeDiskPath strips /disk:/ prefix case insensitive
   ✓ normalizeDiskPath throws on path segment with colon
   ```

3. **Verify:** All path normalization tests pass.

## Expected Log Lines (Summary)

When DEBUG_DISK_CALLS=1 is enabled, you should see:

```
[DISK_CALLS] {
  requestId: "req_1234567890_abc123",
  route: "/api/cars",
  duration: "245ms",
  totalCalls: 12,
  diskCalls: {
    listFolder: 1,
    downloadFile: 11,
    uploadText: 0,
    uploadFile: 0,
    createFolder: 0,
    deleteFile: 0,
    exists: 0,
    moveFolder: 0,
    publishFolder: 0
  }
}
```

## Troubleshooting

### Issue: "AUTH_SECRET is required"
**Solution:** Set AUTH_SECRET env var (min 32 chars).

### Issue: "REGIONS is required"
**Solution:** Set REGIONS env var (e.g., "R1,R2,K1").

### Issue: Database connection error
**Solution:** Ensure NO POSTGRES_URL* vars are set. System should work without DB.

### Issue: Upload limit not enforced
**Solution:** Check _PHOTOS.json exists and count is correct. Run reconcile if needed.

### Issue: Indexes out of sync
**Solution:** Run reconcile endpoint for affected slot/car/region.

## Success Criteria Checklist

- [ ] System starts without Postgres (no crash)
- [ ] Login works with bootstrap admin (no DB)
- [ ] Car creation works and creates _CAR.json
- [ ] Car page loads instantly (O(1) calls)
- [ ] Photos upload successfully
- [ ] 40-photo limit enforced (41st rejected)
- [ ] _SLOT.json and _PHOTOS.json both updated
- [ ] Both indexes stay consistent (count, cover match)
- [ ] Reconcile endpoint repairs missing indexes
- [ ] Region list doesn't scan slot folders
- [ ] Path normalization strips disk: prefixes
- [ ] DEBUG_DISK_CALLS shows call counts

## Production Verification (Vercel)

When deployed to Vercel:

1. Check Vercel logs for DB warnings:
   ```
   [Database] WARNING: No database configured - using ENV/file-based auth only
   ```

2. Verify no errors like:
   - `missing_connection_string`
   - `Connection to Postgres failed`
   - Import-time crashes from `@vercel/postgres`

3. Test login via deployed URL.

4. Check function logs for `[DISK_CALLS]` entries (if DEBUG enabled).

5. Verify all operations work same as local testing.

---

**Last Updated:** 2024-02-09  
**Version:** 1.0.0
