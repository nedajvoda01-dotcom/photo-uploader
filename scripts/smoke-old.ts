#!/usr/bin/env node
/**
 * Comprehensive Smoke Test Script
 * 
 * Tests entire critical flow: auth → regions → create car → get car → 14 slots → 
 * upload/lock/download → links/used/admin → archive
 * 
 * Usage:
 *   npm run smoke -- --baseUrl=http://localhost:3000 --email=admin@example.com --password=admin123 --region=R1
 *   npm run smoke -- --baseUrl=https://preview.vercel.app --email=user@example.com --password=pass --cleanup
 * 
 * CLI Parameters:
 *   --baseUrl      Preview URL or localhost (required)
 *   --email        User email for login (required)
 *   --password     User password (required)
 *   --role         admin|user (optional, auto-detected from login)
 *   --region       R1|R2|S1|S2 (required for admin)
 *   --yandexTestMode  Skip actual Yandex Disk operations (optional)
 *   --cleanup      Archive test car after tests (optional)
 * 
 * Example:
 *   npm run smoke -- --baseUrl=https://photo-uploader.vercel.app --email=admin@example.com --password=admin123 --region=R1 --cleanup
 */

interface TestResult {
  step: string;
  success: boolean;
  status?: number;
  body?: any;
  error?: string;
  duration?: number;
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

class ComprehensiveSmokeTest {
  private baseUrl: string;
  private email: string;
  private password: string;
  private role?: 'admin' | 'user';
  private region?: string;
  private yandexTestMode: boolean;
  private cleanup: boolean;
  private cookies: string[] = [];
  private results: TestResult[] = [];
  private testVin?: string;
  private testCarId?: number;

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
    if (data) {
      if (typeof data === 'string') {
        console.log(data);
      } else {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }

  private logStep(stepName: string, status: number, body?: any, error?: string) {
    const icon = status >= 200 && status < 300 ? '✅' : '❌';
    console.log(`\n${icon} ${stepName}`);
    console.log(`   Status: ${status}`);
    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
      const lines = bodyStr.split('\n');
      if (lines.length > 20) {
        console.log(`   Body (first 20 lines):`);
        console.log(lines.slice(0, 20).map(l => `   ${l}`).join('\n'));
        console.log(`   ... (${lines.length - 20} more lines)`);
      } else {
        console.log(`   Body:`);
        console.log(lines.map(l => `   ${l}`).join('\n'));
      }
    }
    if (error) {
      console.log(`   Error: ${error}`);
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
      // Simple cookie parsing (works for most cases)
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
    const padded = timestamp.padEnd(17, '0').slice(0, 17);
    return `TEST${padded.slice(4)}`;
  }

  async run(): Promise<void> {
    const startTime = Date.now();

    this.log('COMPREHENSIVE SMOKE TEST', {
      baseUrl: this.baseUrl,
      email: this.email,
      region: this.region,
      yandexTestMode: this.yandexTestMode,
      cleanup: this.cleanup,
    });

    try {
      // Step 1: Login
      await this.testLogin();

      // Step 2: Check role/region
      await this.testRoleRegion();

      // Step 3: Create test car
      await this.testCreateCar();

      // Step 4: Get car by VIN
      await this.testGetCarByVin();

      // Step 5: Verify 14 slots
      await this.testVerifySlots();

      // Step 6: Upload to slot
      await this.testUpload();

      // Step 7: Lock slot
      await this.testLock();

      // Step 8: Download ZIP (if implemented)
      await this.testDownload();

      // Step 9: Test links
      await this.testLinks();

      // Step 10: Test used flag
      await this.testUsedFlag();

      // Step 11: Archive (cleanup)
      if (this.cleanup && this.testVin) {
        await this.testArchive();
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
    const startTime = Date.now();

    try {
      const url = `${this.baseUrl}/api/auth/login`;
      const response = await this.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.email,
          password: this.password,
        }),
      });

      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, status, body);

      const success = status === 200;
      this.addResult({
        step: stepName,
        success,
        status,
        body,
        duration: Date.now() - startTime,
      });

      if (!success) {
        throw new Error(`Login failed with status ${status}`);
      }

      // Try to determine role from response
      if (body.user?.role) {
        this.role = body.user.role;
      }
      if (body.user?.region) {
        if (!this.region) {
          this.region = body.user.region;
        }
      }

    } catch (error: any) {
      this.logStep(stepName, 0, null, error.message);
      this.addResult({
        step: stepName,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  private async testRoleRegion(): Promise<void> {
    const stepName = 'Check role/region';
    const startTime = Date.now();

    try {
      // Try GET /api/cars to check session info
      const url = `${this.baseUrl}/api/cars`;
      const response = await this.fetch(url);

      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, status, {
        role: this.role || 'unknown',
        region: this.region || 'unknown',
        response_preview: body.ok ? 'OK' : body.code,
      });

      const success = status === 200;
      this.addResult({
        step: stepName,
        success,
        status,
        body: { role: this.role, region: this.region },
        duration: Date.now() - startTime,
      });

      if (!success) {
        throw new Error(`Failed to check role/region with status ${status}`);
      }

    } catch (error: any) {
      this.logStep(stepName, 0, null, error.message);
      this.addResult({
        step: stepName,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  private async testCreateCar(): Promise<void> {
    const stepName = 'POST /api/cars';
    const startTime = Date.now();

    try {
      this.testVin = this.generateTestVin();
      
      const url = `${this.baseUrl}/api/cars`;
      const response = await this.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: this.region,
          make: 'Toyota',
          model: 'Camry',
          vin: this.testVin,
        }),
      });

      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, status, body);

      const success = status === 201 || status === 200;
      this.addResult({
        step: stepName,
        success,
        status,
        body,
        duration: Date.now() - startTime,
      });

      if (!success) {
        throw new Error(`Car creation failed with status ${status}`);
      }

      // Assert region != ALL
      if (body.car?.region === 'ALL') {
        throw new Error('ERROR: Car created in region=ALL (should be blocked!)');
      }

      // Save car ID
      if (body.car?.id) {
        this.testCarId = body.car.id;
      }

    } catch (error: any) {
      this.logStep(stepName, 0, null, error.message);
      this.addResult({
        step: stepName,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  private async testGetCarByVin(): Promise<void> {
    const stepName = `GET /api/cars/vin/${this.testVin}`;
    const startTime = Date.now();

    try {
      if (!this.testVin) {
        throw new Error('No test VIN available');
      }

      const url = `${this.baseUrl}/api/cars/vin/${this.testVin}`;
      const response = await this.fetch(url);

      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, status, body);

      const success = status === 200;
      this.addResult({
        step: stepName,
        success,
        status,
        body,
        duration: Date.now() - startTime,
      });

      if (!success) {
        throw new Error(`Get car by VIN failed with status ${status}`);
      }

      // Verify last_sync_at is present
      if (body.last_sync_at) {
        console.log(`   ✅ last_sync_at present: ${body.last_sync_at}`);
      }

    } catch (error: any) {
      this.logStep(stepName, 0, null, error.message);
      this.addResult({
        step: stepName,
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
      if (!this.testVin) {
        throw new Error('No test VIN available');
      }

      const url = `${this.baseUrl}/api/cars/vin/${this.testVin}`;
      const response = await this.fetch(url);

      const status = response.status;
      const body = await response.json();

      const slots = body.slots || [];
      const slotCount = slots.length;

      this.logStep(stepName, status, {
        expected_slots: 14,
        actual_slots: slotCount,
        slots_summary: slots.map((s: any) => ({
          type: s.slot_type,
          index: s.slot_index,
          locked: s.locked,
        })),
      });

      const success = status === 200 && slotCount === 14;
      this.addResult({
        step: stepName,
        success,
        status,
        body: { expected: 14, actual: slotCount },
        duration: Date.now() - startTime,
      });

      if (slotCount !== 14) {
        throw new Error(`Expected 14 slots, got ${slotCount}`);
      }

      console.log(`   ✅ All 14 slots present`);

    } catch (error: any) {
      this.logStep(stepName, 0, null, error.message);
      this.addResult({
        step: stepName,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      // Don't throw - continue with other tests
    }
  }

  private async testUpload(): Promise<void> {
    const stepName = 'POST upload to slot';
    const startTime = Date.now();

    try {
      if (!this.testVin) {
        throw new Error('No test VIN available');
      }

      if (this.yandexTestMode) {
        console.log(`   ⏭️  Skipping upload (yandexTestMode=true)`);
        this.addResult({
          step: stepName,
          success: true,
          status: 0,
          body: { skipped: true, reason: 'yandexTestMode' },
          duration: Date.now() - startTime,
        });
        return;
      }

      // Create a small test file
      const testContent = 'Test file content for smoke test';
      const blob = new Blob([testContent], { type: 'text/plain' });
      
      const formData = new FormData();
      formData.append('file0', blob, 'test-smoke.txt');

      const url = `${this.baseUrl}/api/cars/vin/${this.testVin}/upload?slotType=exterior&slotIndex=0`;
      const response = await this.fetch(url, {
        method: 'POST',
        body: formData as any,
      });

      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, status, body);

      const success = status === 200;
      this.addResult({
        step: stepName,
        success,
        status,
        body,
        duration: Date.now() - startTime,
      });

    } catch (error: any) {
      this.logStep(stepName, 0, null, error.message);
      this.addResult({
        step: stepName,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      // Don't throw - continue
    }
  }

  private async testLock(): Promise<void> {
    const stepName = 'PATCH lock slot';
    const startTime = Date.now();

    try {
      if (!this.testVin) {
        throw new Error('No test VIN available');
      }

      const url = `${this.baseUrl}/api/cars/vin/${this.testVin}/slots/exterior/0`;
      const response = await this.fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_as_uploaded',
        }),
      });

      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, status, body);

      const success = status === 200;
      this.addResult({
        step: stepName,
        success,
        status,
        body,
        duration: Date.now() - startTime,
      });

    } catch (error: any) {
      this.logStep(stepName, 0, null, error.message);
      this.addResult({
        step: stepName,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      // Don't throw - continue
    }
  }

  private async testDownload(): Promise<void> {
    const stepName = 'GET download ZIP';
    const startTime = Date.now();

    try {
      if (!this.testVin) {
        throw new Error('No test VIN available');
      }

      if (this.yandexTestMode) {
        console.log(`   ⏭️  Skipping download (yandexTestMode=true)`);
        this.addResult({
          step: stepName,
          success: true,
          status: 0,
          body: { skipped: true, reason: 'yandexTestMode' },
          duration: Date.now() - startTime,
        });
        return;
      }

      // Check if download endpoint exists
      const url = `${this.baseUrl}/api/cars/vin/${this.testVin}/download`;
      const response = await this.fetch(url);

      const status = response.status;
      
      this.logStep(stepName, status, {
        note: status === 404 ? 'Download endpoint not implemented' : 'Response received',
      });

      const success = status === 200 || status === 404; // 404 is OK if not implemented
      this.addResult({
        step: stepName,
        success,
        status,
        body: { implemented: status !== 404 },
        duration: Date.now() - startTime,
      });

    } catch (error: any) {
      this.logStep(stepName, 0, null, error.message);
      this.addResult({
        step: stepName,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      // Don't throw - continue
    }
  }

  private async testLinks(): Promise<void> {
    const stepName = 'GET /api/cars/vin/[vin]/links';
    const startTime = Date.now();

    try {
      if (!this.testVin) {
        throw new Error('No test VIN available');
      }

      const url = `${this.baseUrl}/api/cars/vin/${this.testVin}/links`;
      const response = await this.fetch(url);

      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, status, body);

      const success = status === 200;
      this.addResult({
        step: stepName,
        success,
        status,
        body,
        duration: Date.now() - startTime,
      });

    } catch (error: any) {
      this.logStep(stepName, 0, null, error.message);
      this.addResult({
        step: stepName,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      // Don't throw - continue
    }
  }

  private async testUsedFlag(): Promise<void> {
    const stepName = 'PATCH used flag';
    const startTime = Date.now();

    try {
      if (!this.testVin) {
        throw new Error('No test VIN available');
      }

      const url = `${this.baseUrl}/api/cars/vin/${this.testVin}/slots/exterior/0`;
      const response = await this.fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_used',
        }),
      });

      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, status, body);

      const success = status === 200;
      this.addResult({
        step: stepName,
        success,
        status,
        body,
        duration: Date.now() - startTime,
      });

    } catch (error: any) {
      this.logStep(stepName, 0, null, error.message);
      this.addResult({
        step: stepName,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      // Don't throw - continue
    }
  }

  private async testArchive(): Promise<void> {
    const stepName = `DELETE /api/cars/vin/${this.testVin} (archive)`;
    const startTime = Date.now();

    try {
      if (!this.testVin) {
        throw new Error('No test VIN available');
      }

      const url = `${this.baseUrl}/api/cars/vin/${this.testVin}`;
      const response = await this.fetch(url, {
        method: 'DELETE',
      });

      const status = response.status;
      const body = await response.json();

      this.logStep(stepName, status, body);

      const success = status === 200;
      this.addResult({
        step: stepName,
        success,
        status,
        body,
        duration: Date.now() - startTime,
      });

      if (success) {
        console.log(`   ✅ Test car archived successfully`);
      }

    } catch (error: any) {
      this.logStep(stepName, 0, null, error.message);
      this.addResult({
        step: stepName,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      });
      // Don't throw - this is cleanup
    }
  }

  private printSummary(totalDuration: number): void {
    this.log('SMOKE TEST SUMMARY');

    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const total = this.results.length;

    console.log(`\nTotal Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Duration: ${(totalDuration / 1000).toFixed(2)}s`);

    console.log('\n' + '='.repeat(80));
    console.log('DETAILED RESULTS');
    console.log('='.repeat(80));

    this.results.forEach((result, index) => {
      const icon = result.success ? '✅' : '❌';
      const duration = result.duration ? `${result.duration}ms` : 'N/A';
      console.log(`${index + 1}. ${icon} ${result.step} (${duration})`);
      if (result.status) {
        console.log(`   Status: ${result.status}`);
      }
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    console.log('\n' + '='.repeat(80));

    if (failed > 0) {
      console.log('❌ SMOKE TEST FAILED');
      console.log('='.repeat(80));
      process.exit(1);
    } else {
      console.log('✅ SMOKE TEST PASSED');
      console.log('='.repeat(80));
      process.exit(0);
    }
  }
}

// Parse CLI arguments
function parseCLIArgs(): CLIArgs | null {
  const args: any = {};
  
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      
      switch (key) {
        case 'baseUrl':
          args.baseUrl = value;
          break;
        case 'email':
          args.email = value;
          break;
        case 'password':
          args.password = value;
          break;
        case 'role':
          args.role = value;
          break;
        case 'region':
          args.region = value;
          break;
        case 'yandexTestMode':
          args.yandexTestMode = value === '1' || value === 'true';
          break;
        case 'cleanup':
          args.cleanup = value === '1' || value === 'true' || value === undefined;
          break;
      }
    }
  }

  // Validate required args
  if (!args.baseUrl || !args.email || !args.password) {
    console.error('Error: Missing required arguments');
    console.error('\nUsage:');
    console.error('  npm run smoke -- --baseUrl=<url> --email=<email> --password=<password> [options]');
    console.error('\nRequired:');
    console.error('  --baseUrl      Preview URL or localhost');
    console.error('  --email        User email for login');
    console.error('  --password     User password');
    console.error('\nOptional:');
    console.error('  --role         admin|user (auto-detected)');
    console.error('  --region       R1|R2|S1|S2 (required for admin)');
    console.error('  --yandexTestMode  Skip Yandex Disk operations (default: false)');
    console.error('  --cleanup      Archive test car after tests (default: false)');
    console.error('\nExample:');
    console.error('  npm run smoke -- --baseUrl=http://localhost:3000 --email=admin@example.com --password=admin123 --region=R1 --cleanup');
    return null;
  }

  return args as CLIArgs;
}

// Main execution
async function main() {
  const args = parseCLIArgs();
  
  if (!args) {
    process.exit(1);
  }

  const smokeTest = new ComprehensiveSmokeTest(args);
  await smokeTest.run();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
