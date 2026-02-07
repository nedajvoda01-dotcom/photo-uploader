# Verification Checklist - Required Artifacts

## ⚠️ Work Status: NOT COMPLETE

Per requirements, work is NOT considered complete until these artifacts are provided.

---

## Required Artifacts

### 1. Preview URL ⏳

**What:** URL of deployed Preview environment

**How to get:**
1. Open PR #21: https://github.com/nedajvoda01-dotcom/photo-uploader/pull/21
2. Scroll to "Checks" section at bottom
3. Find "Vercel" deployment
4. Click "Visit Preview" button
5. Copy the URL from browser address bar

**Example:**
```
https://photo-uploader-[hash].vercel.app
```

**Record here:**
```
Preview URL: _________________________________
```

---

### 2. Network: POST /api/cars ⏳

**What:** HTTP status and response body for car creation

**How to test:**
1. Open Preview URL in browser
2. Open DevTools (F12)
3. Go to Network tab
4. Filter by "Fetch/XHR"
5. Login as user (region=R1 or R2)
6. Click "Создать авто" (Create car)
7. Fill form:
   - Марка: Toyota
   - Модель: Camry
   - VIN: 1HGBH41JXMN109186
8. Submit form
9. In Network tab, find request to `POST /api/cars`
10. Capture:
    - Status code
    - Response body (Preview tab or Response tab)

**Expected Response:**
```json
{
  "ok": true,
  "car": {
    "id": 123,
    "region": "R1",
    "make": "Toyota",
    "model": "Camry",
    "vin": "1HGBH41JXMN109186"
  }
}
```

**Or if DB failed:**
```json
{
  "ok": true,
  "car": {...},
  "warning": "DB_CACHE_WRITE_FAILED",
  "message": "Автомобиль создан на диске..."
}
```

**Record here:**
```
POST /api/cars
Status: _______
Response Body:




```

**Screenshot:** (Attach Network tab screenshot showing request/response)

---

### 3. Network: GET /api/cars/vin/[vin] ⏳

**What:** HTTP status and response body for VIN car retrieval

**How to test:**
1. After creating car in step 2, you should be redirected to car card
2. OR manually navigate to: `https://[preview-url]/cars/[vin]`
   - Example: `/cars/1HGBH41JXMN109186`
3. DevTools → Network tab should show request
4. Find request to `GET /api/cars/vin/1HGBH41JXMN109186`
5. Capture:
    - Status code
    - Response body

**Expected Response:**
```json
{
  "ok": true,
  "car": {
    "id": 123,
    "region": "R1",
    "make": "Toyota",
    "model": "Camry",
    "vin": "1HGBH41JXMN109186",
    "disk_root_path": "/Фото/R1/Toyota Camry 1HGBH41JXMN109186",
    "created_by": "user@example.com",
    "created_at": "2026-02-07T22:00:00.000Z",
    "deleted_at": null
  },
  "slots": [...],  // 14 slots
  "links": [],
  "last_sync_at": "2026-02-07T22:01:00.000Z"
}
```

**Record here:**
```
GET /api/cars/vin/1HGBH41JXMN109186
Status: _______
Response Body:




```

**Screenshot:** (Attach Network tab screenshot showing request/response)

---

## Verification Criteria

### POST /api/cars
- [x] Status: 201 Created
- [x] Body contains: `"ok": true`
- [x] Body contains: `"car"` object with correct data
- [x] If DB failed: `"warning": "DB_CACHE_WRITE_FAILED"` present

### GET /api/cars/vin/[vin]
- [x] Status: 200 OK
- [x] Body contains: `"ok": true`
- [x] Body contains: `"car"` object
- [x] Body contains: `"slots"` array with 14 elements
- [x] Body contains: `"last_sync_at"` timestamp

---

## Additional Tests (Optional but Recommended)

### Admin with region=ALL can access car
1. Logout
2. Login as admin (region=ALL)
3. Navigate to `/cars/1HGBH41JXMN109186`
4. Should see car details (not 404/403)

### Test standardized errors
1. Try to create car without VIN
2. Network should show:
```json
{
  "ok": false,
  "code": "validation_error",
  "message": "Необходимо указать марку, модель и VIN",
  "status": 400
}
```

### Test ALL region blocking
1. Login as admin
2. Try to create car with region=ALL
3. Should get:
```json
{
  "ok": false,
  "code": "REGION_ALL_FORBIDDEN",
  "message": "Нельзя создавать, загружать или блокировать в регионе ALL...",
  "status": 400
}
```

---

## How to Submit Results

1. Fill in all "Record here" sections above
2. Attach screenshots of Network tab
3. Update PR description with results
4. Mark verification as COMPLETE

---

## Environment Access

**If you cannot access Preview:**
- Check PR #21 Checks section
- Ensure Vercel deployment succeeded
- Verify you have access to the deployment
- Contact maintainer for access if needed

**If you cannot login:**
- Use credentials from ENV variables
- Check .env.example for user structure
- Verify BOOTSTRAP_ADMINS or REGION_USERS configured

---

## Status Updates

**Code Implementation:** ✅ COMPLETE  
**TypeScript Build:** ✅ PASSED  
**Preview Deployment:** ⏳ PENDING CHECK  
**POST /api/cars Test:** ⏳ PENDING  
**GET /api/cars/vin Test:** ⏳ PENDING  
**Artifacts Provided:** ❌ NOT PROVIDED  

---

**Current Status:** Work is NOT complete. Manual verification required.

Once all artifacts are provided and verification passes, work can be marked as complete.
