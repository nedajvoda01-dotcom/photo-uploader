import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, errorResponse, successResponse, ErrorCodes } from "@/lib/apiHelpers";
import { getCarByRegionAndVin, removeCarFromRegionIndex, type Car } from "@/lib/infrastructure/diskStorage/carsRepo";
import { carRoot, getRegionPath } from "@/lib/domain/disk/paths";
import { moveFolder, uploadText, downloadFile } from "@/lib/infrastructure/yandexDisk/client";

/**
 * POST /api/cars/vin/[vin]/restore
 * Restore a car from ALL (archive) region to a target region
 * 
 * Body:
 * - targetRegion: string (required, cannot be ALL)
 * 
 * Requirements:
 * - Admin only
 * - Car must exist in ALL region
 * - Target region must be specified and cannot be ALL
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ vin: string }> }
) {
  // Require admin access
  const authResult = await requireAdmin();
  
  if ('error' in authResult) {
    return authResult.error;
  }
  
  const { session } = authResult;
  const { vin } = await params;
  
  try {
    // Parse request body
    const body = await request.json();
    const { targetRegion } = body;
    
    // Validate targetRegion is provided
    if (!targetRegion) {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        "Необходимо указать целевой регион (targetRegion)",
        400
      );
    }
    
    // Validate targetRegion is not ALL
    if (targetRegion === 'ALL') {
      return errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        "Нельзя восстановить машину в регион ALL. Выберите конкретный регион.",
        400
      );
    }
    
    // Check if car exists in ALL (archive) region
    const carInArchive = await getCarByRegionAndVin('ALL', vin);
    
    if (!carInArchive) {
      return errorResponse(
        ErrorCodes.CAR_NOT_FOUND,
        `Машина с VIN ${vin} не найдена в архиве (регион ALL)`,
        404
      );
    }
    
    // Check if car already exists in target region
    const carInTarget = await getCarByRegionAndVin(targetRegion, vin);
    
    if (carInTarget) {
      return errorResponse(
        ErrorCodes.ALREADY_EXISTS,
        `Машина с VIN ${vin} уже существует в регионе ${targetRegion}`,
        409
      );
    }
    
    console.log(`[Restore] Starting restore of car ${vin} from ALL to ${targetRegion}`);
    
    // Build source and destination paths
    const sourcePath = carRoot('ALL', carInArchive.make, carInArchive.model, vin);
    const destPath = carRoot(targetRegion, carInArchive.make, carInArchive.model, vin);
    
    console.log(`[Restore] Moving folder from ${sourcePath} to ${destPath}`);
    
    // Move car folder from ALL to target region
    const moveResult = await moveFolder(sourcePath, destPath, false);
    
    if (!moveResult.success) {
      console.error(`[Restore] Failed to move folder:`, moveResult.error);
      return errorResponse(
        ErrorCodes.DISK_ERROR,
        `Не удалось переместить машину: ${moveResult.error}`,
        500
      );
    }
    
    console.log(`[Restore] Successfully moved folder to ${destPath}`);
    
    // Update car metadata with new region
    const metadataPath = `${destPath}/_CAR.json`;
    const updatedMetadata = {
      region: targetRegion,
      make: carInArchive.make,
      model: carInArchive.model,
      vin: carInArchive.vin,
      created_at: carInArchive.created_at,
      created_by: carInArchive.created_by,
      restored_at: new Date().toISOString(),
      restored_by: session.email || session.userId?.toString() || null,
    };
    
    const metadataResult = await uploadText(metadataPath, updatedMetadata);
    
    if (!metadataResult.success) {
      console.error(`[Restore] Failed to update metadata:`, metadataResult.error);
      // Non-fatal - car was moved successfully
    }
    
    // Remove car from ALL region index
    console.log(`[Restore] Removing car from ALL region index`);
    await removeCarFromRegionIndex('ALL', vin);
    
    // Add car to target region index
    console.log(`[Restore] Adding car to ${targetRegion} region index`);
    await addCarToTargetRegionIndex(targetRegion, {
      ...carInArchive,
      region: targetRegion,
      disk_root_path: destPath,
    });
    
    console.log(`[Restore] Successfully restored car ${vin} from ALL to ${targetRegion}`);
    
    return successResponse({
      vin,
      region: targetRegion,
      make: carInArchive.make,
      model: carInArchive.model,
    });
  } catch (error) {
    console.error(`[Restore] Error restoring car ${vin}:`, error);
    return errorResponse(
      ErrorCodes.SERVER_ERROR,
      error instanceof Error ? error.message : "Не удалось восстановить машину из архива",
      500
    );
  }
}

/**
 * Helper function to add car to target region index
 * This mimics the internal addCarToRegionIndex from carsRepo
 */
async function addCarToTargetRegionIndex(region: string, car: Car): Promise<void> {
  try {
    const regionPath = getRegionPath(region);
    const regionIndexPath = `${regionPath}/_REGION.json`;
    
    // Read existing index
    const indexResult = await downloadFile(regionIndexPath);
    let cars: Car[] = [];
    
    if (indexResult.success && indexResult.data) {
      try {
        const indexData = JSON.parse(indexResult.data.toString('utf-8'));
        cars = indexData.cars || [];
      } catch {
        // Invalid JSON, start fresh
        cars = [];
      }
    }
    
    // Check if car already exists (by VIN)
    const existingIndex = cars.findIndex(c => c.vin === car.vin);
    if (existingIndex >= 0) {
      // Update existing car
      cars[existingIndex] = car;
    } else {
      // Add new car
      cars.push(car);
    }
    
    // Write updated index
    const indexData = {
      version: 1,
      updated_at: new Date().toISOString(),
      cars: cars,
    };
    
    await uploadText(regionIndexPath, indexData);
    console.log(`[Restore] Updated region index for ${region}`);
  } catch (error) {
    console.error(`[Restore] Error adding car to region index:`, error);
    // Don't throw - this is best-effort caching
  }
}
