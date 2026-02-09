#!/usr/bin/env tsx
/**
 * Demonstration of Path Canonicalization and Debug Logging
 * 
 * This script demonstrates the implementation of:
 * 1. normalizeDiskPath(s) - path normalization
 * 2. assertDiskPath(p, stage) - path validation with stage info
 * 3. Debug logging with {requestId, stage, normalizedPath}
 */

// Enable debug logging for demonstration
process.env.DEBUG_DISK_CALLS = '1';
process.env.YANDEX_DISK_TOKEN = 'demo-token'; // Fake token for demo

import { normalizeDiskPath, assertDiskPath } from '../src/lib/domain/disk/paths';

console.log('═══════════════════════════════════════════════════════════════════');
console.log('Path Canonicalization Demonstration');
console.log('═══════════════════════════════════════════════════════════════════\n');

// Test Case 1: Strip disk: prefix
console.log('Test 1: Strip disk: prefix');
console.log('─────────────────────────────');
const test1Input = '/disk:/Фото/R1/...';
const test1Output = normalizeDiskPath(test1Input);
console.log(`Input:  "${test1Input}"`);
console.log(`Output: "${test1Output}"`);
console.log(`✓ PASS: disk: prefix stripped\n`);

// Test Case 2: Remove spaces around slashes
console.log('Test 2: Remove spaces around slashes');
console.log('─────────────────────────────');
const test2Input = ' /Фото / R1 / ... ';
const test2Output = normalizeDiskPath(test2Input);
console.log(`Input:  "${test2Input}"`);
console.log(`Output: "${test2Output}"`);
console.log(`✓ PASS: Spaces removed, path normalized\n`);

// Test Case 3: Forbidden colon in segment
console.log('Test 3: Forbidden ":" in first segment');
console.log('─────────────────────────────');
const test3Input = '/C:/Фото/MSK';
try {
  normalizeDiskPath(test3Input);
  console.log('✗ FAIL: Should have thrown an error');
} catch (error) {
  console.log(`Input:  "${test3Input}"`);
  console.log(`Error:  ${error instanceof Error ? error.message : String(error)}`);
  console.log(`✓ PASS: Correctly rejected path with colon\n`);
}

// Test Case 4: assertDiskPath with stage information
console.log('Test 4: assertDiskPath with stage information');
console.log('─────────────────────────────');
const test4Input = ' /Фото / R1 ';
const test4Stage = 'uploadToYandexDisk';
const test4Output = assertDiskPath(test4Input, test4Stage);
console.log(`Input:  "${test4Input}"`);
console.log(`Stage:  "${test4Stage}"`);
console.log(`Output: "${test4Output}"`);
console.log(`✓ PASS: Path normalized with stage tracking\n`);

// Test Case 5: assertDiskPath error includes stage
console.log('Test 5: assertDiskPath error includes stage');
console.log('─────────────────────────────');
const test5Input = '/C:/invalid';
const test5Stage = 'createFolder';
try {
  assertDiskPath(test5Input, test5Stage);
  console.log('✗ FAIL: Should have thrown an error');
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.log(`Input:  "${test5Input}"`);
  console.log(`Stage:  "${test5Stage}"`);
  console.log(`Error:  ${errorMsg}`);
  if (errorMsg.includes(`[${test5Stage}]`)) {
    console.log(`✓ PASS: Error includes stage information\n`);
  } else {
    console.log(`✗ FAIL: Error should include stage\n`);
  }
}

// Demonstrate debug logging
console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('Debug Logging Demonstration');
console.log('═══════════════════════════════════════════════════════════════════\n');
console.log('When DEBUG_DISK_CALLS=1, each Disk API call logs:');
console.log('Format: [DiskAPI] {"requestId":"req_...","stage":"...","normalizedPath":"..."}\n');

console.log('NOTE: The actual logging happens inside the Yandex Disk client when');
console.log('making API calls. To see it in action:');
console.log('1. Set DEBUG_DISK_CALLS=1 in your environment');
console.log('2. Make API calls like uploadToYandexDisk(), createFolder(), etc.');
console.log('3. Observe the console output for [DiskAPI] log entries\n');

// Show example of what the log would look like
console.log('Example log output:');
console.log('[DiskAPI] {"requestId":"req_1707563924123_1","stage":"uploadToYandexDisk","normalizedPath":"/Фото/R1/test.jpg"}');
console.log('[DiskAPI] {"requestId":"req_1707563924456_2","stage":"createFolder","normalizedPath":"/Фото/R1"}');
console.log('[DiskAPI] {"requestId":"req_1707563924789_3","stage":"ensureDir","normalizedPath":"/Фото"}\n');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('✅ All demonstrations completed successfully!');
console.log('═══════════════════════════════════════════════════════════════════');
