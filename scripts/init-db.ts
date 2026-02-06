/**
 * Database initialization script
 * Run this to create all necessary tables
 */

import { initializeDatabase } from '../lib/db';

async function main() {
  console.log('Initializing database schema...');
  
  try {
    await initializeDatabase();
    console.log('✓ Database schema initialized successfully');
    process.exit(0);
  } catch (error) {
    console.error('✗ Failed to initialize database:', error);
    process.exit(1);
  }
}

main();
