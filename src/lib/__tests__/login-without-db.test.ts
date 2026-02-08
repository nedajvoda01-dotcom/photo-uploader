/**
 * Test that login works without database (POSTGRES_URL not set)
 * 
 * This test verifies that the app does NOT throw missing_connection_string
 * when POSTGRES_URL is not set, which was the production bug.
 */

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

describe('Login without Database', () => {
  test('checkDatabaseConnection returns false when no POSTGRES_URL', async () => {
    // Temporarily remove POSTGRES_URL
    const originalPostgresUrl = process.env.POSTGRES_URL;
    const originalPostgresUrlNonPooling = process.env.POSTGRES_URL_NON_POOLING;
    
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_URL_NON_POOLING;
    
    try {
      // Force re-import to pick up new env vars
      delete require.cache[require.resolve('../infrastructure/db/connection')];
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { checkDatabaseConnection, isDatabaseConfigured } = require('../infrastructure/db/connection');
      
      // Verify database is not configured
      expect(isDatabaseConfigured).toBe(false);
      
      // checkDatabaseConnection should return false, NOT throw
      const hasDb = await checkDatabaseConnection();
      expect(hasDb).toBe(false);
      
      console.log('    ✓ No exception thrown - database check returned false gracefully');
    } finally {
      // Restore original values
      if (originalPostgresUrl) {
        process.env.POSTGRES_URL = originalPostgresUrl;
      }
      if (originalPostgresUrlNonPooling) {
        process.env.POSTGRES_URL_NON_POOLING = originalPostgresUrlNonPooling;
      }
      
      // Clear require cache so next import uses restored env
      delete require.cache[require.resolve('../infrastructure/db/connection')];
    }
  });
  
  test('sql proxy throws descriptive error when DB not configured', async () => {
    // Temporarily remove POSTGRES_URL
    const originalPostgresUrl = process.env.POSTGRES_URL;
    const originalPostgresUrlNonPooling = process.env.POSTGRES_URL_NON_POOLING;
    
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_URL_NON_POOLING;
    
    try {
      // Force re-import to pick up new env vars
      delete require.cache[require.resolve('../infrastructure/db/connection')];
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { sql } = require('../infrastructure/db/connection');
      
      // Attempting to use sql should throw a clear error about missing config
      let threwExpectedError = false;
      try {
        await sql`SELECT 1`;
      } catch (error) {
        if (error instanceof Error && error.message.includes('Database is not configured')) {
          threwExpectedError = true;
          console.log('    ✓ Correct error thrown:', error.message);
        } else {
          throw new Error(`Expected "Database is not configured" error, got: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
      if (!threwExpectedError) {
        throw new Error('Expected sql to throw when DB not configured');
      }
    } finally {
      // Restore original values
      if (originalPostgresUrl) {
        process.env.POSTGRES_URL = originalPostgresUrl;
      }
      if (originalPostgresUrlNonPooling) {
        process.env.POSTGRES_URL_NON_POOLING = originalPostgresUrlNonPooling;
      }
      
      // Clear require cache
      delete require.cache[require.resolve('../infrastructure/db/connection')];
    }
  });
});

console.log('\n✅ All login-without-db tests passed!');
