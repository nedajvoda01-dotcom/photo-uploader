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
 */

import { normalizeDiskPath } from '../domain/disk/paths';

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
});

console.log('\n✅ All path validation tests passed!');
