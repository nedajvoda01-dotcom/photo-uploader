# Smoke Test Script - Usage Examples

## Quick Start

### 1. Test with Admin User (region=ALL)

Admin users MUST specify a REGION to create cars:

```bash
BASE_URL=https://photo-uploader-abc123.vercel.app \
EMAIL=admin@example.com \
PASSWORD=admin123 \
REGION=R1 \
npm run smoke-preview
```

### 2. Test with Regional User

Regional users don't need to specify REGION (uses their assigned region):

```bash
BASE_URL=https://photo-uploader-xyz789.vercel.app \
EMAIL=user.r1@example.com \
PASSWORD=userpass \
npm run smoke-preview
```

## Real-World Scenarios

### Scenario 1: Testing PR Preview Deployment

After PR is created and Vercel deploys a Preview:

1. Get Preview URL from PR checks (e.g., `https://photo-uploader-git-feature-abc.vercel.app`)
2. Use test credentials from your ENV setup
3. Run smoke test:

```bash
BASE_URL=https://photo-uploader-git-fix-vin-abc.vercel.app \
EMAIL=admin@example.com \
PASSWORD=SecurePassword123 \
REGION=R1 \
npm run smoke-preview
```

### Scenario 2: Testing Different Regions

Test each region separately with admin:

```bash
# Test R1
BASE_URL=https://preview.vercel.app \
EMAIL=admin@example.com \
PASSWORD=pass \
REGION=R1 \
npm run smoke-preview

# Test R2
REGION=R2 npm run smoke-preview

# Test S1
REGION=S1 npm run smoke-preview

# Test S2
REGION=S2 npm run smoke-preview
```

### Scenario 3: Testing Regional User Permissions

Test that regional users can only create cars in their region:

```bash
# User assigned to R1
BASE_URL=https://preview.vercel.app \
EMAIL=user.r1@example.com \
PASSWORD=userpass \
npm run smoke-preview
```

## Expected Output

### Successful Test Run

```
================================================================================
SMOKE TEST - Preview Environment
================================================================================
Base URL: https://photo-uploader-abc.vercel.app
Email: admin@example.com
Region: R1
================================================================================

[SMOKE] Step 1: POST /api/login
[SMOKE] POST https://photo-uploader-abc.vercel.app/api/login
✅ POST /api/login
   Status: 200
   Body: {
     "success": true
   }

[SMOKE] Step 2: POST /api/cars
[SMOKE] POST https://photo-uploader-abc.vercel.app/api/cars
✅ POST /api/cars
   Status: 201
   Body: {
     "ok": true,
     "car": {
       "id": 456,
       "region": "R1",
       "make": "Toyota",
       "model": "Camry",
       "vin": "TEST87654321123456",
       "disk_root_path": "/Фото/R1/Toyota Camry TEST87654321123456",
       "created_by": "admin@example.com",
       "created_at": "2026-02-07T23:00:00.000Z"
     }
   }

[SMOKE] Step 3: GET /api/cars/vin/TEST87654321123456
[SMOKE] GET https://photo-uploader-abc.vercel.app/api/cars/vin/TEST87654321123456
✅ GET /api/cars/vin/TEST87654321123456
   Status: 200
   Body: {
     "ok": true,
     "car": {
       "id": 456,
       "region": "R1",
       "make": "Toyota",
       "model": "Camry",
       "vin": "TEST87654321123456",
       "disk_root_path": "/Фото/R1/Toyota Camry TEST87654321123456",
       "created_by": "admin@example.com",
       "created_at": "2026-02-07T23:00:00.000Z",
       "deleted_at": null
     },
     "slots": [
       { "slot_type": "front_exterior", "slot_index": 0, "locked": false, ... },
       { "slot_type": "front_exterior", "slot_index": 1, "locked": false, ... },
       ... // 14 slots total
     ],
     "links": [],
     "last_sync_at": "2026-02-07T23:00:15.123Z"
   }

================================================================================
SMOKE TEST SUMMARY
================================================================================
Total: 3 | Passed: 3 | Failed: 0

✅ POST /api/login - Status: 200
✅ POST /api/cars - Status: 201
✅ GET /api/cars/vin/TEST87654321123456 - Status: 200
================================================================================
```

Exit code: 0 ✅

### Failed Test Run - Login Failed

```
================================================================================
SMOKE TEST - Preview Environment
================================================================================
Base URL: https://photo-uploader-abc.vercel.app
Email: wrong@example.com
Region: R1
================================================================================

[SMOKE] Step 1: POST /api/login
[SMOKE] POST https://photo-uploader-abc.vercel.app/api/login
❌ POST /api/login
   Status: 401
   Body: {
     "error": "Invalid email or password"
   }
   Error: Login failed or no cookie received

❌ Login failed, aborting remaining tests

================================================================================
SMOKE TEST SUMMARY
================================================================================
Total: 1 | Passed: 0 | Failed: 1

❌ POST /api/login - Status: 401
================================================================================
```

Exit code: 1 ❌

### Failed Test Run - Region ALL Blocked

```
================================================================================
SMOKE TEST - Preview Environment
================================================================================
Base URL: https://photo-uploader-abc.vercel.app
Email: admin@example.com
Region: ALL
================================================================================

[SMOKE] Step 1: POST /api/login
[SMOKE] POST https://photo-uploader-abc.vercel.app/api/login
✅ POST /api/login
   Status: 200
   Body: { "success": true }

[SMOKE] Step 2: POST /api/cars
[SMOKE] POST https://photo-uploader-abc.vercel.app/api/cars
❌ POST /api/cars
   Status: 400
   Body: {
     "ok": false,
     "code": "REGION_ALL_FORBIDDEN",
     "message": "Нельзя создавать, загружать или блокировать в регионе ALL. Админ должен выбрать активный регион (R1, R2, S1, S2).",
     "status": 400
   }
   Error: Car creation failed

❌ Car creation failed, aborting GET test

================================================================================
SMOKE TEST SUMMARY
================================================================================
Total: 2 | Passed: 1 | Failed: 1

✅ POST /api/login - Status: 200
❌ POST /api/cars - Status: 400
================================================================================
```

Exit code: 1 ❌

## Troubleshooting

### Error: "BASE_URL environment variable is required"

**Solution:** Set BASE_URL before running:
```bash
BASE_URL=https://your-preview.vercel.app npm run smoke-preview
```

### Error: "Login failed or no cookie received"

**Possible causes:**
1. Wrong email/password
2. User doesn't exist in system
3. /api/login endpoint not working

**Solution:**
- Verify credentials are correct
- Check user exists in BOOTSTRAP_ADMINS or REGION_USERS env vars
- Test login manually in browser first

### Error: "Car creation failed" with status 400

**If body contains "REGION_ALL_FORBIDDEN":**
- You're trying to create car in region=ALL
- **Solution:** Specify a valid region (R1, R2, S1, S2)

**If body contains "validation_error":**
- Missing required fields (make, model, vin)
- **Solution:** Script should automatically provide these, check script logs

### Error: "Failed to retrieve car by VIN" with status 404

**Possible causes:**
1. Car wasn't actually created (check POST response)
2. VIN mismatch
3. Region access issue

**Solution:**
- Check POST /api/cars response body for actual VIN
- Verify user has access to the region where car was created

### Error: "Failed to retrieve car by VIN" with status 403

**Cause:** User doesn't have access to the region where car exists

**Solution:**
- Regional users can only access cars in their region
- Admin users should be able to access all regions
- Check user's region assignment

## Integration with CI/CD

### GitHub Actions

```yaml
name: Smoke Test Preview

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  smoke-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Wait for Vercel deployment
        uses: patrickedqvist/wait-for-vercel-preview@v1.3.1
        id: wait-for-deployment
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          max_timeout: 300
      
      - name: Run smoke tests
        env:
          BASE_URL: ${{ steps.wait-for-deployment.outputs.url }}
          EMAIL: ${{ secrets.TEST_ADMIN_EMAIL }}
          PASSWORD: ${{ secrets.TEST_ADMIN_PASSWORD }}
          REGION: R1
        run: npm run smoke-preview
```

### Vercel Deployment Hook

You can trigger smoke tests after Vercel deployment:

```bash
# In Vercel deployment hook
curl -X POST https://api.github.com/repos/owner/repo/dispatches \
  -H "Authorization: token $GITHUB_TOKEN" \
  -d '{"event_type":"smoke-test","client_payload":{"url":"'$VERCEL_URL'"}}'
```

## Next Steps After Smoke Test

### If All Tests Pass ✅

1. Update VERIFICATION_CHECKLIST.md with results
2. Record Preview URL
3. Record all status codes and responses
4. Mark verification as complete
5. Move PR to "Ready for Review"

### If Any Test Fails ❌

1. Review the failure details in output
2. Check the specific error message and status code
3. Fix the issue in code
4. Push fix to PR
5. Re-run smoke test
6. Repeat until all tests pass

## Related Documentation

- `scripts/README.md` - Main script documentation
- `VERIFICATION_CHECKLIST.md` - Manual verification procedures
- `SMOKE_TESTS.md` - Comprehensive test scenarios
- `PRODUCTION_FIXES_SUMMARY.md` - Implementation details
