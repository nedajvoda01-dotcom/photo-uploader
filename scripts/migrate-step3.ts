/**
 * Database migration script for Step 3 features
 * Adds is_used, marked_used_at, and marked_used_by columns to car_slots table
 */

import { sql } from '../lib/db';

async function migrateDatabase() {
  console.log('Starting database migration for Step 3...');
  
  try {
    // Check if columns already exist
    const checkResult = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'car_slots' 
      AND column_name IN ('is_used', 'marked_used_at', 'marked_used_by')
    `;
    
    const existingColumns = checkResult.rows.map(row => row.column_name);
    
    if (existingColumns.length === 3) {
      console.log('✓ All columns already exist. No migration needed.');
      return;
    }
    
    console.log('Adding new columns to car_slots table...');
    
    // Add is_used column if it doesn't exist
    if (!existingColumns.includes('is_used')) {
      await sql`
        ALTER TABLE car_slots 
        ADD COLUMN IF NOT EXISTS is_used BOOLEAN DEFAULT FALSE
      `;
      console.log('✓ Added is_used column');
    } else {
      console.log('✓ is_used column already exists');
    }
    
    // Add marked_used_at column if it doesn't exist
    if (!existingColumns.includes('marked_used_at')) {
      await sql`
        ALTER TABLE car_slots 
        ADD COLUMN IF NOT EXISTS marked_used_at TIMESTAMP
      `;
      console.log('✓ Added marked_used_at column');
    } else {
      console.log('✓ marked_used_at column already exists');
    }
    
    // Add marked_used_by column if it doesn't exist
    if (!existingColumns.includes('marked_used_by')) {
      await sql`
        ALTER TABLE car_slots 
        ADD COLUMN IF NOT EXISTS marked_used_by INTEGER REFERENCES users(id)
      `;
      console.log('✓ Added marked_used_by column');
    } else {
      console.log('✓ marked_used_by column already exists');
    }
    
    console.log('✓ Migration completed successfully!');
    
  } catch (error) {
    console.error('✗ Migration failed:', error);
    throw error;
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  migrateDatabase()
    .then(() => {
      console.log('Migration finished.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration error:', error);
      process.exit(1);
    });
}

export { migrateDatabase };
