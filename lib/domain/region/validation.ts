/**
 * Domain: Region validation and normalization
 * Pure business rules for region handling
 */

/**
 * Normalize region code (trim + uppercase)
 */
export function normalizeRegion(region: string): string {
  return region.trim().toUpperCase();
}

/**
 * Normalize region list (trim + uppercase each region, filter empty)
 */
export function normalizeRegionList(regions: string[]): string[] {
  return regions
    .map(r => normalizeRegion(r))
    .filter(r => r.length > 0);
}

/**
 * Check if a user has permission to access a specific region
 */
export function hasRegionAccess(userRegion: string, targetRegion: string): boolean {
  // Admin region (ALL) has access to everything
  if (userRegion === "ALL") {
    return true;
  }

  // User can only access their own region
  return userRegion === targetRegion;
}

/**
 * Validate region is in allowed list
 */
export function isValidRegion(region: string, allowedRegions: string[]): boolean {
  const normalized = normalizeRegion(region);
  return allowedRegions.includes(normalized);
}
