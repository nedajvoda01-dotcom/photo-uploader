/**
 * Database connection and query utilities
 */
import { sql } from '@vercel/postgres';

export { sql };

/**
 * Initialize database schema
 * Creates tables if they don't exist
 */
export async function initializeDatabase() {
  try {
    // Create users table
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

    // Create cars table
    await sql`
      CREATE TABLE IF NOT EXISTS cars (
        id SERIAL PRIMARY KEY,
        region VARCHAR(50) NOT NULL,
        make VARCHAR(100) NOT NULL,
        model VARCHAR(100) NOT NULL,
        vin VARCHAR(17) NOT NULL,
        disk_root_path TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        UNIQUE(region, vin)
      )
    `;

    // Create car_links table
    await sql`
      CREATE TABLE IF NOT EXISTS car_links (
        id SERIAL PRIMARY KEY,
        car_id INTEGER REFERENCES cars(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create car_slots table
    await sql`
      CREATE TABLE IF NOT EXISTS car_slots (
        id SERIAL PRIMARY KEY,
        car_id INTEGER REFERENCES cars(id) ON DELETE CASCADE,
        slot_type VARCHAR(50) NOT NULL,
        slot_index INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'empty',
        locked_at TIMESTAMP,
        locked_by INTEGER REFERENCES users(id),
        lock_meta_json TEXT,
        disk_slot_path TEXT NOT NULL,
        public_url TEXT,
        is_used BOOLEAN DEFAULT FALSE,
        marked_used_at TIMESTAMP,
        marked_used_by INTEGER REFERENCES users(id),
        file_count INTEGER DEFAULT 0,
        total_size_mb NUMERIC(10,2) DEFAULT 0,
        last_sync_at TIMESTAMP,
        UNIQUE(car_id, slot_type, slot_index)
      )
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
