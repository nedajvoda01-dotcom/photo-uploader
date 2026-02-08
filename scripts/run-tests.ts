#!/usr/bin/env node
/**
 * Test Runner Script
 * Runs all test suites with proper environment setup
 */

// Set up test environment
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-key-at-least-32-characters-long-for-testing';
process.env.REGIONS = process.env.REGIONS || 'R1,R2,TEST';

// Import and run each test file
async function runTests() {
  console.log('========================================');
  console.log('Running All Test Suites');
  console.log('========================================\n');
  
  let allPassed = true;
  
  try {
    console.log('1/3: Config Parsing Tests');
    console.log('---');
    await import('../src/lib/__tests__/config-parsing.test.ts');
    console.log('');
  } catch (error) {
    console.error('Config tests failed:', error);
    allPassed = false;
  }
  
  try {
    console.log('2/3: Authentication Tests');
    console.log('---');
    await import('../src/lib/__tests__/auth.test.ts');
    console.log('');
  } catch (error) {
    console.error('Auth tests failed:', error);
    allPassed = false;
  }
  
  try {
    console.log('3/4: Strict Requirements Tests');
    console.log('---');
    await import('../src/lib/__tests__/strict-requirements.test.ts');
    console.log('');
  } catch (error) {
    console.error('Strict requirements tests failed:', error);
    allPassed = false;
  }
  
  try {
    console.log('4/4: CreateCar Integration Tests');
    console.log('---');
    await import('../src/lib/__tests__/createCar.test.ts');
    console.log('');
  } catch (error) {
    console.error('CreateCar tests failed:', error);
    allPassed = false;
  }
  
  console.log('========================================');
  if (allPassed) {
    console.log('✅ ALL TEST SUITES PASSED');
    console.log('========================================\n');
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED');
    console.log('========================================\n');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
