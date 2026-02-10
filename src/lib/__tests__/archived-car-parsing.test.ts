/**
 * Test suite for archived car folder name parsing
 * Tests the parseArchivedCarFolderName function that handles ALL region folders
 */

console.log("\n=== Testing Archived Car Folder Name Parsing ===\n");

// Mock the parsing function (copy of the actual implementation)
function parseArchivedCarFolderName(folderName: string): { region: string; make: string; model: string; vin: string } | null {
  const parts = folderName.trim();
  
  // VIN is always the last 17 characters (alphanumeric)
  const vinMatch = parts.match(/([A-HJ-NPR-Z0-9]{17})$/i);
  if (!vinMatch) {
    return null;
  }
  
  const vin = vinMatch[1];
  
  // Remove VIN and trailing underscore
  const beforeVin = parts.substring(0, parts.length - 17);
  if (!beforeVin.endsWith('_')) {
    return null;
  }
  
  const regionMakeModel = beforeVin.substring(0, beforeVin.length - 1); // Remove trailing underscore
  
  // Split by underscores: REGION_Make_Model...
  const segments = regionMakeModel.split('_');
  if (segments.length < 3) {
    return null; // Need at least region, make, and model
  }
  
  const region = segments[0];
  const make = segments[1];
  // Model can contain underscores, so join remaining segments
  const model = segments.slice(2).join('_');
  
  return { region, make, model, vin };
}

// Test cases
const tests = [
  {
    name: "Standard archived format",
    input: "MSK_Toyota_Camry_1HGBH41JXMN109186",
    expected: { region: "MSK", make: "Toyota", model: "Camry", vin: "1HGBH41JXMN109186" }
  },
  {
    name: "Different region",
    input: "SPB_Ford_Focus_1FAFP34N65W123456",
    expected: { region: "SPB", make: "Ford", model: "Focus", vin: "1FAFP34N65W123456" }
  },
  {
    name: "Model with underscores",
    input: "R1_Mercedes_Benz_G_Class_1234567890ABCDEFG",
    expected: { region: "R1", make: "Mercedes", model: "Benz_G_Class", vin: "1234567890ABCDEFG" }
  },
  {
    name: "Single character region",
    input: "V_BMW_X5_12345678901234567",
    expected: { region: "V", make: "BMW", model: "X5", vin: "12345678901234567" }
  },
  {
    name: "Multi-word model with spaces replaced by underscores",
    input: "K1_Land_Rover_Range_Rover_ABCDEFG1234567890",
    expected: { region: "K1", make: "Land", model: "Rover_Range_Rover", vin: "ABCDEFG1234567890" }
  },
  {
    name: "Invalid: no VIN",
    input: "MSK_Toyota_Camry",
    expected: null
  },
  {
    name: "Invalid: VIN too short",
    input: "MSK_Toyota_Camry_SHORT",
    expected: null
  },
  {
    name: "Invalid: missing make or model",
    input: "MSK_Toyota_1HGBH41JXMN109186",
    expected: null
  },
  {
    name: "Invalid: missing region",
    input: "Toyota_Camry_1HGBH41JXMN109186",
    expected: null
  },
  {
    name: "Invalid: empty string",
    input: "",
    expected: null
  },
  {
    name: "Invalid: no trailing underscore before VIN",
    input: "MSK_Toyota_Camry1HGBH41JXMN109186",
    expected: null
  }
];

let passed = 0;
let failed = 0;

tests.forEach((test) => {
  const result = parseArchivedCarFolderName(test.input);
  const success = JSON.stringify(result) === JSON.stringify(test.expected);
  
  if (success) {
    console.log(`✓ ${test.name}`);
    passed++;
  } else {
    console.log(`✗ ${test.name}`);
    console.log(`  Input: "${test.input}"`);
    console.log(`  Expected: ${JSON.stringify(test.expected)}`);
    console.log(`  Got: ${JSON.stringify(result)}`);
    failed++;
  }
});

console.log(`\n=== Test Results ===`);
console.log(`Passed: ${passed}/${tests.length}`);
console.log(`Failed: ${failed}/${tests.length}`);

if (failed > 0) {
  console.log("\n❌ Some tests failed!");
  process.exit(1);
} else {
  console.log("\n✅ All tests passed!");
  process.exit(0);
}
