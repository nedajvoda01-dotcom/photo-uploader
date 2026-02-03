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

6. **ADMIN_PASSWORD_HASH** (required when data/users.json is not available)
   - Bcrypt hash of the admin password
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
2. **Environment variables** (ADMIN_EMAIL + ADMIN_PASSWORD_HASH) - fallback for production

This allows the same codebase to work both locally (with users.json) and on Vercel (with environment variables).

# Build Instructions
