/**
 * Regions Configuration
 * Single source of truth for region-related environment variables
 */

import { normalizeRegion, normalizeRegionList } from '@/lib/domain/region/validation';

const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';

// Regions configuration (required)
const REGIONS_ENV = process.env.REGIONS;
if (!isBuildTime && !REGIONS_ENV) {
  throw new Error("REGIONS environment variable is required (comma-separated list, e.g., 'R1,R2,R3,K1,V,S1,S2')");
}

// Normalize regions: trim + toUpperCase
export const REGIONS = REGIONS_ENV 
  ? normalizeRegionList(REGIONS_ENV.split(","))
  : [];

if (!isBuildTime && REGIONS.length === 0) {
  throw new Error("REGIONS must contain at least one region");
}

// Admin region (default: ALL)
export const ADMIN_REGION = process.env.ADMIN_REGION 
  ? normalizeRegion(process.env.ADMIN_REGION)
  : "ALL";

// Validate ADMIN_REGION configuration
if (!isBuildTime) {
  // ADMIN_REGION can be "ALL" (special value for full access) or must be in REGIONS list
  if (ADMIN_REGION !== "ALL" && REGIONS.length > 0 && !REGIONS.includes(ADMIN_REGION)) {
    console.warn(
      `WARNING: ADMIN_REGION is set to "${ADMIN_REGION}" but this region is not in REGIONS list [${REGIONS.join(', ')}]. ` +
      `Admins will only have access to region "${ADMIN_REGION}". ` +
      `Consider setting ADMIN_REGION="ALL" for full admin access.`
    );
  }
}

// Region-based user mappings (REGION_<REGION>_USERS)
// Format: email1@x.com,email2@x.com (no spaces)
interface RegionUsers {
  [region: string]: string[];
}

export const REGION_USERS: RegionUsers = {};

if (!isBuildTime) {
  for (const region of REGIONS) {
    const envKey = `REGION_${region}_USERS`;
    const usersEnv = process.env[envKey];
    if (usersEnv) {
      REGION_USERS[region] = usersEnv.split(',').map(email => email.trim().toLowerCase()).filter(email => email.length > 0);
    } else {
      REGION_USERS[region] = [];
    }
  }
}

// User password map (USER_PASSWORD_MAP)
// Format: email1:password1,email2:password2
interface UserPasswordMap {
  [email: string]: string;
}

export const USER_PASSWORD_MAP: UserPasswordMap = {};

if (!isBuildTime) {
  const passwordMapEnv = process.env.USER_PASSWORD_MAP;
  if (passwordMapEnv) {
    const pairs = passwordMapEnv.split(',');
    for (const pair of pairs) {
      const [email, password] = pair.split(':').map(s => s.trim());
      if (email && password) {
        // Normalize email to lowercase, but keep password as-is
        USER_PASSWORD_MAP[email.toLowerCase()] = password;
      }
    }
  }
}

// Validation: Each email in REGION_*_USERS should have a password
if (!isBuildTime) {
  const allRegionUsers: string[] = [];
  const emailToRegion: Map<string, string[]> = new Map();
  const missingPasswords: string[] = [];
  
  for (const [region, users] of Object.entries(REGION_USERS)) {
    for (const email of users) {
      allRegionUsers.push(email);
      
      // Track which regions this email appears in
      if (!emailToRegion.has(email)) {
        emailToRegion.set(email, []);
      }
      emailToRegion.get(email)!.push(region);
      
      // Check if email has a password in USER_PASSWORD_MAP
      if (!USER_PASSWORD_MAP[email]) {
        missingPasswords.push(`${email} (region: ${region})`);
      }
    }
  }
  
  // Warn about missing passwords but don't throw (allow service to start)
  if (missingPasswords.length > 0) {
    console.warn(
      `\nWARNING: Missing passwords in USER_PASSWORD_MAP for the following region users:\n` +
      missingPasswords.map(email => `  - ${email}`).join('\n') + '\n' +
      `These users will not be able to log in until passwords are added to USER_PASSWORD_MAP.\n` +
      `Format: email1:password1,email2:password2\n`
    );
  }
  
  // Check for email duplicates across regions (this is an error)
  const duplicates: string[] = [];
  for (const [email, regions] of emailToRegion.entries()) {
    if (regions.length > 1) {
      duplicates.push(`${email} (regions: ${regions.join(', ')})`);
    }
  }
  
  if (duplicates.length > 0) {
    console.warn(
      `\nWARNING: Email duplicates found across regions:\n` +
      duplicates.map(d => `  - ${d}`).join('\n') + '\n' +
      `Each user must belong to exactly one region. Using first occurrence.\n`
    );
  }
}

/**
 * Get region for a user email from REGION_USERS mappings
 * Returns region code if found, null otherwise
 */
export function getRegionForUser(email: string): string | null {
  for (const [region, users] of Object.entries(REGION_USERS)) {
    if (users.includes(email)) {
      return region;
    }
  }
  return null;
}

/**
 * Get all users from REGION_USERS and USER_PASSWORD_MAP
 * Returns array of user configurations
 */
export function getAllRegionUsers(): Array<{
  email: string;
  password: string;
  region: string;
  role: string;
}> {
  const users = [];
  
  for (const [region, emails] of Object.entries(REGION_USERS)) {
    for (const email of emails) {
      const password = USER_PASSWORD_MAP[email];
      if (password) {
        users.push({
          email,
          password,
          region,
          role: 'user',
        });
      }
    }
  }
  
  return users;
}
