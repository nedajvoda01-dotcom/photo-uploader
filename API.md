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

Create a new car with all 14 slots.

**Authentication:** Required

**Request Body:**
```json
{
  "make": "Toyota",
  "model": "Camry",
  "vin": "1HGBH41JXMN109186"
}
```

**Response (201 Created):**
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
  }
}
```

**Response (409 Conflict):**
```json
{
  "error": "Car with this VIN already exists in this region"
}
```

**Notes:**
- VIN must be exactly 17 characters
- Creates folder structure on Yandex Disk
- Creates 14 slots in database (1 dealer + 8 buyout + 5 dummies)
- Checks uniqueness by `(region, vin)` where region comes from session

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
