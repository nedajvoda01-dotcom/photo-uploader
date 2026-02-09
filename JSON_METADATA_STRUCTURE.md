# JSON Metadata Structure on Yandex Disk

This document describes all JSON metadata files used in the photo-uploader system. These files serve as the database layer, eliminating the need for `listFolder` API calls in most cases.

## Overview

The system uses a **JSON = DB** approach where all metadata is stored in structured JSON files on Yandex Disk. This enables:
- Fast data reads without expensive API calls
- Automatic system repair
- Prevention of N+1 query problems
- Single Source of Truth (SSOT) for all data

## File Hierarchy

```
/Фото/{REGION}/
  _REGION.json          # List of cars in region
  /{CAR_FOLDER}/
    _CAR.json           # Car metadata
    _LINKS.json         # Shared links for car
    /1. Dealer photos/
      /{SLOT_FOLDER}/
        _PHOTOS.json    # Photo index (SSOT)
        _SLOT.json      # Quick summary
        _LOCK.json      # Soft lock marker
        _DIRTY.json     # Desync flag (future)
        _PUBLISHED.json # Public URL (if shared)
        photo_*.jpg     # Actual photos
```

## JSON File Specifications

### 1. _REGION.json

**Location:** `${YANDEX_DISK_BASE_DIR}/{REGION}/_REGION.json`

**Purpose:** Index of all cars in a region with TTL caching. Avoids expensive folder listing. Enables O(1) region loading.

**Schema:**
```typescript
interface RegionIndex {
  version: number;       // Schema version (currently 1)
  updated_at: string;    // ISO 8601 timestamp
  cars: Array<{
    make: string;
    model: string;
    vin: string;
    disk_root_path: string;
    created_at?: string;
    created_by?: string;
  }>;
}
```

**Example:**
```json
{
  "version": 1,
  "updated_at": "2026-02-09T10:30:00Z",
  "cars": [
    {
      "make": "Toyota",
      "model": "Camry",
      "vin": "1HGBH41JXMN109186",
      "disk_root_path": "/Фото/R1/Toyota Camry 1HGBH41JXMN109186",
      "created_at": "2026-02-09T10:00:00Z",
      "created_by": "user@example.com"
    }
  ]
}
```

**TTL (Time To Live):** 5 minutes (300,000ms, configurable via `REGION_INDEX_TTL_MS`)

**Cache Invalidation:**
- Missing file → rebuild with `listFolder(region)`
- Parse error → rebuild
- Schema validation failure → rebuild
- Age > TTL → rebuild

**Performance:**
- Cache hit: O(1) - single file read (~50-100ms)
- Cache miss: O(n) - one `listFolder` + n metadata reads (~500-1000ms)
- Zero nested scans regardless of cache state

**Auto-rebuild:** Yes, from folder listing if missing, corrupted, or expired

---

### 2. _CAR.json

**Location:** `{CAR_ROOT}/_CAR.json`

**Purpose:** Car metadata including creation info

**Schema:**
```typescript
interface CarMetadata {
  region: string;
  make: string;
  model: string;
  vin: string;
  disk_root_path: string;
  created_by?: string;
  created_at: string;
}
```

**Example:**
```json
{
  "region": "R1",
  "make": "Toyota",
  "model": "Camry",
  "vin": "1HGBH41JXMN109186",
  "disk_root_path": "/Фото/R1/Toyota Camry 1HGBH41JXMN109186",
  "created_by": "user@example.com",
  "created_at": "2026-02-09T10:00:00Z"
}
```

**Auto-repair:** Yes, paths are normalized on read

---

### 3. _PHOTOS.json (SSOT)

**Location:** `{SLOT_PATH}/_PHOTOS.json`

**Purpose:** **Main index for slot photos**. This is the Single Source of Truth for photo metadata.

**Schema:**
```typescript
interface PhotoIndex {
  version: number;           // Schema version (currently 1)
  updatedAt: string;         // ISO 8601 timestamp
  count: number;             // Photo count (must match items.length)
  limit: number;             // Hard limit (always 40)
  cover: string | null;      // First photo filename or null
  items: PhotoItem[];        // Photo list
}

interface PhotoItem {
  name: string;              // Filename
  size: number;              // Bytes
  modified: string;          // ISO 8601 timestamp
}
```

**Example (from problem statement):**
```json
{
  "version": 1,
  "updatedAt": "2026-02-09T10:05:00Z",
  "count": 2,
  "limit": 40,
  "cover": "photo_002.jpg",
  "items": [
    {
      "name": "photo_001.jpg",
      "size": 5123456,
      "modified": "2026-02-09T10:04:00Z"
    },
    {
      "name": "photo_002.jpg",
      "size": 4987654,
      "modified": "2026-02-09T10:05:00Z"
    }
  ]
}
```

**Validation Rules:**
- `version` must be >= 1
- `count` must equal `items.length`
- `limit` must equal 40 (MAX_PHOTOS_PER_SLOT)
- `updatedAt` must be valid ISO 8601 timestamp
- `cover` must be null or match a filename in items
- Each item must have valid `name`, `size`, and `modified`

**Update Strategy:** Read-merge-write with retry logic for concurrency

**Auto-rebuild:** Yes, from folder listing if missing or validation fails

---

### 4. _SLOT.json

**Location:** `{SLOT_PATH}/_SLOT.json`

**Purpose:** Quick summary for UI display. Cached stats.

**Schema:**
```typescript
interface SlotStats {
  count: number;
  cover: string | null;
  total_size_mb: number;
  updated_at: string;
}
```

**Example:**
```json
{
  "count": 12,
  "cover": "photo_001.jpg",
  "total_size_mb": 15.4,
  "updated_at": "2026-02-09T10:05:00Z"
}
```

**Note:** This is a cache. `_PHOTOS.json` is the authoritative source.

---

### 5. _LOCK.json

**Location:** `{SLOT_PATH}/_LOCK.json`

**Purpose:** Soft lock marker indicating slot is filled and locked

**Schema:**
```typescript
interface LockMarker {
  locked_at: string;
  locked_by?: string;
  file_count: number;
  total_size_mb?: number;
}
```

**Example:**
```json
{
  "locked_at": "2026-02-09T10:05:00Z",
  "locked_by": "user@example.com",
  "file_count": 12,
  "total_size_mb": 15.4
}
```

**Behavior:** Presence of this file indicates slot cannot be modified

---

### 6. _LINKS.json

**Location:** `{CAR_ROOT}/_LINKS.json`

**Purpose:** Shared links for the car

**Schema:**
```typescript
interface LinksIndex {
  links: Array<{
    id: string;           // UUID
    title: string;
    url: string;
    created_by?: string;
    created_at: string;
  }>;
}
```

**Example:**
```json
{
  "links": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Share Link 1",
      "url": "https://disk.yandex.ru/d/...",
      "created_by": "user@example.com",
      "created_at": "2026-02-09T10:05:00Z"
    }
  ]
}
```

---

### 7. _PUBLISHED.json

**Location:** `{SLOT_PATH}/_PUBLISHED.json`

**Purpose:** Public URL for shared slot

**Schema:**
```typescript
interface PublishedUrl {
  url: string;
  published_at: string;
  published_by?: string;
}
```

**Example:**
```json
{
  "url": "https://disk.yandex.ru/d/...",
  "published_at": "2026-02-09T10:05:00Z",
  "published_by": "user@example.com"
}
```

---

### 8. _DIRTY.json (Future)

**Location:** `{SLOT_PATH}/_DIRTY.json`

**Purpose:** Flag indicating metadata is out of sync with actual files

**Schema:**
```typescript
interface DirtyFlag {
  marked_dirty_at: string;
  reason: string;
  needs_rebuild: boolean;
}
```

**Example:**
```json
{
  "marked_dirty_at": "2026-02-09T10:05:00Z",
  "reason": "Concurrent upload conflict",
  "needs_rebuild": true
}
```

**Behavior:** System should rebuild `_PHOTOS.json` when this flag exists

**Status:** Not yet implemented

---

## Reading Strategy

### Priority Order for Photo Metadata

1. **Read `_PHOTOS.json`** (SSOT)
   - If valid: Use this data
   - If invalid schema: Auto-rebuild from folder
   - If missing: Try fallback

2. **Fallback to `_SLOT.json`** (Quick summary)
   - Use for count and cover only
   - Less detailed than `_PHOTOS.json`

3. **Last Resort: `listFolder()`**
   - Expensive API call
   - Rebuild `_PHOTOS.json` and `_SLOT.json`

### Code Example

```typescript
// Best practice: Try _PHOTOS.json first
let index = await readPhotosIndex(slotPath);

if (!index) {
  // Auto-rebuild if missing or invalid
  index = await rebuildPhotosIndex(slotPath);
}

// Now use index.count, index.cover, index.items
```

## Validation

### JSON Schema Validation

All metadata files are validated on read:

1. **Type checking** - Ensure all fields have correct types
2. **Required fields** - Check all mandatory fields exist
3. **Consistency** - Verify data relationships (e.g., count === items.length)
4. **Business rules** - Enforce constraints (e.g., limit === 40)

### Auto-Rebuild on Failure

When validation fails:
1. Log warning with details
2. Attempt to rebuild from source (folder listing or other metadata)
3. Write rebuilt data back to disk
4. Return rebuilt data or null if rebuild fails

### Example Validation

```typescript
function validatePhotosIndexSchema(data: any): data is PhotoIndex {
  // Type checks
  if (typeof data.version !== 'number' || data.version < 1) return false;
  if (typeof data.count !== 'number' || data.count < 0) return false;
  if (typeof data.limit !== 'number' || data.limit !== 40) return false;
  
  // Consistency checks
  if (data.count !== data.items.length) return false;
  
  // Item validation
  for (const item of data.items) {
    if (typeof item.name !== 'string') return false;
    if (typeof item.size !== 'number') return false;
    if (typeof item.modified !== 'string') return false;
  }
  
  return true;
}
```

## Benefits

### 1. Fast Reads
- Most metadata available without `listFolder()`
- Single file download vs. expensive directory listing
- Reduces API quota usage

### 2. Auto-Repair
- Broken JSON automatically rebuilt
- System self-heals from corruption
- No manual intervention needed

### 3. No N+1 Queries
- Batch operations possible
- Region index enables listing all cars without folder scans
- Photo index enables slot operations without file listing

### 4. Consistency
- Single Source of Truth (SSOT) for each data type
- Clear data ownership
- Easier debugging and maintenance

### 5. Versioning
- Schema version enables future migrations
- Backward compatibility possible
- Breaking changes detectable

## File Lifecycle

### Creation
1. System creates JSON files during operations (upload, create car, etc.)
2. Files include all required fields with proper types
3. Timestamps set to current ISO 8601

### Update
1. Read current JSON
2. Merge with new data (for concurrent operations)
3. Validate merged result
4. Write back with updated timestamp

### Deletion
1. JSON files deleted when container deleted
2. Orphaned JSON files cleaned up during reconciliation

### Rebuild
1. Triggered on validation failure or missing file
2. Source data from folder listing or other metadata
3. Write back with current timestamp
4. Log rebuild for monitoring

## Error Handling

### Read Errors
- **File not found:** Return null, trigger rebuild if needed
- **Parse error:** Log error, trigger rebuild
- **Validation error:** Log details, trigger rebuild

### Write Errors
- **Upload failed:** Retry with backoff
- **Quota exceeded:** Return error to user
- **Network error:** Retry with backoff

### Rebuild Errors
- **Folder listing failed:** Return null, escalate error
- **No photos found:** Create empty index (count: 0)
- **Partial data:** Use what's available, mark as incomplete

## Testing

### Unit Tests
- Schema validation for each JSON type
- Auto-rebuild logic
- Merge operations for concurrent updates

### Integration Tests
- End-to-end file lifecycle
- Concurrent operation handling
- Error recovery scenarios

### Example Test

```typescript
test('_PHOTOS.json: auto-rebuilds on schema validation failure', async () => {
  // Write invalid JSON
  await uploadText(path, { invalid: 'schema' });
  
  // Read should trigger rebuild
  const index = await readPhotosIndex(path);
  
  // Should have valid schema now
  expect(index).not.toBeNull();
  expect(index?.version).toBe(1);
  expect(index?.limit).toBe(40);
});
```

## Future Enhancements

### 1. _DIRTY.json Implementation
- Mark slots as needing rebuild
- Trigger background reconciliation
- Prevent reads from corrupted data

### 2. Atomic Updates
- Compare-and-swap for writes
- Optimistic locking
- Conflict resolution

### 3. Compression
- Gzip large JSON files
- Reduce storage and bandwidth
- Transparent decompression

### 4. Caching Layer
- In-memory cache for hot data
- TTL-based invalidation
- Reduce redundant reads

## References

- **Implementation:** `src/lib/infrastructure/diskStorage/carsRepo.ts`
- **Disk Structure:** `DISK_STRUCTURE.md`
- **Problem Statement:** Issue #2 - "Структура данных на Диске (JSON = БД)"
- **Schema Version:** 1
- **Last Updated:** 2026-02-09

---

**Status:** Implemented (except _DIRTY.json)
**Validation:** JSON schema on read ✅
**Auto-rebuild:** For _PHOTOS.json and _REGION.json ✅
**Version:** 1.0.0
