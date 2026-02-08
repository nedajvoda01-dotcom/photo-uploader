# Environment Variables Setup Guide

## Critical Environment Variables (Required)

### AUTH_SECRET
**Purpose**: JWT signing and session encryption

**Format**: Minimum 32 characters (hexadecimal string recommended)

**Generate**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Example**:
```env
AUTH_SECRET=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

**Validation**: 
- ✅ Must be at least 32 characters
- ❌ Empty or missing → Server fails to start
- ❌ Less than 32 chars → Security error

---

### REGIONS
**Purpose**: Define all available regions in the system

**Format**: Comma-separated list, case-insensitive (normalized to UPPERCASE)

**Example**:
```env
REGIONS=R1,R2,R3,K1,V,S1,S2
# Or with spaces (will be trimmed):
REGIONS=R1, R2, R3, K1, V, S1, S2
# Mixed case OK (normalized to uppercase):
REGIONS=r1,R2,r3
```

**Normalization Rules**:
- Whitespace: Trimmed automatically
- Case: Converted to UPPERCASE
- Duplicates: Not allowed (warning logged)

**Validation**:
- ✅ Must have at least 1 region
- ❌ Empty → Server fails to start

---

## User Authentication (Bootstrap Admins)

### ADMIN_EMAIL + ADMIN_PASSWORD (or ADMIN_PASSWORD_HASH)
**Purpose**: Primary bootstrap admin account

**Format**:
```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-password-here
```

**OR** (more secure):
```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH=$2b$10$XAFke6qJqObeuIa.1kC3T.ufP4078lWsDvwLIfMCWBhdT2gAFD3Gi
```

**Generate Password Hash**:
```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('your-password', 10, (err, hash) => { console.log(hash); });"
```

**⚠️ Important Notes**:
- In `.env` or `.env.local` files: Escape `$` with `\$`
  ```env
  ADMIN_PASSWORD_HASH=\$2b\$10\$XAFke6qJqO...
  ```
- In Vercel UI or shell: Use hash as-is (no escaping)
- Email: Automatically normalized (trim + lowercase)
- Role: Always `admin`
- Region: Uses `ADMIN_REGION` (default: `ALL`)

---

### ADMIN_EMAIL_2 + ADMIN_PASSWORD_2 (Optional)
**Purpose**: Secondary bootstrap admin account

**Format**: Same as primary admin

**Use Case**: Multiple admin accounts with different credentials

---

### ADMIN_REGION
**Purpose**: Default region for bootstrap admins

**Format**: Single region code or `ALL`

**Default**: `ALL` (access to all regions)

**Example**:
```env
ADMIN_REGION=ALL  # Full access (recommended)
# OR
ADMIN_REGION=R1   # Limited to R1 region only
```

**Normalization**: Trimmed and converted to UPPERCASE

**Validation**:
- ✅ `ALL` → Always valid (special value)
- ✅ Must exist in `REGIONS` if not `ALL`
- ⚠️ Warning if not in REGIONS list

---

## Region-Based Users

### REGION_*_USERS
**Purpose**: Define which users belong to each region

**Format**: Comma-separated email list

**Pattern**: `REGION_{REGION_CODE}_USERS`

**Example**:
```env
REGION_R1_USERS=user1@example.com,user2@example.com
REGION_R2_USERS=user3@example.com
REGION_K1_USERS=user4@example.com,user5@example.com
```

**Normalization**:
- Emails: Trimmed and converted to lowercase
- Whitespace: Allowed and trimmed
- Empty strings: Filtered out

**Validation**:
- ⚠️ Warning if user has no password in `USER_PASSWORD_MAP`
- ⚠️ Warning if user appears in multiple regions
- ✅ Service starts even with warnings

---

### USER_PASSWORD_MAP
**Purpose**: Map emails to passwords for region users

**Format**: `email:password,email:password,...`

**Example**:
```env
USER_PASSWORD_MAP=user1@example.com:SecurePass123,user2@example.com:AnotherPass456
```

**Password Requirements**:
- ✅ Any format allowed (no length restrictions)
- ✅ Can contain letters, numbers, special characters
- ❌ ~~Must be exactly 5 digits~~ (OLD REQUIREMENT - REMOVED)

**Normalization**:
- Emails: Trimmed and converted to lowercase
- Passwords: Trimmed but case-preserved

**⚠️ Security Notes**:
- Plain passwords in ENV are less secure
- Consider using database users for production
- Rotate passwords regularly

---

## Yandex Disk Integration

### YANDEX_DISK_TOKEN
**Purpose**: OAuth token for Yandex Disk API

**Format**: Long alphanumeric token

**Get Token**: https://yandex.ru/dev/disk/poligon/

**Example**:
```env
YANDEX_DISK_TOKEN=y0_AgAAAAABCDEF1234567890abcdefGHIJKLMNOP
```

**Validation**:
- ⚠️ Warning if missing (not fail-fast)
- Upload operations will fail without token
- Other features continue to work

---

### YANDEX_DISK_BASE_DIR
**Purpose**: Base directory path on Yandex Disk

**Default**: `/Фото`

**Format**: Absolute path on Yandex Disk

**Example**:
```env
YANDEX_DISK_BASE_DIR=/Фото
# OR
YANDEX_DISK_BASE_DIR=/Photos
```

---

## Database Configuration (Optional)

### POSTGRES_URL or POSTGRES_URL_NON_POOLING
**Purpose**: PostgreSQL database connection

**Format**: Connection string

**Example**:
```env
POSTGRES_URL_NON_POOLING=postgres://user:pass@host:5432/dbname
```

**Note**: Automatically provided by Vercel when adding Postgres storage

**Behavior**:
- If configured → Users stored in database
- If not configured → ENV-based authentication only

---

## File Size Limits

### MAX_FILE_SIZE_MB
**Purpose**: Maximum size per individual file

**Default**: `50` (MB)

**Example**:
```env
MAX_FILE_SIZE_MB=100
```

---

### MAX_TOTAL_UPLOAD_SIZE_MB
**Purpose**: Maximum total size per upload request

**Default**: `200` (MB)

**Example**:
```env
MAX_TOTAL_UPLOAD_SIZE_MB=500
```

---

### MAX_FILES_PER_UPLOAD
**Purpose**: Maximum number of files per request

**Default**: `50`

**Example**:
```env
MAX_FILES_PER_UPLOAD=100
```

---

## ZIP Download Limits

### ZIP_MAX_FILES
**Purpose**: Maximum files in ZIP download

**Default**: `500`

**Example**:
```env
ZIP_MAX_FILES=1000
```

---

### ZIP_MAX_TOTAL_MB
**Purpose**: Maximum total ZIP size

**Default**: `1500` (MB)

**Example**:
```env
ZIP_MAX_TOTAL_MB=2000
```

---

## Debug Options

### AUTH_DEBUG
**Purpose**: Enable authentication debug logging

**Format**: `true` or `1` to enable

**Example**:
```env
AUTH_DEBUG=true
```

**Output**: Detailed authentication attempt logs

**⚠️ Security**: Disable in production (may log sensitive data)

---

## Common Patterns

### Development Setup
```env
AUTH_SECRET=dev-secret-key-at-least-32-chars-long-here
REGIONS=R1,R2,TEST
ADMIN_EMAIL=admin@localhost
ADMIN_PASSWORD=admin123
REGION_R1_USERS=user1@localhost
USER_PASSWORD_MAP=user1@localhost:password123
YANDEX_DISK_TOKEN=your-token-here
AUTH_DEBUG=true
```

### Production Setup
```env
AUTH_SECRET=<64-char-random-hex-from-crypto>
REGIONS=R1,R2,R3,K1,V,S1,S2
ADMIN_EMAIL=admin@company.com
ADMIN_PASSWORD_HASH=\$2b\$10\$...
ADMIN_EMAIL_2=admin2@company.com
ADMIN_PASSWORD_HASH_2=\$2b\$10\$...
REGION_R1_USERS=user1@company.com,user2@company.com
USER_PASSWORD_MAP=user1@company.com:StrongPass1,user2@company.com:StrongPass2
YANDEX_DISK_TOKEN=<production-token>
POSTGRES_URL_NON_POOLING=<vercel-provides-this>
AUTH_DEBUG=false
```

---

## Troubleshooting

### Error: "AUTH_SECRET environment variable is required"
- Ensure `AUTH_SECRET` is set
- Must be at least 32 characters
- Check `.env.local` file exists

### Error: "REGIONS must contain at least one region"
- Set `REGIONS=R1,R2,R3` or similar
- Don't leave it empty

### Warning: "Missing passwords in USER_PASSWORD_MAP"
- Add missing users to `USER_PASSWORD_MAP`
- Users without passwords can't log in
- Service will start but affected users blocked

### Warning: "Email duplicates found across regions"
- User appears in multiple `REGION_*_USERS`
- Remove duplicates
- Each user must belong to one region only

### Warning: "YANDEX_DISK_TOKEN is not configured"
- Set token for upload functionality
- Service starts but uploads will fail
- Other features work normally

---

## Best Practices

1. **Never commit `.env` files to git**
   - Use `.env.example` as template
   - Add `.env.local` to `.gitignore`

2. **Rotate secrets regularly**
   - Generate new `AUTH_SECRET` periodically
   - Update `YANDEX_DISK_TOKEN` as needed
   - Change user passwords regularly

3. **Use strong passwords**
   - Bootstrap admins: Use bcrypt hashes
   - Region users: Use strong passwords (not 5 digits)
   - Minimum 12 characters recommended

4. **Validate on deployment**
   - Check all required ENV vars set
   - Verify no warnings in startup logs
   - Test login before announcing

5. **Monitor logs**
   - Watch for authentication failures
   - Check for missing password warnings
   - Alert on repeated failed attempts
