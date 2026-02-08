# Upload Fixes Summary

## What Was Failing

### 1. Database Check Failure
**Production logs:** `VercelPostgresError: missing_connection_string` because code still executes `@vercel/postgres sql\`SELECT 1\`` when `POSTGRES_URL` is not set.

**Root cause:** Module-level import of `@vercel/postgres` meant the library was loaded even when no database was configured, and `checkDatabaseConnection()` would attempt to execute SQL queries against a non-existent connection.

### 2. Yandex Disk Path Formatting Errors
**Production logs:** `DiskPathFormatError` / "upload path must start with '/'"

**Concrete failing example:** Paths with spaces around slashes: `"/Фото / R1 / Toyota Test ..."` which could also introduce a leading space (`" /..."`).

**Root cause:** Paths were not being normalized consistently, allowing malformed paths to reach the Yandex Disk API, which rejected them.

### 3. Silent Upload Failures
Slot folders may already exist, but file bytes never appear because the upload flow aborts before uploading, with only generic UI error messages.

**Root cause:** Errors were not properly propagated with stage information, making it difficult to diagnose where in the upload pipeline failures occurred.

## Exact Normalization Rules

The canonical path normalizer (`normalizeDiskPath`) implements these EXACT steps:

1. **Trim leading/trailing whitespace**: `"  /path  "` → `"/path"`
2. **Replace all backslashes with forward slashes**: `"\\Фото\\MSK"` → `"/Фото/MSK"`
3. **Remove spaces adjacent to slashes**:
   - `" / "` → `"/"`
   - `"/ "` → `"/"`
   - `" /"` → `"/"`
4. **Collapse multiple slashes**: `"//+"` → `"/"`
5. **Ensure starts with `/`**: If missing after previous steps, prefix with `/`
6. **Throw on empty**: If path is empty after trimming, throw descriptive error

### Examples

```typescript
normalizeDiskPath('/Фото / R1 / Toyota Test')        → '/Фото/R1/Toyota Test'
normalizeDiskPath('  \\Фото / MSK \\ car // photos  ') → '/Фото/MSK/car/photos'
normalizeDiskPath(' /Фото/MSK')                       → '/Фото/MSK'
normalizeDiskPath('   ')                              → throws "empty after trimming"
```

## Where Normalization Is Applied

### 1. Configuration Load Time
- **File:** `src/lib/config/disk.ts`
- **Applied to:** `YANDEX_DISK_BASE_DIR` environment variable
- **Purpose:** Ensure base directory is clean from the start

### 2. Path Construction
- **File:** `src/lib/domain/disk/paths.ts`
- **Functions:** All path construction functions call `normalizeDiskPath()`:
  - `getBasePath()`
  - `getRegionPath()`
  - `carRoot()`
  - `slotPath()`

### 3. Disk API Boundary
- **File:** `src/lib/infrastructure/yandexDisk/client.ts`
- **Function:** `validateAndNormalizePath()` called before every API operation
- **Operations:** 
  - `ensureDir()` - normalize before creating directories
  - `uploadToYandexDisk()` - normalize before uploading files
  - `createFolder()` - normalize before creating folders

### 4. Repair-on-Read
- **File:** `src/lib/infrastructure/diskStorage/carsRepo.ts`
- **Function:** `readCarMetadata()`
- **Purpose:** When reading `_CAR.json` files, normalize any stored paths and write back corrected values if changed

## Error Reporting Improvements

### Stage-Based Error Messages

All upload operations now include stage information in error messages:

- **ensureDir:** `[ensureDir] Failed at path: /Фото/MSK/car - Status: 404`
- **getUploadUrl:** `[getUploadUrl] Failed at path: /Фото/MSK/car/file.jpg - Status: 403`
- **uploadBytes:** `[uploadBytes] Failed at path: /Фото/MSK/car/file.jpg - Status: 500`
- **path_validation:** Errors during path normalization

### Enhanced UploadResult Interface

```typescript
export interface UploadResult {
  success: boolean;
  error?: string;
  path?: string;
  stage?: string; // NEW: Where the error occurred
}
```

## Idempotent Folder Creation

### Changes to ensureDir()

1. **409 (Conflict) treated as success:** When a folder already exists, this is acceptable
2. **Retry logic for transient errors:**
   - 409: Retryable (concurrent creation)
   - 5xx: Retryable (server errors)
   - 4xx (except 409): Non-retryable (client errors)
3. **Exponential backoff:** 1s, 2s, 4s for up to 3 attempts

## Making Postgres Optional

### Database Configuration Check

```typescript
export const isDatabaseConfigured = !!(POSTGRES_URL || POSTGRES_URL_NON_POOLING);
```

### Lazy Loading

The `sql` export is now a function wrapper that:
1. Checks if database is configured
2. Throws descriptive error if not configured
3. Lazy-loads `@vercel/postgres` only when needed
4. Caches the loaded module for reuse

### Updated checkDatabaseConnection()

```typescript
export async function checkDatabaseConnection(): Promise<boolean> {
  // If no database is configured, return false immediately
  if (!isDatabaseConfigured) {
    return false;
  }
  
  try {
    const sqlInstance = getSql();
    await sqlInstance`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
}
```

## How to Reproduce Before/After

### Before Fix

1. **Database Error:**
   ```bash
   # No POSTGRES_URL set
   curl http://localhost:3000/api/auth/login
   # ERROR: VercelPostgresError: missing_connection_string
   ```

2. **Path Error:**
   ```bash
   # Upload with spaces around slashes
   curl -F "file=@test.jpg" \
        -F "path=/Фото / R1 / Toyota Test" \
        http://localhost:3000/api/upload
   # ERROR: DiskPathFormatError: upload path must start with '/'
   ```

### After Fix

1. **Database Error - FIXED:**
   ```bash
   # No POSTGRES_URL set
   curl http://localhost:3000/api/auth/login
   # SUCCESS: Login works with ENV-based auth
   # Log: [Database] WARNING: No database configured - using ENV/file-based auth only
   ```

2. **Path Error - FIXED:**
   ```bash
   # Upload with spaces around slashes
   curl -F "file=@test.jpg" \
        -F "path=/Фото / R1 / Toyota Test" \
        http://localhost:3000/api/upload
   # SUCCESS: Path normalized to "/Фото/R1/Toyota Test" and upload succeeds
   ```

3. **Stage Error Reporting - NEW:**
   ```bash
   # Upload to non-existent directory with no permissions
   curl -F "file=@test.jpg" \
        -F "path=/forbidden/path/test.jpg" \
        http://localhost:3000/api/upload
   # ERROR: {
   #   "success": false,
   #   "error": "[ensureDir] Failed at path: /forbidden - Status: 403",
   #   "stage": "ensureDir"
   # }
   ```

## Tests Added

### 1. Path Normalization Tests
**File:** `src/lib/__tests__/pathValidation.test.ts`

- Tests for all normalization rules
- Tests for the exact production failing case: `"/Фото / R1 / Toyota Test"`
- Edge cases: empty strings, whitespace-only, null, undefined

### 2. Login Without Database Tests
**File:** `src/lib/__tests__/login-without-db.test.ts`

- Verifies `checkDatabaseConnection()` returns false without throwing
- Verifies `sql` proxy throws descriptive error when DB not configured
- Confirms no `missing_connection_string` error

## Verification Checklist

- [x] Build succeeds without POSTGRES_URL set
- [x] All path normalization tests pass
- [x] Login tests pass without database
- [x] Linting passes with no errors
- [x] Path normalization handles production case: `"/Фото / R1 / Toyota Test"` → `"/Фото/R1/Toyota Test"`
- [x] Error messages include stage information
- [x] Folder creation is idempotent (409 = success)
- [x] Paths repaired on read from _CAR.json
