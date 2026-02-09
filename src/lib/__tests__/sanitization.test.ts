/**
 * Tests for path sanitization and security
 * 
 * These tests verify that:
 * 1. All dangerous characters are removed/replaced: \ / : * ? " < > |
 * 2. Path traversal (..) is prevented
 * 3. Length limits are enforced
 * 4. VIN, make, model, and file names are properly sanitized
 */

import { sanitizePathSegment, sanitizeFilename } from '../domain/disk/paths';

// Mock expect for standalone execution
function expect(value: unknown) {
  return {
    toBe(expected: unknown) {
      if (value !== expected) {
        throw new Error(`Expected ${JSON.stringify(value)} to be ${JSON.stringify(expected)}`);
      }
    },
    toContain(substring: string) {
      if (typeof value !== 'string' || !value.includes(substring)) {
        throw new Error(`Expected "${value}" to contain "${substring}"`);
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

// Tests for sanitizePathSegment
describe('sanitizePathSegment Security Tests', () => {
  test('REQUIREMENT: removes forward slash /', () => {
    expect(sanitizePathSegment('test/path')).toBe('test_path');
  });
  
  test('REQUIREMENT: removes backslash \\', () => {
    expect(sanitizePathSegment('test\\path')).toBe('test_path');
  });
  
  test('REQUIREMENT: removes colon :', () => {
    expect(sanitizePathSegment('C:')).toBe('C_');
  });
  
  test('REQUIREMENT: removes asterisk *', () => {
    expect(sanitizePathSegment('test*file')).toBe('test_file');
  });
  
  test('REQUIREMENT: removes question mark ?', () => {
    expect(sanitizePathSegment('test?file')).toBe('test_file');
  });
  
  test('REQUIREMENT: removes double quote "', () => {
    expect(sanitizePathSegment('test"file')).toBe('test_file');
  });
  
  test('REQUIREMENT: removes less than <', () => {
    expect(sanitizePathSegment('test<file')).toBe('test_file');
  });
  
  test('REQUIREMENT: removes greater than >', () => {
    expect(sanitizePathSegment('test>file')).toBe('test_file');
  });
  
  test('REQUIREMENT: removes pipe |', () => {
    expect(sanitizePathSegment('test|file')).toBe('test_file');
  });
  
  test('REQUIREMENT: collapses multiple dots (.. prevention)', () => {
    // '..' gets collapsed to '.', then stripped, resulting in empty string
    // This is correct security behavior - prevents path traversal
    expect(sanitizePathSegment('..')).toBe('');
    expect(sanitizePathSegment('...')).toBe('');
  });
  
  test('REQUIREMENT: strips leading dots', () => {
    expect(sanitizePathSegment('...test')).toBe('test');
  });
  
  test('REQUIREMENT: strips trailing dots', () => {
    expect(sanitizePathSegment('test...')).toBe('test');
  });
  
  test('REQUIREMENT: limits length to 255 chars', () => {
    const longName = 'a'.repeat(300);
    const sanitized = sanitizePathSegment(longName);
    expect(sanitized).toBe('a'.repeat(255));
  });
  
  test('REQUIREMENT: trims whitespace', () => {
    expect(sanitizePathSegment('  test  ')).toBe('test');
  });
  
  test('sanitizes all dangerous characters at once', () => {
    // '..' at end gets collapsed then stripped as trailing dot
    expect(sanitizePathSegment('test/path\\:*?"<>|..')).toBe('test_path________');
  });
  
  test('allows safe characters', () => {
    expect(sanitizePathSegment('Toyota-Camry_2020')).toBe('Toyota-Camry_2020');
  });
  
  test('handles Cyrillic characters', () => {
    expect(sanitizePathSegment('Тест')).toBe('Тест');
  });
  
  test('handles numbers', () => {
    expect(sanitizePathSegment('12345')).toBe('12345');
  });
});

// Tests for sanitizeFilename
describe('sanitizeFilename Security Tests', () => {
  test('sanitizes filename but preserves extension', () => {
    expect(sanitizeFilename('test/file.jpg')).toBe('test_file.jpg');
  });
  
  test('handles filename with dangerous characters', () => {
    expect(sanitizeFilename('test:file*.jpg')).toBe('test_file_.jpg');
  });
  
  test('handles dotfiles', () => {
    expect(sanitizeFilename('.gitignore')).toBe('gitignore');
  });
  
  test('handles multiple extensions', () => {
    expect(sanitizeFilename('archive.tar.gz')).toBe('archive.tar.gz');
  });
  
  test('handles no extension', () => {
    expect(sanitizeFilename('README')).toBe('README');
  });
  
  test('handles empty filename after sanitization', () => {
    // sanitizeFilename has a fallback to 'file' when everything is stripped
    const result = sanitizeFilename('...');
    expect(result).toBe('file');
  });
  
  test('sanitizes complex filenames', () => {
    expect(sanitizeFilename('my<file>name?.txt')).toBe('my_file_name_.txt');
  });
});

// Integration tests
describe('VIN/Make/Model Sanitization Integration', () => {
  test('sanitizes VIN with dangerous characters', () => {
    expect(sanitizePathSegment('1HGBH41/JXMN109186')).toBe('1HGBH41_JXMN109186');
  });
  
  test('sanitizes make with special characters', () => {
    expect(sanitizePathSegment('Toyota*')).toBe('Toyota_');
  });
  
  test('sanitizes model with path traversal', () => {
    // Each '../' becomes '_.' and the final '/' becomes '_'
    expect(sanitizePathSegment('Camry/../../../etc')).toBe('Camry_._._._etc');
  });
  
  test('prevents directory traversal in VIN', () => {
    // '../' becomes '_.' but leading dots are stripped, leaving '_._._'
    const vin = sanitizePathSegment('../../../etc/passwd');
    expect(vin).toBe('_._._etc_passwd');
  });
});

console.log('\n✅ All sanitization security tests passed!');
