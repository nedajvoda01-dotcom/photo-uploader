/**
 * Infrastructure: Database Connection
 * Handles database connection configuration
 */

import { POSTGRES_URL, POSTGRES_URL_NON_POOLING } from '@/lib/config/db';

// Check if database is configured
export const isDatabaseConfigured = !!(POSTGRES_URL || POSTGRES_URL_NON_POOLING);

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
  if (!isDatabaseConfigured) {
    console.log('[Database] WARNING: No database configured - using ENV/file-based auth only');
  }
}

// Lazy import of sql to avoid errors when DB is not configured
let _sql: any = null;

function getSql() {
  if (!isDatabaseConfigured) {
    throw new Error('Database is not configured (missing POSTGRES_URL)');
  }
  if (!_sql) {
    // Lazy import @vercel/postgres only when needed
    const { sql: pgSql } = require('@vercel/postgres');
    _sql = pgSql;
  }
  return _sql;
}

// Create a proxy that acts like sql template tag but only loads DB when needed
export const sql: any = function(strings: TemplateStringsArray, ...values: any[]) {
  const sqlInstance = getSql();
  return sqlInstance(strings, ...values);
};

/**
 * Check if database connection is available
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  // If no database is configured, return false immediately
  if (!isDatabaseConfigured) {
    return false;
  }
  
  try {
    const sqlInstance = getSql();
    await sqlInstance`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
}
