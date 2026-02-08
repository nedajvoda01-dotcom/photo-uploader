# Next Steps for Smoke Test Verification

## Current Status

✅ **Implementation:** Complete  
✅ **Documentation:** Complete  
⏳ **Execution:** Pending  
⏳ **Output Capture:** Pending

## What's Ready

1. **Enhanced smoke test script** (`scripts/smoke.ts`)
   - All Definition of Done requirements implemented
   - Real endpoints with 404/405 detection
   - Required artifacts output
   - 15+ hard assertions
   - Test mode honesty
   - Cleanup verification

2. **Complete documentation**
   - SMOKE_TEST_GUIDE.md - Usage guide with endpoint mappings
   - SMOKE_DOD_SUMMARY.md - Requirement implementation details
   - All assertions and behaviors documented

## What's Needed: Execution

### Option 1: Execute Against Localhost

**Prerequisites:**
- Application running locally on `http://localhost:3000`
- Test user credentials available
- (Optional) Yandex Disk configured for full test

**Command:**
```bash
npm run smoke -- \
  --baseUrl=http://localhost:3000 \
  --email=admin@example.com \
  --password=admin123 \
  --region=R1 \
  --yandexTestMode=1 \
  --cleanup=1 \
  > SMOKE_RUN_OUTPUT.txt 2>&1
```

**Result:** SMOKE_RUN_OUTPUT.txt with full test output

### Option 2: Execute Against Preview

**Prerequisites:**
- Preview deployment URL from Vercel
- Test user credentials
- Use yandexTestMode=1 in CI environment

**Command:**
```bash
npm run smoke -- \
  --baseUrl=https://photo-uploader-abc.vercel.app \
  --email=$TEST_EMAIL \
  --password=$TEST_PASSWORD \
  --region=R1 \
  --yandexTestMode=1 \
  --cleanup=1 \
  > SMOKE_RUN_OUTPUT.txt 2>&1
```

**Result:** SMOKE_RUN_OUTPUT.txt with full test output

### Option 3: Dry Run (Test Mode Only)

If no live environment available, run with test mode:

```bash
npm run smoke -- \
  --baseUrl=http://localhost:3000 \
  --email=test@example.com \
  --password=test \
  --region=R1 \
  --yandexTestMode=1 \
  > SMOKE_RUN_OUTPUT.txt 2>&1
```

**Note:** Some tests may fail if environment not set up, but output format will be demonstrated.

## Expected Output Structure

The SMOKE_RUN_OUTPUT.txt should contain:

1. **Banner and configuration**
   ```
   ================================================================================
   [SMOKE] ENHANCED COMPREHENSIVE SMOKE TEST
   ================================================================================
   {
     "baseUrl": "...",
     "email": "...",
     "region": "...",
     "yandexTestMode": true,
     "cleanup": true
   }
   ```

2. **Test mode indicator (if enabled)**
   ```
   ⚠️  Yandex test mode: ON
      The following steps will be SKIPPED:
      - File upload to Yandex Disk
      - Slot locking (requires upload)
      - ZIP download (requires locked slots)
   ```

3. **Artifact: BASE_URL**
   ```
   ================================================================================
   ARTIFACT: BASE_URL
   ================================================================================
   BASE_URL=https://...
   ```

4. **Test steps with results**
   ```
   ✅ POST /api/login
      Endpoint: https://.../api/login
      Status: 200
      Body: {...}
   ```

5. **Artifact: POST /api/cars**
   ```
   ================================================================================
   ARTIFACT: POST /api/cars
   ================================================================================
   {
     "endpoint": "...",
     "status": 201,
     "body": {
       "car": {
         "region": "R1",
         ...
       }
     }
   }
   ```

6. **Artifact: GET /api/cars/vin/[vin]**
   ```
   ================================================================================
   ARTIFACT: GET /api/cars/vin/[vin]
   ================================================================================
   {
     "endpoint": "...",
     "status": 200,
     "slots_length": 14,
     "first_2_slots": [...]
   }
   ```

7. **All test steps** (11 total)

8. **Summary**
   ```
   ================================================================================
   SMOKE TEST SUMMARY
   ================================================================================
   Total Tests: 11
   Passed: 11 ✅
   Failed: 0 ❌
   Skipped: 3 ⏭️
   Duration: 5.34s
   ```

9. **Detailed results**

10. **Final status**
    ```
    ✅ SMOKE TEST PASSED
    (3 tests skipped in test mode)
    ```

## After Execution

1. **Review SMOKE_RUN_OUTPUT.txt**
   - Check all three artifacts are present
   - Verify assertions passed
   - Review any failures

2. **Attach to PR**
   - Add SMOKE_RUN_OUTPUT.txt to repository
   - Update PR description with execution results
   - Document any issues found

3. **If tests failed:**
   - Review failure details in output
   - Fix identified issues
   - Re-run smoke test
   - Update output file

4. **If all tests passed:**
   - Mark requirement 6 as ✅ COMPLETE
   - PR is ready for final review

## Troubleshooting

### "Login failed with status 401"
- Check email/password credentials
- Verify user exists in database/users.json
- Check if authentication endpoint is working

### "Endpoint error: 404"
- Check if Next.js application is running
- Verify API routes exist in app/api/
- Check baseUrl is correct

### "Cannot find module 'tsx'"
- Run `npm install` to install dependencies
- tsx is required to run TypeScript scripts

### "Failed to fetch"
- Check if baseUrl is accessible
- Verify network connectivity
- Check if server is running

## Summary

**Current State:**
- ✅ Script implementation complete
- ✅ All DoD requirements met
- ✅ Documentation complete

**Required Action:**
1. Execute smoke test (Option 1, 2, or 3 above)
2. Capture output to SMOKE_RUN_OUTPUT.txt
3. Attach to PR
4. Document results

**Time Estimate:** 5-10 minutes

**Exit Codes:**
- 0 = All tests passed
- 1 = One or more tests failed

---

**Ready to execute:** Yes  
**Command prepared:** Yes  
**Documentation:** Complete  
**Awaiting:** Execution and output capture
