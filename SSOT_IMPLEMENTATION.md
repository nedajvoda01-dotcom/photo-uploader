# SSOT Path Structure Implementation - Summary

## Overview

This document summarizes the implementation of the Single Source of Truth (SSOT) for Yandex Disk path construction, completed as part of Step 2+3 requirements.

## What Was Implemented

### 1. Canonical Documentation: DISK_STRUCTURE.md

Created comprehensive documentation (7.5KB) that serves as the **only** reference for path structures:

- **Base Path Structure:** `${YANDEX_DISK_BASE_DIR}/Фото/`
- Complete folder hierarchy with examples
- Path component specifications (base, region, car root, slots)
- Slot types table (dealer, buyout, dummies)
- Usage examples for common operations
- Migration guide from old module
- Security considerations
- Troubleshooting guide

**Key Point:** This document is the canonical reference. Any questions about path structure should be answered by consulting DISK_STRUCTURE.md first.

### 2. Centralized Path Builder: lib/diskPaths.ts

Created a unified path builder module (6.5KB) with **13 functions**:

#### Core Path Functions
1. **`getBasePath()`** - Base path for all photo storage
2. **`getRegionPath(region)`** - Region-specific path
3. **`carRoot(region, make, model, vin)`** - Car root folder path
4. **`slotPath(carRoot, slotType, slotIndex)`** - Individual slot path
5. **`getAllSlotPaths(region, make, model, vin)`** - All 14 slot paths for a car

#### Helper Functions
6. **`getLockMarkerPath(slotPath)`** - Lock marker file path (_LOCK.json)
7. **`validateSlot(slotType, slotIndex)`** - Validate slot type/index combination
8. **`getSlotCount(slotType)`** - Number of slots for a type
9. **`getSlotTypeNameRu(slotType)`** - Russian name for slot type
10. **`getSlotTypeNumber(slotType)`** - Number prefix for slot type folder

#### Path Structure Example

```typescript
import { carRoot, slotPath } from '@/lib/diskPaths';

// Base: /Фото/Фото
// Region: /Фото/Фото/MSK
// Car: /Фото/Фото/MSK/Toyota Camry 1HGBH41JXMN109186
// Slot: /Фото/Фото/MSK/Toyota Camry 1HGBH41JXMN109186/2. Выкуп фото/3. Toyota Camry 1HGBH41JXMN109186
```

### 3. Code Refactoring

**Files Updated:** 9 API route files
- `app/api/cars/route.ts`
- `app/api/cars/[id]/upload/route.ts`
- `app/api/cars/[id]/share/route.ts`
- `app/api/cars/[id]/download/route.ts`
- `app/api/cars/[id]/slots/[slotType]/[slotIndex]/route.ts`
- `app/api/cars/vin/[vin]/upload/route.ts`
- `app/api/cars/vin/[vin]/share/route.ts`
- `app/api/cars/vin/[vin]/download/route.ts`
- `app/api/cars/vin/[vin]/slots/[slotType]/[slotIndex]/route.ts`

**Change Made:** All imports changed from:
```typescript
import { carRoot, slotPath } from '@/lib/yandexDiskStructure';
```

To:
```typescript
import { carRoot, slotPath } from '@/lib/diskPaths';
```

### 4. Documentation Updates

**README.md:**
- Added reference to DISK_STRUCTURE.md
- Clarified base path structure: `${YANDEX_DISK_BASE_DIR}/Фото`
- Added note about mandatory use of `lib/diskPaths.ts`

**IMPLEMENTATION_SUMMARY.md:**
- Updated module reference from `yandexDiskStructure.ts` to `diskPaths.ts`

**VIN_IMPLEMENTATION.md:**
- Updated path construction reference to use `diskPaths.ts`

### 5. Old Module Deprecated

**lib/yandexDiskStructure.ts:**
- Added `@deprecated` JSDoc tag
- Added migration instructions in comments
- Module kept for backward compatibility
- All new code must use `lib/diskPaths.ts`

## Path Structure Details

### Base Path Construction

The base path follows this pattern:
```
${YANDEX_DISK_BASE_DIR}/Фото/
```

Where `YANDEX_DISK_BASE_DIR` defaults to `/Фото`, resulting in:
```
/Фото/Фото/
```

This creates a "double Фото" structure which is intentional and part of the canonical specification.

### Complete Path Hierarchy

```
/Фото/Фото/                                    # Base (YANDEX_DISK_BASE_DIR + /Фото)
└── MSK/                                       # Region
    └── Toyota Camry 1HGBH41JXMN109186/        # Car (Make Model VIN)
        ├── 1. Дилер фото/                     # Dealer photos
        │   └── Toyota Camry 1HGBH41JXMN109186/
        │       ├── photo1.jpg
        │       └── _LOCK.json
        ├── 2. Выкуп фото/                     # Buyout photos (8 slots)
        │   ├── 1. Toyota Camry 1HGBH41JXMN109186/
        │   ├── 2. Toyota Camry 1HGBH41JXMN109186/
        │   ...
        │   └── 8. Toyota Camry 1HGBH41JXMN109186/
        └── 3. Муляги фото/                    # Dummy photos (5 slots)
            ├── 1. Toyota Camry 1HGBH41JXMN109186/
            ...
            └── 5. Toyota Camry 1HGBH41JXMN109186/
```

## Usage Examples

### Creating a Car with Slots

```typescript
import { carRoot, getAllSlotPaths } from '@/lib/diskPaths';
import { createFolder } from '@/lib/yandexDisk';

// Create car root
const root = carRoot('MSK', 'Toyota', 'Camry', '1HGBH41JXMN109186');
await createFolder(root);

// Create all 14 slots
const slots = getAllSlotPaths('MSK', 'Toyota', 'Camry', '1HGBH41JXMN109186');
for (const slot of slots) {
  await createFolder(slot.path);
}
```

### Uploading to a Slot

```typescript
import { slotPath, getLockMarkerPath } from '@/lib/diskPaths';

// Get slot path
const slot = slotPath(carRootPath, 'buyout', 3);
// Result: /Фото/Фото/MSK/Toyota Camry ABC123/2. Выкуп фото/3. Toyota Camry ABC123

// Upload photo
await uploadFile(`${slot}/photo1.jpg`, photoData);

// Create lock marker
const lockPath = getLockMarkerPath(slot);
// Result: /Фото/Фото/MSK/Toyota Camry ABC123/2. Выкуп фото/3. Toyota Camry ABC123/_LOCK.json
await uploadFile(lockPath, lockMetadata);
```

### Validating Slots

```typescript
import { validateSlot, getSlotCount } from '@/lib/diskPaths';

// Validate slot combinations
validateSlot('dealer', 1);    // true
validateSlot('dealer', 2);    // false
validateSlot('buyout', 5);    // true
validateSlot('buyout', 9);    // false
validateSlot('dummies', 3);   // true

// Get slot counts
getSlotCount('dealer');       // 1
getSlotCount('buyout');       // 8
getSlotCount('dummies');      // 5
```

## Verification

### Build Status
✅ TypeScript compilation: SUCCESS
✅ Next.js build: SUCCESS
✅ All routes registered: 25 routes
✅ No import errors
✅ No hardcoded paths detected

### Code Quality
✅ All path construction centralized
✅ Comprehensive documentation
✅ JSDoc comments on all functions
✅ Backward compatibility maintained
✅ Migration path provided

## Benefits

1. **Single Source of Truth:** DISK_STRUCTURE.md is the definitive reference
2. **Centralized Logic:** All path construction in one place
3. **Type Safety:** TypeScript types for slot types and validation
4. **Consistency:** No divergent path construction patterns
5. **Maintainability:** Changes to structure need only one place
6. **Documentation:** Clear examples and usage patterns
7. **Backward Compatible:** Old module still works (deprecated)

## Migration for Developers

If you're working with this codebase:

1. **For new code:** Always import from `@/lib/diskPaths`
2. **For existing code:** Update imports as you touch files
3. **For questions:** Consult DISK_STRUCTURE.md first
4. **Never:** Construct paths manually with string templates

## Testing Recommendations

While no automated tests were added (per instructions for minimal modifications), the following should be tested:

1. **Car Creation:** Verify folder structure matches DISK_STRUCTURE.md
2. **Photo Upload:** Check files go to correct slots
3. **Lock Markers:** Verify _LOCK.json in correct locations
4. **Path Validation:** Test with invalid slot types/indexes
5. **Region Separation:** Ensure cars in different regions are isolated

## Future Improvements

Potential enhancements (not implemented in this PR):

1. Add unit tests for path builder functions
2. Add integration tests for full car creation flow
3. Create path validator utility for debugging
4. Add path visualization tool
5. Implement path migration script if structure changes

## Conclusion

The SSOT for disk structure has been successfully established:

- ✅ **Documentation:** DISK_STRUCTURE.md is the canonical reference
- ✅ **Implementation:** lib/diskPaths.ts is the single path builder
- ✅ **Adoption:** All API endpoints use the centralized builder
- ✅ **Consistency:** No hardcoded paths remain in codebase
- ✅ **Quality:** Build passes, documentation complete

The codebase now has a clear, documented, and enforced structure for all Yandex Disk paths.

---

**Created:** 2026-02-07
**Status:** Complete
**Module:** lib/diskPaths.ts
**Documentation:** DISK_STRUCTURE.md
