#!/bin/bash
# CI Gates Script - Anti-garbage checks
# This script validates strict requirements and fails the build if violated

set -e

echo "=========================================="
echo "Running CI Gates - Anti-Garbage Checks"
echo "=========================================="
echo ""

EXIT_CODE=0

# Gate 1: No /api/login with cookie setting
echo "Gate 1: Checking for legacy /api/login with cookie setting..."
if grep -r "cookies.set" src/app/api/login/ 2>/dev/null; then
    echo "❌ FAIL: Found cookie setting in /api/login endpoint"
    echo "   /api/login must not set cookies directly"
    EXIT_CODE=1
else
    echo "✅ PASS: No cookie setting in /api/login"
fi
echo ""

# Gate 2: No userId: 0 or || 0 in sessions
echo "Gate 2: Checking for userId=0 or userId || 0 patterns..."
if grep -rE "userId:\s*0|userId\s*\|\|\s*0" src/app/ src/lib/ --include="*.ts" --include="*.tsx" --exclude-dir="__tests__" 2>/dev/null; then
    echo "❌ FAIL: Found userId=0 or userId || 0 pattern in production code"
    echo "   Sessions must never have userId = 0"
    EXIT_CODE=1
else
    echo "✅ PASS: No userId=0 patterns found"
fi
echo ""

# Gate 3: No process.env outside src/lib/config/**
echo "Gate 3: Checking for process.env usage outside src/lib/config/..."
if grep -r "process\.env\." src/app/ src/lib/ --include="*.ts" --include="*.tsx" \
    | grep -v "src/lib/config/" \
    | grep -v "test" \
    | grep -v "NEXT_PHASE" 2>/dev/null; then
    echo "❌ FAIL: Found process.env usage outside src/lib/config/"
    echo "   All environment variables must be accessed through src/lib/config/"
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
