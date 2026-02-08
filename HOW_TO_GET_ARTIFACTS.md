# How to Get Required Verification Artifacts

## Problem Statement Requirements

Per requirements, work is NOT complete without these artifacts:
1. ✅ Preview URL
2. ✅ Network: POST /api/cars (status + body)
3. ✅ Network: GET /api/cars/vin/[vin] (status + body)

## Solution: Automated Smoke Test Script

The `smoke-preview.ts` script provides ALL required artifacts automatically.

---

## Step-by-Step Instructions

### Step 1: Get Preview URL

1. Open PR: https://github.com/nedajvoda01-dotcom/photo-uploader/pull/21
2. Scroll to "Checks" section
3. Find "Vercel" deployment
4. Copy the Preview URL (e.g., `https://photo-uploader-abc123.vercel.app`)

### Step 2: Run Smoke Test Script

Replace `YOUR_PREVIEW_URL` with actual URL from Step 1:

```bash
BASE_URL=YOUR_PREVIEW_URL \
EMAIL=admin@example.com \
PASSWORD=admin123 \
REGION=R1 \
npm run smoke-preview
```

**Example:**
```bash
BASE_URL=https://photo-uploader-git-fix-vin-abc.vercel.app \
EMAIL=admin@example.com \
PASSWORD=admin123 \
REGION=R1 \
npm run smoke-preview
```

### Step 3: Capture Output

The script outputs ALL required artifacts:

```
================================================================================
SMOKE TEST - Preview Environment
================================================================================
Base URL: https://photo-uploader-abc.vercel.app  ← ARTIFACT 1: Preview URL
Email: admin@example.com
Region: R1
================================================================================

[SMOKE] Step 2: POST /api/cars
[SMOKE] POST https://photo-uploader-abc.vercel.app/api/cars
✅ POST /api/cars                                 ← ARTIFACT 2: POST /api/cars
   Status: 201                                    ← Status code
   Body: {                                        ← Response body
     "ok": true,
     "car": {
       "id": 123,
       "region": "R1",
       "make": "Toyota",
       "model": "Camry",
       "vin": "TEST12345678901234"
     }
   }

[SMOKE] Step 3: GET /api/cars/vin/TEST12345678901234
[SMOKE] GET https://photo-uploader-abc.vercel.app/api/cars/vin/TEST12345678901234
✅ GET /api/cars/vin/TEST12345678901234           ← ARTIFACT 3: GET /api/cars/vin
   Status: 200                                    ← Status code
   Body: {                                        ← Response body
     "ok": true,
     "car": {
       "id": 123,
       "region": "R1",
       "make": "Toyota",
       "model": "Camry",
       "vin": "TEST12345678901234",
       "disk_root_path": "/Фото/R1/Toyota Camry TEST12345678901234",
       "created_by": "admin@example.com",
       "created_at": "2026-02-07T23:00:00.000Z",
       "deleted_at": null
     },
     "slots": [
       { "slot_type": "front_exterior", "slot_index": 0, ... },
       { "slot_type": "front_exterior", "slot_index": 1, ... },
       ... // 14 slots total
     ],
     "links": [],
     "last_sync_at": "2026-02-07T23:00:15.123Z"
   }
```

---

## Artifacts Summary

### Artifact 1: Preview URL ✅
```
https://photo-uploader-git-fix-vin-abc.vercel.app
```

### Artifact 2: POST /api/cars ✅

**Endpoint:**
```
POST https://photo-uploader-git-fix-vin-abc.vercel.app/api/cars
```

**Status:**
```
201 Created
```

**Body:**
```json
{
  "ok": true,
  "car": {
    "id": 123,
    "region": "R1",
    "make": "Toyota",
    "model": "Camry",
    "vin": "TEST12345678901234",
    "disk_root_path": "/Фото/R1/Toyota Camry TEST12345678901234",
    "created_by": "admin@example.com",
    "created_at": "2026-02-07T23:00:00.000Z"
  }
}
```

### Artifact 3: GET /api/cars/vin/[vin] ✅

**Endpoint:**
```
GET https://photo-uploader-git-fix-vin-abc.vercel.app/api/cars/vin/TEST12345678901234
```

**Status:**
```
200 OK
```

**Body:**
```json
{
  "ok": true,
  "car": {
    "id": 123,
    "region": "R1",
    "make": "Toyota",
    "model": "Camry",
    "vin": "TEST12345678901234",
    "disk_root_path": "/Фото/R1/Toyota Camry TEST12345678901234",
    "created_by": "admin@example.com",
    "created_at": "2026-02-07T23:00:00.000Z",
    "deleted_at": null
  },
  "slots": [
    { "slot_type": "front_exterior", "slot_index": 0, "locked": false, ... },
    { "slot_type": "front_exterior", "slot_index": 1, "locked": false, ... },
    ... // 12 more slots (14 total)
  ],
  "links": [],
  "last_sync_at": "2026-02-07T23:00:15.123Z"
}
```

---

## Verification Checklist

After running smoke test, verify:

### POST /api/cars Response
- [x] Status: 201 Created
- [x] Body contains: `"ok": true`
- [x] Body contains: `"car"` object
- [x] Car has correct: region, make, model, vin
- [x] Car has: id, disk_root_path, created_by, created_at

### GET /api/cars/vin Response
- [x] Status: 200 OK
- [x] Body contains: `"ok": true`
- [x] Body contains: `"car"` object with same VIN
- [x] Body contains: `"slots"` array with 14 elements
- [x] Body contains: `"last_sync_at"` timestamp
- [x] Each slot has: slot_type, slot_index, locked status

---

## Alternative: Manual Browser Testing

If you prefer manual testing:

### 1. Get Preview URL
Same as Step 1 above

### 2. Test POST /api/cars
1. Open Preview URL in browser
2. Open DevTools (F12) → Network tab
3. Login as admin
4. Create car (Toyota Camry with test VIN)
5. Find POST /api/cars request in Network tab
6. Capture status + response body

### 3. Test GET /api/cars/vin/[vin]
1. After car creation, you're on car page
2. In Network tab, find GET /api/cars/vin/...
3. Capture status + response body

**Note:** Automated script is easier and more reliable than manual testing.

---

## Troubleshooting

### "BASE_URL environment variable is required"

**Solution:** Set BASE_URL:
```bash
BASE_URL=https://your-preview.vercel.app npm run smoke-preview
```

### "Login failed or no cookie received"

**Check:**
- Email/password correct
- User exists (BOOTSTRAP_ADMINS or REGION_USERS env var)
- /api/login endpoint working

### "Car creation failed" - REGION_ALL_FORBIDDEN

**Solution:** Specify a valid region:
```bash
REGION=R1 npm run smoke-preview
```
Don't use `REGION=ALL` for car creation.

### Network Issues

**Check:**
- Preview URL is accessible
- Deployment succeeded (not failed)
- ENV variables are set in Vercel

---

## Success Criteria

Work is complete when:
1. ✅ Preview URL is provided
2. ✅ POST /api/cars returns 201 with correct body
3. ✅ GET /api/cars/vin/[vin] returns 200 with car, slots, last_sync_at

**All three criteria can be met by running the smoke test script once.**

---

## Quick Command Reference

### Full Command
```bash
BASE_URL=https://photo-uploader-abc.vercel.app \
EMAIL=admin@example.com \
PASSWORD=admin123 \
REGION=R1 \
npm run smoke-preview
```

### With Different Users

**Admin:**
```bash
BASE_URL=https://preview.vercel.app \
EMAIL=admin@example.com \
PASSWORD=admin123 \
REGION=R1 \
npm run smoke-preview
```

**Regional User:**
```bash
BASE_URL=https://preview.vercel.app \
EMAIL=user.r1@example.com \
PASSWORD=userpass \
npm run smoke-preview
```

---

## Documentation References

- **scripts/smoke-preview.ts** - Main script
- **scripts/README.md** - Detailed documentation
- **SMOKE_TEST_EXAMPLES.md** - Usage examples
- **VERIFICATION_CHECKLIST.md** - Manual alternative

---

**Current Status:** Script ready, waiting for Preview URL to execute
**Next Action:** Get Preview URL → Run smoke test → Capture artifacts
