#!/bin/bash
# CI Gates Script - Anti-garbage checks
# This script validates strict requirements and fails the build if violated

set -euo pipefail

echo "=========================================="
echo "Running CI Gates - Anti-Garbage Checks"
echo "=========================================="
echo ""

EXIT_CODE=0

# Gate 0: No duplicate old paths after src/ migration
echo "Gate 0: Checking for old path duplicates (app/, lib/, middleware.ts, pages/ in root)..."
OLD_PATHS_FOUND=0

if [ -d "app" ]; then
    echo "❌ FAIL: Found ./app/ directory in root (should be in src/)"
    OLD_PATHS_FOUND=1
fi

if [ -d "lib" ]; then
    echo "❌ FAIL: Found ./lib/ directory in root (should be in src/)"
    OLD_PATHS_FOUND=1
fi

if [ -d "pages" ]; then
    echo "❌ FAIL: Found ./pages/ directory in root (should be in src/ if used)"
    OLD_PATHS_FOUND=1
fi

if [ -f "middleware.ts" ]; then
    echo "❌ FAIL: Found ./middleware.ts in root (should be in src/)"
    OLD_PATHS_FOUND=1
fi

# Verify tsconfig paths point to ./src/*
if ! grep -q '"@/\*".*"./src/\*"' tsconfig.json 2>/dev/null; then
    echo "❌ FAIL: tsconfig.json paths should point to ./src/*"
    OLD_PATHS_FOUND=1
fi

if [ $OLD_PATHS_FOUND -eq 1 ]; then
    echo "   After migration to src/, old paths must not exist"
    echo "   Next.js may pick up wrong file structure if duplicates exist"
    EXIT_CODE=1
else
    echo "✅ PASS: No old path duplicates found, tsconfig correct"
fi
echo ""

# Gate 1: No /api/login with cookie setting or proxying
echo "Gate 1: Checking /api/login endpoint constraints..."
API_LOGIN_ISSUES=0

# Check for cookie setting
if grep -r "cookies.set" src/app/api/login/ 2>/dev/null || true; then
    if grep -r "cookies.set" src/app/api/login/ 2>/dev/null; then
        echo "❌ FAIL: Found cookie setting in /api/login endpoint"
        API_LOGIN_ISSUES=1
    fi
fi

# Check for actual fetch calls or response forwarding (not in comments)
FETCH_CHECK=$(grep -E "fetch\(|\.forward\(|response\.json\(\)" src/app/api/login/route.ts 2>/dev/null | grep -v "^[[:space:]]*\*" | grep -v "^[[:space:]]*//" || true)
if [ -n "$FETCH_CHECK" ]; then
    echo "❌ FAIL: Found fetch/proxying in /api/login endpoint"
    API_LOGIN_ISSUES=1
fi

# Verify correct status code (410 Gone)
if ! grep -q "status: 410" src/app/api/login/route.ts 2>/dev/null; then
    echo "⚠️  WARNING: /api/login should use status 410 (Gone)"
    API_LOGIN_ISSUES=1
fi

# Verify it includes "use" field in response
if ! grep -qE 'use:|"use":' src/app/api/login/route.ts 2>/dev/null; then
    echo "⚠️  WARNING: /api/login should include 'use' field pointing to /api/auth/login"
fi

if [ $API_LOGIN_ISSUES -eq 0 ]; then
    echo "✅ PASS: /api/login endpoint properly configured (410 Gone, no cookies, no proxying)"
else
    echo "   /api/login must not set cookies or proxy responses"
    EXIT_CODE=1
fi
echo ""

# Gate 2: No userId: 0 or || 0 in sessions
echo "Gate 2: Checking for userId=0 or userId || 0 patterns..."
USER_ID_CHECK=$(grep -rE "userId:\s*0|userId\s*\|\|\s*0" src/app/ src/lib/ --include="*.ts" --include="*.tsx" --exclude-dir="__tests__" 2>/dev/null || true)
if [ -n "$USER_ID_CHECK" ]; then
    echo "❌ FAIL: Found userId=0 or userId || 0 pattern in production code"
    echo "   Sessions must never have userId = 0"
    echo "$USER_ID_CHECK"
    EXIT_CODE=1
else
    echo "✅ PASS: No userId=0 patterns found"
fi
echo ""

# Gate 3: No process.env outside src/lib/config/** (and src/middleware.ts can import from config)
echo "Gate 3: Checking for process.env usage outside src/lib/config/..."
# Only src/lib/config/** is allowed to use process.env directly
# src/middleware.ts must import from config, not use process.env directly
PROCESS_ENV_CHECK=$(grep -r "process\.env\." src/app/ src/lib/ --include="*.ts" --include="*.tsx" 2>/dev/null \
    | grep -v "src/lib/config/" \
    | grep -v "test" \
    | grep -v "NEXT_PHASE" || true)
if [ -n "$PROCESS_ENV_CHECK" ]; then
    echo "❌ FAIL: Found process.env usage outside src/lib/config/"
    echo "   All environment variables must be accessed through src/lib/config/"
    echo "   src/middleware.ts can import from config but not use process.env directly"
    echo "$PROCESS_ENV_CHECK"
    EXIT_CODE=1
else
    echo "✅ PASS: No direct process.env usage outside config"
fi
echo ""

# Gate 4: No users.json read in production code
echo "Gate 4: Checking for users.json usage in production..."
# Check that usersJson.ts properly guards against production usage
if ! grep -q "IS_PRODUCTION" src/lib/infrastructure/dev/usersJson.ts 2>/dev/null; then
    echo "❌ FAIL: users.json reader doesn't check IS_PRODUCTION"
    EXIT_CODE=1
elif ! grep -q "return null" src/lib/infrastructure/dev/usersJson.ts 2>/dev/null; then
    echo "❌ FAIL: users.json reader doesn't return null in production"
    EXIT_CODE=1
else
    echo "✅ PASS: users.json properly guarded for production"
fi
echo ""

# Additional checks
echo "Additional Checks:"

# Check 5: Verify middleware is public for auth endpoints
echo "  - Checking middleware public paths..."
if grep -q "/api/auth/login" src/middleware.ts && grep -q "PUBLIC_PATHS" src/middleware.ts; then
    echo "    ✅ Middleware has public auth paths"
else
    echo "    ⚠️  Warning: Middleware may need public path configuration"
fi

# Check 6: Verify AUTH_SECRET length validation exists
echo "  - Checking AUTH_SECRET validation..."
if grep -q "AUTH_SECRET.length < 32" src/lib/config/auth.ts; then
    echo "    ✅ AUTH_SECRET length validation exists"
else
    echo "    ❌ AUTH_SECRET length validation missing"
    EXIT_CODE=1
fi

# Check 7: Verify region normalization
echo "  - Checking region normalization..."
if grep -q "toUpperCase()" src/lib/domain/region/validation.ts; then
    echo "    ✅ Region normalization exists"
else
    echo "    ❌ Region normalization missing"
    EXIT_CODE=1
fi

echo ""
echo "=========================================="
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ ALL CI GATES PASSED"
else
    echo "❌ CI GATES FAILED"
fi
echo "=========================================="
echo ""

exit $EXIT_CODE
