# Smoke Test Script for Preview Environment

## Purpose

The `smoke-preview.ts` script automates smoke testing of the Preview deployment. It performs the three critical API requests required to verify the deployment works correctly:

1. **POST /api/login** - Authenticate and get session cookie
2. **POST /api/cars** - Create a test car with VIN
3. **GET /api/cars/vin/[vin]** - Retrieve the created car by VIN

## Usage

### Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Get the Preview URL from your Vercel deployment (e.g., from PR checks)

### Running the Script

```bash
BASE_URL=https://your-preview-url.vercel.app \
EMAIL=user@example.com \
PASSWORD=your-password \
REGION=R1 \
npm run smoke-preview
```

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `BASE_URL` | Yes | Preview deployment URL | `https://photo-uploader-abc123.vercel.app` |
| `EMAIL` | Yes | User email for login | `admin@example.com` or `user@example.com` |
| `PASSWORD` | Yes | User password | `admin123` |
| `REGION` | No* | Active region (for admin users) | `R1`, `R2`, `S1`, `S2` |

*Required for admin users with region=ALL, optional for regional users

### Examples

#### Test as Admin User
```bash
BASE_URL=https://photo-uploader-abc.vercel.app \
EMAIL=admin@example.com \
PASSWORD=admin123 \
REGION=R1 \
npm run smoke-preview
```

#### Test as Regional User
```bash
BASE_URL=https://photo-uploader-preview.vercel.app \
EMAIL=user.r1@example.com \
PASSWORD=userpass \
npm run smoke-preview
```

## Output

The script outputs detailed information about each test step:

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
   Body: {...}

[SMOKE] Step 2: POST /api/cars
[SMOKE] POST https://photo-uploader-abc.vercel.app/api/cars
✅ POST /api/cars
   Status: 201
   Body: {
     "ok": true,
     "car": {
       "id": 123,
       "region": "R1",
       "make": "Toyota",
       "model": "Camry",
       "vin": "TEST12345678901234"
     }
   }

[SMOKE] Step 3: GET /api/cars/vin/TEST12345678901234
[SMOKE] GET https://photo-uploader-abc.vercel.app/api/cars/vin/TEST12345678901234
✅ GET /api/cars/vin/TEST12345678901234
   Status: 200
   Body: {
     "ok": true,
     "car": {...},
     "slots": [...],
     "last_sync_at": "2026-02-07T23:00:00Z"
   }

================================================================================
SMOKE TEST SUMMARY
================================================================================
Total: 3 | Passed: 3 | Failed: 0

✅ POST /api/login - Status: 200
✅ POST /api/cars - Status: 201
✅ GET /api/cars/vin/TEST12345678901234 - Status: 200
================================================================================
```

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed or error occurred

## What It Verifies

### POST /api/login
- ✅ Authentication works
- ✅ Session cookie is set
- ✅ Credentials are valid

### POST /api/cars
- ✅ Car creation API works
- ✅ Response format is correct (`{ok: true, car: {...}}`)
- ✅ VIN is returned
- ✅ Region validation works (blocks ALL region)
- ✅ Disk-first creation strategy works
- ✅ DB failure handling (if DB fails, should get warning)

### GET /api/cars/vin/[vin]
- ✅ VIN-based retrieval works
- ✅ syncCar() executes before response
- ✅ Response includes car, slots, last_sync_at
- ✅ Region access control works correctly
- ✅ Admin with region=ALL can access cars

## Troubleshooting

### "BASE_URL environment variable is required"
Make sure to set the BASE_URL before running the script.

### "Login failed or no cookie received"
- Check that EMAIL and PASSWORD are correct
- Verify the user exists in the system
- Check that /api/login endpoint is working

### "Car creation failed"
- If REGION is not specified and user is admin, creation will fail
- Check that region validation allows the specified region
- Verify disk and database are accessible

### "Failed to retrieve car by VIN"
- Check that syncCar() is working
- Verify region access permissions
- Check database and disk synchronization

## Integration with CI/CD

You can integrate this script into your CI/CD pipeline:

```yaml
# GitHub Actions example
- name: Run Smoke Tests
  env:
    BASE_URL: ${{ steps.deploy.outputs.url }}
    EMAIL: ${{ secrets.TEST_USER_EMAIL }}
    PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
    REGION: R1
  run: npm run smoke-preview
```

## Related Documentation

- `VERIFICATION_CHECKLIST.md` - Manual verification procedures
- `SMOKE_TESTS.md` - Comprehensive test scenarios
- `PRODUCTION_FIXES_SUMMARY.md` - Implementation details
