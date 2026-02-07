# Release Implementation Visual Summary

## Release Goals - Before & After

### 1. User Car Creation

#### Before (Broken)
```
User Dashboard
┌──────────────────────────────────────┐
│ My Cars          Region: R1          │
│                                      │
│ ❌ No "+ New Car" button            │
│ ❌ Only admins could create cars    │
│                                      │
│ [Toyota Camry - VIN: ABC123]        │
│ [Honda Accord - VIN: DEF456]        │
└──────────────────────────────────────┘
```

#### After (Working) ✅
```
User Dashboard
┌──────────────────────────────────────┐
│ My Cars     Region: R1  [+ New Car]  │
│                                      │
│ ✅ Users can create cars now        │
│ ✅ Creates in own region (R1)       │
│                                      │
│ [Toyota Camry - VIN: ABC123]        │
│ [Honda Accord - VIN: DEF456]        │
│ [Mazda CX5 - VIN: GHI789] ← NEW!   │
└──────────────────────────────────────┘
```

### 2. Archive Deletion

#### Before (Wrong)
```
DELETE Car
    ↓
❌ Permanently deletes folder from disk
    ↓
/Фото/R1/Toyota_Camry_ABC123/
    → DELETED FOREVER ❌
```

#### After (Correct) ✅
```
DELETE Car (Archive)
    ↓
✅ Moves folder to /Фото/ALL/
    ↓
FROM: /Фото/Фото/R1/Toyota Camry ABC123/
TO:   /Фото/ALL/R1_Toyota_Camry_ABC123/
    ↓
✅ All files preserved
✅ Can be restored manually
```

## Architecture Diagram

### SSOT Flow
```
┌─────────────────────────────────────────────────┐
│           Yandex.Disk (SSOT)                   │
│  • Folder structure = Truth                     │
│  • _LOCK.json = Slot lock status               │
│  • Files = Actual photos                        │
└───────────────────┬─────────────────────────────┘
                    │
                    │ syncRegion() on every read
                    ↓
┌─────────────────────────────────────────────────┐
│         Postgres/Neon (Cache)                  │
│  • Fast UI queries                              │
│  • Synced before every read                     │
│  • Business fields (is_used)                    │
└───────────────────┬─────────────────────────────┘
                    │
                    │ Fast queries
                    ↓
┌─────────────────────────────────────────────────┐
│              UI (Next.js)                       │
│  • Region selector (admin)                      │
│  • Region badge (user)                          │
│  • Car list, upload, download                   │
└─────────────────────────────────────────────────┘
```

## User vs Admin Access

### User (Photographer)
```
┌─────────────────────────────────────┐
│  My Cars     Region: R1             │
│  ┌─────────────────────┐            │
│  │ Region: R1          │ ← Fixed    │
│  │ (cannot change)     │            │
│  └─────────────────────┘            │
│                                     │
│  [+ New Car]  ← ✅ Can create      │
│                                     │
│  ✅ Can view cars in R1            │
│  ✅ Can upload photos              │
│  ✅ Can download ZIP               │
│  ❌ Cannot delete cars             │
│  ❌ Cannot manage links            │
│  ❌ Cannot toggle "used"           │
└─────────────────────────────────────┘
```

### Admin
```
┌─────────────────────────────────────┐
│  My Cars     Region: [R1 ▼]         │
│  ┌─────────────────────┐            │
│  │ Region: R1 ▼        │ ← Dropdown │
│  │  • R1               │            │
│  │  • R2               │            │
│  │  • R3               │            │
│  │  • K1, V, S1, S2    │            │
│  └─────────────────────┘            │
│                                     │
│  [+ New Car]  ← ✅ Can create      │
│                                     │
│  ✅ Can view all regions           │
│  ✅ Can switch regions             │
│  ✅ Can create in any region       │
│  ✅ Can delete (archive)           │
│  ✅ Can manage links               │
│  ✅ Can toggle "used"              │
└─────────────────────────────────────┘
```

## Archive Structure

### Active Cars Location
```
/Фото/Фото/
├── R1/
│   ├── Toyota Camry 1HGBH41JXMN109186/
│   │   ├── 1. Дилер фото/
│   │   ├── 2. Выкуп фото/
│   │   └── 3. Муляги фото/
│   └── Honda Accord 2HGBH41JXMN109187/
├── R2/
│   └── Mazda CX5 3HGBH41JXMN109188/
└── R3/
    └── ...
```

### Archived Cars Location (NEW) ✅
```
/Фото/ALL/
├── R1_Toyota_Camry_1HGBH41JXMN109186/
│   ├── 1. Дилер фото/
│   │   └── Toyota Camry 1HGBH41JXMN109186/
│   │       ├── photo1.jpg
│   │       └── _LOCK.json
│   ├── 2. Выкуп фото/
│   │   ├── 1. Toyota Camry 1HGBH41JXMN109186/
│   │   └── ...
│   └── 3. Муляги фото/
│       └── ...
├── R2_Honda_Accord_2HGBH41JXMN109187/
└── R3_Mazda_CX5_3HGBH41JXMN109188/
```

**Archive Naming Convention:**
- Format: `{region}_{make}_{model}_{vin}`
- Spaces replaced with underscores
- Example: `R1_Toyota_Camry_1HGBH41JXMN109186`
- Benefits:
  - Easy to identify original region
  - Sorted alphabetically by region
  - Preserves all metadata in folder name

## API Changes

### Car Creation Endpoint
```typescript
// Before: Admin only
POST /api/cars
Authorization: requireAdmin() ❌

// After: All authenticated users
POST /api/cars
Authorization: requireAuth() ✅

// User request (region automatic)
{
  make: "Toyota",
  model: "Camry",
  vin: "1HGBH41JXMN109186"
  // region: automatically set to session.region
}

// Admin request (region selectable)
{
  make: "Honda",
  model: "Accord",
  vin: "2HGBH41JXMN109187",
  region: "R2" // Admin can specify
}
```

### Delete (Archive) Endpoint
```typescript
// Before: Hard delete
DELETE /api/cars/vin/:vin
→ deleteFolder(car.disk_root_path) ❌
→ Files permanently lost

// After: Archive (soft delete)
DELETE /api/cars/vin/:vin
→ moveFolder(
    from: car.disk_root_path,
    to: `/Фото/ALL/${region}_${make}_${model}_${vin}`
  ) ✅
→ Soft delete in DB (deleted_at timestamp)
→ Files preserved in archive
→ Can be restored manually
```

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
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,  -- ✅ Soft delete for archive
  UNIQUE(region, vin)
);
```

**Soft Delete Query:**
```sql
-- Active cars only (not archived)
SELECT * FROM cars 
WHERE region = 'R1' 
  AND deleted_at IS NULL  -- ✅ Excludes archived cars
ORDER BY created_at DESC;
```

## Code Changes Summary

### 1. Allow User Car Creation
**File:** `app/api/cars/route.ts`
```typescript
// Changed from:
const authResult = await requireAdmin();

// To:
const authResult = await requireAuth();

// Region logic:
const effectiveRegion = session.role === 'admin' 
  ? (bodyRegion || getEffectiveRegion(session, bodyRegion))
  : session.region; // Users always use their own region
```

### 2. Archive Deletion
**File:** `lib/yandexDisk.ts`
```typescript
// NEW function
export async function moveFolder(
  fromPath: string, 
  toPath: string, 
  overwrite: boolean = false
): Promise<{ success: boolean; error?: string }> {
  // Uses Yandex Disk move API
  // POST /resources/move
}
```

**File:** `app/api/cars/vin/[vin]/route.ts`
```typescript
// Archive path with region prefix
const archiveName = `${car.region}_${car.make}_${car.model}_${vin}`
  .replace(/\s+/g, '_');
const archivePath = `${basePath}/ALL/${archiveName}`;

// Move instead of delete
await moveFolder(car.disk_root_path, archivePath, false);

// Still soft delete in DB
await deleteCarByVin(car.region, vin);
```

### 3. UI Update
**File:** `app/cars/page.tsx`
```typescript
// Before: Only admins see button
{isAdmin && (
  <Link href="/cars/new" className={styles.newButton}>
    + New Car
  </Link>
)}

// After: All users see button
{activeRegion && (
  <Link href={`/cars/new?region=${activeRegion}`} className={styles.newButton}>
    + New Car
  </Link>
)}
```

## Testing Scenarios

### Test 1: User Creates Car
1. Login as `r1@photouploader.ru` (password: `48392`)
2. See "+ New Car" button ✅
3. Create car with VIN `TEST00000000001`
4. Verify: Car in `/Фото/Фото/R1/Test_Car_TEST00000000001/` ✅
5. Verify: User cannot specify different region ✅

### Test 2: Admin Creates Car in Different Region
1. Login as `admin@example.com`
2. Select region "R2" from dropdown ✅
3. Create car with VIN `TEST00000000002`
4. Verify: Car in `/Фото/Фото/R2/Test_Car_TEST00000000002/` ✅
5. Switch to region "R1"
6. Verify: Previous car not visible in R1 ✅

### Test 3: Archive Deletion
1. Login as admin
2. Select region with test car
3. Delete test car
4. Verify on Yandex Disk:
   - Original path empty ✅
   - Archive path exists: `/Фото/ALL/R1_Test_Car_TEST00000000001/` ✅
   - All files preserved ✅
5. Verify in database:
   - `deleted_at` timestamp set ✅
   - Car excluded from listings ✅

## Performance Considerations

### On-Read Sync
```typescript
// Called before every list/get operation
await syncRegion(effectiveRegion);

// Syncs:
// - Car existence (marks deleted_at if missing on disk)
// - Slot lock status (from _LOCK.json)
// - File counts and sizes
// - Maintains SSOT principle
```

### Caching Benefits
- DB queries are fast (indexed by region)
- UI doesn't wait for disk operations
- Sync happens once per request
- Memoization prevents redundant syncs

## Success Criteria Met ✅

- [x] Yandex.Disk is SSOT
- [x] Postgres is cache
- [x] Users work in own region
- [x] Admin manages all regions
- [x] Both users and admins create cars
- [x] Delete = Archive to /Фото/ALL/
- [x] All builds pass
- [x] Complete documentation
- [x] Ready for production

## Deployment Notes

1. Set environment variables (see TESTING_GUIDE.md)
2. Database auto-initializes on first request
3. Archive folder `/Фото/ALL/` created automatically
4. Users assigned via `REGION_*_USERS` ENV
5. Admins set via `ADMIN_EMAIL` and `ADMIN_REGION=ALL`

**The system is production-ready! 🚀**
