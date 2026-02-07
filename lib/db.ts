/**
 * Database connection and query utilities
 */
import { sql } from '@vercel/postgres';
import { POSTGRES_URL, POSTGRES_URL_NON_POOLING } from './config';

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

// Memoization for ensureDbSchema
let schemaInitialized = false;
let schemaInitializationPromise: Promise<boolean> | null = null;

/**
 * Ensure database schema exists (idempotent, memoized)
 * Auto-creates tables and runs migrations on first call
 * Safe to call multiple times - only runs once per instance
 */
export async function ensureDbSchema(): Promise<boolean> {
  // Return immediately if already initialized
  if (schemaInitialized) {
    return true;
  }
  
  // If initialization is in progress, wait for it
  if (schemaInitializationPromise) {
    return schemaInitializationPromise;
  }
  
  // Start initialization
  schemaInitializationPromise = (async () => {
    try {
      await initializeDatabase();
      schemaInitialized = true;
      return true;
    } catch (error) {
      console.error('[ensureDbSchema] Failed to initialize database schema:', error);
      // Reset promise so retry is possible
      schemaInitializationPromise = null;
      throw error;
    }
  })();
  
  return schemaInitializationPromise;
}

/**
 * Initialize database schema
 * Creates tables if they don't exist
 * 
 * Note: created_by, locked_by, marked_used_by are TEXT fields (email/identifier)
 * not foreign keys to users table. This makes the system compatible with ENV-based auth
 * where user records may not exist in the database.
 */
export async function initializeDatabase() {
  try {
    // Create users table (optional, for database-based auth mode)
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        region VARCHAR(50) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Drop foreign key constraints if they exist (migration)
    await sql`
      DO $$ 
      BEGIN 
        -- Drop cars.created_by FK constraint
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name='cars_created_by_fkey' AND table_name='cars'
        ) THEN
          ALTER TABLE cars DROP CONSTRAINT cars_created_by_fkey;
        END IF;
        
        -- Drop car_links.created_by FK constraint
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name='car_links_created_by_fkey' AND table_name='car_links'
        ) THEN
          ALTER TABLE car_links DROP CONSTRAINT car_links_created_by_fkey;
        END IF;
        
        -- Drop car_slots.locked_by FK constraint
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name='car_slots_locked_by_fkey' AND table_name='car_slots'
        ) THEN
          ALTER TABLE car_slots DROP CONSTRAINT car_slots_locked_by_fkey;
        END IF;
        
        -- Drop car_slots.marked_used_by FK constraint
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name='car_slots_marked_used_by_fkey' AND table_name='car_slots'
        ) THEN
          ALTER TABLE car_slots DROP CONSTRAINT car_slots_marked_used_by_fkey;
        END IF;
      END $$;
    `;

    // Create cars table
    await sql`
      CREATE TABLE IF NOT EXISTS cars (
        id SERIAL PRIMARY KEY,
        region VARCHAR(50) NOT NULL,
        make VARCHAR(100) NOT NULL,
        model VARCHAR(100) NOT NULL,
        vin VARCHAR(17) NOT NULL,
        disk_root_path TEXT NOT NULL,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        UNIQUE(region, vin)
      )
    `;
    
    // Migrate cars.created_by from INTEGER to TEXT if needed
    await sql`
      DO $$ 
      BEGIN 
        -- Check if created_by is INTEGER type
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='cars' AND column_name='created_by' 
          AND data_type IN ('integer', 'bigint', 'smallint')
        ) THEN
          -- Change to TEXT
          ALTER TABLE cars ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;
        END IF;
      END $$;
    `;

    // Create car_links table
    await sql`
      CREATE TABLE IF NOT EXISTS car_links (
        id SERIAL PRIMARY KEY,
        car_id INTEGER REFERENCES cars(id) ON DELETE CASCADE,
        label VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    // Migrate car_links.created_by from INTEGER to TEXT if needed
    await sql`
      DO $$ 
      BEGIN 
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='car_links' AND column_name='created_by' 
          AND data_type IN ('integer', 'bigint', 'smallint')
        ) THEN
          ALTER TABLE car_links ALTER COLUMN created_by TYPE TEXT USING created_by::TEXT;
        END IF;
      END $$;
    `;

    // Idempotent migration: title → label
    // Handles 3 cases:
    // 1. Only title exists → rename to label
    // 2. Both exist → copy data to label, drop title
    // 3. Only label exists → do nothing
    await sql`
      DO $$ 
      BEGIN 
        -- Check if title column exists
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='car_links' AND column_name='title'
        ) THEN
          -- Check if label column also exists
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name='car_links' AND column_name='label'
          ) THEN
            -- Both exist: copy data from title to label where label is NULL, then drop title
            UPDATE car_links SET label = COALESCE(label, title) WHERE label IS NULL OR label = '';
            ALTER TABLE car_links DROP COLUMN title;
          ELSE
            -- Only title exists: rename it to label
            ALTER TABLE car_links RENAME COLUMN title TO label;
          END IF;
        END IF;
      END $$;
    `;

    // Create car_slots table
    await sql`
      CREATE TABLE IF NOT EXISTS car_slots (
        id SERIAL PRIMARY KEY,
        car_id INTEGER REFERENCES cars(id) ON DELETE CASCADE,
        slot_type VARCHAR(50) NOT NULL,
        slot_index INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'empty',
        locked BOOLEAN DEFAULT FALSE,
        locked_at TIMESTAMP,
        locked_by TEXT,
        lock_meta_json TEXT,
        disk_slot_path TEXT NOT NULL,
        public_url TEXT,
        is_used BOOLEAN DEFAULT FALSE,
        marked_used_at TIMESTAMP,
        marked_used_by TEXT,
        file_count INTEGER DEFAULT 0,
        total_size_mb NUMERIC(10,2) DEFAULT 0,
        last_sync_at TIMESTAMP,
        UNIQUE(car_id, slot_type, slot_index)
      )
    `;
    
    // Migrate car_slots.locked_by from INTEGER to TEXT if needed
    await sql`
      DO $$ 
      BEGIN 
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='car_slots' AND column_name='locked_by' 
          AND data_type IN ('integer', 'bigint', 'smallint')
        ) THEN
          ALTER TABLE car_slots ALTER COLUMN locked_by TYPE TEXT USING locked_by::TEXT;
        END IF;
      END $$;
    `;
    
    // Migrate car_slots.marked_used_by from INTEGER to TEXT if needed
    await sql`
      DO $$ 
      BEGIN 
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='car_slots' AND column_name='marked_used_by' 
          AND data_type IN ('integer', 'bigint', 'smallint')
        ) THEN
          ALTER TABLE car_slots ALTER COLUMN marked_used_by TYPE TEXT USING marked_used_by::TEXT;
        END IF;
      END $$;
    `;

    // Add locked column if it doesn't exist (migration)
    await sql`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='car_slots' AND column_name='locked'
        ) THEN
          ALTER TABLE car_slots ADD COLUMN locked BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;
    `;

    console.log('Database schema initialized successfully');
    return true;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

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
