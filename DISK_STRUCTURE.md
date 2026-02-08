# Yandex Disk Structure - Single Source of Truth

This document is the **canonical reference** for all Yandex Disk path structures. All code must construct paths according to this specification using the centralized path builder in `lib/diskPaths.ts`.

## Base Directory

The root of all photo storage on Yandex Disk:

```
${YANDEX_DISK_BASE_DIR}/
```

**Default value:** `YANDEX_DISK_BASE_DIR = "/Фото"`

This creates the structure: `/Фото/` (base directory)

## Full Directory Structure

```
${YANDEX_DISK_BASE_DIR}/
├── <REGION>/
│   └── <Марка> <Модель> <VIN>/
│       ├── 1. Дилер фото/
│       │   └── <Марка> <Модель> <VIN>/
│       │       ├── photo1.jpg
│       │       ├── photo2.jpg
│       │       └── _LOCK.json
│       ├── 2. Выкуп фото/
│       │   ├── 1. <Марка> <Модель> <VIN>/
│       │   │   ├── photo1.jpg
│       │   │   └── _LOCK.json
│       │   ├── 2. <Марка> <Модель> <VIN>/
│       │   │   └── ...
│       │   ...
│       │   └── 8. <Марка> <Модель> <VIN>/
│       │       └── ...
│       └── 3. Муляги фото/
│           ├── 1. <Марка> <Модель> <VIN>/
│           │   └── ...
│           ├── 2. <Марка> <Модель> <VIN>/
│           │   └── ...
│           ...
│           └── 5. <Марка> <Модель> <VIN>/
│               └── ...
└── ALL/
    └── <REGION>_<Марка>_<Модель>_<VIN>/
        ├── 1. Дилер фото/
        │   └── ...
        ├── 2. Выкуп фото/
        │   └── ...
        └── 3. Муляги фото/
            └── ...
```

## Path Components

### 1. Base Path
- **Pattern:** `${YANDEX_DISK_BASE_DIR}`
- **Example:** `/Фото`
- **Note:** YANDEX_DISK_BASE_DIR is the root directory for all photo storage

### 2. Region Path
- **Pattern:** `${BASE_PATH}/<REGION>`
- **Example:** `/Фото/MSK`
- **Valid regions:** Configured in `REGIONS` environment variable
- **Purpose:** Organize cars by geographical region

### 3. Archive Path (ALL Region)
- **Pattern:** `${BASE_PATH}/ALL`
- **Example:** `/Фото/ALL`
- **Purpose:** Central archive for cars deleted/archived from all regions
- **Note:** The "ALL" region is reserved for archived cars only

#### Archived Car Path
- **Pattern:** `${BASE_PATH}/ALL/<REGION>_<Марка>_<Модель>_<VIN>`
- **Example:** `/Фото/ALL/MSK_Toyota_Camry_1HGBH41JXMN109186`
- **Format:** Underscore-separated components (spaces replaced with underscores)
- **Purpose:** When a car is archived/deleted, its entire folder structure is moved from the region folder to the ALL archive folder

### 4. Car Root Path
- **Pattern:** `${REGION_PATH}/<Марка> <Модель> <VIN>`
- **Example:** `/Фото/MSK/Toyota Camry 1HGBH41JXMN109186`
- **Components:**
  - `Марка` (Make): Car manufacturer
  - `Модель` (Model): Car model
  - `VIN`: 17-character Vehicle Identification Number
- **Format:** Components separated by single spaces
- **Uniqueness:** VIN must be unique within each region

### 5. Slot Type Paths

#### Dealer Photos (1 slot)
- **Pattern:** `${CAR_ROOT}/1. Дилер фото/<Марка> <Модель> <VIN>`
- **Example:** `/Фото/MSK/Toyota Camry 1HGBH41JXMN109186/1. Дилер фото/Toyota Camry 1HGBH41JXMN109186`
- **Index:** Always 1
- **Purpose:** Official dealer photos

#### Buyout Photos (8 slots)
- **Pattern:** `${CAR_ROOT}/2. Выкуп фото/<INDEX>. <Марка> <Модель> <VIN>`
- **Example:** `/Фото/MSK/Toyota Camry 1HGBH41JXMN109186/2. Выкуп фото/3. Toyota Camry 1HGBH41JXMN109186`
- **Index range:** 1-8
- **Purpose:** Photos from vehicle buyout/inspection

#### Dummy Photos (5 slots)
- **Pattern:** `${CAR_ROOT}/3. Муляги фото/<INDEX>. <Марка> <Модель> <VIN>`
- **Example:** `/Фото/MSK/Toyota Camry 1HGBH41JXMN109186/3. Муляги фото/2. Toyota Camry 1HGBH41JXMN109186`
- **Index range:** 1-5
- **Purpose:** Template/placeholder photos

### 6. Lock Marker File
- **Pattern:** `${SLOT_PATH}/_LOCK.json`
- **Example:** `/Фото/MSK/Toyota Camry 1HGBH41JXMN109186/2. Выкуп фото/3. Toyota Camry 1HGBH41JXMN109186/_LOCK.json`
- **Purpose:** Indicates slot is filled and locked
- **Content:** JSON metadata about uploaded files

## Slot Types

| Slot Type | Count | Index Range | Russian Name |
|-----------|-------|-------------|--------------|
| dealer    | 1     | 1           | Дилер фото   |
| buyout    | 8     | 1-8         | Выкуп фото   |
| dummies   | 5     | 1-5         | Муляги фото  |

**Total slots per car:** 14 (1 + 8 + 5)

## Path Construction Rules

### Rule 1: Always Use Path Builder
All path construction **must** use functions from `lib/diskPaths.ts`. Never construct paths manually with string concatenation.

❌ **Bad:**
```typescript
const path = `/Фото/${region}/${make} ${model} ${vin}`;
```

✅ **Good:**
```typescript
import { carRoot } from '@/lib/diskPaths';
const path = carRoot(region, make, model, vin);
```

### Rule 2: Normalize Inputs
- VIN: Always uppercase
- Make/Model: Trim whitespace
- Region: Validate against REGIONS config

### Rule 3: Folder Naming Convention
- Slot type folders: `<NUMBER>. <Russian Name>`
- Slot subfolders: `<INDEX>. <Car Name>` (for buyout and dummies)
- Car name format: `<Make> <Model> <VIN>` (single spaces)

### Rule 4: Special Files
- Lock marker: Always `_LOCK.json` in slot folder
- Photos: Preserve original filenames
- No other special files allowed

## Usage Examples

### Creating a New Car
```typescript
import { carRoot, getAllSlotPaths, createFolder } from '@/lib/diskPaths';

// 1. Create car root folder
const root = carRoot('MSK', 'Toyota', 'Camry', '1HGBH41JXMN109186');
await createFolder(root);

// 2. Create all slot folders
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

// Upload photos
await uploadFile(`${slot}/photo1.jpg`, photoData);

// Create lock marker
await uploadFile(getLockMarkerPath(slot), lockMetadata);
```

### Sharing a Slot
```typescript
import { slotPath } from '@/lib/diskPaths';

const slot = slotPath(carRootPath, 'dealer', 1);
const publicUrl = await publishFolder(slot);
```

## Migration Notes

### From yandexDiskStructure.ts to diskPaths.ts

If you're updating existing code, replace imports:

```typescript
// Old (deprecated)
import { carRoot, slotPath } from '@/lib/yandexDiskStructure';

// New (canonical)
import { carRoot, slotPath } from '@/lib/diskPaths';
```

The function signatures remain identical for backward compatibility.

## Validation

### Path Validation Checklist
- [ ] Uses `lib/diskPaths.ts` functions
- [ ] No hardcoded path strings
- [ ] Proper error handling for invalid inputs
- [ ] Validates slot type and index
- [ ] Uses environment variable for base directory

### Code Review Checklist
When reviewing code changes:
1. Check all path construction uses `diskPaths.ts`
2. Verify no manual string concatenation for paths
3. Ensure proper validation of inputs
4. Confirm error messages are helpful
5. Check documentation is updated

## Environment Configuration

### Required Environment Variables
- `YANDEX_DISK_BASE_DIR`: Base directory path (default: "/Фото")
- `REGIONS`: Comma-separated list of valid regions

### Example Configuration
```bash
YANDEX_DISK_BASE_DIR=/Фото
REGIONS=MSK,SPB,EKB
```

## Security Considerations

1. **Path Traversal Protection:** Never accept user input directly in paths
2. **Validation:** Always validate region, VIN, slot type, and index
3. **Sanitization:** Remove special characters that could cause issues
4. **Authorization:** Check user region permissions before path operations

## Troubleshooting

### Common Issues

**Issue:** Path not found
- **Cause:** Incorrect path construction or missing folder
- **Solution:** Verify using `diskPaths.ts` functions, check folder exists

**Issue:** Lock file not detected
- **Cause:** Incorrect lock marker path
- **Solution:** Use `getLockMarkerPath()` function

**Issue:** Slot validation fails
- **Cause:** Invalid slot type/index combination
- **Solution:** Use `validateSlot()` before operations

## References

- Implementation: `lib/diskPaths.ts`
- Configuration: `lib/config.ts`
- API Documentation: `API.md`
- README: `README.md`

---

**Last Updated:** 2026-02-07
**Version:** 1.0.0
**Status:** Canonical Reference
