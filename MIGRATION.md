# Migration Guide: From File-Based to Database Storage

This guide explains the differences between the old file-based system and the new database-backed system.

## What Changed?

### Before (File-Based)
- Users stored in `data/users.json` or environment variables
- No persistent car data storage
- Simple single-file upload to Yandex Disk
- No multi-user or multi-region support
- Vercel deployment issues with file storage

### After (Database-Backed)
- Users stored in Postgres database
- Full car management with 14 structured slots per car
- Region-based access control
- Multi-user support with roles
- Vercel-compatible architecture
- Slot locking mechanism with `_LOCK.json` markers

## Database Tables

### users
Stores user accounts with region and role information.

**Fields:**
- `id` - Primary key
- `email` - Unique email address
- `password_hash` - Bcrypt hashed password
- `region` - User's region (MSK, SPB, etc.)
- `role` - User role (admin, user, etc.)
- `created_at` - Account creation timestamp

### cars
Stores car records unique by region and VIN.

**Fields:**
- `id` - Primary key
- `region` - Car's region
- `make` - Car manufacturer
- `model` - Car model
- `vin` - Vehicle Identification Number (17 chars)
- `disk_root_path` - Root folder path on Yandex Disk
- `created_by` - User ID who created the record
- `created_at` - Record creation timestamp

**Unique constraint:** `(region, vin)`

### car_slots
Stores the 14 photo upload slots for each car.

**Fields:**
- `id` - Primary key
- `car_id` - Foreign key to cars table
- `slot_type` - Type of slot (dealer, buyout, dummies)
- `slot_index` - Index within the slot type
- `status` - empty or locked
- `locked_at` - When the slot was locked
- `locked_by` - User ID who locked the slot
- `lock_meta_json` - JSON metadata about uploaded files
- `disk_slot_path` - Full path to slot folder on Yandex Disk
- `public_url` - Cached public share URL

**Unique constraint:** `(car_id, slot_type, slot_index)`

### car_links
Stores external links associated with cars.

**Fields:**
- `id` - Primary key
- `car_id` - Foreign key to cars table
- `title` - Link title
- `url` - Link URL
- `created_by` - User ID who created the link
- `created_at` - Link creation timestamp

## Yandex Disk Folder Structure

The new system creates a strict, predictable folder structure:

```
Фото/
└── <REGION>/                          # e.g., MSK, SPB
    └── <Make> <Model> <VIN>/          # e.g., Toyota Camry ABC123XYZ
        ├── 1. Дилер фото/              # Dealer photos (1 slot)
        │   └── <Make> <Model> <VIN>/
        │       ├── photo1.jpg
        │       ├── photo2.jpg
        │       └── _LOCK.json          # Lock marker
        ├── 2. Выкуп фото/              # Buyout photos (8 slots)
        │   ├── 1. <Make> <Model> <VIN>/
        │   │   ├── photo1.jpg
        │   │   └── _LOCK.json
        │   ├── 2. <Make> <Model> <VIN>/
        │   ...
        │   └── 8. <Make> <Model> <VIN>/
        └── 3. Муляги фото/             # Dummy photos (5 slots)
            ├── 1. <Make> <Model> <VIN>/
            ├── 2. <Make> <Model> <VIN>/
            ...
            └── 5. <Make> <Model> <VIN>/
```

### Slot Types
1. **Dealer (дилер)**: 1 slot for dealer photos
2. **Buyout (выкуп)**: 8 slots for buyout process photos
3. **Dummies (муляги)**: 5 slots for placeholder/mock photos

**Total: 14 slots per car**

## Authentication Flow

### Old Flow
1. User logs in
2. JWT contains only email
3. No region or role information
4. Files uploaded to single directory

### New Flow
1. User logs in
2. JWT contains: `userId`, `email`, `region`, `role`
3. Region determines which cars user can access
4. All operations are region-scoped
5. Files uploaded to structured car-specific folders

## API Changes

### New Endpoints

**Car Management:**
- `GET /api/cars` - List cars in user's region
- `POST /api/cars` - Create new car
- `GET /api/cars/:id` - Get car details with slots

**Upload:**
- `POST /api/cars/:id/upload` - Upload to specific slot

**Links:**
- `GET /api/cars/:id/links` - List car links
- `POST /api/cars/:id/links` - Create link
- `DELETE /api/links/:linkId` - Delete link

**Sharing:**
- `GET /api/cars/:id/share` - Get public share URL for slot

### Backward Compatibility

The old endpoints still work:
- `POST /api/login` - Legacy login endpoint
- `POST /api/upload` - Legacy upload endpoint

But new features require using new endpoints.

## Slot Locking Mechanism

### SSOT (Single Source of Truth)

A slot is considered "locked" (filled) when:
1. Database: `car_slots.status = 'locked'`
2. AND Yandex Disk: `_LOCK.json` file exists in slot folder

The `_LOCK.json` file is the authoritative source. If there's a mismatch:
- Priority goes to the disk status
- Database should be synchronized

### _LOCK.json Structure

```json
{
  "carId": 123,
  "slotType": "buyout",
  "slotIndex": 3,
  "uploadedBy": 5,
  "uploadedAt": "2024-01-15T14:00:00.000Z",
  "fileCount": 12,
  "files": [
    {
      "name": "photo1.jpg",
      "size": 1024000
    },
    {
      "name": "photo2.jpg",
      "size": 2048000
    }
  ]
}
```

## Migration Steps

### For New Deployments
1. Follow DEPLOYMENT.md
2. Set up database from scratch
3. Create users in database
4. Start using new API endpoints

### For Existing Deployments
1. Keep existing `data/users.json` for backward compatibility
2. Set up database alongside
3. Run `scripts/init-db.ts` to create schema
4. Optionally migrate users to database
5. Start creating cars using new endpoints
6. Old login still works, new features use database

## Environment Variables

### Required for Database Mode
```bash
AUTH_SECRET=...
YANDEX_DISK_TOKEN=...
DEFAULT_REGION=MSK

# Vercel Postgres (auto-added by Vercel)
POSTGRES_URL=...
POSTGRES_PRISMA_URL=...
# ... other Postgres variables
```

### Optional for Fallback
```bash
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=password123
# OR
ADMIN_PASSWORD_HASH=$2b$10$...
```

## Security Improvements

1. **Region-based isolation**: Users only see cars in their region
2. **Role-based access**: Future support for different user roles
3. **Atomic operations**: Database transactions ensure data consistency
4. **Audit trail**: `created_by` and timestamps on all records
5. **Lock mechanism**: Prevents concurrent uploads to same slot

## Performance Considerations

1. **Database queries**: More efficient than file I/O
2. **Caching**: Public URLs cached in database
3. **Indexing**: Database indexes on common queries
4. **Retry logic**: Automatic retry with backoff for Yandex Disk API
5. **Concurrent operations**: Database handles concurrent access

## Troubleshooting

### Database Not Available
- System falls back to file/env authentication
- New features won't work (cars, slots)
- Login still works with `data/users.json` or env variables

### Slot Already Locked
- Check `_LOCK.json` on Yandex Disk
- Verify database status matches disk status
- Admin can unlock via database if needed

### Region Mismatch
- User can only access cars in their region
- Check user's region in JWT token
- Update user's region in database if needed

### VIN Conflict
- VINs must be unique within a region
- Different regions can have same VIN
- Use different VIN or change region

## Best Practices

1. **Always use region from session**: Never accept region from client
2. **Check lock status before upload**: Verify both DB and disk
3. **Handle errors gracefully**: Yandex Disk may have rate limits
4. **Monitor database usage**: Watch for quota limits
5. **Backup regularly**: Database and critical Yandex Disk folders
6. **Use transactions**: For operations affecting multiple tables
7. **Validate VINs**: 17 characters, alphanumeric
8. **Clean up on errors**: If upload fails, clean up partial state

## Future Enhancements

Possible improvements:
- Batch upload support
- Progress tracking for large uploads
- Image thumbnails
- Search and filtering
- Admin dashboard
- User management UI
- Bulk car import
- Export functionality
- Reporting and analytics
