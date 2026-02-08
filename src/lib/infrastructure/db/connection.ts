/**
 * Infrastructure: Database Connection
 * Handles database connection configuration
 */

import { sql } from '@vercel/postgres';
import { POSTGRES_URL, POSTGRES_URL_NON_POOLING } from '@/lib/config/db';

// Determine connection type for logging
let connectionType = 'none';
let connectionSource = 'none';

if (POSTGRES_URL_NON_POOLING) {
  connectionType = 'direct (non-pooling)';
  connectionSource = 'POSTGRES_URL_NON_POOLING';
} else if (POSTGRES_URL) {
  // Check if URL contains pooler indicators
  if (POSTGRES_URL.includes('-pooler') || POSTGRES_URL.includes('pooler')) {
    connectionType = 'pooled';
    connectionSource = 'POSTGRES_URL (detected as pooled)';
  } else {
    connectionType = 'direct';
    connectionSource = 'POSTGRES_URL (detected as direct)';
  }
} else {
  connectionType = 'not configured';
  connectionSource = 'none';
}

// Log connection info (without sensitive data)
if (typeof window === 'undefined') { // Only log on server side
  console.log('[Database] Connection configuration:');
  console.log(`  - Type: ${connectionType}`);
  console.log(`  - Source: ${connectionSource}`);
  console.log(`  - Has POSTGRES_URL: ${!!POSTGRES_URL}`);
  console.log(`  - Has POSTGRES_URL_NON_POOLING: ${!!POSTGRES_URL_NON_POOLING}`);
}

export { sql };

/**
 * Check if database connection is available
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
}
