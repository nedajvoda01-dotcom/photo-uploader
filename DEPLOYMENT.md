# Deployment Guide

This guide explains how to deploy the Photo Uploader application to Vercel with Postgres database.

## Prerequisites

- GitHub account
- Vercel account
- Yandex Disk account with API token

## Step 1: Fork/Clone Repository

1. Fork or push this repository to your GitHub account
2. Ensure all changes are committed and pushed

## Step 2: Connect to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Import your GitHub repository
4. Configure project settings:
   - Framework Preset: Next.js
   - Root Directory: `./` (default)
   - Build Command: `npm run build` (default)
   - Output Directory: `.next` (default)

## Step 3: Add Vercel Postgres

1. In your Vercel project, go to the "Storage" tab
2. Click "Create Database"
3. Select "Postgres"
4. Choose a database name and region
5. Click "Create"
6. Vercel will automatically add all required environment variables:
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NO_SSL`
   - `POSTGRES_URL_NON_POOLING`
   - `POSTGRES_USER`
   - `POSTGRES_HOST`
   - `POSTGRES_PASSWORD`
   - `POSTGRES_DATABASE`

## Step 4: Configure Environment Variables

In your Vercel project settings, add the following environment variables:

### Required Variables

1. **AUTH_SECRET**
   ```
   Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Example: `4161d8b6cb61f42e56c991ee16ba6e280052ac67e2edbf11e4cd0fcd3bf470ee`

2. **YANDEX_DISK_TOKEN**
   - Get from: https://yandex.ru/dev/disk/poligon/
   - Click "Get OAuth token"
   - Copy the generated token

3. **DEFAULT_REGION**
   - Example: `MSK` (Moscow), `SPB` (St. Petersburg), `EKB` (Yekaterinburg)
   - This is used for legacy/file-based authentication

### Optional Variables (for fallback admin)

If you want a fallback admin user when database is unavailable:

**Option A: Plain password (quick setup)**
```
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-password
```

**Option B: Bcrypt hash (more secure)**
```
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH=$2b$10$XAFke6qJqObeuIa.1kC3T.ufP4078lWsDvwLIfMCWBhdT2gAFD3Gi
```

Note: In Vercel environment variables UI, use the hash as-is (no escaping needed)

### Optional Configuration

- `UPLOAD_DIR` - Legacy upload directory (default: `/mvp_uploads`)
- `UPLOAD_MAX_MB` - Max file size in MB (default: `20`)
- `AUTH_DEBUG` - Enable debug logging (`1` or `0`)

## Step 5: Deploy

1. Click "Deploy" in Vercel
2. Wait for the build to complete
3. Your application will be live at `https://your-app.vercel.app`

## Step 6: Initialize Database

After deployment, initialize the database schema:

### Option A: Using Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Link your project:
   ```bash
   vercel link
   ```

4. Run the initialization script:
   ```bash
   vercel env pull .env.local
   npx tsx scripts/init-db.ts
   ```

### Option B: Direct Database Access

1. Go to Vercel Dashboard → Your Project → Storage → Postgres
2. Click "Query" tab
3. Run the SQL from `lib/db.ts` `initializeDatabase()` function manually

### Option C: Create a Temporary API Endpoint

1. Create a temporary endpoint that calls `initializeDatabase()`
2. Deploy and access the endpoint once
3. Delete the endpoint after initialization

## Step 7: Create Admin User

### Option A: Direct Database Insert

1. Generate password hash:
   ```bash
   node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('your-password', 10, (err, hash) => { console.log(hash); });"
   ```

2. In Vercel Postgres Query tab, run:
   ```sql
   INSERT INTO users (email, password_hash, region, role)
   VALUES ('admin@example.com', '$2b$10$...', 'MSK', 'admin');
   ```

### Option B: Use Environment Variable Fallback

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables as described in Step 4.

## Step 8: Test the Application

1. Visit your deployed application
2. Try to login with your admin credentials
3. Test creating a car
4. Test uploading photos to a slot
5. Verify files appear on Yandex Disk

## Troubleshooting

### Build Fails

- Check build logs in Vercel dashboard
- Ensure all environment variables are set
- Verify `AUTH_SECRET` is configured

### Login Fails

- Enable debug mode: set `AUTH_DEBUG=1`
- Check runtime logs in Vercel dashboard
- Verify admin credentials are correct
- Check database connection

### Database Connection Fails

- Verify Vercel Postgres is properly connected
- Check that all `POSTGRES_*` variables are set
- Try redeploying the application

### Yandex Disk Upload Fails

- Verify `YANDEX_DISK_TOKEN` is correct and valid
- Check token has not expired
- Verify token has write permissions
- Check Yandex Disk API limits

## Production Checklist

- [ ] Database initialized with schema
- [ ] Admin user created
- [ ] AUTH_SECRET is a strong random value
- [ ] YANDEX_DISK_TOKEN is configured
- [ ] DEFAULT_REGION is set appropriately
- [ ] All environment variables are set
- [ ] Login works
- [ ] Car creation works
- [ ] Photo upload works
- [ ] Files appear on Yandex Disk
- [ ] Yandex Disk folder structure is correct
- [ ] Slot locking works (cannot upload to locked slots)
- [ ] Share links work

## Monitoring

- Monitor database usage in Vercel dashboard
- Monitor Yandex Disk storage usage
- Set up alerts for API errors
- Review logs regularly for issues

## Scaling Considerations

- Vercel Postgres has usage limits based on plan
- Consider upgrading plan as usage grows
- Yandex Disk has storage limits
- Implement pagination for large car lists
- Consider adding caching layer for frequently accessed data

## Security Best Practices

- Never commit `.env.local` or secrets
- Use strong passwords for admin accounts
- Regularly rotate `AUTH_SECRET`
- Monitor for unauthorized access attempts
- Keep dependencies up to date
- Review Yandex Disk permissions regularly
