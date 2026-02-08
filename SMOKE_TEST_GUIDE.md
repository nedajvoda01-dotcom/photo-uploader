# Enhanced Smoke Test Guide - Definition of Done

## Overview

The `scripts/smoke.ts` is the **SOURCE OF TRUTH** for system verification. It validates the entire critical flow with hard assertions and proper error handling.

## API Endpoint Mappings

This smoke test uses **real endpoints** from the application. Here's the mapping:

| Endpoint | Method | File Path | Test Step |
|----------|--------|-----------|-----------|
| `/api/login` | POST | `app/api/login/route.ts` | Step 1: Login |
| `/api/cars` | GET | `app/api/cars/route.ts` | Step 2: Check role/region |
| `/api/cars` | POST | `app/api/cars/route.ts` | Step 3: Create car |
| `/api/cars/vin/[vin]` | GET | `app/api/cars/vin/[vin]/route.ts` | Step 4: Get car by VIN |
| `/api/cars/vin/[vin]/upload` | POST | `app/api/cars/vin/[vin]/upload/route.ts` | Step 6: Upload |
| `/api/cars/vin/[vin]/slots/[slotType]/[slotIndex]` | PATCH | `app/api/cars/vin/[vin]/slots/[slotType]/[slotIndex]/route.ts` | Step 7: Lock, Step 10: Used |
| `/api/cars/vin/[vin]/download` | GET | `app/api/cars/vin/[vin]/download/route.ts` | Step 8: Download |
| `/api/cars/vin/[vin]/links` | GET/POST | `app/api/cars/vin/[vin]/links/route.ts` | Step 9: Links |
| `/api/cars/vin/[vin]` | DELETE | `app/api/cars/vin/[vin]/route.ts` | Step 11: Archive |

**Error Handling:** The script fails with exit code 1 if any endpoint returns 404 or 405, indicating a misconfigured or missing route.

## Hard Assertions

The smoke test includes strict assertions that must pass:

### 1. After Login
- **Admin users:** Must have `region='ALL'` and `activeRegion != 'ALL'`
- **Regular users:** Must have `region` in `['R1', 'R2', 'S1', 'S2']`

### 2. After Create Car
- `car.region` must be in `['R1', 'R2', 'S1', 'S2']`
- `car.region` must **NOT** be `'ALL'`

### 3. After Get Car
- `slots` array must exist
- `slots.length` must equal `14`
- At least one slot must have a `disk_path` value

### 4. RBAC (Role-Based Access Control)
- **User role:** May get 403 on admin-only endpoints (links, used, archive)
- **Admin role:** Should have 200 OK on links and toggle_used

### 5. Download ZIP
- If slot `locked=true`: status 200 with content-type containing "zip"
- If slot `locked=false`: status 409 or 403

## Required Artifact Output

When you run the smoke test, it MUST output three key artifacts:

### A) BASE_URL
```
ARTIFACT: BASE_URL
================================================================================
BASE_URL=https://photo-uploader-abc.vercel.app
================================================================================
```

### B) POST /api/cars
```
ARTIFACT: POST /api/cars
================================================================================
{
  "endpoint": "https://photo-uploader-abc.vercel.app/api/cars",
  "status": 201,
  "body": {
    "ok": true,
    "car": {
      "region": "R1",
      "make": "Toyota",
      "model": "Camry",
      "vin": "TEST1708844912345"
    }
  }
}
================================================================================
```

### C) GET /api/cars/vin/[vin]
```
ARTIFACT: GET /api/cars/vin/[vin]
================================================================================
{
  "endpoint": "https://photo-uploader-abc.vercel.app/api/cars/vin/TEST1708844912345",
  "status": 200,
  "ok": true,
  "car": {...},
  "slots_length": 14,
  "first_2_slots": [
    {
      "type": "exterior",
      "index": 0,
      "locked": false,
      "disk_path": "/disk/R1/Toyota/Camry/TEST1708844912345/exterior_0"
    },
    {
      "type": "exterior",
      "index": 1,
      "locked": false,
      "disk_path": "/disk/R1/Toyota/Camry/TEST1708844912345/exterior_1"
    }
  ]
}
================================================================================
```

## Test Mode (Yandex Operations)

### When `--yandexTestMode` is enabled:

The test clearly indicates which steps are skipped:

```
⚠️  Yandex test mode: ON
   The following steps will be SKIPPED:
   - File upload to Yandex Disk
   - Slot locking (requires upload)
   - ZIP download (requires locked slots)
   All other tests (create car, get car, 14 slots) will execute normally.
```

Skipped steps show:
```
⏭️  POST upload to slot
   Status: SKIPPED
   Reason: Yandex test mode enabled
```

### When `--yandexTestMode` is disabled:

All upload/lock/download tests execute normally with real Yandex Disk operations.

## Cleanup Behavior

When `--cleanup=1` is specified:

1. After all tests, the script calls `DELETE /api/cars/vin/[vin]` to archive the car
2. Then verifies that `GET /api/cars` no longer includes the test VIN in the active region
3. Assertion: The VIN must NOT appear in the active region's car list

```
✅ Verify archive cleanup
   Endpoint: https://photo-uploader-abc.vercel.app/api/cars
   Status: 200
   VIN TEST1708844912345 in active region: NO (PASS)
   ✓ Cleanup assertion passed: VIN removed from active region
```

# Comprehensive Smoke Test Guide

## Overview

The `smoke.ts` script is a comprehensive end-to-end test that verifies the entire critical flow of the photo-uploader application.

## What It Tests

The smoke test validates:

1. **Authentication** - Login and session management
2. **Role/Region Checking** - Verify user permissions
3. **Car Creation** - Create test car with unique VIN
4. **Car Retrieval** - Get car by VIN with sync
5. **14 Slots Verification** - Ensure all photo slots exist
6. **Upload** - Test file upload to slot
7. **Lock** - Test slot locking
8. **Download** - Test ZIP download (if implemented)
9. **Links** - Test share links
10. **Used Flag** - Test marking photos as used
11. **Archive** - Test car archiving (cleanup)

## Installation

Ensure dependencies are installed:

```bash
npm install
```

## Usage

### Basic Usage

```bash
npm run smoke -- --baseUrl=<url> --email=<email> --password=<password> [options]
```

### Required Parameters

- `--baseUrl` - Preview URL or localhost (e.g., `http://localhost:3000` or `https://preview.vercel.app`)
- `--email` - User email for login
- `--password` - User password

### Optional Parameters

- `--role` - `admin` or `user` (auto-detected from login response)
- `--region` - `R1`, `R2`, `S1`, or `S2` (required for admin users)
- `--yandexTestMode` - Skip actual Yandex Disk operations (`1` or `true`)
- `--cleanup` - Archive test car after tests (`1` or `true`, or flag without value)

## Examples

### Example 1: Test Localhost as Admin

```bash
npm run smoke -- \
  --baseUrl=http://localhost:3000 \
  --email=admin@example.com \
  --password=admin123 \
  --region=R1 \
  --cleanup
```

### Example 2: Test Preview as Regular User

```bash
npm run smoke -- \
  --baseUrl=https://photo-uploader-abc123.vercel.app \
  --email=user@example.com \
  --password=userpass \
  --yandexTestMode=1
```

### Example 3: Test Production

```bash
npm run smoke -- \
  --baseUrl=https://photo-uploader.vercel.app \
  --email=test@example.com \
  --password=testpass \
  --region=R1
```

### Example 4: CI/CD Integration

```bash
# In CI environment
npm run smoke -- \
  --baseUrl=$PREVIEW_URL \
  --email=$TEST_USER_EMAIL \
  --password=$TEST_USER_PASSWORD \
  --region=R1 \
  --yandexTestMode=1 \
  --cleanup
```

## Output Format

The script outputs detailed information for each test step:

```
================================================================================
[SMOKE] POST /api/login
================================================================================

✅ POST /api/login
   Status: 200
   Body:
   {
     "ok": true,
     "user": {
       "email": "admin@example.com",
       "role": "admin",
       "region": "ALL"
     }
   }

✅ POST /api/cars
   Status: 201
   Body:
   {
     "ok": true,
     "car": {
       "id": 123,
       "region": "R1",
       "make": "Toyota",
       "model": "Camry",
       "vin": "TEST17088449123456"
     }
   }

...

================================================================================
SMOKE TEST SUMMARY
================================================================================

Total Tests: 11
Passed: 11 ✅
Failed: 0 ❌
Duration: 5.34s

================================================================================
DETAILED RESULTS
================================================================================
1. ✅ POST /api/login (234ms)
   Status: 200
2. ✅ Check role/region (123ms)
   Status: 200
3. ✅ POST /api/cars (456ms)
   Status: 201
4. ✅ GET /api/cars/vin/TEST17088449123456 (189ms)
   Status: 200
...
```

## Exit Codes

- `0` - All tests passed ✅
- `1` - One or more tests failed ❌

## Key Features

### 1. Cookie/Session Management

The script automatically:
- Captures session cookies from login
- Sends cookies with all subsequent requests
- Maintains session throughout test execution

### 2. Unique Test VINs

Each test run generates a unique VIN:
- Format: `TEST` + 13 digits (timestamp-based)
- Total length: 17 characters (valid VIN length)
- Example: `TEST17088449123456`

### 3. Region Validation

The script validates:
- Cars are NOT created in region=ALL
- Admin users must specify --region
- Region access controls work correctly

### 4. Comprehensive Assertions

Each step includes assertions:
- HTTP status codes (200, 201, etc.)
- Response body structure
- Expected data presence (14 slots, last_sync_at, etc.)
- Business logic (region != ALL)

### 5. Error Handling

The script:
- Continues testing even if non-critical tests fail
- Reports all errors with details
- Provides helpful error messages
- Fails fast on critical errors (login, car creation)

## Yandex Test Mode

When `--yandexTestMode=1` is set:
- Upload tests are skipped (no actual file upload to Yandex Disk)
- Download tests are skipped
- All API calls are still tested
- Useful for CI environments without Yandex credentials

## Cleanup Mode

When `--cleanup` is set:
- Test car is archived after all tests
- Moves car to /ALL/ folder on Yandex Disk
- Marks car as deleted in database
- Useful to avoid cluttering test environment

## Troubleshooting

### Login Fails

```
❌ POST /api/login
   Status: 401
   Error: Login failed with status 401
```

**Solution:** Check email and password are correct

### Car Creation Fails with 400

```
❌ POST /api/cars
   Status: 400
   Body: {
     "ok": false,
     "code": "REGION_ALL_FORBIDDEN",
     "message": "Нельзя создавать в регионе ALL"
   }
```

**Solution:** Admin users must specify `--region=R1` (or R2, S1, S2)

### 14 Slots Not Found

```
❌ Verify 14 slots
   Expected: 14, Got: 0
```

**Solution:** Check car creation and sync logic

### Upload Fails

```
❌ POST upload to slot
   Status: 500
   Error: Upload failed
```

**Solution:** Use `--yandexTestMode=1` to skip actual uploads, or check Yandex Disk credentials

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Smoke Tests

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  smoke-test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm install
        
      - name: Wait for Vercel Preview
        uses: patrickedqvist/wait-for-vercel-preview@v1.3.1
        id: vercel
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          max_timeout: 300
          
      - name: Run Smoke Tests
        run: |
          npm run smoke -- \
            --baseUrl=${{ steps.vercel.outputs.url }} \
            --email=${{ secrets.TEST_USER_EMAIL }} \
            --password=${{ secrets.TEST_USER_PASSWORD }} \
            --region=R1 \
            --yandexTestMode=1 \
            --cleanup
```

### Vercel Deploy Hook

```yaml
# vercel.json
{
  "buildCommand": "npm run build && npm run smoke -- --baseUrl=$VERCEL_URL --email=$TEST_EMAIL --password=$TEST_PASSWORD --region=R1 --yandexTestMode=1"
}
```

## Advanced Usage

### Test Specific Flow

Comment out steps you don't want to test in `scripts/smoke.ts`:

```typescript
// await this.testUpload(); // Skip upload test
// await this.testDownload(); // Skip download test
```

### Add Custom Assertions

Add custom checks in the script:

```typescript
if (body.car?.custom_field !== expectedValue) {
  throw new Error(`Expected ${expectedValue}, got ${body.car?.custom_field}`);
}
```

### Capture Screenshots

For UI testing, integrate with Playwright or Puppeteer:

```typescript
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${this.baseUrl}/cars/${this.testVin}`);
await page.screenshot({ path: 'test-result.png' });
```

## Comparison with Manual Testing

| Aspect | Manual Testing | Smoke Script |
|--------|---------------|--------------|
| Speed | 10-15 minutes | 5-10 seconds |
| Consistency | Varies by tester | Always same |
| Repeatability | Low | High |
| CI Integration | Manual trigger | Automatic |
| Documentation | Screenshots | Logged output |
| Coverage | Depends on tester | Fixed checklist |

## Best Practices

1. **Run Before PR** - Always run smoke tests before creating PR
2. **Test Preview** - Test against Preview deployment, not just localhost
3. **Use Cleanup** - Always use `--cleanup` to avoid test data accumulation
4. **Document Failures** - Copy full output when reporting issues
5. **CI Integration** - Add smoke tests to CI pipeline
6. **Regular Updates** - Update tests when adding new features

## Files

- `scripts/smoke.ts` - Main smoke test script
- `scripts/README.md` - Scripts documentation
- `SMOKE_TEST_GUIDE.md` - This guide

## Support

For issues or questions:
1. Check this guide
2. Review script output for errors
3. Check application logs
4. Report issue with full smoke test output
