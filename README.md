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

When deploying to Vercel (or other cloud platforms), the `data/users.json` file will not be available since it's gitignored. The application supports environment variable-based authentication as a fallback.

### Required Environment Variables

Configure the following environment variables in your Vercel project settings:

1. **AUTH_SECRET** (required)
   - A long, random secret key for JWT token signing
   - Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

2. **YANDEX_DISK_TOKEN** (required for file uploads)
   - Your Yandex Disk OAuth token
   - Obtain from: https://yandex.ru/dev/disk/poligon/

3. **UPLOAD_DIR** (optional)
   - Directory path on Yandex Disk where files will be uploaded
   - Default: `/uploads`

4. **UPLOAD_MAX_MB** (optional)
   - Maximum file size in megabytes
   - Default: `10`

5. **ADMIN_EMAIL** (required when data/users.json is not available)
   - Email address for the admin user
   - Example: `admin@example.com`

6. **ADMIN_PASSWORD** (optional, for MVP/quick setup)
   - Plain text password for the admin user
   - **Recommended for MVP and testing only** - simpler setup without generating bcrypt hashes
   - Takes priority over `ADMIN_PASSWORD_HASH` if both are set
   - Example: `mySecurePassword123`
   - ⚠️ **Security Note:** Plain passwords in environment variables are vulnerable to exposure through logging, process listings, error reports, and configuration management tools. Even for MVP, use a strong, unique password. **Transition to `ADMIN_PASSWORD_HASH` for production or when handling sensitive data.** The implementation uses constant-time comparison to mitigate timing attacks.

7. **ADMIN_PASSWORD_HASH** (optional, more secure alternative to ADMIN_PASSWORD)
   - Bcrypt hash of the admin password
   - **Recommended for production** - more secure than plain password
   - Only used if `ADMIN_PASSWORD` is not set
   - Generate with: `node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('your-password', 10, (err, hash) => { console.log(hash); });"`
   - **Important:** In local `.env` files (`.env.local`), you must escape the `$` signs in the bcrypt hash with backslashes: `\$2b\$10\$...` (this is required by Next.js's dotenv parsing)
   - In Vercel's environment variables UI, use the hash as-is without escaping (no backslashes needed)

### Generating Password Hash for ADMIN_PASSWORD_HASH

To generate a bcrypt password hash for the `ADMIN_PASSWORD_HASH` environment variable:

```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('your-password-here', 10, (err, hash) => { if (err) throw err; console.log(hash); });"
```

Replace `'your-password-here'` with your desired password.

**For Vercel:** Copy the output hash directly and paste it as the `ADMIN_PASSWORD_HASH` environment variable in Vercel's project settings.

**For local `.env.local` file:** You must escape the `$` signs with backslashes (required by Next.js's dotenv parsing). For example, if the hash is:
```
$2b$10$XAFke6qJqObeuIa.1kC3T.ufP4078lWsDvwLIfMCWBhdT2gAFD3Gi
```

In your `.env.local` file, it should be:
```
ADMIN_PASSWORD_HASH=\$2b\$10\$XAFke6qJqObeuIa.1kC3T.ufP4078lWsDvwLIfMCWBhdT2gAFD3Gi
```

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

The application follows a strict folder structure on Yandex Disk:

```
Фото/
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
- Database connection variables (for Vercel Postgres)

**Optional:**
- `DEFAULT_REGION` - Default region for legacy auth (default: 'MSK')
- `UPLOAD_DIR` - Legacy upload directory (default: '/mvp_uploads')
- `UPLOAD_MAX_MB` - Max file size (default: 20)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` - Fallback admin credentials
- `AUTH_DEBUG` - Enable debug logging (1 or 0)

### Authentication Flow

1. User logs in via `/api/auth/login` or `/api/login`
2. JWT token created with: `userId`, `email`, `region`, `role`
3. All API endpoints verify session and check region permission
4. Region is ALWAYS taken from session, never from client input

### Backward Compatibility

The application supports both:
1. **Database mode** (preferred) - Users stored in Postgres
2. **File/Env mode** (fallback) - Users from `data/users.json` or environment variables

When database is unavailable, the system falls back to file-based authentication with default region and admin role.

# Build Instructions
