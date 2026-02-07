# API Documentation

This document describes all API endpoints for the Photo Uploader backend.

## Base URL

All API endpoints are relative to the application base URL (e.g., `http://localhost:3000` or `https://your-app.vercel.app`).

## Authentication

Most endpoints require authentication via JWT tokens stored in HTTP-only cookies. Login first using the `/api/auth/login` endpoint.

### Headers

No special headers required for authenticated requests - authentication is handled via cookies.

## Endpoints

### Authentication

#### POST /api/auth/login

Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful"
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Invalid email or password"
}
```

**Notes:**
- Sets HTTP-only session cookie
- JWT includes: `userId`, `email`, `region`, `role`
- Region is stored in session and used for all subsequent operations

---

### Cars

**Note:** VIN-based endpoints are now the preferred API. All endpoints are available in both formats:
- **Legacy (ID-based):** `/api/cars/:id/...` 
- **Canonical (VIN-based):** `/api/cars/vin/:vin/...`

VIN-based endpoints accept the 17-character VIN code directly in the URL, making it the Single Source of Truth for car identification within a region.

#### GET /api/cars

List all cars in the authenticated user's region with progress information.

**Authentication:** Required

**Response (200 OK):**
```json
{
  "success": true,
  "cars": [
    {
      "id": 1,
      "region": "MSK",
      "make": "Toyota",
      "model": "Camry",
      "vin": "1HGBH41JXMN109186",
      "disk_root_path": "/Фото/MSK/Toyota Camry 1HGBH41JXMN109186",
      "created_by": 5,
      "created_at": "2024-01-15T10:00:00Z",
      "total_slots": 14,
      "locked_slots": 5,
      "empty_slots": 9
    }
  ]
}
```

---

#### POST /api/cars

Create a new car with all 14 slots. **Idempotent:** Returns success if car already exists.

**Authentication:** Required

**Request Body:**
```json
{
  "make": "Toyota",
  "model": "Camry",
  "vin": "1HGBH41JXMN109186",
  "region": "MSK"  // Optional, admin only
}
```

**Response (201 Created - New Car):**
```json
{
  "ok": true,
  "car": {
    "id": 1,
    "region": "MSK",
    "make": "Toyota",
    "model": "Camry",
    "vin": "1HGBH41JXMN109186"
  }
}
```

**Response (200 OK - Car Already Exists):**
```json
{
  "ok": true,
  "car": {
    "id": 1,
    "region": "MSK",
    "make": "Toyota",
    "model": "Camry",
    "vin": "1HGBH41JXMN109186"
  }
}
```

**Response (400 Bad Request):**
```json
{
  "ok": false,
  "code": "validation_error",
  "message": "make, model, and vin are required",
  "status": 400
}
```

**Error Codes:**
- `validation_error`: Missing required fields
- `invalid_vin`: VIN is not exactly 17 characters
- `region_required`: Admin must specify region
- `disk_error`: Failed to create folder on Yandex Disk
- `server_error`: Internal server error

**Notes:**
- VIN must be exactly 17 characters
- Creates folder structure on Yandex Disk
- Creates 14 slots in database (1 dealer + 8 buyout + 5 dummies)
- **Idempotent behavior:** If car already exists, returns 200 with existing car data
- Region comes from user session (photographers) or request body (admins)

---

#### GET /api/cars/:id

Get detailed information about a car including all slots and links.

**Authentication:** Required

**Response (200 OK):**
```json
{
  "success": true,
  "car": {
    "id": 1,
    "region": "MSK",
    "make": "Toyota",
    "model": "Camry",
    "vin": "1HGBH41JXMN109186",
    "disk_root_path": "/Фото/MSK/Toyota Camry 1HGBH41JXMN109186",
    "created_by": 5,
    "created_at": "2024-01-15T10:00:00Z"
  },
  "slots": [
    {
      "id": 1,
      "car_id": 1,
      "slot_type": "dealer",
      "slot_index": 1,
      "status": "locked",
      "locked_at": "2024-01-15T12:00:00Z",
      "locked_by": 5,
      "lock_meta_json": "{...}",
      "disk_slot_path": "/Фото/MSK/Toyota Camry 1HGBH41JXMN109186/1. Дилер фото/Toyota Camry 1HGBH41JXMN109186",
      "public_url": "https://disk.yandex.ru/d/..."
    }
  ],
  "links": [
    {
      "id": 1,
      "car_id": 1,
      "title": "Auction Link",
      "url": "https://example.com/auction/123",
      "created_by": 5,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Access denied - region mismatch"
}
```

---

#### GET /api/cars/vin/:vin

Get detailed information about a car by VIN including all slots and links.

**Authentication:** Required

**URL Parameters:**
- `vin` (string): 17-character VIN code (case-insensitive)

**Example:**
```
GET /api/cars/vin/1HGBH41JXMN109186
```

**Response (200 OK):**
```json
{
  "success": true,
  "car": {
    "id": 1,
    "region": "MSK",
    "make": "Toyota",
    "model": "Camry",
    "vin": "1HGBH41JXMN109186",
    "disk_root_path": "/Фото/MSK/Toyota Camry 1HGBH41JXMN109186",
    "created_by": 5,
    "created_at": "2024-01-15T10:00:00Z"
  },
  "slots": [...],
  "links": [...]
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Invalid VIN format. VIN must be exactly 17 characters"
}
```

**Response (404 Not Found):**
```json
{
  "error": "Car not found in your region"
}
```

**Notes:**
- VIN is case-insensitive and normalized to uppercase
- Only returns car if it exists in the user's region
- Admins with region=ALL can access all regions

---

### Photo Upload

#### POST /api/cars/:id/upload

Upload photos to a specific slot.

**Authentication:** Required

**Content-Type:** `multipart/form-data`

**Form Data:**
- `slotType` (string): One of "dealer", "buyout", "dummies"
- `slotIndex` (number): Slot index (dealer: 1, buyout: 1-8, dummies: 1-5)
- `file1`, `file2`, ... (files): Image files to upload

**Example using curl:**
```bash
curl -X POST http://localhost:3000/api/cars/1/upload \
  -F "slotType=buyout" \
  -F "slotIndex=3" \
  -F "file1=@photo1.jpg" \
  -F "file2=@photo2.jpg" \
  -H "Cookie: session=..."
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Files uploaded successfully",
  "slot": {
    "id": 10,
    "car_id": 1,
    "slot_type": "buyout",
    "slot_index": 3,
    "status": "locked",
    "locked_at": "2024-01-15T14:00:00Z",
    "locked_by": 5,
    "lock_meta_json": "{...}",
    "disk_slot_path": "...",
    "public_url": null
  },
  "uploadedFiles": [
    { "name": "photo1.jpg", "size": 1024000 },
    { "name": "photo2.jpg", "size": 2048000 }
  ]
}
```

**Response (409 Conflict):**
```json
{
  "error": "Slot is already locked/filled"
}
```

**Notes:**
- Validates region permission
- Checks slot is not locked in database
- Checks `_LOCK.json` does not exist on disk (SSOT)
- Uploads all files to slot folder
- Creates `_LOCK.json` marker after successful upload
- Updates slot status to `locked` in database

---

#### POST /api/cars/vin/:vin/upload

Upload photos to a specific slot using VIN.

**Authentication:** Required

**URL Parameters:**
- `vin` (string): 17-character VIN code (case-insensitive)

**Content-Type:** `multipart/form-data`

**Form Data:**
- `slotType` (string): One of "dealer", "buyout", "dummies"
- `slotIndex` (number): Slot index (dealer: 1, buyout: 1-8, dummies: 1-5)
- `file1`, `file2`, ... (files): Image files to upload

**Example using curl:**
```bash
curl -X POST http://localhost:3000/api/cars/vin/1HGBH41JXMN109186/upload \
  -F "slotType=buyout" \
  -F "slotIndex=3" \
  -F "file1=@photo1.jpg" \
  -F "file2=@photo2.jpg" \
  -H "Cookie: session=..."
```

**Response:** Same as ID-based endpoint

**Notes:**
- VIN is the canonical identifier - preferred over ID-based endpoint
- All validations and behavior identical to ID-based endpoint

---
- Creates `_LOCK.json` marker file
- Updates slot status to `locked` in database

---

### Links

#### GET /api/cars/:id/links

List all links for a car.

**Authentication:** Required

**Response (200 OK):**
```json
{
  "success": true,
  "links": [
    {
      "id": 1,
      "car_id": 1,
      "title": "Auction Link",
      "url": "https://example.com/auction/123",
      "created_by": 5,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

#### POST /api/cars/:id/links

Create a new link for a car.

**Authentication:** Required

**Request Body:**
```json
{
  "title": "Auction Link",
  "url": "https://example.com/auction/123"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "link": {
    "id": 1,
    "car_id": 1,
    "title": "Auction Link",
    "url": "https://example.com/auction/123",
    "created_by": 5,
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

---

#### DELETE /api/links/:linkId

Delete a specific link.

**Authentication:** Required

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Link deleted successfully"
}
```

---

### Sharing

#### GET /api/cars/:id/share

Get or create a public share URL for a slot folder.

**Authentication:** Required

**Query Parameters:**
- `slotType` (string): One of "dealer", "buyout", "dummies"
- `slotIndex` (number): Slot index

**Example:**
```
GET /api/cars/1/share?slotType=buyout&slotIndex=3
```

**Response (200 OK):**
```json
{
  "success": true,
  "url": "https://disk.yandex.ru/d/abc123xyz",
  "cached": false
}
```

**Notes:**
- Returns existing URL if already published (cached: true)
- Publishes folder on Yandex Disk if not yet published
- Stores URL in database for future requests

---

## Slot Types and Indexes

- **dealer**: 1 slot (index must be 1)
- **buyout**: 8 slots (index: 1-8)
- **dummies**: 5 slots (index: 1-5)

Total: 14 slots per car

## Error Codes

- **400 Bad Request**: Invalid input data
- **401 Unauthorized**: Not authenticated
- **403 Forbidden**: Authenticated but no permission (e.g., region mismatch)
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource already exists or is in conflicting state
- **500 Internal Server Error**: Server-side error

## Slot Locking (SSOT)

A slot is considered "locked" (filled) when:
1. Database `car_slots.status = 'locked'`
2. AND `_LOCK.json` file exists on Yandex Disk

The `_LOCK.json` file contains metadata about the upload:
```json
{
  "carId": 1,
  "slotType": "buyout",
  "slotIndex": 3,
  "uploadedBy": 5,
  "uploadedAt": "2024-01-15T14:00:00Z",
  "fileCount": 12,
  "files": [
    { "name": "photo1.jpg", "size": 1024000 },
    { "name": "photo2.jpg", "size": 2048000 }
  ]
}
```

## Rate Limiting

All Yandex Disk API calls include automatic retry with exponential backoff:
- Max retries: 3
- Initial delay: 1 second
- Delay multiplier: 2x per retry
- 4xx errors (client errors) are not retried

---

### User Info

#### GET /api/me

Get current authenticated user information.

**Authentication:** Required

**Response (200 OK):**
```json
{
  "userId": 5,
  "email": "admin@example.com",
  "region": "MSK",
  "role": "admin"
}
```

**Notes:**
- Returns user information from JWT session
- Useful for checking user role in frontend

---

### Slot Management

#### PATCH /api/cars/:id/slots/:slotType/:slotIndex

Mark a slot as used or unused (admin only).

**Authentication:** Required (Admin only)

**URL Parameters:**
- `id` - Car ID
- `slotType` - Slot type (dealer, buyout, dummies)
- `slotIndex` - Slot index (dealer: 1, buyout: 1-8, dummies: 1-5)

**Request Body:**
```json
{
  "isUsed": true
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "slot": {
    "id": 123,
    "car_id": 1,
    "slot_type": "dealer",
    "slot_index": 1,
    "status": "locked",
    "is_used": true,
    "marked_used_at": "2026-02-06T16:00:00.000Z",
    "marked_used_by": 5,
    ...
  }
}
```

**Response (403 Forbidden):**
```json
{
  "error": "Forbidden - admin access required"
}
```

**Notes:**
- Only admin users can mark slots
- Used slots show visual indicator to team
- Can be toggled back to unused

---

#### GET /api/cars/:id/download

Get file list for downloading slot contents.

**Authentication:** Required

**URL Parameters:**
- `id` - Car ID

**Query Parameters:**
- `slotType` - Slot type (dealer, buyout, dummies)
- `slotIndex` - Slot index

**Example:**
```
GET /api/cars/1/download?slotType=buyout&slotIndex=3
```

**Response (200 OK):**
```json
{
  "success": true,
  "files": [
    {
      "name": "photo1.jpg",
      "path": "/Фото/MSK/Toyota Camry ABC123/2. Выкуп фото/3. Toyota Camry ABC123/photo1.jpg"
    },
    {
      "name": "photo2.jpg",
      "path": "/Фото/MSK/Toyota Camry ABC123/2. Выкуп фото/3. Toyota Camry ABC123/photo2.jpg"
    }
  ],
  "slotInfo": {
    "car": "Toyota Camry",
    "vin": "ABC123",
    "slotType": "buyout",
    "slotIndex": 3
  }
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Slot is empty - no files to download"
}
```

**Notes:**
- Only works on locked (filled) slots
- Filters out _LOCK.json from file list
- Returns metadata for client-side processing
- Future: Will stream ZIP file directly

---

## Step 3 Features

### Used/Unused Marking

**Purpose**: Admin users can mark slots as "used" to indicate they've been processed, preventing duplicate work by team members.

**Access**: Admin only

**Visual Indicators**:
- Yellow border on used slots
- "Used" badge displayed
- Slightly reduced opacity

**Workflow**:
1. Admin fills slot with photos
2. Admin processes/uses those photos
3. Admin marks slot as "used"
4. Team members see slot is already used
5. Team avoids duplicate work

### Download ZIP

**Purpose**: Download all photos from a specific slot in one operation.

**Access**: All authenticated users (with region permission)

**Current Implementation**:
- API returns list of files
- Client can download individually
- Shows file count

**Future Implementation**:
- Server streams ZIP file
- Progress bar for large downloads
- One-click download

---

## Error Codes Summary

- **400 Bad Request**: Invalid input data, slot empty for download
- **401 Unauthorized**: Not authenticated
- **403 Forbidden**: 
  - Region mismatch (non-admin)
  - Admin access required (for marking used/unused)
- **404 Not Found**: Resource not found
- **409 Conflict**: Slot already filled, VIN conflict
- **500 Internal Server Error**: Server-side error

## Rate Limiting

All Yandex Disk operations include automatic retry with exponential backoff:
- Max retries: 3
- Initial delay: 1 second
- Delay multiplier: 2x per retry
- 4xx errors are not retried

---

## VIN-Based API Endpoints (Canonical)

All car-related operations are now available via VIN-based endpoints, which serve as the canonical API. VIN (Vehicle Identification Number) is the Single Source of Truth for car identification within a region.

### Available VIN-Based Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cars/vin/:vin` | GET | Get car details, slots, and links by VIN |
| `/api/cars/vin/:vin/upload` | POST | Upload photos to a slot |
| `/api/cars/vin/:vin/links` | GET | Get car links |
| `/api/cars/vin/:vin/links` | POST | Create a new link |
| `/api/cars/vin/:vin/share` | GET | Get/create public share URL for a slot |
| `/api/cars/vin/:vin/download` | GET | Download slot photos as ZIP |
| `/api/cars/vin/:vin/slots/:slotType/:slotIndex` | PATCH | Mark slot as used/unused (admin) |

### Benefits of VIN-Based API

1. **Single Source of Truth**: VIN is unique within a region and serves as the canonical identifier
2. **Human-Readable URLs**: VINs are more meaningful than database IDs
3. **Region-Scoped**: VIN uniqueness is scoped to user's region from session
4. **Backward Compatible**: ID-based endpoints remain functional for existing integrations

### VIN Requirements

- Must be exactly 17 characters
- Case-insensitive (automatically normalized to uppercase)
- Unique within a region (enforced by database constraint)
- Used in Yandex Disk folder structure: `/Фото/{region}/{Make} {Model} {VIN}`

### Migration Path

**For API Clients:**
1. Update code to use `/api/cars/vin/:vin` instead of `/api/cars/:id`
2. Use car's VIN from the car object instead of database ID
3. Test with existing cars to ensure compatibility

**For Frontend:**
- URLs now use VIN: `/cars/:vin` instead of `/cars/:id`
- More user-friendly and shareable links
- Direct navigation to car using VIN

### Example: Complete Workflow with VIN

```bash
# 1. Create a car (returns VIN)
curl -X POST http://localhost:3000/api/cars \
  -H "Content-Type: application/json" \
  -d '{"make":"Toyota","model":"Camry","vin":"1HGBH41JXMN109186"}'

# 2. Get car details using VIN
curl http://localhost:3000/api/cars/vin/1HGBH41JXMN109186

# 3. Upload photos using VIN
curl -X POST http://localhost:3000/api/cars/vin/1HGBH41JXMN109186/upload \
  -F "slotType=dealer" \
  -F "slotIndex=1" \
  -F "file1=@photo1.jpg"

# 4. Get share link using VIN
curl "http://localhost:3000/api/cars/vin/1HGBH41JXMN109186/share?slotType=dealer&slotIndex=1"

# 5. Add link using VIN
curl -X POST http://localhost:3000/api/cars/vin/1HGBH41JXMN109186/links \
  -H "Content-Type: application/json" \
  -d '{"title":"Auction","url":"https://example.com/auction"}'
```

### Frontend URLs

- **Car list**: `/cars` (unchanged)
- **Car details**: `/cars/:vin` (changed from `/cars/:id`)
- **Example**: `/cars/1HGBH41JXMN109186`

All frontend components now use VIN for navigation and API calls.
