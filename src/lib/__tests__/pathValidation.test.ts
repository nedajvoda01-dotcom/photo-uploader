/**
 * Tests for Yandex Disk path validation and normalization
 * 
 * These tests verify that:
 * 1. Path normalization handles backslashes correctly
 * 2. Leading slashes are ensured
 * 3. Duplicate slashes are removed
 * 4. Spaces around slashes are removed
 * 5. Leading/trailing whitespace is trimmed
 * 6. Empty paths are rejected
 * 7. Valid paths pass through correctly
 * 8. assertDiskPath validates and includes stage in errors
 */

import { normalizeDiskPath, assertDiskPath } from '../domain/disk/paths';

// Mock expect for standalone execution
function expect(value: unknown) {
  return {
    toBe(expected: unknown) {
      if (value !== expected) {
        throw new Error(`Expected ${JSON.stringify(value)} to be ${JSON.stringify(expected)}`);
      }
    },
    toThrow(expectedMessage?: string) {
      if (typeof value !== 'function') {
        throw new Error('Expected value to be a function');
      }
      
      let didThrow = false;
      let thrownError: unknown;
      
      try {
        (value as () => void)();
      } catch (error) {
        didThrow = true;
        thrownError = error;
      }
      
      if (!didThrow) {
        throw new Error('Expected function to throw an error');
      }
      
      if (expectedMessage && thrownError instanceof Error) {
        if (!thrownError.message.includes(expectedMessage)) {
          throw new Error(`Expected error message to include "${expectedMessage}", but got "${thrownError.message}"`);
        }
      }
    }
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

// Tests
describe('Path Validation', () => {
  test('normalizeDiskPath handles backslashes', () => {
    expect(normalizeDiskPath('\\Фото\\MSK\\car')).toBe('/Фото/MSK/car');
  });
  
  test('normalizeDiskPath ensures leading slash', () => {
    expect(normalizeDiskPath('Фото/MSK')).toBe('/Фото/MSK');
  });
  
  test('normalizeDiskPath removes duplicate slashes', () => {
    expect(normalizeDiskPath('/Фото//MSK///car')).toBe('/Фото/MSK/car');
  });
  
  test('normalizeDiskPath removes spaces around slashes: " / "', () => {
    expect(normalizeDiskPath('/Фото / MSK / car')).toBe('/Фото/MSK/car');
  });
  
  test('normalizeDiskPath removes spaces around slashes: "/ "', () => {
    expect(normalizeDiskPath('/Фото/ MSK/ car')).toBe('/Фото/MSK/car');
  });
  
  test('normalizeDiskPath removes spaces around slashes: " /"', () => {
    expect(normalizeDiskPath('/Фото /MSK /car')).toBe('/Фото/MSK/car');
  });
  
  test('normalizeDiskPath handles the exact failing case from production', () => {
    expect(normalizeDiskPath('/Фото / R1 / Toyota Test VIN')).toBe('/Фото/R1/Toyota Test VIN');
  });
  
  test('normalizeDiskPath handles leading space that creates " /"', () => {
    expect(normalizeDiskPath(' /Фото/MSK')).toBe('/Фото/MSK');
  });
  
  test('normalizeDiskPath trims leading and trailing whitespace', () => {
    expect(normalizeDiskPath('  /Фото/MSK  ')).toBe('/Фото/MSK');
  });
  
  test('normalizeDiskPath handles complex mix of issues', () => {
    expect(normalizeDiskPath('  \\Фото / MSK \\ car // photos  ')).toBe('/Фото/MSK/car/photos');
  });
  
  test('normalizeDiskPath throws on empty string', () => {
    expect(() => normalizeDiskPath('')).toThrow('invalid path');
  });
  
  test('normalizeDiskPath throws on whitespace-only string', () => {
    expect(() => normalizeDiskPath('   ')).toThrow('empty after trimming');
  });
  
  test('normalizeDiskPath throws on null', () => {
    expect(() => normalizeDiskPath(null as unknown as string)).toThrow('invalid path');
  });
  
  test('normalizeDiskPath throws on undefined', () => {
    expect(() => normalizeDiskPath(undefined as unknown as string)).toThrow('invalid path');
  });
  
  test('normalizeDiskPath handles valid paths', () => {
    expect(normalizeDiskPath('/Фото/MSK/Toyota Camry VIN')).toBe('/Фото/MSK/Toyota Camry VIN');
  });
  
  test('normalizeDiskPath preserves internal spaces in path segments', () => {
    expect(normalizeDiskPath('/Фото/MSK/Toyota Camry 123')).toBe('/Фото/MSK/Toyota Camry 123');
  });
  
  test('normalizeDiskPath handles mixed backslashes and forward slashes', () => {
    expect(normalizeDiskPath('\\Фото/MSK\\car/photos')).toBe('/Фото/MSK/car/photos');
  });
  
  test('normalizeDiskPath handles paths already starting with slash', () => {
    expect(normalizeDiskPath('/already/correct/path')).toBe('/already/correct/path');
  });
  
  test('normalizeDiskPath handles complex duplicates and backslashes', () => {
    expect(normalizeDiskPath('\\\\Фото//MSK\\\\car///photos')).toBe('/Фото/MSK/car/photos');
  });
  
  test('normalizeDiskPath strips disk:/ prefix', () => {
    expect(normalizeDiskPath('disk:/Фото/MSK')).toBe('/Фото/MSK');
  });
  
  test('normalizeDiskPath strips /disk:/ prefix', () => {
    expect(normalizeDiskPath('/disk:/Фото/MSK')).toBe('/Фото/MSK');
  });
  
  test('normalizeDiskPath strips disk:/ prefix case insensitive', () => {
    expect(normalizeDiskPath('DISK:/Фото/MSK')).toBe('/Фото/MSK');
  });
  
  test('normalizeDiskPath strips /disk:/ prefix case insensitive', () => {
    expect(normalizeDiskPath('/DISK:/Фото/MSK')).toBe('/Фото/MSK');
  });
  
  // Test cases from requirements specification
  test('REQUIREMENT: "/disk:/Фото/R1/..." → "/Фото/R1/..."', () => {
    expect(normalizeDiskPath('/disk:/Фото/R1/...')).toBe('/Фото/R1/...');
  });
  
  test('REQUIREMENT: " /Фото / R1 / ... " → "/Фото/R1/..."', () => {
    expect(normalizeDiskPath(' /Фото / R1 / ... ')).toBe('/Фото/R1/...');
  });
  
  test('normalizeDiskPath throws on path segment with colon', () => {
    expect(() => normalizeDiskPath('/Фото/C:/MSK')).toThrow('path segment contains colon');
  });
  
  test('normalizeDiskPath throws on Windows drive letter in segment', () => {
    expect(() => normalizeDiskPath('/Фото/MSK/D:/car')).toThrow('path segment contains colon');
  });
  
  test('REQUIREMENT: forbidden ":" in first segment → structured error', () => {
    expect(() => normalizeDiskPath('/C:/Фото/MSK')).toThrow('path segment contains colon');
  });
  
  // Path traversal prevention tests
  test('REQUIREMENT: ban ".." for path traversal prevention', () => {
    expect(() => normalizeDiskPath('/Фото/../etc/passwd')).toThrow('path traversal attempt');
  });
  
  test('normalizeDiskPath rejects ".." at start of path', () => {
    expect(() => normalizeDiskPath('/../Фото/R1')).toThrow('path traversal attempt');
  });
  
  test('normalizeDiskPath rejects ".." in middle of path', () => {
    expect(() => normalizeDiskPath('/Фото/R1/../R2')).toThrow('path traversal attempt');
  });
  
  test('normalizeDiskPath rejects ".." at end of path', () => {
    expect(() => normalizeDiskPath('/Фото/R1/..')).toThrow('path traversal attempt');
  });
  
  test('normalizeDiskPath allows "..." (three dots) which is not traversal', () => {
    expect(normalizeDiskPath('/Фото/R1/...')).toBe('/Фото/R1/...');
  });
  
  test('normalizeDiskPath allows single "." in path', () => {
    expect(normalizeDiskPath('/Фото/R1/.')).toBe('/Фото/R1/.');
  });
});

// Tests for assertDiskPath
describe('assertDiskPath Function', () => {
  test('assertDiskPath normalizes and validates path', () => {
    expect(assertDiskPath('/Фото/R1', 'testStage')).toBe('/Фото/R1');
  });
  
  test('assertDiskPath handles disk: prefix', () => {
    expect(assertDiskPath('disk:/Фото/R1', 'testStage')).toBe('/Фото/R1');
  });
  
  test('assertDiskPath handles spaces around slashes', () => {
    expect(assertDiskPath(' /Фото / R1 / ... ', 'testStage')).toBe('/Фото/R1/...');
  });
  
  test('assertDiskPath throws with stage info on invalid path', () => {
    expect(() => assertDiskPath('/C:/Фото', 'uploadStage')).toThrow('[uploadStage]');
  });
  
  test('assertDiskPath includes original path in error', () => {
    expect(() => assertDiskPath('/C:/Фото', 'createFolder')).toThrow('original: /C:/Фото');
  });
  
  test('assertDiskPath includes error details in message', () => {
    expect(() => assertDiskPath('/C:/Фото', 'ensureDir')).toThrow('path segment contains colon');
  });
  
  test('assertDiskPath throws on empty path', () => {
    expect(() => assertDiskPath('', 'testStage')).toThrow('[testStage]');
  });
  
  test('assertDiskPath rejects path traversal with ".."', () => {
    expect(() => assertDiskPath('/Фото/../etc', 'testStage')).toThrow('[testStage]');
    expect(() => assertDiskPath('/Фото/../etc', 'testStage')).toThrow('path traversal');
  });
});

console.log('\n✅ All path validation tests passed!');
