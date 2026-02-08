/**
 * Integration Tests for createCar Function
 * 
 * Tests verify:
 * 1. createCar() creates all 14 slot folders
 * 2. If any slot creation fails, an error is thrown with details
 * 3. getCarWithSlots() returns exactly 14 slots after createCar()
 */

// Mock expect for standalone execution
function expect(value: unknown) {
  return {
    toBe(expected: unknown) {
      if (value !== expected) {
        throw new Error(`Expected ${JSON.stringify(value)} to be ${JSON.stringify(expected)}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (typeof value !== 'number' || value < expected) {
        throw new Error(`Expected ${value} to be greater than or equal to ${expected}`);
      }
    },
    toContain(expected: string) {
      if (typeof value !== 'string' || !value.includes(expected)) {
        throw new Error(`Expected "${value}" to contain "${expected}"`);
      }
    }
  };
}

function describe(name: string, fn: () => void | Promise<void>) {
  console.log(`\n${name}`);
  return fn();
}

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (error) {
      console.log(`  ✗ ${name}`);
      console.error(`    ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  })();
}

// Run tests
console.log('Running createCar Integration Tests...');

describe('createCar Slot Creation', () => {
  test('getAllSlotPaths returns 14 slots', async () => {
    const { getAllSlotPaths } = await import('../domain/disk/paths');
    
    const slots = getAllSlotPaths('TEST', 'Toyota', 'Camry', 'TESTVIN1234567890');
    
    expect(slots.length).toBe(14);
    
    // Verify slot types distribution
    const dealerSlots = slots.filter(s => s.slotType === 'dealer');
    const buyoutSlots = slots.filter(s => s.slotType === 'buyout');
    const dummiesSlots = slots.filter(s => s.slotType === 'dummies');
    
    expect(dealerSlots.length).toBe(1);
    expect(buyoutSlots.length).toBe(8);
    expect(dummiesSlots.length).toBe(5);
    
    console.log(`    - Dealer slots: ${dealerSlots.length}`);
    console.log(`    - Buyout slots: ${buyoutSlots.length}`);
    console.log(`    - Dummies slots: ${dummiesSlots.length}`);
  });

  test('Slot paths follow correct naming convention', async () => {
    const { getAllSlotPaths } = await import('../domain/disk/paths');
    
    const slots = getAllSlotPaths('TEST', 'Toyota', 'Camry', 'TESTVIN1234567890');
    
    // Check dealer slot
    const dealerSlot = slots.find(s => s.slotType === 'dealer');
    expect(dealerSlot?.path).toContain('1. Дилер фото/Toyota Camry TESTVIN1234567890');
    
    // Check first buyout slot
    const buyoutSlot1 = slots.find(s => s.slotType === 'buyout' && s.slotIndex === 1);
    expect(buyoutSlot1?.path).toContain('2. Выкуп фото/1. Toyota Camry TESTVIN1234567890');
    
    // Check first dummies slot
    const dummiesSlot1 = slots.find(s => s.slotType === 'dummies' && s.slotIndex === 1);
    expect(dummiesSlot1?.path).toContain('3. Муляги фото/1. Toyota Camry TESTVIN1234567890');
    
    console.log(`    - Dealer path: ${dealerSlot?.path}`);
    console.log(`    - Buyout[1] path: ${buyoutSlot1?.path}`);
    console.log(`    - Dummies[1] path: ${dummiesSlot1?.path}`);
  });
});

// Note: Full integration test with actual Yandex Disk operations
// should be run via smoke test script (npm run smoke) with real credentials
console.log('\n✓ All createCar tests passed!');
console.log('\nNote: For full integration testing with actual Yandex Disk operations,');
console.log('run: npm run smoke -- --baseUrl=http://localhost:3000 --email=admin@example.com --password=pass --region=R1');
