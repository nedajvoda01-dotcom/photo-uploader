# SSOT Architecture: JSON as Single Source of Truth

## Overview

As of this update, the photo-uploader system has been refactored to make JSON files the **Single Source of Truth (SSOT)** instead of treating them as caches. This architectural change eliminates inconsistencies and makes the system predictable.

## The Two Worlds

### World A: Physical Disk (Yandex Disk)
- **Role**: Storage backend
- **Purpose**: Persist data
- **NOT the source of truth**

### World B: JSON Indices (_REGION.json, _CAR.json)
- **Role**: Single Source of Truth
- **Purpose**: Authoritative data structure
- **Always consistent with operations**

## Core Principles

### Principle 1: SSOT (Single Source of Truth)

**Any action IMMEDIATELY and ATOMICALLY updates the corresponding JSON.**

| Operation | JSON Update |
|-----------|-------------|
| `create`  | Add to `_REGION.json` synchronously |
| `archive` | Remove from source `_REGION.json` + Add to `ALL/_REGION.json` synchronously |
| `restore` | Remove from `ALL/_REGION.json` + Add to target `_REGION.json` synchronously |
| `delete`  | Remove from `_REGION.json` synchronously |
| `rename`  | Update in `_REGION.json` synchronously |

**Critical Rules:**
- ❌ NOT later
- ❌ NOT by TTL
- ❌ NOT "on next scan"
- ✅ BEFORE returning HTTP 200

### Principle 2: Auto-Healing on Read

**Any read request has the right to rebuild JSON if it doesn't match disk.**

Self-healing triggers when:
- JSON is missing → rebuild from disk
- JSON is corrupt/invalid schema → rebuild from disk
- Operation fails due to inconsistency → rebuild from disk

**Flow:**
```
GET /api/cars?region=X:
  1. Try read _REGION.json
  2. If missing/corrupt → scan disk + rebuild JSON
  3. Return JSON data
```

### Principle 3: Disk Parsing is Recovery Only

**Disk scanning is an emergency mechanism, not the normal path.**

Disk parser is called ONLY when:
- `_REGION.json` is missing
- `_REGION.json` is broken/corrupt
- `_REGION.json` points to non-existent folders

Normal operation flow:
```
disk → parse → rebuild JSON → everyone reads JSON
```

## TTL Policy

### ✅ TTL Allowed For:
- Photo indices (`_PHOTOS.json`) - 1-2 minutes
- Slot stats (`_SLOT.json`) - 1-2 minutes
- Previews and thumbnails
- Heavy read-only data

### ❌ TTL FORBIDDEN For:
- Region composition (`_REGION.json`) - **NO TTL**
- Car metadata (`_CAR.json`) - **NO TTL**

**Rationale:** Structural data must always be authoritative. Only performance caches (photos, stats) can use TTL.

## Implementation Details

### Region Index (_REGION.json)

**Location:** `{regionPath}/_REGION.json`

**Structure:**
```json
{
  "version": 1,
  "updated_at": "2026-02-10T15:00:00Z",
  "cars": [
    {
      "region": "R1",
      "make": "Toyota",
      "model": "Camry",
      "vin": "1HGBH41JXMN109186",
      "disk_root_path": "/Фото/R1/Toyota Camry 1HGBH41JXMN109186",
      "created_by": "user@example.com",
      "created_at": "2026-02-10T14:00:00Z"
    }
  ]
}
```

**Read Behavior:**
```typescript
// NO TTL CHECK - always authoritative
async function readRegionIndex(regionPath: string): Promise<Car[] | null> {
  const result = await downloadFile(`${regionPath}/_REGION.json`);
  
  if (!result.success) {
    return null; // Missing - will trigger self-healing
  }
  
  const indexData = JSON.parse(result.data.toString('utf-8'));
  
  if (!validateRegionIndexSchema(indexData)) {
    return null; // Corrupt - will trigger self-healing
  }
  
  // Return immediately - NO TTL check
  return indexData.cars;
}
```

**Write Behavior:**
```typescript
// Synchronous - blocks until complete
async function writeRegionIndex(regionPath: string, cars: Car[]): Promise<boolean> {
  const indexData = {
    version: 1,
    updated_at: new Date().toISOString(),
    cars: cars,
  };
  
  const result = await uploadText(`${regionPath}/_REGION.json`, indexData);
  
  if (!result.success) {
    throw new Error('Failed to update SSOT'); // Must not fail silently
  }
  
  return true;
}
```

### Mutation Functions

**All mutation functions are:**
1. **Public** (exported for use in API endpoints)
2. **Synchronous** (await completion)
3. **Atomic** (throw on error, don't silently fail)

```typescript
// Add/update car in region index
export async function addCarToRegionIndex(region: string, car: Car): Promise<void> {
  // Read, modify, write - all synchronous
  const cars = await readRegionIndex(regionPath) || [];
  cars.push(car);
  await writeRegionIndex(regionPath, cars);
  
  // Throws on error - caller must handle
}

// Remove car from region index
export async function removeCarFromRegionIndex(region: string, vin: string): Promise<void> {
  const cars = await readRegionIndex(regionPath) || [];
  const filtered = cars.filter(c => c.vin !== vin);
  await writeRegionIndex(regionPath, filtered);
  
  // Throws on error - caller must handle
}
```

### API Endpoint Pattern

**Every mutation endpoint follows this pattern:**

```typescript
export async function POST(request: NextRequest) {
  try {
    // 1. Validate input
    // 2. Change disk (move folder, create folder, etc.)
    // 3. SYNCHRONOUSLY update JSON
    await addCarToRegionIndex(region, car);
    
    // 4. Only then return success
    return successResponse({ ... });
  } catch (error) {
    // If JSON update fails, return error (not success)
    return errorResponse(...);
  }
}
```

**Example: Archive Operation**
```typescript
// 1. Move folder on disk
await moveFolder(sourcePath, archivePath);

// 2. Update source region SYNCHRONOUSLY
await removeCarFromRegionIndex(sourceRegion, vin);

// 3. Update destination region SYNCHRONOUSLY
await addCarToRegionIndex('ALL', car);

// 4. Return success only after all updates complete
return NextResponse.json({ success: true });
```

## Self-Healing Examples

### Scenario 1: Missing JSON
```
User: GET /api/cars?region=R1
System: 
  - Tries to read _REGION.json
  - File not found
  - Scans disk folders
  - Rebuilds _REGION.json
  - Returns car list
```

### Scenario 2: Corrupt JSON
```
User: GET /api/cars?region=R1
System:
  - Reads _REGION.json
  - Schema validation fails (invalid structure)
  - Scans disk folders
  - Rebuilds _REGION.json
  - Returns car list
```

### Scenario 3: Phantom Entry
```
User: GET /api/cars/vin/ABC123
System:
  - Reads _REGION.json → car exists
  - Tries to open car from disk
  - Folder not found on disk
  - Returns 404 (JSON will self-heal on next rebuild)
```

## Migration Notes

### What Changed

**Before:**
- JSON treated as cache with TTL
- TTL expiration triggered rebuild
- Async fire-and-forget updates
- Silent failures tolerated

**After:**
- JSON is SSOT with no TTL
- Self-healing on missing/corrupt only
- Synchronous updates before success
- Failures throw errors

### Backward Compatibility

- `REGION_INDEX_TTL_MS` constant still exists but is deprecated
- Old tests still pass (they test the constant, not behavior)
- Environment variable still works but has no effect
- Migration is transparent to clients

## Benefits

### Consistency
- **Before**: JSON could be stale, causing phantom entries or missing cars
- **After**: JSON is always up-to-date with last operation

### Predictability
- **Before**: "Is this car real or cached?" uncertainty
- **After**: JSON is truth - what you see is what exists

### Debugging
- **Before**: "Why is this car missing?" could be TTL, could be failed update
- **After**: If operation succeeded, JSON is updated. Period.

### Performance
- **Before**: TTL misses caused unnecessary disk scans
- **After**: Only scan disk on actual missing/corrupt JSON (rare)

## Testing

### Unit Tests
- Schema validation tests still pass
- TTL constant tests pass (deprecated but present)
- Mutation tests verify synchronous updates

### Integration Tests
- Archive operation updates both regions
- Create operation updates region index
- Restore operation updates both regions
- GET operations self-heal on missing JSON

## Future Considerations

### Potential Enhancements
1. **Optimistic Locking**: Add version numbers to prevent concurrent update conflicts
2. **Write-Ahead Log**: Log intended changes before applying them
3. **Checksums**: Validate JSON integrity with checksums
4. **Backup Strategy**: Periodically backup JSON files

### Not Recommended
- ❌ Adding TTL back to region indices
- ❌ Making mutations async again
- ❌ Treating disk as source of truth

## Summary

**The Golden Rules:**

1. **JSON = Law** - Always read as authoritative
2. **Mutations = Synchronous** - Update JSON before returning success
3. **Disk = Storage** - Backend only, not truth
4. **Parsing = Recovery** - Emergency mechanism for missing/corrupt JSON
5. **TTL = Forbidden** - Not for structural data (regions, cars)

By following these principles, the system eliminates an entire class of consistency bugs and becomes predictable and reliable.
