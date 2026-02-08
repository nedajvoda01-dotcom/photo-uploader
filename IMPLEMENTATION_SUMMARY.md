# Yandex Disk API Optimization - Implementation Summary

## ✅ Completed Implementation

This document summarizes the optimization work completed to minimize Yandex Disk API calls.

## Changes Made

### 1. Core Repository Changes (`src/lib/infrastructure/diskStorage/carsRepo.ts`)

#### Added JSON Index Management

**_REGION.json Management:**
- `readRegionIndex()` - Read car list from region index
- `writeRegionIndex()` - Write car list to region index
- `addCarToRegionIndex()` - Add car to index after creation
- `removeCarFromRegionIndex()` - Remove car from index after deletion

**_SLOT.json Management:**
- `updateSlotStats()` - Write slot statistics (count, cover, size, timestamp)
- Updated `getSlotStats()` to read from `_SLOT.json` first, then fallback

#### Updated Core Functions

**`listCarsByRegion()` - Phase 0 Optimization:**
```typescript
// Before: 14+ API calls per car (slot scanning)
// After: 1 API call (read _REGION.json) OR N+2 calls (scan + cache)
```
- Tries to read `_REGION.json` first (1 API call)
- Falls back to folder listing if index missing
- Returns cars with `counts_loaded: false`
- Writes `_REGION.json` after scan for future use

**`getCarWithSlots()` - Phase 1 Optimization:**
```typescript
// Before: 14+ API calls (slot scanning)
// After: 1 API call (read _CAR.json only)
```
- Builds slots deterministically using `getAllSlotPaths()`
- No folder scanning
- Returns slots with `stats_loaded: false`

**`loadCarSlotCounts()` - Phase 2 (NEW):**
```typescript
// Lazy-load actual counts after initial render
// 14-28 API calls (read _SLOT.json or scan)
```
- Calls existing `getCarSlots()` to load full stats
- Returns slots with `stats_loaded: true`

**`createCar()`:**
- Now updates `_REGION.json` after creating car
- Ensures index stays synchronized

#### Updated Data Structures

**CarWithProgress:**
```typescript
interface CarWithProgress extends Car {
  total_slots: number;
  locked_slots: number;
  empty_slots: number;
  counts_loaded?: boolean;  // NEW FLAG
}
```

**Slot:**
```typescript
interface Slot {
  slot_type: SlotType;
  slot_index: number;
  disk_slot_path: string;
  locked: boolean;
  file_count: number;
  total_size_mb: number;
  public_url?: string;
  is_used?: boolean;
  stats_loaded?: boolean;  // NEW FLAG
}
```

### 2. New API Endpoint

**`GET /api/cars/vin/:vin/counts`** (`src/app/api/cars/vin/[vin]/counts/route.ts`)

Purpose: Load slot counts lazily after initial car card render

Response:
```json
{
  "ok": true,
  "slots": [
    {
      "slot_type": "dealer",
      "slot_index": 1,
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

### 3. Upload Endpoint Updates

**`POST /api/cars/vin/:vin/upload`** (`src/app/api/cars/vin/[vin]/upload/route.ts`)

Added synchronous `_SLOT.json` update:
```typescript
// After successful upload and _LOCK.json creation
await updateSlotStats(slot.disk_slot_path);
```

This ensures counts are always up-to-date after uploads.

### 4. Documentation

**OPTIMIZATION.md:**
- Complete optimization strategy
- JSON file formats
- API endpoint documentation
- Performance metrics
- UI integration patterns
- Cache invalidation strategy

**Tests (`src/lib/__tests__/optimization.test.ts`):**
- Validates JSON structures
- Verifies interface flags
- Documents API call reduction

## File Formats

### _REGION.json
```
Location: {YANDEX_DISK_BASE_DIR}/{REGION}/_REGION.json
Purpose: Fast car list without folder scanning
Updated: When cars created/deleted
```

### _SLOT.json
```
Location: {carRoot}/{slotTypeFolder}/{slotFolder}/_SLOT.json
Purpose: Fast slot stats without photo listing
Updated: Synchronously after every upload
```

## Performance Impact

| Operation | Before | After (Best) | After (Worst) |
|-----------|--------|--------------|---------------|
| List 10 cars | 140+ calls | 1 call | 12 calls |
| Open 1 car | 14+ calls | 1 call | 1 call |
| Load counts | N/A | 14 calls | 28 calls |
| **Total** | **154+ calls** | **16 calls** | **41 calls** |

**Improvement:** 90%+ reduction in API calls for cached operations

## Backward Compatibility

✅ **100% backward compatible**
- All JSON files are optional
- System gracefully falls back to folder listing
- No breaking changes to existing APIs
- Existing integrations continue to work

## Testing

All tests pass:
```bash
npm test          # All existing tests pass
npm run build     # Build succeeds
npx tsx src/lib/__tests__/optimization.test.ts  # Optimization tests pass
```

## Rollback Plan

If issues occur:
1. System automatically falls back to folder listing if JSON missing
2. Can delete all `_REGION.json` and `_SLOT.json` files to reset
3. No data loss (folder structure is source of truth)

## Next Steps for Integration

### Frontend Integration

1. **Update Car List UI:**
   ```javascript
   // Check counts_loaded flag
   if (!car.counts_loaded) {
     showPlaceholder();
   } else {
     showActualCounts();
   }
   ```

2. **Update Car Card UI:**
   ```javascript
   // Phase 1: Render immediately
   const { car, slots } = await fetch(`/api/cars/vin/${vin}`);
   renderCard(car, slots);  // slots[].stats_loaded === false
   
   // Phase 2: Load counts in background
   const { slots, progress } = await fetch(`/api/cars/vin/${vin}/counts`);
   updateCard(slots, progress);  // slots[].stats_loaded === true
   ```

3. **Progressive Enhancement:**
   - Show skeleton/placeholder UI immediately
   - Display loading indicators for counts
   - Update UI smoothly when counts arrive

## Files Changed

1. `src/lib/infrastructure/diskStorage/carsRepo.ts` - Core implementation
2. `src/app/api/cars/vin/[vin]/counts/route.ts` - New endpoint
3. `src/app/api/cars/vin/[vin]/upload/route.ts` - Update _SLOT.json on upload
4. `OPTIMIZATION.md` - Complete documentation
5. `src/lib/__tests__/optimization.test.ts` - Tests

## Acceptance Criteria Status

✅ **All criteria met:**

- [x] Region page: exactly 1 API call (cached) or N+2 calls (uncached)
- [x] No nested folder scans for car list
- [x] Car page initial render: O(1) API calls
- [x] No per-slot listFolder calls on initial load
- [x] Counts loaded only after opening car
- [x] Total Disk calls reduced from "dozens per car" to ~O(1) for initial load
- [x] Eventual consistency maintained
- [x] Graceful fallback if caches missing

## Summary

✨ **Optimization complete!**

The implementation follows the specification exactly:
- **Phase 0:** Region list without slot scanning (1 call cached, N+2 uncached)
- **Phase 1:** Car card opens instantly (1 call)
- **Phase 2:** Counts load on-demand (14-28 calls)

API calls reduced by **90%+** for typical workflows while maintaining data accuracy and graceful degradation.
