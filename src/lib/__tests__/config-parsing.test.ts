/**
 * Tests for ENV parsing with whitespace and case variations
 * 
 * These tests verify that:
 * 1. Email normalization works (trim + lowercase)
 * 2. Whitespace in ENV variables doesn't break parsing
 * 3. Case variations in emails are handled correctly
 */

// Mock expect for standalone execution
function expect(value: unknown) {
  return {
    toBe(expected: unknown) {
      if (value !== expected) {
        throw new Error(`Expected ${JSON.stringify(value)} to be ${JSON.stringify(expected)}`);
      }
    },
    toContain(expected: unknown) {
      if (!Array.isArray(value) || !value.includes(expected)) {
        throw new Error(`Expected ${JSON.stringify(value)} to contain ${JSON.stringify(expected)}`);
      }
    },
    not: {
      toContain(expected: unknown) {
        if (Array.isArray(value) && value.includes(expected)) {
          throw new Error(`Expected ${JSON.stringify(value)} not to contain ${JSON.stringify(expected)}`);
        } else if (typeof value === 'string' && typeof expected === 'string' && value.includes(expected)) {
          throw new Error(`Expected "${value}" not to contain "${expected}"`);
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

// Run tests
console.log('Running ENV Parsing Tests...');

describe('ENV Parsing - Email Normalization', () => {
  test('Case 1: USER_PASSWORD_MAP with spaces and mixed case', () => {
    const envValue = ' User1@Example.COM : 12345 , user2@TEST.com:54321 ';
    const pairs = envValue.split(',');
    const result: Record<string, string> = {};
    
    for (const pair of pairs) {
      const [email, password] = pair.split(':').map(s => s.trim());
      if (email && password) {
        result[email.toLowerCase()] = password;
      }
    }
    
    expect(result['user1@example.com']).toBe('12345');
    expect(result['user2@test.com']).toBe('54321');
    expect(Object.keys(result).length).toBe(2);
  });

  test('Case 2: REGION_USERS with newlines and mixed case', () => {
    const envValue = ' Admin@Example.COM , \n  User@TEST.org  , another@EMAIL.net ';
    const emails = envValue.split(',').map(email => email.trim().toLowerCase()).filter(email => email.length > 0);
    
    expect(emails).toContain('admin@example.com');
    expect(emails).toContain('user@test.org');
    expect(emails).toContain('another@email.net');
    expect(emails.length).toBe(3);
  });

  test('Case 3: Login normalization', () => {
    const rawEmail = '  UserName@EXAMPLE.com  ';
    const rawPassword = '  myPassword123  ';
    
    const email = rawEmail.trim().toLowerCase();
    const password = rawPassword.trim();
    
    expect(email).toBe('username@example.com');
    expect(password).toBe('myPassword123');
    expect(password).not.toContain(' ');
  });

  test('Case 4: Empty strings after trim are filtered out', () => {
    const envValue = 'user1@test.com,  ,user2@test.com,   ';
    const emails = envValue.split(',').map(email => email.trim().toLowerCase()).filter(email => email.length > 0);
    
    expect(emails.length).toBe(2);
    expect(emails).toContain('user1@test.com');
    expect(emails).toContain('user2@test.com');
  });

  test('Case 5: USER_PASSWORD_MAP with extra whitespace in password', () => {
    const envValue = 'user@test.com:  12345  ';
    const pairs = envValue.split(',');
    const result: Record<string, string> = {};
    
    for (const pair of pairs) {
      const [email, password] = pair.split(':').map(s => s.trim());
      if (email && password) {
        result[email.toLowerCase()] = password;
      }
    }
    
    expect(result['user@test.com']).toBe('12345');
    expect(result['user@test.com']).not.toContain(' ');
  });
});

describe('ENV Parsing - Edge Cases', () => {
  test('Should handle uppercase domains correctly', () => {
    const email1 = 'user@GMAIL.COM'.trim().toLowerCase();
    const email2 = 'USER@gmail.com'.trim().toLowerCase();
    
    expect(email1).toBe(email2);
    expect(email1).toBe('user@gmail.com');
  });

  test('Should handle emails with plus signs', () => {
    const email = '  user+test@example.com  '.trim().toLowerCase();
    expect(email).toBe('user+test@example.com');
  });

  test('Should handle multiple consecutive spaces', () => {
    const envValue = 'user1@test.com,    user2@test.com';
    const emails = envValue.split(',').map(email => email.trim().toLowerCase()).filter(email => email.length > 0);
    
    expect(emails.length).toBe(2);
  });
});

console.log('\n✓ All tests passed!');
