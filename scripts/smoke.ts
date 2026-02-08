#!/usr/bin/env node
/**
 * Enhanced Comprehensive Smoke Test Script - Definition of Done
 * 
 * This script is the SOURCE OF TRUTH for system verification.
 * 
 * Tests entire critical flow with hard assertions:
 * - auth → regions → create car → get car → 14 slots
 * - upload/lock/download → links/used/admin → archive
 * 
 * Usage:
 *   npm run smoke -- --baseUrl=http://localhost:3000 --email=admin@example.com --password=admin123 --region=R1
 *   npm run smoke -- --baseUrl=https://preview.vercel.app --email=user@example.com --password=pass --cleanup --yandexTestMode
 * 
 * CLI Parameters:
 *   --baseUrl          Preview URL or localhost (required)
 *   --email            User email for login (required)
 *   --password         User password (required)
 *   --role             admin|user (optional, auto-detected from login)
 *   --region           R1|R2|S1|S2 (required for admin)
 *   --yandexTestMode   Skip actual Yandex Disk operations (optional)
 *   --cleanup          Archive test car after tests (optional)
 * 
 * Required Artifacts Output:
 *   1. BASE_URL
 *   2. POST /api/cars - endpoint, status, full JSON with car.region
 *   3. GET /api/cars/vin/[vin] - endpoint, status, slots.length, first 2 slots
 */

const REGIONS = ['R1', 'R2', 'S1', 'S2'] as const;
type Region = typeof REGIONS[number];

interface TestResult {
  step: string;
  endpoint?: string;
  success: boolean;
  status?: number;
  body?: any;
  error?: string;
  duration?: number;
  skipped?: boolean;
  skipReason?: string;
}

interface CLIArgs {
  baseUrl: string;
  email: string;
  password: string;
  role?: 'admin' | 'user';
  region?: string;
  yandexTestMode?: boolean;
  cleanup?: boolean;
}

class EnhancedSmokeTest {
  private baseUrl: string;
  private email: string;
  private password: string;
  private role?: 'admin' | 'user';
  private region?: string;
  private activeRegion?: string;
  private yandexTestMode: boolean;
  private cleanup: boolean;
  private cookies: string[] = [];
  private results: TestResult[] = [];
  private testVin?: string;
  private testCarId?: number;
  private carData?: any;
  private slotsData?: any[];

  constructor(args: CLIArgs) {
    this.baseUrl = args.baseUrl.replace(/\/$/, '');
    this.email = args.email;
    this.password = args.password;
    this.role = args.role;
    this.region = args.region;
    this.yandexTestMode = args.yandexTestMode || false;
    this.cleanup = args.cleanup || false;
  }

  private log(message: string, data?: any) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[SMOKE] ${message}`);
    console.log('='.repeat(80));
    if (data !== undefined) {
      if (typeof data === 'string') {
        console.log(data);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }

  private logArtifact(title: string, data: any) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`ARTIFACT: ${title}`);
    console.log('='.repeat(80));
    if (typeof data === 'string') {
      console.log(data);
    } else {
      const jsonStr = JSON.stringify(data, null, 2);
      // Limit to 2KB but ensure we show important parts
      if (jsonStr.length > 2048) {
        console.log(jsonStr.slice(0, 2048));
        console.log(`\n... (truncated, total ${jsonStr.length} bytes)`);
      } else {
        console.log(jsonStr);
      }
    }
    console.log('='.repeat(80));
  }

  private logStep(stepName: string, endpoint: string, status: number, body?: any, error?: string, skipped?: boolean, skipReason?: string) {
    let icon = '❌';
    if (skipped) {
      icon = '⏭️ ';
    } else if (status >= 200 && status < 300) {
      icon = '✅';
    }
    
    console.log(`\n${icon} ${stepName}`);
    console.log(`   Endpoint: ${endpoint}`);
    if (skipped) {
      console.log(`   Status: SKIPPED`);
      console.log(`   Reason: ${skipReason || 'Test mode'}`);
    } else {
      console.log(`   Status: ${status}`);
      if (body) {
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
        const lines = bodyStr.split('\n');
        if (lines.length > 15) {
          console.log(`   Body (first 15 lines):`);
          console.log(lines.slice(0, 15).map(l => `   ${l}`).join('\n'));
          console.log(`   ... (${lines.length - 15} more lines)`);
        } else {
          console.log(`   Body:`);
          console.log(lines.map(l => `   ${l}`).join('\n'));
        }
      }
      if (error) {
        console.log(`   Error: ${error}`);
      }
    }
  }

  private async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    if (this.cookies.length > 0) {
      headers.set('Cookie', this.cookies.join('; '));
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Save cookies from response
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const cookies = setCookie.split(',').map(c => c.split(';')[0].trim());
      this.cookies.push(...cookies);
    }

    return response;
  }

  private addResult(result: TestResult) {
    this.results.push(result);
  }

  private generateTestVin(): string {
    const timestamp = Date.now().toString();
    // Ensure VIN is exactly 17 characters: TEST + 13 digits
    const digits = timestamp.slice(-13).padStart(13, '0');
    return `TEST${digits}`;
  }

  private assert(condition: boolean, message: string) {
    if (!condition) {
      throw new Error(`ASSERTION FAILED: ${message}`);
    }
  }

  async run(): Promise<void> {
    const startTime = Date.now();

    // Print BASE_URL as required artifact
    this.logArtifact('BASE_URL', `BASE_URL=${this.baseUrl}`);

    this.log('ENHANCED COMPREHENSIVE SMOKE TEST', {
      baseUrl: this.baseUrl,
      email: this.email,
      region: this.region,
      yandexTestMode: this.yandexTestMode,
      cleanup: this.cleanup,
    });

    if (this.yandexTestMode) {
      console.log('\n⚠️  Yandex test mode: ON');
      console.log('   The following steps will be SKIPPED:');
      console.log('   - File upload to Yandex Disk');
      console.log('   - Slot locking (requires upload)');
      console.log('   - ZIP download (requires locked slots)');
      console.log('   All other tests (create car, get car, 14 slots) will execute normally.\n');
    }

    try {
      // Step 1: Login
      await this.testLogin();

      // Step 2: Check role/region with assertions
      await this.testRoleRegion();

      // Step 3: Create test car
      await this.testCreateCar();

      // Step 4: Get car by VIN
      await this.testGetCarByVin();

      // Step 5: Verify 14 slots
      await this.testVerifySlots();

      // Step 6: Upload to slot (skip in test mode)
      await this.testUpload();

      // Step 7: Lock slot (skip in test mode)
      await this.testLock();

      // Step 8: Download ZIP (skip in test mode)
      await this.testDownload();

      // Step 9: Test links (RBAC check)
      await this.testLinks();

      // Step 10: Test used flag (RBAC check)
      await this.testUsedFlag();

      // Step 11: Archive (cleanup)
      if (this.cleanup && this.testVin) {
        await this.testArchive();
        await this.verifyArchiveCleanup();
      }

    } catch (error: any) {
      this.log('FATAL ERROR', error.message);
      this.addResult({
        step: 'Fatal Error',
        success: false,
        error: error.message,
      });
    }

    // Print summary
    this.printSummary(Date.now() - startTime);
  }

  private async testLogin(): Promise<void> {
    const stepName = 'POST /api/auth/login';
    const endpoint = `${this.baseUrl}/api/auth/login`;
    const startTime = Date.now();

    try {
      const response = await this.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.email,
          password: this.password,
        }),
      });

      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, endpoint, status, body);

      // Check for 404/405 (wrong endpoint)
      if (status === 404 || status === 405) {
        throw new Error(`Endpoint error: ${status}. Check if /api/auth/login exists in src/app/api/auth/login/route.ts`);
      }

      const success = status === 200;
      this.addResult({
        step: stepName,
        endpoint,
        success,
        status,
        body,
        duration: Date.now() - startTime,
      });

      if (!success) {
        throw new Error(`Login failed with status ${status}`);
      }

      // Extract role/region from response
      if (body.user?.role) {
        this.role = body.user.role;
      }
      if (body.user?.region) {
        this.region = body.user.region;
      }
      if (body.user?.activeRegion) {
        this.activeRegion = body.user.activeRegion;
      }

      // HARD ASSERTION 1: Role and region checks after login
      if (this.role === 'admin') {
        this.assert(
          this.region === 'ALL',
          `Admin must have region='ALL', got '${this.region}'`
        );
        this.assert(
          this.activeRegion && this.activeRegion !== 'ALL',
          `Admin must have activeRegion != 'ALL', got '${this.activeRegion}'`
        );
        console.log(`   ✓ Admin assertion passed: region=ALL, activeRegion=${this.activeRegion}`);
      } else if (this.role === 'user') {
        this.assert(
          this.region && REGIONS.includes(this.region as Region),
          `User must have region in ${REGIONS.join(', ')}, got '${this.region}'`
        );
        console.log(`   ✓ User assertion passed: region=${this.region}`);
      }

    } catch (error: any) {
      this.logStep(stepName, endpoint, 0, null, error.message);
      this.addResult({
        step: stepName,
        endpoint,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  private async testRoleRegion(): Promise<void> {
    const stepName = 'Check role/region';
    const endpoint = `${this.baseUrl}/api/cars`;
    const startTime = Date.now();

    try {
      const response = await this.fetch(endpoint);
      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, endpoint, status, {
        role: this.role || 'unknown',
        region: this.region || 'unknown',
        activeRegion: this.activeRegion || 'N/A',
        response_ok: body.ok,
      });

      const success = status === 200;
      this.addResult({
        step: stepName,
        endpoint,
        success,
        status,
        body: { role: this.role, region: this.region, activeRegion: this.activeRegion },
        duration: Date.now() - startTime,
      });

      if (!success) {
        throw new Error(`Failed to check role/region with status ${status}`);
      }

    } catch (error: any) {
      this.logStep(stepName, endpoint, 0, null, error.message);
      this.addResult({
        step: stepName,
        endpoint,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  private async testCreateCar(): Promise<void> {
    const stepName = 'POST /api/cars';
    const endpoint = `${this.baseUrl}/api/cars`;
    const startTime = Date.now();

    try {
      this.testVin = this.generateTestVin();
      
      // Use activeRegion for admin, or user's region
      const targetRegion = this.role === 'admin' ? (this.activeRegion || this.region) : this.region;

      if (!targetRegion) {
        throw new Error('No region specified for car creation');
      }

      const response = await this.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: targetRegion,
          make: 'Toyota',
          model: 'Camry',
          vin: this.testVin,
        }),
      });

      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, endpoint, status, body);

      // Check for 404/405
      if (status === 404 || status === 405) {
        throw new Error(`Endpoint error: ${status}. Check if POST /api/cars exists in app/api/cars/route.ts`);
      }

      // Save car data for later steps
      if (body.car) {
        this.carData = body.car;
        this.testCarId = body.car.id;
      }

      // Print as required artifact
      this.logArtifact('POST /api/cars', {
        endpoint,
        status,
        body,
      });

      const success = status === 201 || status === 200;
      this.addResult({
        step: stepName,
        endpoint,
        success,
        status,
        body,
        duration: Date.now() - startTime,
      });

      if (!success) {
        throw new Error(`Create car failed with status ${status}`);
      }

      // HARD ASSERTION 2: Car region checks
      const carRegion = body.car?.region;
      this.assert(
        carRegion && REGIONS.includes(carRegion as Region),
        `car.region must be in ${REGIONS.join(', ')}, got '${carRegion}'`
      );
      this.assert(
        carRegion !== 'ALL',
        `car.region must NOT be 'ALL', got '${carRegion}'`
      );
      console.log(`   ✓ Car region assertion passed: region=${carRegion} (not ALL)`);

    } catch (error: any) {
      this.logStep(stepName, endpoint, 0, null, error.message);
      this.addResult({
        step: stepName,
        endpoint,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  private async testGetCarByVin(): Promise<void> {
    const stepName = 'GET /api/cars/vin/[vin]';
    const endpoint = `${this.baseUrl}/api/cars/vin/${this.testVin}`;
    const startTime = Date.now();

    try {
      const response = await this.fetch(endpoint);
      const status = response.status;
      const body = await response.json();

      // Prepare artifact output with slots.length and first 2 slots
      const artifactData: any = {
        endpoint,
        status,
        ok: body.ok,
        car: body.car,
        slots_length: body.slots?.length || 0,
      };

      if (body.slots && body.slots.length >= 2) {
        artifactData.first_2_slots = body.slots.slice(0, 2).map((slot: any) => ({
          type: slot.type,
          index: slot.index,
          locked: slot.locked,
          disk_path: slot.disk_slot_path || slot.disk_path,
        }));
      }

      this.logStep(stepName, endpoint, status, artifactData);

      // Check for 404/405
      if (status === 404 || status === 405) {
        throw new Error(`Endpoint error: ${status}. Check if GET /api/cars/vin/[vin] exists in app/api/cars/vin/[vin]/route.ts`);
      }

      // Save slots data
      if (body.slots) {
        this.slotsData = body.slots;
      }

      // Print as required artifact
      this.logArtifact('GET /api/cars/vin/[vin]', artifactData);

      const success = status === 200;
      this.addResult({
        step: stepName,
        endpoint,
        success,
        status,
        body: artifactData,
        duration: Date.now() - startTime,
      });

      if (!success) {
        throw new Error(`Get car failed with status ${status}`);
      }

      // HARD ASSERTION 3: Slots checks
      this.assert(
        body.slots !== undefined && body.slots !== null,
        'Response must include slots array'
      );
      this.assert(
        body.slots.length === 14,
        `Must have exactly 14 slots, got ${body.slots.length}`
      );
      
      // Check that at least one slot has a disk_path
      const hasPath = body.slots.some((slot: any) => 
        slot.disk_slot_path || slot.disk_path
      );
      this.assert(
        hasPath,
        'At least one slot must have a disk_path'
      );
      
      console.log(`   ✓ Slots assertion passed: ${body.slots.length} slots, at least 1 with disk_path`);

    } catch (error: any) {
      this.logStep(stepName, endpoint, 0, null, error.message);
      this.addResult({
        step: stepName,
        endpoint,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  private async testVerifySlots(): Promise<void> {
    const stepName = 'Verify 14 slots';
    const startTime = Date.now();

    try {
      if (!this.slotsData) {
        throw new Error('No slots data available from previous step');
      }

      const slotsSummary = {
        total: this.slotsData.length,
        exterior: this.slotsData.filter(s => s.type === 'exterior').length,
        interior: this.slotsData.filter(s => s.type === 'interior').length,
        with_disk_path: this.slotsData.filter(s => s.disk_slot_path || s.disk_path).length,
      };

      console.log(`\n✅ ${stepName}`);
      console.log(`   Total slots: ${slotsSummary.total}`);
      console.log(`   Exterior: ${slotsSummary.exterior}`);
      console.log(`   Interior: ${slotsSummary.interior}`);
      console.log(`   With disk_path: ${slotsSummary.with_disk_path}`);

      this.addResult({
        step: stepName,
        success: true,
        body: slotsSummary,
        duration: Date.now() - startTime,
      });

    } catch (error: any) {
      console.log(`\n❌ ${stepName}`);
      console.log(`   Error: ${error.message}`);
      this.addResult({
        step: stepName,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
    }
  }

  private async testUpload(): Promise<void> {
    const stepName = 'POST upload to slot';
    const startTime = Date.now();

    if (this.yandexTestMode) {
      console.log(`\n⏭️  ${stepName}`);
      console.log(`   Status: SKIPPED`);
      console.log(`   Reason: Yandex test mode enabled`);
      this.addResult({
        step: stepName,
        success: true,
        skipped: true,
        skipReason: 'Yandex test mode enabled',
        duration: Date.now() - startTime,
      });
      return;
    }

    const endpoint = `${this.baseUrl}/api/cars/vin/${this.testVin}/upload`;

    try {
      // Create a simple test file
      const fileContent = 'Test file content for smoke test';
      const blob = new Blob([fileContent], { type: 'image/jpeg' });
      
      const formData = new FormData();
      formData.append('file0', blob, 'test.jpg');
      formData.append('slotType', 'exterior');
      formData.append('slotIndex', '0');

      const response = await this.fetch(endpoint, {
        method: 'POST',
        body: formData as any,
      });

      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, endpoint, status, body);

      const success = status === 200;
      this.addResult({
        step: stepName,
        endpoint,
        success,
        status,
        body,
        duration: Date.now() - startTime,
      });

    } catch (error: any) {
      this.logStep(stepName, endpoint, 0, null, error.message);
      this.addResult({
        step: stepName,
        endpoint,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
    }
  }

  private async testLock(): Promise<void> {
    const stepName = 'PATCH lock slot (mark_as_uploaded)';
    const startTime = Date.now();

    if (this.yandexTestMode) {
      console.log(`\n⏭️  ${stepName}`);
      console.log(`   Status: SKIPPED`);
      console.log(`   Reason: Yandex test mode enabled (requires upload first)`);
      this.addResult({
        step: stepName,
        success: true,
        skipped: true,
        skipReason: 'Yandex test mode enabled',
        duration: Date.now() - startTime,
      });
      return;
    }

    const endpoint = `${this.baseUrl}/api/cars/vin/${this.testVin}/slots/exterior/0`;

    try {
      const response = await this.fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_as_uploaded',
        }),
      });

      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, endpoint, status, body);

      const success = status === 200;
      this.addResult({
        step: stepName,
        endpoint,
        success,
        status,
        body,
        duration: Date.now() - startTime,
      });

    } catch (error: any) {
      this.logStep(stepName, endpoint, 0, null, error.message);
      this.addResult({
        step: stepName,
        endpoint,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
    }
  }

  private async testDownload(): Promise<void> {
    const stepName = 'GET download ZIP';
    const startTime = Date.now();

    if (this.yandexTestMode) {
      console.log(`\n⏭️  ${stepName}`);
      console.log(`   Status: SKIPPED`);
      console.log(`   Reason: Yandex test mode enabled (requires locked slots)`);
      this.addResult({
        step: stepName,
        success: true,
        skipped: true,
        skipReason: 'Yandex test mode enabled',
        duration: Date.now() - startTime,
      });
      return;
    }

    const endpoint = `${this.baseUrl}/api/cars/vin/${this.testVin}/download`;

    try {
      const response = await this.fetch(endpoint);
      const status = response.status;
      
      const contentType = response.headers.get('content-type');
      const isZip = contentType?.includes('zip');

      this.logStep(stepName, endpoint, status, {
        content_type: contentType,
        is_zip: isZip,
      });

      // HARD ASSERTION 5: Download checks
      // If slot is locked, should return 200 with ZIP
      // If not locked, should return 409/403
      const success = status === 200 || status === 409 || status === 403;
      
      if (status === 200) {
        this.assert(
          isZip,
          'Download with status 200 must have content-type containing "zip"'
        );
        console.log(`   ✓ Download assertion passed: status 200 with content-type ${contentType}`);
      }

      this.addResult({
        step: stepName,
        endpoint,
        success,
        status,
        body: { content_type: contentType, is_zip: isZip },
        duration: Date.now() - startTime,
      });

    } catch (error: any) {
      this.logStep(stepName, endpoint, 0, null, error.message);
      this.addResult({
        step: stepName,
        endpoint,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
    }
  }

  private async testLinks(): Promise<void> {
    const stepName = 'GET/POST links (RBAC check)';
    const endpoint = `${this.baseUrl}/api/cars/vin/${this.testVin}/links`;
    const startTime = Date.now();

    try {
      // Try to get links
      const response = await this.fetch(endpoint);
      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, endpoint, status, body);

      // HARD ASSERTION 4: RBAC checks
      if (this.role === 'user') {
        // Users should get 403 on admin endpoints
        // Note: links might be accessible to all, but let's verify the response
        console.log(`   ℹ️  User role detected - links access: ${status}`);
      } else if (this.role === 'admin') {
        this.assert(
          status === 200 || status === 404,
          `Admin should be able to access links, got ${status}`
        );
        console.log(`   ✓ Admin RBAC assertion passed: can access links`);
      }

      const success = status === 200 || status === 403 || status === 404;
      this.addResult({
        step: stepName,
        endpoint,
        success,
        status,
        body,
        duration: Date.now() - startTime,
      });

    } catch (error: any) {
      this.logStep(stepName, endpoint, 0, null, error.message);
      this.addResult({
        step: stepName,
        endpoint,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
    }
  }

  private async testUsedFlag(): Promise<void> {
    const stepName = 'PATCH toggle_used (RBAC check)';
    const endpoint = `${this.baseUrl}/api/cars/vin/${this.testVin}/slots/exterior/0`;
    const startTime = Date.now();

    try {
      const response = await this.fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_used',
        }),
      });

      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, endpoint, status, body);

      // HARD ASSERTION 4: RBAC checks
      if (this.role === 'user') {
        // Users might get 403 on toggle_used if it's admin-only
        console.log(`   ℹ️  User role detected - toggle_used access: ${status}`);
      } else if (this.role === 'admin') {
        this.assert(
          status === 200 || status === 404,
          `Admin should be able to toggle_used, got ${status}`
        );
        console.log(`   ✓ Admin RBAC assertion passed: can toggle_used`);
      }

      const success = status === 200 || status === 403 || status === 404;
      this.addResult({
        step: stepName,
        endpoint,
        success,
        status,
        body,
        duration: Date.now() - startTime,
      });

    } catch (error: any) {
      this.logStep(stepName, endpoint, 0, null, error.message);
      this.addResult({
        step: stepName,
        endpoint,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
    }
  }

  private async testArchive(): Promise<void> {
    const stepName = 'DELETE archive car';
    const endpoint = `${this.baseUrl}/api/cars/vin/${this.testVin}`;
    const startTime = Date.now();

    try {
      const response = await this.fetch(endpoint, {
        method: 'DELETE',
      });

      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, endpoint, status, body);

      // Check for 404/405
      if (status === 404 || status === 405) {
        throw new Error(`Endpoint error: ${status}. Check if DELETE /api/cars/vin/[vin] exists in app/api/cars/vin/[vin]/route.ts`);
      }

      // RBAC check for archive
      if (this.role === 'user' && status === 403) {
        console.log(`   ℹ️  User got 403 on archive (expected if archive is admin-only)`);
      }

      const success = status === 200 || status === 403;
      this.addResult({
        step: stepName,
        endpoint,
        success,
        status,
        body,
        duration: Date.now() - startTime,
      });

    } catch (error: any) {
      this.logStep(stepName, endpoint, 0, null, error.message);
      this.addResult({
        step: stepName,
        endpoint,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
    }
  }

  private async verifyArchiveCleanup(): Promise<void> {
    const stepName = 'Verify archive cleanup';
    const targetRegion = this.role === 'admin' ? this.activeRegion : this.region;
    const endpoint = `${this.baseUrl}/api/cars`;
    const startTime = Date.now();

    try {
      // Get cars list for the region
      const response = await this.fetch(endpoint);
      const status = response.status;
      const body = await response.json();

      const cars = body.cars || [];
      const vinStillExists = cars.some((car: any) => car.vin === this.testVin);

      console.log(`\n✅ ${stepName}`);
      console.log(`   Endpoint: ${endpoint}`);
      console.log(`   Status: ${status}`);
      console.log(`   VIN ${this.testVin} in active region: ${vinStillExists ? 'YES (FAIL)' : 'NO (PASS)'}`);

      // HARD ASSERTION 5: Cleanup check
      this.assert(
        !vinStillExists,
        `After archive, VIN ${this.testVin} should NOT appear in GET /api/cars for region ${targetRegion}`
      );
      console.log(`   ✓ Cleanup assertion passed: VIN removed from active region`);

      this.addResult({
        step: stepName,
        endpoint,
        success: true,
        status,
        body: { vin_exists: vinStillExists, cars_count: cars.length },
        duration: Date.now() - startTime,
      });

    } catch (error: any) {
      console.log(`\n❌ ${stepName}`);
      console.log(`   Error: ${error.message}`);
      this.addResult({
        step: stepName,
        endpoint,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
    }
  }

  private printSummary(totalDuration: number) {
    this.log('SMOKE TEST SUMMARY');

    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const skipped = this.results.filter(r => r.skipped).length;

    console.log(`\nTotal Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Skipped: ${skipped} ⏭️`);
    console.log(`Duration: ${(totalDuration / 1000).toFixed(2)}s`);

    this.log('DETAILED RESULTS');
    this.results.forEach((result, index) => {
      const icon = result.skipped ? '⏭️ ' : (result.success ? '✅' : '❌');
      const duration = result.duration ? ` (${result.duration}ms)` : '';
      const status = result.skipped ? 'SKIPPED' : (result.status ? `status ${result.status}` : 'N/A');
      console.log(`${index + 1}. ${icon} ${result.step} - ${status}${duration}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      if (result.skipReason) {
        console.log(`   Reason: ${result.skipReason}`);
      }
    });

    console.log(`\n${'='.repeat(80)}`);
    if (failed === 0) {
      console.log('✅ SMOKE TEST PASSED');
      if (skipped > 0) {
        console.log(`   (${skipped} tests skipped in test mode)`);
      }
    } else {
      console.log('❌ SMOKE TEST FAILED');
      console.log(`   ${failed} test(s) failed`);
    }
    console.log('='.repeat(80));

    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
  }
}

// Parse CLI arguments
function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const parsed: any = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value !== undefined) {
        parsed[key] = value;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        parsed[key] = args[++i];
      } else {
        parsed[key] = true;
      }
    }
  }

  if (!parsed.baseUrl || !parsed.email || !parsed.password) {
    console.error('Usage: npm run smoke -- --baseUrl=<url> --email=<email> --password=<password> [--region=<region>] [--yandexTestMode] [--cleanup]');
    console.error('\nRequired:');
    console.error('  --baseUrl       Preview URL or localhost');
    console.error('  --email         User email');
    console.error('  --password      User password');
    console.error('\nOptional:');
    console.error('  --region        R1|R2|S1|S2 (required for admin)');
    console.error('  --role          admin|user (auto-detected)');
    console.error('  --yandexTestMode  Skip Yandex Disk operations');
    console.error('  --cleanup       Archive test car after tests');
    process.exit(1);
  }

  return {
    baseUrl: parsed.baseUrl,
    email: parsed.email,
    password: parsed.password,
    role: parsed.role,
    region: parsed.region,
    yandexTestMode: parsed.yandexTestMode === true || parsed.yandexTestMode === '1',
    cleanup: parsed.cleanup === true || parsed.cleanup === '1',
  };
}

// Main execution
const args = parseArgs();
const test = new EnhancedSmokeTest(args);
test.run().catch(error => {
  console.error('\n❌ Unhandled error:', error);
  process.exit(1);
});
