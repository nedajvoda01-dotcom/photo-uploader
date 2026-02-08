#!/usr/bin/env node
/**
 * Smoke Test Script for Preview Environment
 * 
 * Usage:
 *   npm run smoke-preview
 * 
 * Environment Variables:
 *   BASE_URL - Preview URL (e.g., https://photo-uploader-abc123.vercel.app)
 *   EMAIL - User email for login
 *   PASSWORD - User password
 *   REGION - (Optional) Active region for admin users (e.g., R1, R2, S1, S2)
 * 
 * Example:
 *   BASE_URL=https://photo-uploader-abc.vercel.app \
 *   EMAIL=admin@example.com \
 *   PASSWORD=admin123 \
 *   REGION=R1 \
 *   npm run smoke-preview
 */

interface TestResult {
  step: string;
  success: boolean;
  status?: number;
  body?: any;
  error?: string;
}

class SmokeTest {
  private baseUrl: string;
  private email: string;
  private password: string;
  private region?: string;
  private cookies: string[] = [];
  private results: TestResult[] = [];

  constructor(baseUrl: string, email: string, password: string, region?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.email = email;
    this.password = password;
    this.region = region;
  }

  private log(message: string, data?: any) {
    console.log(`[SMOKE] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  private async makeRequest(
    method: string,
    path: string,
    body?: any,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; body: any; headers: Headers }> {
    const url = `${this.baseUrl}${path}`;
    
    const fetchHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    // Add cookies if we have them
    if (this.cookies.length > 0) {
      fetchHeaders['Cookie'] = this.cookies.join('; ');
    }

    this.log(`${method} ${url}`);

    const response = await fetch(url, {
      method,
      headers: fetchHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Extract cookies from response
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      // Parse and store cookies
      const newCookies = setCookie.split(',').map(c => c.trim().split(';')[0]);
      this.cookies.push(...newCookies);
    }

    let responseBody: any;
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    return {
      status: response.status,
      body: responseBody,
      headers: response.headers,
    };
  }

  private addResult(result: TestResult) {
    this.results.push(result);
    
    const status = result.success ? '✅' : '❌';
    this.log(`${status} ${result.step}`);
    
    if (result.status) {
      this.log(`   Status: ${result.status}`);
    }
    
    if (result.body) {
      this.log(`   Body:`, result.body);
    }
    
    if (result.error) {
      this.log(`   Error: ${result.error}`);
    }
    
    console.log(''); // Blank line for readability
  }

  async runLogin(): Promise<boolean> {
    try {
      this.log('Step 1: POST /api/auth/login');
      
      const { status, body } = await this.makeRequest('POST', '/api/auth/login', {
        email: this.email,
        password: this.password,
      });

      const success = status === 200 && this.cookies.length > 0;

      this.addResult({
        step: 'POST /api/auth/login',
        success,
        status,
        body,
        error: success ? undefined : 'Login failed or no cookie received',
      });

      return success;
    } catch (error) {
      this.addResult({
        step: 'POST /api/auth/login',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async runCreateCar(): Promise<string | null> {
    try {
      this.log('Step 2: POST /api/cars');
      
      // Generate test VIN (17 characters)
      const timestamp = Date.now().toString().slice(-8);
      const testVin = `TEST${timestamp}123456`.substring(0, 17);
      
      const carData: any = {
        make: 'Toyota',
        model: 'Camry',
        vin: testVin,
      };

      // Add region if provided (for admin users)
      if (this.region) {
        carData.region = this.region;
      }

      const { status, body } = await this.makeRequest('POST', '/api/cars', carData);

      const success = (status === 200 || status === 201) && body?.ok === true;
      const createdVin = body?.car?.vin || null;

      this.addResult({
        step: 'POST /api/cars',
        success,
        status,
        body,
        error: success ? undefined : 'Car creation failed',
      });

      return success ? createdVin : null;
    } catch (error) {
      this.addResult({
        step: 'POST /api/cars',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async runGetCarByVin(vin: string): Promise<boolean> {
    try {
      this.log(`Step 3: GET /api/cars/vin/${vin}`);
      
      const { status, body } = await this.makeRequest('GET', `/api/cars/vin/${vin}`);

      const success = status === 200 && body?.ok === true && body?.car?.vin === vin;

      this.addResult({
        step: `GET /api/cars/vin/${vin}`,
        success,
        status,
        body,
        error: success ? undefined : 'Failed to retrieve car by VIN',
      });

      return success;
    } catch (error) {
      this.addResult({
        step: `GET /api/cars/vin/${vin}`,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async run(): Promise<boolean> {
    console.log('='.repeat(80));
    console.log('SMOKE TEST - Preview Environment');
    console.log('='.repeat(80));
    console.log(`Base URL: ${this.baseUrl}`);
    console.log(`Email: ${this.email}`);
    console.log(`Region: ${this.region || '(not specified)'}`);
    console.log('='.repeat(80));
    console.log('');

    // Step 1: Login
    const loginSuccess = await this.runLogin();
    if (!loginSuccess) {
      this.log('❌ Login failed, aborting remaining tests');
      this.printSummary();
      return false;
    }

    // Step 2: Create Car
    const createdVin = await this.runCreateCar();
    if (!createdVin) {
      this.log('❌ Car creation failed, aborting GET test');
      this.printSummary();
      return false;
    }

    // Step 3: Get Car by VIN
    await this.runGetCarByVin(createdVin);

    // Print summary
    this.printSummary();

    // Return overall success
    return this.results.every(r => r.success);
  }

  printSummary() {
    console.log('='.repeat(80));
    console.log('SMOKE TEST SUMMARY');
    console.log('='.repeat(80));
    
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const total = this.results.length;

    console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
    console.log('');

    this.results.forEach(result => {
      const icon = result.success ? '✅' : '❌';
      console.log(`${icon} ${result.step} - Status: ${result.status || 'N/A'}`);
    });

    console.log('='.repeat(80));
  }
}

// Main execution
async function main() {
  const baseUrl = process.env.BASE_URL;
  const email = process.env.EMAIL;
  const password = process.env.PASSWORD;
  const region = process.env.REGION;

  if (!baseUrl) {
    console.error('❌ Error: BASE_URL environment variable is required');
    console.error('Example: BASE_URL=https://photo-uploader-abc.vercel.app npm run smoke-preview');
    process.exit(1);
  }

  if (!email) {
    console.error('❌ Error: EMAIL environment variable is required');
    process.exit(1);
  }

  if (!password) {
    console.error('❌ Error: PASSWORD environment variable is required');
    process.exit(1);
  }

  const smokeTest = new SmokeTest(baseUrl, email, password, region);
  const success = await smokeTest.run();

  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
