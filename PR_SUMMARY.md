# PR Summary: DB Schema Fix, Region Logic, and Disk-First Architecture

## 🎯 Problem Statement (Russian Requirements Translation)

The original requirements (in Russian) specified:
1. **Create Car** should always create in selected region (not ALL) and not return false 500 errors
2. **Car Card** should always open and show 14 slots (1/8/5) with Upload/Download
3. **ALL = archive only** (no create/upload/lock in ALL)
4. **DB = cache**, not "truth" - missing DB rows shouldn't break UI

## 📊 Changes Summary

### Files Modified: 13
- **6 API routes** (cars creation, retrieval, upload, slots)
- **3 model files** (cars, carLinks, carSlots)
- **1 UI component** (cars/page.tsx)
- **3 core libraries** (db.ts, config, sync)

### Lines Changed: 400+
- **+342 insertions**
- **-58 deletions**

## 🔧 Implementation Details

### Step 1: Database Schema Migration ✅

**Problem**: FK constraints on `users` table break ENV-based authentication

**Solution**:
```sql
-- Drop all FK constraints
ALTER TABLE cars DROP CONSTRAINT IF EXISTS cars_created_by_fkey;
ALTER TABLE car_links DROP CONSTRAINT IF EXISTS car_links_created_by_fkey;
ALTER TABLE car_slots DROP CONSTRAINT IF EXISTS car_slots_locked_by_fkey;
ALTER TABLE car_slots DROP CONSTRAINT IF EXISTS car_slots_marked_used_by_fkey;

-- Migrate columns from INTEGER to TEXT
ALTER TABLE cars ALTER COLUMN created_by TYPE TEXT;
ALTER TABLE car_links ALTER COLUMN created_by TYPE TEXT;
ALTER TABLE car_slots ALTER COLUMN locked_by TYPE TEXT;
ALTER TABLE car_slots ALTER COLUMN marked_used_by TYPE TEXT;
```

**Key Features**:
- Idempotent migration (checks before dropping)
- Auto-migrates existing data
- Works on clean database (auto-creates schema)
- Uses email/identifier instead of user ID

### Step 2: Disk-First Car Creation ✅

**Problem**: DB failures cause 500 errors even when disk operation succeeds

**Solution - Disk First, DB as Cache**:
```typescript
// 1. Create on disk (source of truth)
const rootPath = carRoot(region, make, model, vin);
await createFolder(rootPath); // CRITICAL - must succeed

// 2. Create 14 slot folders on disk
for (const slot of slotPaths) {
  await createFolder(slot.path);
}

// 3. Try to cache in DB (non-critical)
try {
  car = await createCar({...});
  dbCacheOk = true;
} catch (dbError) {
  dbCacheOk = false;
  // Trigger background sync
  syncRegion(region, true);
}

// 4. Always return 201 if disk succeeded
return { ok: true, car, db_cache_ok: dbCacheOk };
```

**Region ALL Validation**:
```typescript
if (effectiveRegion === 'ALL') {
  return NextResponse.json({
    ok: false,
    code: "REGION_ALL_FORBIDDEN",
    message: "Cannot create cars in ALL region. ALL is for archive only."
  }, { status: 400 });
}
```

### Step 3: Unkillable GET Car Endpoint ✅

**Problem**: Missing DB records cause "Failed to load car data" errors

**Solution - Always Construct from Disk**:
```typescript
// 1. Sync region from disk
await syncRegion(session.region);

// 2. Try DB first
let car = await getCarByRegionAndVin(region, vin);

// 3. If not in DB, construct from disk
if (!car) {
  const carsResult = await listFolder(regionPath);
  // Find folder matching VIN and parse car info
  car = constructCarFromDiskFolder(folder);
}

// 4. Always return 14 slots
if (slots.length < EXPECTED_SLOT_COUNT) {
  const slotPaths = getAllSlotPaths(...);
  for (const slotPath of slotPaths) {
    // Check if slot exists on disk
    const lockExists = await exists(getLockMarkerPath(slotPath));
    fullSlots.push({
      ...syntheticSlot,
      status: lockExists ? 'locked' : 'empty'
    });
  }
}
```

**Constants**:
```typescript
const EXPECTED_SLOT_COUNT = 14; // 1 dealer + 8 buyout + 5 dummies
const NO_DB_RECORD_ID = -1; // Sentinel: not in database
```

### Step 4: Region ALL Restrictions ✅

**Server-Side Validation**:
```typescript
// In upload/mark/lock endpoints
if (car.region === 'ALL') {
  return NextResponse.json({
    code: "REGION_ALL_FORBIDDEN",
    message: "ALL region is for archive only"
  }, { status: 400 });
}
```

**UI Changes**:
```tsx
// Region selector
<select value={activeRegion} onChange={...}>
  {availableRegions.map(region => (
    <option key={region}>{region}</option>
  ))}
  <option value="ALL">ALL (Archive Only)</option>
</select>

// New Car button
{activeRegion === 'ALL' ? (
  <button disabled>
    + New Car (ALL is Archive Only)
  </button>
) : (
  <Link href={`/cars/new?region=${activeRegion}`}>
    + New Car
  </Link>
)}
```

## 🏗️ Architecture

### Before (Database as SSOT)
```
API Request → Check DB → Return or 404
              ↓
          (if missing: error)
```

### After (Disk as SSOT, DB as Cache)
```
API Request → Sync from Disk → Check DB → Return
              ↓                  ↓
          Update Cache    (if missing: construct from disk)
```

## 📈 Benefits

### 1. Resilience
- ✅ Car pages always open (even with broken DB)
- ✅ Create car always succeeds (if disk works)
- ✅ No false 500 errors from DB cache issues

### 2. Correctness
- ✅ Always shows 14 slots (structure from disk)
- ✅ Locked state from actual _LOCK.json files
- ✅ Region ALL properly restricted

### 3. Maintainability
- ✅ No FK dependencies on users table
- ✅ ENV-based auth compatible
- ✅ Clean separation: disk = truth, DB = cache

## 🧪 Testing Checklist

- [x] Schema auto-creation on clean database
- [x] Create car in ALL region (returns 400)
- [x] Car page with missing DB entries (works)
- [x] All 14 slots display correctly
- [x] Upload blocked in ALL region
- [x] Archive functionality (already working)
- [x] Code review completed (issues fixed)
- [ ] Manual testing on staging environment

## 🔒 Security Considerations

### Safe Patterns Used
- ✅ Parameterized SQL queries (no SQL injection)
- ✅ Centralized path builder (no path traversal)
- ✅ Region access validation (proper RBAC)
- ✅ Admin-only operations enforced

### Type Safety
- ✅ All interfaces updated for TEXT fields
- ✅ Sentinel value (-1) for missing records
- ✅ Constants for magic numbers

## 📝 Migration Guide

### For Existing Databases

The migration is **automatic and idempotent**:

1. Drop FK constraints (if they exist)
2. Convert INTEGER columns to TEXT
3. Preserve existing data (converts numbers to strings)

### For New Databases

Schema auto-creates with correct structure:
- No FK constraints created
- TEXT fields from start
- 14-slot structure per car

## 🎓 Key Learnings

### Disk-First Architecture
- Disk = source of truth for structure
- DB = cache for performance
- Always possible to rebuild cache from disk

### Sentinel Values
- Use -1 for "no DB record" (not 0)
- Makes intent explicit
- Avoids confusion with valid IDs

### Region Logic
- ALL = read-only archive
- Specific regions = active operations
- Clear separation in UI and API

## 🚀 Deployment Notes

### Environment Variables Required
```bash
# Existing
YANDEX_DISK_TOKEN=...
YANDEX_DISK_BASE_DIR=/Фото
REGIONS=MSK,SPB,EKB,...

# Database (optional - ENV auth works without DB)
POSTGRES_URL=...
```

### Backward Compatibility
- ✅ Existing cars remain accessible
- ✅ Existing slots work correctly
- ✅ No data loss during migration
- ✅ Old API responses still valid

## 📞 Support

If issues arise:
1. Check `/api/cars/vin/:vin` returns 14 slots
2. Verify ALL region is blocked for creates
3. Confirm DB migrations ran successfully
4. Check disk folder structure matches DISK_STRUCTURE.md

---

**Author**: GitHub Copilot Agent  
**Date**: 2026-02-07  
**Branch**: `copilot/fix-car-creation-region`  
**Commits**: 4 (+ 1 initial plan)  
**Review Status**: ✅ Code review completed, issues addressed
