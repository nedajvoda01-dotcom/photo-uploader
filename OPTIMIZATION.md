# Yandex Disk API Optimization

## Overview

This document describes the optimization strategy implemented to minimize Yandex Disk API calls while maintaining data accuracy and UI responsiveness.

## Problem Statement

**Before optimization:**
- Region list: Required ~14+ API calls per car to compute progress (total/locked/empty slots)
- Car details: Required ~14+ API calls to load all slot information
- Total: For a region with 10 cars, this meant 140+ API calls just to show the list

**Impact:**
- Slow page loads
- High API quota consumption
- Poor user experience

## Solution: JSON Index Files

### Three-Level Index Strategy

1. **_REGION.json** - Region-level car index
2. **_CAR.json** - Car-level metadata (already existed)
3. **_SLOT.json** - Slot-level statistics

### Phase 0: Region List (Fast)

**Goal:** List all cars in a region without scanning slot folders

**Implementation:**
```
GET /api/cars?region=MSK
```

**Process:**
1. Try to read `{regionPath}/_REGION.json`
   - If found: Return cars immediately (1 API call)
   - If not found: Fall back to folder listing

2. Fallback (first time or cache miss):
   - List car folders: `listFolder({regionPath})` (1 API call)
   - Read `_CAR.json` for each car (N API calls)
   - Write `_REGION.json` for future use (1 API call)
   - Total: N+2 API calls for N cars

3. Return cars with:
   - `counts_loaded: false` (signal that counts are not yet available)
   - `total_slots: 14` (known deterministic count)
   - `locked_slots: 0` (placeholder)
   - `empty_slots: 14` (placeholder)

**Result:** From 14N+ calls to 1 call (cached) or N+2 calls (uncached)

### Phase 1: Car Details (Fast Initial Load)

**Goal:** Open car card instantly without waiting for slot counts

**Implementation:**
```
GET /api/cars/vin/{VIN}
```

**Process:**
1. Read `_CAR.json` to get car metadata (1 API call)
2. Build slot structure deterministically using `getAllSlotPaths()`
   - No folder scanning
   - Slots returned with `stats_loaded: false`
   - Placeholder values: `file_count: 0`, `locked: false`

3. Return car + slots immediately

**Result:** O(1) API calls for initial car card render

### Phase 2: Load Counts (Background/On-Demand)

**Goal:** Load actual slot counts after card is rendered

**Implementation:**
```
GET /api/cars/vin/{VIN}/counts
```

**Process:**
1. For each slot:
   - Try to read `_SLOT.json` (14 API calls if all exist)
   - If not found: Fallback to `_LOCK.json`
   - If not found: Fallback to `listFolder()` and write `_SLOT.json`

2. Return slots with:
   - `stats_loaded: true`
   - Actual `file_count`, `total_size_mb`, `locked` status
   - `cover` (first photo filename)

**Result:** 14 calls in best case (all _SLOT.json exist), 28 calls worst case (need to scan and write)

## File Formats

### _REGION.json

Location: `{YANDEX_DISK_BASE_DIR}/{REGION}/_REGION.json`

```json
{
  "cars": [
    {
      "region": "MSK",
      "make": "Toyota",
      "model": "Camry",
      "vin": "1HGBH41JXMN109186",
      "disk_root_path": "/Фото/MSK/Toyota Camry 1HGBH41JXMN109186",
      "created_by": "admin@example.com",
      "created_at": "2024-01-15T10:00:00Z"
    }
  ],
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Purpose:** Fast car list without folder scanning
**Updated:** When cars are created or deleted

### _SLOT.json

Location: `{carRoot}/{slotTypeFolder}/{slotFolder}/_SLOT.json`

```json
{
  "count": 12,
  "cover": "photo1.jpg",
  "total_size_mb": 15.4,
  "updated_at": "2024-01-15T10:00:00Z"
}
```

**Purpose:** Fast slot stats without photo listing
**Updated:** Synchronously after every upload/delete

### _CAR.json (Existing)

Location: `{carRoot}/_CAR.json`

```json
{
  "region": "MSK",
  "make": "Toyota",
  "model": "Camry",
  "vin": "1HGBH41JXMN109186",
  "created_at": "2024-01-15T10:00:00Z",
  "created_by": "admin@example.com"
}
```

**Purpose:** Car metadata
**Updated:** When car is created

## Cache Invalidation

### Strategy: Write-Through with TTL

1. **_REGION.json:**
   - Invalidated: When car is created or deleted
   - Writes: Synchronous during car creation
   - Fallback: Always supported (folder listing)

2. **_SLOT.json:**
   - Invalidated: Never (always up-to-date)
   - Writes: Synchronous after every upload
   - Fallback: `listFolder()` if missing or corrupted

3. **Manual Edits:**
   - If user edits files outside app → _SLOT.json may be stale
   - Mitigation: Client can force refresh by not using counts endpoint
   - Acceptable: Counts become eventually consistent

## API Endpoints

### GET /api/cars?region={region}
Lists cars in a region

**Response:**
```json
{
  "ok": true,
  "cars": [
    {
      "region": "MSK",
      "make": "Toyota",
      "model": "Camry",
      "vin": "1HGBH41JXMN109186",
      "total_slots": 14,
      "locked_slots": 0,
      "empty_slots": 14,
      "counts_loaded": false
    }
  ]
}
```

**Note:** `counts_loaded: false` means counts are placeholders

### GET /api/cars/vin/{vin}
Gets car details with slot structure

**Response:**
```json
{
  "ok": true,
  "car": { ... },
  "slots": [
    {
      "slot_type": "dealer",
      "slot_index": 1,
      "disk_slot_path": "...",
      "locked": false,
      "file_count": 0,
      "total_size_mb": 0,
      "stats_loaded": false
    }
  ]
}
```

**Note:** `stats_loaded: false` means stats are placeholders

### GET /api/cars/vin/{vin}/counts (NEW)
Loads actual slot counts

**Response:**
```json
{
  "ok": true,
  "slots": [
    {
      "slot_type": "dealer",
      "slot_index": 1,
      "disk_slot_path": "...",
      "locked": true,
      "file_count": 12,
      "total_size_mb": 15.4,
      "stats_loaded": true
    }
  ],
  "progress": {
    "total_slots": 14,
    "locked_slots": 5,
    "empty_slots": 9
  }
}
```

**Note:** `stats_loaded: true` means stats are actual values

## Performance Impact

### Before Optimization

| Operation | API Calls |
|-----------|-----------|
| List 10 cars | 140+ |
| Open 1 car | 14+ |
| Total | 154+ |

### After Optimization

| Operation | API Calls (Best) | API Calls (Worst) |
|-----------|------------------|-------------------|
| List 10 cars (cached) | 1 | 12 |
| List 10 cars (uncached) | 12 | 12 |
| Open 1 car (fast) | 1 | 1 |
| Load counts (cached) | 14 | 28 |
| Total (cached) | 16 | 41 |

**Improvement:** 90%+ reduction in API calls for cached operations

## UI Integration

### Recommended Flow

1. **Page Load:**
   ```javascript
   // Fast: Show car list immediately
   const cars = await fetch('/api/cars?region=MSK');
   // cars[].counts_loaded === false
   renderCarList(cars);
   ```

2. **Open Car:**
   ```javascript
   // Fast: Show car card with slot placeholders
   const { car, slots } = await fetch('/api/cars/vin/ABC123');
   // slots[].stats_loaded === false
   renderCarCard(car, slots);
   ```

3. **Background Load:**
   ```javascript
   // Slow: Load actual counts in background
   const { slots, progress } = await fetch('/api/cars/vin/ABC123/counts');
   // slots[].stats_loaded === true
   updateCarCard(slots, progress);
   ```

### Progressive Enhancement

- Show car card skeleton immediately (Phase 1)
- Show loading indicators for counts
- Update UI when counts arrive (Phase 2)
- Avoid blocking on counts for initial render

## Maintenance

### Monitoring

Monitor these metrics:
1. API call count per region list
2. Cache hit rate for _REGION.json
3. Cache hit rate for _SLOT.json
4. Time to first render vs. time to complete

### Manual Operations

If _REGION.json or _SLOT.json become corrupted:
1. Delete the affected JSON file
2. System will automatically rebuild on next access
3. No data loss (source of truth is always the folder structure)

### Future Optimizations

Potential improvements:
1. Add TTL to _REGION.json for auto-refresh
2. Batch _SLOT.json updates
3. Add _SLOT.json validation/repair tool
4. Implement client-side caching

## Testing

Run optimization tests:
```bash
npx tsx src/lib/__tests__/optimization.test.ts
```

Tests validate:
- JSON file formats
- Interface flags (counts_loaded, stats_loaded)
- API call reduction expectations

## Rollback Plan

If issues occur:
1. The system gracefully falls back to folder listing if JSON files missing
2. No breaking changes to existing API contracts
3. Can delete all _REGION.json and _SLOT.json files to reset

## Related Files

- `src/lib/infrastructure/diskStorage/carsRepo.ts` - Core implementation
- `src/app/api/cars/vin/[vin]/counts/route.ts` - Counts endpoint
- `src/lib/__tests__/optimization.test.ts` - Tests
- `DISK_STRUCTURE.md` - Disk structure reference
