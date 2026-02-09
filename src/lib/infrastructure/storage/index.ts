/**
 * Storage API - The ONLY public interface for storage operations
 * 
 * This module enforces the canonical storage pipeline architecture.
 * All storage operations MUST go through this API.
 * 
 * DO NOT import yandexDisk/client or diskStorage modules directly from application code.
 * This API provides the structural enforcement of the pipeline boundaries.
 * 
 * Architecture Contract:
 * - Single entry point for all storage operations
 * - All writes go through 4-stage pipeline
 * - All reads use JSON-first with auto-reconcile fallback
 * - Reconcile is first-class, idempotent, and auto-triggered
 * - No background work - event-driven only
 */

// Re-export high-level storage operations
export {
  // Read operations (JSON-first, auto-reconcile on missing/dirty)
  listCarsByRegion,
  getCarByRegionAndVin,
  getCarWithSlots,
  loadCarSlotCounts,
  getSlot,
  getSlotStats,
  getCarLinks,
  
  // Write operations (all go through pipeline)
  createCar,
  
  // Types
  type Car,
  type CarWithProgress,
  type Slot,
  type Link,
  type PhotoIndex,
  type PhotoItem,
  type RegionIndex,
} from '../diskStorage/carsRepo';

// Re-export write pipeline (canonical write path)
export {
  executeWritePipeline,
  preflight,
  type PreflightResult,
  type WriteOperationResult,
} from '../diskStorage/writePipeline';

// Re-export reconcile (first-class system component)
export {
  reconcile,
  reconcileSlot,
  reconcileCar,
  reconcileRegion,
  type ReconcileDepth,
  type ReconcileResult,
} from '../diskStorage/reconcile';

// Re-export path utilities (validation/normalization)
export {
  normalizeDiskPath,
  assertDiskPath,
  getRegionPath,
  carRoot,
  slotPath,
  getAllSlotPaths,
  buildDeterministicSlots,
  sanitizePathSegment,
  sanitizeFilename,
  validateSlot,
  getLockMarkerPath,
  type SlotType,
} from '@/lib/domain/disk/paths';

/**
 * INTERNAL MODULES - NOT FOR DIRECT APPLICATION USE
 * 
 * The following modules are internal implementation details:
 * - src/lib/infrastructure/yandexDisk/client.ts - Low-level Yandex.Disk API
 * - src/lib/infrastructure/diskStorage/carsRepo.ts - Repository implementation
 * - src/lib/infrastructure/diskStorage/writePipeline.ts - Pipeline stages
 * - src/lib/infrastructure/diskStorage/reconcile.ts - Reconcile implementation
 * 
 * Application code should NEVER import these directly.
 * Use this storage API module instead.
 * 
 * This structural separation enforces:
 * 1. Single canonical pipeline for writes
 * 2. JSON-first reads with auto-reconcile
 * 3. No bypass paths
 * 4. No background work
 * 5. Event-driven, on-demand only
 */
