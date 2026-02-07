# Step 2: Database as Cache, Disk as Truth - Sync System

## Overview

This document describes the sync system implemented in Step 2, where Yandex Disk serves as the Single Source of Truth (SSOT) and the database acts as a cache.

## Core Principles

### 1. Disk is Truth for Lock State

The `locked` state of a slot is determined **exclusively** by the presence of `_LOCK.json` file on Yandex Disk:

- **Locked:** `_LOCK.json` exists in the slot folder
- **Empty:** `_LOCK.json` does NOT exist in the slot folder

The database `status` field is a cache that is updated from disk during sync.

### 2. Database is Cache

The database serves as a performance cache:
- Stores discovered cars and slots
- Caches file counts and sizes
- Tracks last sync time
- **Refreshed on every GET request** (no background cron)

### 3. Used Flag is Business Logic

The `is_used` boolean flag in the database:
- **Not** synced from disk
- Managed only by admins via API
- Business logic to track which slots have been processed
- Preserved during sync operations

## Sync Behavior

### When Sync Happens

Sync is triggered automatically on these endpoints:
- `GET /api/cars` - List all cars
- `GET /api/cars/:id` - Get car by ID
- `GET /api/cars/vin/:vin` - Get car by VIN

**No background jobs or cron.** Sync happens on-demand before returning data.

### What Sync Does

1. **Scans Disk Structure**
   ```
   ${YANDEX_DISK_BASE_DIR}/Фото/<region>/
   └── <Make> <Model> <VIN>/
       ├── 1. Дилер фото/
       │   └── <Make> <Model> <VIN>/
       ├── 2. Выкуп фото/
       │   ├── 1. <Make> <Model> <VIN>/
       │   ...
       │   └── 8. <Make> <Model> <VIN>/
       └── 3. Муляги фото/
           ├── 1. <Make> <Model> <VIN>/
           ...
           └── 5. <Make> <Model> <VIN>/
   ```

2. **Discovers Cars**
   - Parses folder names: `<Make> <Model> <VIN>`
   - VIN is last 17 alphanumeric characters
   - Creates or updates car records in database

3. **Discovers Slots**
   - Identifies slot types from folder names
   - Determines slot indexes
   - Checks for `_LOCK.json` presence
   - Counts files in each slot
   - Calculates total size in MB

4. **Updates Database**
   - Upserts cars (sets `deleted_at = NULL` if rediscovered)
   - Upserts slots with current disk state
   - Preserves `is_used` flag from existing records
   - Updates `last_sync_at` timestamp

## Database Schema

### Cars Table

```sql
CREATE TABLE cars (
  id SERIAL PRIMARY KEY,
  region VARCHAR(50) NOT NULL,
  make VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  vin VARCHAR(17) NOT NULL,
  disk_root_path TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,  -- For soft deletes
  UNIQUE(region, vin)
);
```

**New Field:**
- `deleted_at`: Soft delete timestamp. Set to NULL when car rediscovered on disk.

### Car Slots Table

```sql
CREATE TABLE car_slots (
  id SERIAL PRIMARY KEY,
  car_id INTEGER REFERENCES cars(id) ON DELETE CASCADE,
  slot_type VARCHAR(50) NOT NULL,
  slot_index INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'empty',
  locked_at TIMESTAMP,
  locked_by INTEGER REFERENCES users(id),
  lock_meta_json TEXT,
  disk_slot_path TEXT NOT NULL,
  public_url TEXT,
  is_used BOOLEAN DEFAULT FALSE,           -- Business logic only
  marked_used_at TIMESTAMP,
  marked_used_by INTEGER REFERENCES users(id),
  file_count INTEGER DEFAULT 0,            -- Synced from disk
  total_size_mb NUMERIC(10,2) DEFAULT 0,   -- Synced from disk
  last_sync_at TIMESTAMP,                  -- Last sync timestamp
  UNIQUE(car_id, slot_type, slot_index)
);
```

**New Fields:**
- `file_count`: Number of files in slot (excluding _LOCK.json)
- `total_size_mb`: Total size of files in MB
- `last_sync_at`: Timestamp of last successful sync

## Sync Module API

### syncRegion(region)

Main sync function that updates database cache from disk.

**Signature:**
```typescript
function syncRegion(region: string): Promise<{
  success: boolean;
  carsFound: number;
  slotsFound: number;
  error?: string;
}>
```

**Parameters:**
- `region`: Region code to sync (e.g., "MSK", "SPB")

**Returns:**
- `success`: Whether sync completed successfully
- `carsFound`: Number of cars discovered/updated
- `slotsFound`: Number of slots discovered/updated
- `error`: Error message if sync failed

**Usage:**
```typescript
import { syncRegion } from '@/lib/sync';

// Sync a region before querying
const result = await syncRegion('MSK');
console.log(`Synced ${result.carsFound} cars, ${result.slotsFound} slots`);
```

## Folder Name Parsing

### Car Folder Format

**Pattern:** `<Make> <Model> <VIN>`

**Examples:**
- `Toyota Camry 1HGBH41JXMN109186`
- `BMW X5 WBAFR1C58BC286113`

**Parsing Rules:**
- VIN: Last 17 alphanumeric characters
- Make: First word before VIN
- Model: Remaining text between make and VIN

### Slot Type Folders

**Formats:**
- `1. Дилер фото` → `dealer`
- `2. Выкуп фото` → `buyout`
- `3. Муляги фото` → `dummies`

### Slot Subfolders

**Dealer (no index prefix):**
- `<Make> <Model> <VIN>` → Index 1

**Buyout/Dummies (with index prefix):**
- `1. <Make> <Model> <VIN>` → Index 1
- `2. <Make> <Model> <VIN>` → Index 2
- etc.

## Lock State Detection

### Checking Lock Status

```typescript
// Check if _LOCK.json exists
const lockPath = `${slotPath}/_LOCK.json`;
const isLocked = await exists(lockPath);
```

### Lock State Flow

1. **Upload Operation**
   - User uploads photos to slot
   - `_LOCK.json` created on disk
   - Database updated with `status = 'locked'`

2. **Sync Operation**
   - Checks for `_LOCK.json` on disk
   - Updates database `status` to match disk state
   - Preserves lock metadata if present

3. **Manual Unlock (Admin)**
   - Admin deletes `_LOCK.json` from disk
   - Next sync updates database to `status = 'empty'`

## File Statistics

### Counting Files

```typescript
const files = items.filter(item => 
  item.type === 'file' && item.name !== '_LOCK.json'
);
const fileCount = files.length;
```

### Calculating Size

```typescript
const totalSizeBytes = files.reduce((sum, file) => 
  sum + (file.size || 0), 0
);
const totalSizeMB = totalSizeBytes / (1024 * 1024);
```

**Stored:** Rounded to 2 decimal places in database.

## Soft Deletes

### Marking as Deleted

Cars can be soft-deleted by setting `deleted_at`:

```sql
UPDATE cars
SET deleted_at = CURRENT_TIMESTAMP
WHERE id = :car_id;
```

### Rediscovery Behavior

When sync finds a car on disk that was soft-deleted:

```sql
UPDATE cars
SET deleted_at = NULL,
    make = :make,
    model = :model,
    disk_root_path = :path
WHERE region = :region AND vin = :vin;
```

The car is "undeleted" automatically.

### Filtering Deleted Cars

To exclude deleted cars from queries:

```sql
SELECT * FROM cars
WHERE region = :region AND deleted_at IS NULL;
```

**Note:** Current implementation doesn't filter deleted cars in listings. This can be added later if needed.

## Performance Considerations

### Sync Cost

Each sync operation:
- Lists region folder (1 API call)
- Lists each car folder (N API calls for N cars)
- Lists each slot type folder (3N API calls)
- Checks _LOCK.json existence (14N API calls for 14 slots)
- Lists each slot folder for stats (14N API calls)

**Total:** ~33N API calls for N cars

### Optimization Strategies

1. **Cache Results**
   - Use `last_sync_at` to skip recently synced data
   - Implement sync throttling (e.g., max once per minute)

2. **Parallel Processing**
   - Process cars concurrently
   - Batch database operations

3. **Selective Sync**
   - Only sync specific cars when needed
   - Implement incremental sync based on modification times

**Current:** Full sync on every GET request. Works for small-medium datasets.

## Error Handling

### Sync Failures

Sync is designed to be resilient:
- Individual car failures don't stop entire sync
- Errors logged but sync continues
- Returns success=true with partial results
- Returns success=false only on catastrophic failures

### Missing Folders

If region folder doesn't exist:
- Returns success=true, carsFound=0, slotsFound=0
- No error logged (valid empty state)

### Parse Failures

If folder name can't be parsed:
- Warning logged
- Folder skipped
- Sync continues with other folders

## Monitoring

### Log Output

Sync produces structured logs:

```
[Sync] Starting sync for region: MSK at /Фото/Фото/MSK
[Sync] Found car: Toyota Camry 1HGBH41JXMN109186
[Sync] Found slot: dealer[1] locked=true files=5
[Sync] Found slot: buyout[1] locked=true files=8
[Sync] Completed sync for region MSK: 1 cars, 14 slots
```

### API Logs

GET endpoints log sync activity:

```
[API] Syncing region MSK before listing cars
[API] Syncing region MSK before getting car 123
```

## Testing

### Manual Testing

1. **Create Car on Disk**
   ```bash
   # Create folder structure manually on Yandex Disk
   /Фото/Фото/MSK/Toyota Camry 1HGBH41JXMN109186/
   ```

2. **Call GET Endpoint**
   ```bash
   curl http://localhost:3000/api/cars
   ```

3. **Verify Database**
   ```sql
   SELECT * FROM cars WHERE vin = '1HGBH41JXMN109186';
   SELECT * FROM car_slots WHERE car_id = :car_id;
   ```

### Test Scenarios

- ✅ Discover new car from disk
- ✅ Update existing car metadata
- ✅ Detect locked state from _LOCK.json
- ✅ Count files and calculate sizes
- ✅ Preserve is_used flag during sync
- ✅ Handle missing folders gracefully
- ✅ Parse various car folder name formats

## Future Enhancements

1. **Incremental Sync**
   - Use modification times to skip unchanged data
   - Only sync recently modified cars/slots

2. **Background Sync**
   - Optional cron job for large deployments
   - Reduces latency on GET requests

3. **Sync Status API**
   - Endpoint to check last sync time
   - Manual sync trigger endpoint

4. **Deleted Car Filtering**
   - Add `deleted_at IS NULL` to queries
   - UI to show/hide deleted cars

5. **Batch Operations**
   - Optimize database writes with batch inserts
   - Reduce transaction overhead

6. **Cache Warming**
   - Pre-sync regions on application startup
   - Reduce first-request latency

## References

- Implementation: `lib/sync.ts`
- Database Schema: `lib/db.ts`
- API Integration: `app/api/cars/route.ts`
- Disk Structure: `DISK_STRUCTURE.md`

---

**Version:** 1.0.0
**Last Updated:** 2026-02-07
**Status:** Implemented
