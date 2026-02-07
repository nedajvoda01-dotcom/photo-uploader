# Photo Uploader

A Next.js application for uploading photos to Yandex Disk.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, install dependencies:

```bash
npm install
```

### Authentication Setup

This application uses JWT-based session authentication with bcrypt password hashing.

#### 1. Set up environment variables

Create a `.env.local` file in the project root:

```bash
AUTH_SECRET=your-long-random-secret-key-here
```

To generate a secure random secret, you can use:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 2. Create user data file

Copy the example user data file:

```bash
cp data/users.example.json data/users.json
```

**Note**: The default credentials in `data/users.example.json` are:
- Email: `admin@example.com`
- Password: `password123`

#### 3. Generate password hashes (for new users)

To add new users or change passwords, you need to generate bcrypt password hashes.

You can use this Node.js script:

```bash
node -e "const bcrypt = require('bcryptjs'); const password = 'your-password-here'; bcrypt.hash(password, 10, (err, hash) => { console.log(hash); });"
```

Or create a helper script `scripts/hash-password.js`:

```javascript
const bcrypt = require('bcryptjs');
const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/hash-password.js <password>');
  process.exit(1);
}

bcrypt.hash(password, 10, (err, hash) => {
  if (err) throw err;
  console.log('Password hash:', hash);
});
```

Then run:

```bash
node scripts/hash-password.js your-password-here
```

Add the generated hash to your `data/users.json` file:

```json
[
  {
    "email": "user@example.com",
    "passwordHash": "$2a$10$..."
  }
]
```

### Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser. You'll be redirected to the login page.

## Project Structure

- `app/` - Next.js App Router pages and layouts
  - `app/login/` - Login page
  - `app/api/login/` - Login API endpoint
  - `app/api/logout/` - Logout API endpoint
- `data/` - User data storage (users.json is gitignored)
- `lib/` - Utility functions
  - `lib/auth.ts` - JWT session management
  - `lib/users.ts` - User data access
- `middleware.ts` - Authentication middleware
- `legacy/` - Legacy HTML implementation
- `public/` - Static assets

## Configuration

Copy `data/users.example.json` to `data/users.json` for local development.

## Security

**⚠️ Never commit real credentials or user data!**

- User data file `data/users.json` is excluded from git
- Environment variables should be in `.env.local` (also gitignored)
- See `data/users.example.json` for the expected user data format
- AUTH_SECRET must be a long, random string in production
- Passwords are hashed using bcrypt before storage
- Sessions use JWT tokens with 7-day expiration
- Cookies are HttpOnly, SameSite=Lax, and Secure in production

## Authentication Flow

1. User visits any protected route → redirected to `/login`
2. User submits email/password → validated against `data/users.json`
3. On success → JWT session created and set as HttpOnly cookie
4. Middleware validates session on each request
5. User clicks logout → session cookie cleared

## Vercel Deployment

When deploying to Vercel (or other cloud platforms), configure the required environment variables.

### Required Environment Variables

#### Critical Configuration (Required)

1. **AUTH_SECRET** (required)
   - A long, random secret key for JWT token signing
   - Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

2. **YANDEX_DISK_TOKEN** (required)
   - Your Yandex Disk OAuth token
   - Obtain from: https://yandex.ru/dev/disk/poligon/

3. **REGIONS** (required)
   - Comma-separated list of regions
   - Example: `REGIONS=R1,R2,R3,K1,V,S1,S2` or `REGIONS=MSK,SPB,EKB`
   - Used for access control and organization

#### Bootstrap Admin Configuration

The application supports two bootstrap admin accounts configured via environment variables. At least one admin must be configured (or use Postgres with users in the database).

4. **ADMIN_REGION** (optional, default: `ALL`)
   - Region access for bootstrap admins
   - `ALL` grants access to all regions (recommended for admins)
   - Can also be set to a specific region

5. **ADMIN_EMAIL** and **ADMIN_PASSWORD** / **ADMIN_PASSWORD_HASH** (Bootstrap Admin #1)
   - **ADMIN_EMAIL**: Email address for first admin user
   - **ADMIN_PASSWORD** (plain text, simpler but less secure): Plain password for quick setup
   - **ADMIN_PASSWORD_HASH** (bcrypt hash, more secure): Use instead of ADMIN_PASSWORD for production
   - Takes priority over `ADMIN_PASSWORD_HASH` if both are set
   - Generate hash: `node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('your-password', 10, (err, hash) => { console.log(hash); });"`
   - **Important:** In local `.env` files, escape `$` signs: `\$2b\$10\$...`
   - In Vercel UI, use hash as-is without escaping

6. **ADMIN_EMAIL_2** and **ADMIN_PASSWORD_2** / **ADMIN_PASSWORD_HASH_2** (Bootstrap Admin #2, optional)
   - Second admin account (same format as first admin)
   - Useful for having multiple admin users
   - **ADMIN_EMAIL_2**: Email for second admin
   - **ADMIN_PASSWORD_2** or **ADMIN_PASSWORD_HASH_2**: Password credentials

#### Yandex Disk Configuration

7. **YANDEX_DISK_BASE_DIR** (optional, default: `/Фото`)
   - Base directory on Yandex Disk (SSOT for path construction)
   - All car folders are created under: `${YANDEX_DISK_BASE_DIR}/${region}/...`
   - This is the Single Source of Truth for Yandex Disk paths

#### Step 3 - ZIP Download Limits

8. **ZIP_MAX_FILES** (optional, default: `500`)
   - Maximum number of files allowed in a ZIP download

9. **ZIP_MAX_TOTAL_MB** (optional, default: `1500`)
   - Maximum total size in MB for ZIP download

#### Database Configuration (Optional)

10. **POSTGRES_URL** (optional)
    - PostgreSQL connection string
    - When configured, users are loaded from database
    - Automatically provided by Vercel when you add Postgres storage
    - Other Postgres vars: `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NO_SSL`, etc.

#### Legacy Configuration (Backward Compatibility)

11. **UPLOAD_DIR** (optional, legacy, default: `/mvp_uploads`)
    - **⚠️ LEGACY:** Not the Single Source of Truth
    - Only used by legacy `/api/upload` endpoint
    - New code should use `YANDEX_DISK_BASE_DIR` instead

12. **UPLOAD_MAX_MB** (optional, default: `20`)
    - Maximum file size in MB for uploads

#### Debug Options

13. **AUTH_DEBUG** (optional)
    - Set to `1` to enable authentication debug logging
    - Logs safe diagnostic info (no secrets) to help troubleshoot login issues

### Authentication Priority

The application checks authentication sources in this order:

1. **Bootstrap admins** (from ENV): `ADMIN_EMAIL` / `ADMIN_EMAIL_2` pairs checked first
   - Role: `admin`
   - Region: `ADMIN_REGION` (default: `ALL`)

2. **Database users** (if `POSTGRES_URL` configured): Users from Postgres with their role and region

3. **File-based users** (local dev): `data/users.json` for local development

### Region Access Control

- **Admin users** (role=`admin`, region=`ALL`): Can access all regions and all cars
- **Regular users** (role=`user`, region=specific): Can only access cars in their assigned region
- Region is **always** taken from the session JWT, never from client input

### Deployment Priority

The application prioritizes authentication sources in this order:
1. **data/users.json** file (if present) - used for local development
2. **Environment variables** - fallback for production/Vercel:
   - **ADMIN_PASSWORD** (plain text) - takes priority if set
   - **ADMIN_PASSWORD_HASH** (bcrypt hash) - used if ADMIN_PASSWORD is not set

This allows the same codebase to work both locally (with users.json) and on Vercel (with environment variables).

**For MVP/Quick Setup:** Use `ADMIN_EMAIL` + `ADMIN_PASSWORD` (plain text)

**For Production:** Use `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (bcrypt hash) for better security

### Debugging Authentication Issues

If you're experiencing login issues (401 errors) on Vercel, you can enable safe diagnostic logging:

1. **Enable debug mode:** Add `AUTH_DEBUG=1` to your Vercel environment variables
2. **Redeploy:** Trigger a new deployment in Vercel
3. **View logs:** Go to Vercel → Your Project → Runtime Logs → Filter by `/api/login`
4. **Analyze:** Check the diagnostic output to see which environment variables are present and whether they're being matched correctly
5. **Cleanup:** After debugging, remove the `AUTH_DEBUG` variable or set it to `0`

**Debug output includes (all safe, no secrets logged):**
- Boolean flags: `hasAdminEmail`, `hasAdminPassword`, `hasAdminPasswordHash`, `hasAuthSecret`
- Input validation: `inputEmailPresent`, `inputPasswordPresent`
- Email matching: `emailEqualsAdmin`, `emailTrimEqualsAdminTrim` (helps catch whitespace issues)
- Authentication mode: `usingPlain`, `usingHash`
- String lengths (not actual values): `envAdminEmailLength`, `envAdminPasswordLength`, `inputEmailLength`, `inputPasswordLength`
- Result status: `result` ("ok" or "fail")
- Failure reason: `reasonCode` (e.g., "missing_env_admin_email", "email_mismatch", "password_mismatch_plain", "password_mismatch_hash", "hash_compare_error", "jwt_sign_error")

**Note:** Debug logs only show boolean flags and lengths - no actual passwords, emails, tokens, or secrets are logged.

## Backend Migration (Database + API)

This application now supports Vercel-compatible database storage using Vercel Postgres, enabling scalable multi-user and multi-region car photo management.

### Database Schema

The application uses PostgreSQL with the following tables:

1. **users** - User accounts with region and role
   - `id`, `email` (unique), `password_hash`, `region`, `role`, `created_at`

2. **cars** - Car records
   - `id`, `region`, `make`, `model`, `vin`, `disk_root_path`, `created_by`, `created_at`
   - Unique constraint: `(region, vin)`

3. **car_slots** - Photo upload slots for each car (14 slots per car)
   - `id`, `car_id`, `slot_type`, `slot_index`, `status`, `locked_at`, `locked_by`, `lock_meta_json`, `disk_slot_path`, `public_url`
   - Unique constraint: `(car_id, slot_type, slot_index)`

4. **car_links** - External links associated with cars
   - `id`, `car_id`, `title`, `url`, `created_by`, `created_at`

### Database Setup

1. **Configure Vercel Postgres**

   If using Vercel Postgres, add these environment variables:
   ```bash
   POSTGRES_URL="postgres://..."
   POSTGRES_PRISMA_URL="postgres://..."
   POSTGRES_URL_NO_SSL="postgres://..."
   POSTGRES_URL_NON_POOLING="postgres://..."
   POSTGRES_USER="..."
   POSTGRES_HOST="..."
   POSTGRES_PASSWORD="..."
   POSTGRES_DATABASE="..."
   ```

2. **Initialize Database Schema**

   Run the initialization script to create all tables:
   ```bash
   npx tsx scripts/init-db.ts
   ```

3. **Create Admin User** (if using database authentication)

   You can create users directly in the database or use environment variables for a default admin.

### Yandex Disk Structure

The application follows a strict folder structure on Yandex Disk. All paths are constructed from `YANDEX_DISK_BASE_DIR` as the Single Source of Truth:

```
${YANDEX_DISK_BASE_DIR}/          # Default: /Фото
└── <REGION>/
    └── <Марка> <Модель> <VIN>/
        ├── 1. Дилер фото/
        │   └── <Марка> <Модель> <VIN>/
        ├── 2. Выкуп фото/
        │   ├── 1. <Марка> <Модель> <VIN>/
        │   ├── 2. <Марка> <Модель> <VIN>/
        │   ...
        │   └── 8. <Марка> <Модель> <VIN>/
        └── 3. Муляги фото/
            ├── 1. <Марка> <Модель> <VIN>/
            ├── 2. <Марка> <Модель> <VIN>/
            ...
            └── 5. <Марка> <Модель> <VIN>/
```

**Key Points:**
- `YANDEX_DISK_BASE_DIR` is the SSOT for all path construction
- Each region has its own folder under the base directory
- Car folders are named: `<Марка> <Модель> <VIN>`
- 14 slots per car: 1 dealer + 8 buyout + 5 dummies

Each slot folder contains:
- Uploaded photo files
- `_LOCK.json` - Lock marker file (SSOT for slot status)

### API Endpoints

#### Authentication

**POST /api/auth/login**
- Login with email and password
- Returns JWT token with `userId`, `email`, `region`, `role`
- Region is stored in session and used for all operations

#### Cars Management

**GET /api/cars**
- List all cars in the user's region
- Returns cars with progress breakdown (total slots, locked slots, empty slots)

**POST /api/cars**
- Create a new car
- Body: `{ make, model, vin }`
- Creates 14 slots (1 dealer + 8 buyout + 5 dummies)
- Creates folder structure on Yandex Disk
- Checks uniqueness by `(region, vin)`

**GET /api/cars/:id**
- Get car details with all slots and links
- Verifies region permission

#### Photo Upload

**POST /api/cars/:id/upload**
- Upload photos to a specific slot
- Form data: `slotType`, `slotIndex`, `file1`, `file2`, ...
- Validates:
  - Region permission
  - Slot is not locked (DB + Disk `_LOCK.json`)
  - File types (images only)
- Creates `_LOCK.json` after successful upload
- Updates slot status to `locked` in DB

#### Links Management

**GET /api/cars/:id/links**
- List all links for a car

**POST /api/cars/:id/links**
- Create a new link for a car
- Body: `{ title, url }`

**DELETE /api/links/:linkId**
- Delete a specific link

#### Sharing

**GET /api/cars/:id/share?slotType=<type>&slotIndex=<index>**
- Get public share URL for a slot folder
- Publishes folder on Yandex Disk if not already published
- Caches URL in database

### Slot Types and Indexes

- **dealer**: 1 slot (index: 1)
- **buyout**: 8 slots (index: 1-8)
- **dummies**: 5 slots (index: 1-5)

Total: 14 slots per car

### Slot Locking (SSOT)

A slot is considered "locked" (filled) if:
1. Database `car_slots.status = 'locked'`
2. AND `_LOCK.json` exists on Yandex Disk

The `_LOCK.json` file is the Single Source of Truth (SSOT) and contains:
```json
{
  "carId": 123,
  "slotType": "buyout",
  "slotIndex": 3,
  "uploadedBy": 5,
  "uploadedAt": "2024-01-15T10:30:00Z",
  "fileCount": 12,
  "files": [
    { "name": "photo1.jpg", "size": 1024000 },
    ...
  ]
}
```

### Environment Variables

**Required:**
- `AUTH_SECRET` - JWT signing secret
- `YANDEX_DISK_TOKEN` - Yandex Disk API token
- `REGIONS` - Comma-separated list of regions
- At least one admin: `ADMIN_EMAIL` + `ADMIN_PASSWORD`/`ADMIN_PASSWORD_HASH` OR `POSTGRES_URL` with users

**Optional:**
- `YANDEX_DISK_BASE_DIR` - Base directory on Yandex Disk (default: '/Фото')
- `ADMIN_REGION` - Region for bootstrap admins (default: 'ALL')
- `ADMIN_EMAIL_2`, `ADMIN_PASSWORD_2`/`ADMIN_PASSWORD_HASH_2` - Second admin account
- `ZIP_MAX_FILES` - Max files in ZIP download (default: 500)
- `ZIP_MAX_TOTAL_MB` - Max ZIP size in MB (default: 1500)
- `POSTGRES_URL` - Database connection (for Postgres mode)
- `UPLOAD_DIR` - **LEGACY** - Legacy upload directory (default: '/mvp_uploads')
- `UPLOAD_MAX_MB` - Max file size (default: 20)
- `AUTH_DEBUG` - Enable debug logging (1 or 0)

### Authentication Flow

1. User logs in via `/api/auth/login` or `/api/login`
2. System checks in order:
   - Bootstrap admins from ENV (ADMIN_EMAIL, ADMIN_EMAIL_2)
   - Database users (if POSTGRES_URL configured)
   - File-based users (data/users.json, local dev only)
3. JWT token created with: `userId`, `email`, `region`, `role`
4. All API endpoints verify session and check region permission
5. **Region is ALWAYS taken from session, never from client input**
6. Admin users (region=ALL) can access all regions
7. Regular users can only access their assigned region

### Backward Compatibility

The application supports both:
1. **Database mode** (preferred) - Users stored in Postgres
2. **File/Env mode** (fallback) - Users from `data/users.json` or environment variables

When database is unavailable, the system falls back to file-based authentication with default region and admin role.

# Build Instructions
