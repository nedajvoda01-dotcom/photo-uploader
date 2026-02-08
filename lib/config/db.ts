/**
 * Database Configuration
 * Single source of truth for database-related environment variables
 */

// Database configuration
export const POSTGRES_URL = process.env.POSTGRES_URL || null;
export const POSTGRES_URL_NON_POOLING = process.env.POSTGRES_URL_NON_POOLING || null;
