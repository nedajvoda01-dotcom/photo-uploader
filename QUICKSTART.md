# Quick Start Guide

Get up and running with the Photo Uploader in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- Yandex Disk account
- PostgreSQL database (optional for local dev, required for production)

## Local Development Setup

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd photo-uploader
npm install
```

### 2. Generate Secrets

```bash
# Generate AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Get Yandex Disk Token

1. Visit https://yandex.ru/dev/disk/poligon/
2. Click "Get OAuth token"
3. Copy the generated token

### 4. Configure Environment

Create `.env.local`:

```bash
# Required
AUTH_SECRET=<generated-secret-from-step-2>
YANDEX_DISK_TOKEN=<token-from-step-3>
REGIONS=R1,R2,R3,K1,V,S1,S2

# For local dev without database (quick start)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
ADMIN_REGION=ALL
```

### 5. Run Development Server

```bash
npm run dev
```

Open http://localhost:3000 and login with:
- Email: `admin@example.com`
- Password: `admin123`

## Using the API

### 1. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}' \
  -c cookies.txt
```

### 2. Create a Car

```bash
curl -X POST http://localhost:3000/api/cars \
  -H "Content-Type: application/json" \
  -d '{"make":"Toyota","model":"Camry","vin":"1HGBH41JXMN109186"}' \
  -b cookies.txt
```

Response includes `car.id` - use this for next steps.

### 3. Upload Photos to a Slot

```bash
curl -X POST http://localhost:3000/api/cars/1/upload \
  -F "slotType=dealer" \
  -F "slotIndex=1" \
  -F "file1=@photo1.jpg" \
  -F "file2=@photo2.jpg" \
  -b cookies.txt
```

### 4. Get Car Details

```bash
curl http://localhost:3000/api/cars/1 \
  -b cookies.txt
```

### 5. Get Share Link for Slot

```bash
curl "http://localhost:3000/api/cars/1/share?slotType=dealer&slotIndex=1" \
  -b cookies.txt
```

## Slot Types Reference

- **dealer**: 1 slot (index: 1)
- **buyout**: 8 slots (index: 1-8)
- **dummies**: 5 slots (index: 1-5)

## Common Issues

### "AUTH_SECRET environment variable is required"
- Make sure `.env.local` exists with `AUTH_SECRET`
- Restart dev server after creating `.env.local`

### "Invalid email or password"
- Check `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env.local`
- Make sure they match what you're sending

### "YANDEX_DISK_TOKEN environment variable is not set"
- Add `YANDEX_DISK_TOKEN` to `.env.local`
- Get token from https://yandex.ru/dev/disk/poligon/

### Upload fails with 409
- Slot is already locked (filled)
- Try a different slot index

## Production Setup

For production deployment with database:

1. Follow [DEPLOYMENT.md](DEPLOYMENT.md) for full Vercel setup
2. Set up Vercel Postgres
3. Run database initialization
4. Create users in database

## Next Steps

- Read [API.md](API.md) for complete API documentation
- Read [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment
- Read [MIGRATION.md](MIGRATION.md) to understand the architecture

## Testing the Yandex Disk Structure

After uploading, check your Yandex Disk:

```
Фото/
└── MSK/
    └── Toyota Camry 1HGBH41JXMN109186/
        └── 1. Дилер фото/
            └── Toyota Camry 1HGBH41JXMN109186/
                ├── photo1.jpg
                ├── photo2.jpg
                └── _LOCK.json
```

Open `_LOCK.json` to see upload metadata.

## Example: Complete Workflow

```bash
# 1. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}' \
  -c cookies.txt

# 2. Create car
curl -X POST http://localhost:3000/api/cars \
  -H "Content-Type: application/json" \
  -d '{"make":"Toyota","model":"Camry","vin":"1HGBH41JXMN109186"}' \
  -b cookies.txt

# 3. Upload to dealer slot
curl -X POST http://localhost:3000/api/cars/1/upload \
  -F "slotType=dealer" \
  -F "slotIndex=1" \
  -F "file1=@photo1.jpg" \
  -b cookies.txt

# 4. Upload to buyout slot 1
curl -X POST http://localhost:3000/api/cars/1/upload \
  -F "slotType=buyout" \
  -F "slotIndex=1" \
  -F "file1=@photo2.jpg" \
  -b cookies.txt

# 5. List all cars
curl http://localhost:3000/api/cars \
  -b cookies.txt

# 6. Get car details with all slots
curl http://localhost:3000/api/cars/1 \
  -b cookies.txt

# 7. Add a link
curl -X POST http://localhost:3000/api/cars/1/links \
  -H "Content-Type: application/json" \
  -d '{"title":"Auction Link","url":"https://example.com/auction/123"}' \
  -b cookies.txt

# 8. Get share link
curl "http://localhost:3000/api/cars/1/share?slotType=dealer&slotIndex=1" \
  -b cookies.txt
```

## Tips

1. **Cookie-based auth**: Save cookies with `-c cookies.txt` and reuse with `-b cookies.txt`
2. **JSON responses**: Pipe to `jq` for pretty printing: `| jq`
3. **VIN format**: Must be exactly 17 characters
4. **Slot uniqueness**: Each slot can only be filled once per car
5. **Region isolation**: Users only see cars in their region

## Support

- Check logs: `console` output in terminal
- Enable debug: Set `AUTH_DEBUG=1` in `.env.local`
- Review [API.md](API.md) for detailed endpoint info
- Check [MIGRATION.md](MIGRATION.md) for architecture details
