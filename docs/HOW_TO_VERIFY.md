# How to Verify CI Changes

## Quick Verification Commands

Run these commands in order to verify the implementation:

```bash
# 1. Install dependencies
npm ci

# 2. Run linter
npm run lint

# 3. Run tests
npm run test

# 4. Run CI gates
npm run ci-gates

# 5. Build project
npm run build
```

All commands should complete successfully.

## What Each Command Checks

### npm ci
Installs exact dependencies from package-lock.json (more reliable than npm install for CI).

### npm run lint
Runs ESLint to check code quality and style consistency.

### npm run test
Runs all test suites:
- Config parsing tests
- Authentication tests
- Strict requirements tests

### npm run ci-gates
Runs architectural gates:
- Gate 0: No old path duplicates (app/, lib/, middleware.ts, pages/)
- Gate 1: /api/login properly configured (410 Gone, no cookies)
- Gate 2: No userId=0 patterns
- Gate 3: No process.env outside src/lib/config/
- Gate 4: users.json production guard

### npm run build
Builds the Next.js application for production.

## Expected Results

All commands should exit with code 0 (success).

Gate output should show:
```
✅ Gate 0: No old path duplicates found, tsconfig correct
✅ Gate 1: /api/login endpoint properly configured
✅ Gate 2: No userId=0 patterns found
✅ Gate 3: No direct process.env usage outside config
✅ Gate 4: users.json properly guarded for production
```

## Troubleshooting

If gates fail, check:
1. No duplicate directories: app/, lib/, pages/ in root
2. tsconfig.json paths point to ./src/*
3. /api/login returns only { error, use } with status 410
4. All process.env usage is in src/lib/config/
5. Middleware has /api/auth/login and /api/logout in PUBLIC_PATHS
