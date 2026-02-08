# Vercel Environment Variables Setup

This document lists all required and optional environment variables that must be configured in Vercel for the application to work correctly.

## Critical Production Fixes - New Environment Variables

The following environment variables were added as part of PR #21 (Critical Production Fixes):

### Upload File Size Limits
- **MAX_FILE_SIZE_MB** (default: 50)
  - Maximum size for individual file uploads in megabytes
  - Prevents OOM errors from oversized files
  - Returns HTTP 413 when exceeded

- **MAX_TOTAL_UPLOAD_SIZE_MB** (default: 200)
  - Maximum total size for all files in a single upload request in megabytes
  - Prevents OOM errors from batch uploads
  - Returns HTTP 413 when exceeded

- **MAX_FILES_PER_UPLOAD** (default: 50)
  - Maximum number of files allowed in a single upload request
  - Prevents OOM errors from too many files
  - Returns HTTP 413 when exceeded

### Archive Operations
- **ARCHIVE_RETRY_DELAY_MS** (default: 1000)
  - Delay in milliseconds between retry attempts when archiving cars
  - Helps handle transient Yandex Disk API failures
  - Configurable for production tuning

## How to Set Environment Variables in Vercel

1. Go to your Vercel project: https://vercel.com/nedajvoda01-dotcom/photo-uploader
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable for the environments you want (Preview, Production, or both)
4. Click **Save**
5. **Redeploy** your application for changes to take effect

## Default Values

All new environment variables have sensible defaults configured in `lib/config.ts`:
- If not set in Vercel, the application will use the defaults listed above
- This ensures backward compatibility and prevents build failures
- You can override defaults by setting explicit values in Vercel

## Verification

After setting environment variables:
1. Trigger a new deployment (push to branch or redeploy)
2. Check deployment logs for any environment-related errors
3. Verify the application starts successfully
4. Test upload limits by attempting to upload files exceeding the limits

## Full List of Required Environment Variables

For the complete list of all environment variables needed by the application, see `.env.example` in the repository root.

Critical variables that MUST be set:
- AUTH_SECRET
- YANDEX_DISK_TOKEN
- REGIONS
- POSTGRES_URL or POSTGRES_URL_NON_POOLING (for database mode)
- Bootstrap admin credentials (ADMIN_EMAIL, ADMIN_PASSWORD or ADMIN_PASSWORD_HASH)
