/**
 * Integration Test: Architecture Validation
 * 
 * This test validates the 4-layer architecture implementation:
 * 1. No process.env outside lib/config/**
 * 2. No cloud-api.yandex.net in app/api/**
 * 3. No sql` in app/api/**
 * 4. Middleware PUBLIC_PATHS includes /api/auth/login
 */

import * as fs from 'fs';
import * as path from 'path';

// Mock expect for standalone execution
function expect(value: any) {
  return {
    toBe(expected: any) {
      if (value !== expected) {
        throw new Error(`Expected ${JSON.stringify(value)} to be ${JSON.stringify(expected)}`);
      }
    },
    toContain(expected: string) {
      if (typeof value === 'string' && !value.includes(expected)) {
        throw new Error(`Expected "${value}" to contain "${expected}"`);
      }
    },
  };
}

function describe(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.error(`    ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run tests
console.log('Running Architecture Validation Tests...');
console.log('====================================');

describe('Requirement 1: process.env only in lib/config/**', () => {
  test('No process.env outside lib/config/', () => {
    const { execSync } = require('child_process');
    
    try {
      // Search for process.env outside lib/config and scripts (excluding tests)
      const result = execSync(
        'grep -r "process\\.env" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v "node_modules" | grep -v ".next" | grep -v "scripts/" | grep -v "lib/config/" | grep -v "__tests__" || echo "NONE"',
        { cwd: process.cwd(), encoding: 'utf-8' }
      );
      
      if (result.trim() !== 'NONE' && !result.includes('No such file')) {
        throw new Error(`Found process.env usage outside lib/config/: ${result}`);
      }
    } catch (error: any) {
      if (error.message && error.message.includes('process.env')) {
        throw error;
      }
      // grep returned no matches (exit code 1), which is good
    }
  });
});

describe('Requirement 2: No Yandex Disk API calls in app/api/**', () => {
  test('No cloud-api.yandex.net in app/api/', () => {
    const { execSync } = require('child_process');
    
    try {
      const result = execSync(
        'grep -r "cloud-api.yandex.net" app/api 2>/dev/null || echo "NONE"',
        { cwd: process.cwd(), encoding: 'utf-8' }
      );
      
      if (result.trim() !== 'NONE' && !result.includes('No such file')) {
        throw new Error(`Found Yandex Disk API calls in app/api/: ${result}`);
      }
    } catch (error: any) {
      if (error.message && error.message.includes('cloud-api')) {
        throw error;
      }
    }
  });
});

describe('Requirement 3: No SQL in app/api/**', () => {
  test('No sql` in app/api/', () => {
    const { execSync } = require('child_process');
    
    try {
      // Use single quotes to avoid backtick escaping issues
      const result = execSync(
        'grep -r "sql" app/api 2>/dev/null | grep "sql\\\`" || echo "NONE"',
        { cwd: process.cwd(), encoding: 'utf-8' }
      );
      
      if (result.trim() !== 'NONE' && !result.includes('No such file')) {
        throw new Error(`Found SQL queries in app/api/: ${result}`);
      }
    } catch (error: any) {
      if (error.message && error.message.includes('SQL queries')) {
        throw error;
      }
    }
  });
});

describe('Requirement 4: Middleware PUBLIC_PATHS configuration', () => {
  test('/api/auth/login is in PUBLIC_PATHS', () => {
    const middlewareContent = fs.readFileSync(
      path.join(process.cwd(), 'middleware.ts'),
      'utf-8'
    );
    
    expect(middlewareContent).toContain('/api/auth/login');
    expect(middlewareContent).toContain('PUBLIC_PATHS');
  });
  
  test('Middleware imports from new architecture', () => {
    const middlewareContent = fs.readFileSync(
      path.join(process.cwd(), 'middleware.ts'),
      'utf-8'
    );
    
    // Should import from infrastructure and domain layers
    expect(middlewareContent).toContain('@/lib/infrastructure/auth/jwt');
    expect(middlewareContent).toContain('@/lib/domain/auth/session');
  });
});

describe('Requirement 5: Login route uses new architecture', () => {
  test('Login route uses loginUseCase', () => {
    const loginRouteContent = fs.readFileSync(
      path.join(process.cwd(), 'app/api/auth/login/route.ts'),
      'utf-8'
    );
    
    expect(loginRouteContent).toContain('loginUseCase');
    expect(loginRouteContent).toContain('@/lib/application/auth/loginUseCase');
  });
  
  test('Login route imports from new infrastructure', () => {
    const loginRouteContent = fs.readFileSync(
      path.join(process.cwd(), 'app/api/auth/login/route.ts'),
      'utf-8'
    );
    
    expect(loginRouteContent).toContain('@/lib/infrastructure/auth/jwt');
    expect(loginRouteContent).toContain('@/lib/domain/auth/session');
  });
});

describe('Requirement 6: Disk paths SSOT', () => {
  test('Domain disk paths exists and is used', () => {
    const diskPathsExist = fs.existsSync(
      path.join(process.cwd(), 'lib/domain/disk/paths.ts')
    );
    
    expect(diskPathsExist).toBe(true);
  });
  
  test('Disk paths imports from config', () => {
    const diskPathsContent = fs.readFileSync(
      path.join(process.cwd(), 'lib/domain/disk/paths.ts'),
      'utf-8'
    );
    
    expect(diskPathsContent).toContain('@/lib/config/disk');
  });
});

console.log('\n====================================');
console.log('✅ All Architecture Validation Tests Passed!');
console.log('====================================\n');

console.log('Summary:');
console.log('  ✅ process.env only in lib/config/**');
console.log('  ✅ No Yandex Disk API calls in app/api/**');
console.log('  ✅ No SQL queries in app/api/**');
console.log('  ✅ Middleware PUBLIC_PATHS includes /api/auth/login');
console.log('  ✅ Login route uses new architecture (loginUseCase)');
console.log('  ✅ Disk paths SSOT is in domain layer');
console.log('');
