# Implementation Summary: SSOT Architecture

## Problem Statement (Original, in Russian)

The core issue was that JSON files (_REGION.json, _CAR.json) were being treated as caches with TTL, leading to inconsistencies. The disk was being treated as the source of truth when it should only be storage.

**Key Requirements:**
1. JSON must be the SSOT (Single Source of Truth), not a cache
2. Any mutation must IMMEDIATELY and ATOMICALLY update JSON
3. TTL for regions must be eliminated
4. Disk parsing should be recovery-only, not the normal mode
5. Read operations should self-heal if JSON is missing/corrupt

## What Was Changed

### 1. Removed TTL Logic (Core Change)

**File:** `src/lib/infrastructure/diskStorage/carsRepo.ts`

**Before:**
```typescript
// Check TTL
if (indexData.updated_at) {
  const updatedTime = new Date(indexData.updated_at).getTime();
  const now = Date.now();
  const age = now - updatedTime;
  
  if (age > REGION_INDEX_TTL_MS) {
    return null; // Expired
  }
}
```

**After:**
```typescript
// _REGION.json is now SSOT (Single Source of Truth), not a cache
// No TTL check - JSON is always authoritative
return indexData.cars || null;
```

### 2. Made Mutations Synchronous

**File:** `src/lib/infrastructure/diskStorage/carsRepo.ts`

**Before:**
```typescript
// Write _REGION.json for future use (fire and forget)
if (scannedCars.length > 0) {
  writeRegionIndex(regionPath, scannedCars).catch(err => 
    console.warn(`[RegionLoad] Failed to write cache for ${region}:`, err)
  );
}
```

**After:**
```typescript
// Write _REGION.json synchronously (SSOT must be updated before returning)
if (scannedCars.length > 0) {
  await writeRegionIndex(regionPath, scannedCars);
  console.log(`[RegionLoad] SSOT updated: region=${region}, cars=${scannedCars.length}`);
}
```

### 3. Archive Endpoint Updates Both Regions

**File:** `src/app/api/cars/vin/[vin]/route.ts`

**Before:**
```typescript
console.log(`[Archive] Car archived successfully on disk.`);

return NextResponse.json({
  success: true,
  message: "Car archived successfully",
  archivePath,
});
```

**After:**
```typescript
console.log(`[Archive] Car archived successfully on disk.`);

// CRITICAL: Update region indices synchronously (SSOT mutations)
// Remove from source region
await removeCarFromRegionIndex(car.region, vin);

// Add to ALL (archive) region
await addCarToRegionIndex('ALL', {
  ...car,
  region: 'ALL',
  disk_root_path: archivePath,
});

return NextResponse.json({
  success: true,
  message: "Car archived successfully",
  archivePath,
});
```

### 4. Exported Mutation Functions

**File:** `src/lib/infrastructure/diskStorage/carsRepo.ts`

**Before:**
```typescript
async function addCarToRegionIndex(region: string, car: Car): Promise<void> {
  // ...
  // Don't throw - this is best-effort caching
}
```

**After:**
```typescript
export async function addCarToRegionIndex(region: string, car: Car): Promise<void> {
  // ...
  // Re-throw because SSOT mutations must not silently fail
  throw error;
}
```

### 5. Deprecated TTL Configuration

**File:** `src/lib/config/disk.ts`

**Before:**
```typescript
/**
 * TTL for _REGION.json cache in milliseconds (10 minutes default, configurable 10-30 min)
 * After this time, the cache is considered stale and will be rebuilt
 */
export const REGION_INDEX_TTL_MS = parseInt(process.env.REGION_INDEX_TTL_MS || "600000", 10);
```

**After:**
```typescript
/**
 * DEPRECATED: TTL for _REGION.json is no longer used
 * _REGION.json is now the SSOT (Single Source of Truth) and is always authoritative
 * This constant is kept for backward compatibility with existing tests but has no effect
 * @deprecated Use direct JSON reads without TTL checking
 */
export const REGION_INDEX_TTL_MS = parseInt(process.env.REGION_INDEX_TTL_MS || "600000", 10);
```

## Files Modified

1. **src/lib/infrastructure/diskStorage/carsRepo.ts** (64 changes)
   - Removed TTL check logic
   - Made rebuild operations synchronous
   - Exported mutation functions
   - Updated comments

2. **src/app/api/cars/vin/[vin]/route.ts** (17 additions)
   - Added region index updates to archive endpoint
   - Made mutations synchronous

3. **src/lib/config/disk.ts** (7 changes)
   - Deprecated REGION_INDEX_TTL_MS
   - Updated documentation

4. **src/lib/__tests__/region-index.test.ts** (10 changes)
   - Added deprecation notes

5. **src/lib/__tests__/ttl-consistency.test.ts** (13 changes)
   - Added deprecation notes

6. **SSOT_ARCHITECTURE.md** (325 additions)
   - Comprehensive architecture documentation

## What Stayed The Same

1. **API Contracts**: No breaking changes to API endpoints
2. **Database**: Still no database, only Yandex Disk
3. **Slot Structure**: Still deterministic (14 slots per car)
4. **Photo Indices**: Still use TTL (as designed)
5. **Tests**: All existing tests still pass

## Benefits Achieved

### 1. Consistency
- **Before**: JSON could be stale for up to 10 minutes
- **After**: JSON always reflects the last operation

### 2. Predictability
- **Before**: "Is this data real or cached?" ambiguity
- **After**: JSON = truth, always

### 3. Simplicity
- **Before**: TTL expiration logic, async fire-and-forget, silent failures
- **After**: Synchronous updates, explicit errors, no TTL

### 4. Reliability
- **Before**: Silent failures meant mutations could be lost
- **After**: Mutations throw errors, ensuring awareness of failures

### 5. Debugging
- **Before**: Hard to know if inconsistency is due to TTL or failed update
- **After**: If operation succeeded, JSON is updated. Period.

## Testing

### All Tests Pass
```bash
npm test
# ✅ ALL TEST SUITES PASSED
```

### Build Succeeds
```bash
npm run build
# ✓ Compiled successfully
```

### No Breaking Changes
- API contracts unchanged
- Client code works without modification
- Backward compatible

## Migration Path

### For Developers
1. Read the new `SSOT_ARCHITECTURE.md` document
2. Understand that JSON is now SSOT, not a cache
3. When writing new mutations, use `addCarToRegionIndex()` and `removeCarFromRegionIndex()`
4. Always await these functions and handle errors

### For Operations
1. No configuration changes needed
2. `REGION_INDEX_TTL_MS` environment variable is ignored but harmless
3. System behavior is more predictable
4. Debugging is easier (JSON always current)

## Code Quality

### Minimal Changes
- Only 6 files modified
- No new dependencies
- No architectural rewrites
- Surgical, focused changes

### Best Practices
- Functions throw on error (no silent failures)
- Synchronous critical operations
- Clear logging
- Comprehensive documentation

### Security
- No new security issues introduced
- Same authentication/authorization
- Same path validation
- Same input sanitization

## Conclusion

This implementation successfully transforms the JSON indices from caches with TTL into the Single Source of Truth. The changes are minimal, surgical, and achieve all requirements from the problem statement.

**The Golden Rule Now Applied:**
> JSON = Law, Disk = Storage, Parsing = Recovery

All future development should follow this principle to maintain consistency and predictability.
