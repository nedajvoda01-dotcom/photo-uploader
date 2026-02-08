# CI Gates Documentation

## Overview
This document describes the CI gates implemented in `scripts/ci-gates.sh` and the architectural rules they enforce.

## Gates

### Gate 0: No Old Path Duplicates
After migration to `src/`, the following paths must NOT exist in the repository root:
- `./app/` directory
- `./lib/` directory  
- `./middleware.ts` file

**Rationale**: Next.js may pick up the wrong file structure if duplicates exist. All code must be in `src/`.

### Gate 1: /api/login Endpoint Constraints
The legacy `/api/login` endpoint must:
- Return status **410 Gone** (not 308 or other redirect codes)
- Include a `use` field pointing to `/api/auth/login`
- **NOT** set any cookies
- **NOT** proxy or forward requests to the actual auth endpoint

**Rationale**: This endpoint is deprecated and should only inform clients about the new endpoint, not perform authentication.

### Gate 2: No userId=0 Patterns
Sessions must never have `userId: 0` or `userId || 0` patterns.

**Rationale**: ENV users get stable negative IDs, and userId=0 is reserved as an invalid state.

### Gate 3: process.env Usage Restrictions
Direct `process.env` usage is only allowed in `src/lib/config/**`.

**Exception**: `src/middleware.ts` can import from `src/lib/config` but must NOT use `process.env` directly.

**Rationale**: Centralized configuration management ensures consistency and makes environment variable usage auditable.

**Examples**:
```typescript
// ❌ BAD: Direct process.env in middleware
export function middleware() {
  const secret = process.env.AUTH_SECRET;
  // ...
}

// ✅ GOOD: Import from config
import { IS_PRODUCTION } from "@/lib/config/auth";

export function middleware() {
  // Use imported constants
  if (IS_PRODUCTION) {
    // ...
  }
}
```

### Gate 4: users.json Production Guard
The `src/lib/infrastructure/dev/usersJson.ts` file must:
- Check `IS_PRODUCTION` environment flag
- Return `null` when in production mode

**Rationale**: File-based authentication is for development only. Production must use database.

### Additional Checks
- Middleware has public auth paths
- AUTH_SECRET length validation (minimum 32 characters)
- Region normalization implementation exists

## Running the Gates

```bash
npm run ci-gates
```

All gates must pass before code can be merged.

## CI/CD Integration

The CI workflow (`.github/workflows/ci.yml`) runs all gates automatically on:
- Push to main/master branches
- Pull requests to main/master branches

Gates run in this order:
1. npm ci (install dependencies)
2. npm run lint
3. npm run test
4. **npm run ci-gates** ← This runs all the gates
5. npm run build

If any gate fails, the entire CI pipeline fails and the code cannot be merged.
