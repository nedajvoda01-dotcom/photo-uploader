# Storage Pipeline Architecture

## Overview

This document defines the canonical storage pipeline architecture for the photo uploader system. This is not a feature - it is the **base architectural contract** that all future development must follow.

## Core Principle

**There is ONE and ONLY ONE way to interact with storage.**

This architecture enforces:
- Single canonical pipeline for all operations
- No bypass paths
- No duplicate logic
- Event-driven, on-demand only (no background work)
- Self-healing by design

## Architecture Contract

### 1. Single Entry Point

All application code MUST import from:
```typescript
import { ... } from '@/lib/infrastructure/storage';
```

**NEVER** import directly from:
- ❌ `@/lib/infrastructure/yandexDisk/client` - Internal implementation
- ❌ `@/lib/infrastructure/diskStorage/carsRepo` - Internal implementation
- ❌ `@/lib/infrastructure/diskStorage/writePipeline` - Internal implementation
- ❌ `@/lib/infrastructure/diskStorage/reconcile` - Internal implementation

### 2. The Pipeline

#### Write Operations (4-Stage Pipeline)

All write operations (upload/delete/rename) go through this pipeline:

```
┌─────────────────────────────────────────────────────────────┐
│                     WRITE PIPELINE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Stage A: Preflight                                         │
│  ├─ normalize + assert path                                │
│  ├─ ensureDir(slot)                                         │
│  ├─ read _PHOTOS.json (or reconcile)                       │
│  └─ check limits: count < 40, size ≤ 20MB                  │
│  Result: Reject BEFORE upload URL obtained                 │
│                                                             │
│  Stage B: Commit Data                                       │
│  ├─ get upload URL                                          │
│  ├─ upload bytes                                            │
│  └─ retry on 429/5xx with backoff                          │
│  Result: Files uploaded with rollback on failure           │
│                                                             │
│  Stage C: Commit Index                                      │
│  ├─ acquire _LOCK.json (TTL)                               │
│  ├─ reread _PHOTOS.json (fresh)                            │
│  ├─ merge changes                                           │
│  ├─ atomic write (tmp→rename)                              │
│  ├─ recalculate _SLOT.json                                 │
│  └─ release lock (finally block)                           │
│  Result: Indexes updated atomically                        │
│                                                             │
│  Stage D: Verify                                            │
│  ├─ verify index reflects operation                        │
│  ├─ create _DIRTY.json if mismatch                         │
│  └─ continue (non-blocking)                                │
│  Result: System heals on next read                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**API:**
```typescript
import { executeWritePipeline, preflight } from '@/lib/infrastructure/storage';

// Check limits before upload
const preflightResult = await preflight(slotPath, files, uploadedBy);
if (!preflightResult.success) {
  // Rejected before bandwidth wasted
}

// Execute full pipeline
const result = await executeWritePipeline({
  slotPath,
  files,
  uploadedBy,
  operation: 'upload'
});
```

#### Read Operations (JSON-First)

All read operations use JSON indexes with automatic reconcile fallback:

```
┌─────────────────────────────────────────────────────────────┐
│                      READ PATH                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Check for _DIRTY.json flag                             │
│     └─ if dirty → auto-reconcile → clear flag             │
│                                                             │
│  2. Try read _PHOTOS.json / _REGION.json / _CAR.json       │
│     ├─ Check TTL                                            │
│     ├─ Validate schema                                      │
│     └─ Parse JSON                                           │
│                                                             │
│  3. If missing/invalid/expired                             │
│     └─ auto-reconcile → rebuild from disk                  │
│                                                             │
│  4. Return data                                             │
│     └─ O(1) from cache, O(n) on reconcile                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Performance:**
- Region list: O(1) - single _REGION.json read
- Car open: O(1) - single _CAR.json read + deterministic slots
- Slot stats: O(1) - single _PHOTOS.json read
- No folder scanning (except reconcile)

**API:**
```typescript
import { 
  listCarsByRegion,
  getCarWithSlots,
  getSlotStats 
} from '@/lib/infrastructure/storage';

// Region view - no slot parsing
const cars = await listCarsByRegion(region);

// Car view - deterministic slots, no photo parsing
const { car, slots } = await getCarWithSlots(region, vin);

// Slot view - JSON-first, disk as fallback
const stats = await getSlotStats(slotPath);
```

#### Reconcile (First-Class System Component)

Reconcile is NOT a helper - it's part of the system contract.

```
┌─────────────────────────────────────────────────────────────┐
│                     RECONCILE                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Properties:                                                │
│  ├─ Idempotent (safe to call repeatedly)                   │
│  ├─ Minimal depth rebuild                                   │
│  ├─ Never blocks UI unnecessarily                          │
│  └─ Single source of truth: actual files on disk           │
│                                                             │
│  Auto-triggered on:                                         │
│  ├─ Missing index (_PHOTOS.json, _REGION.json, etc.)       │
│  ├─ Invalid JSON (parse error, schema validation fail)     │
│  ├─ TTL expiration (stale cache)                           │
│  ├─ DIRTY flag (_DIRTY.json exists)                        │
│  └─ Disk API consistency errors                            │
│                                                             │
│  Depths:                                                    │
│  ├─ reconcile(path, 'slot') → rebuild _PHOTOS+_SLOT        │
│  ├─ reconcile(path, 'car') → validate structure + slots    │
│  └─ reconcile(path, 'region') → rebuild _REGION.json       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**API:**
```typescript
import { reconcile } from '@/lib/infrastructure/storage';

// Automatic (triggered by reads)
const stats = await getSlotStats(slotPath);
// → missing _PHOTOS.json → auto-reconcile → return stats

// Manual (admin/debug)
const result = await reconcile(slotPath, 'slot');
```

### 3. Data Model

#### Storage Structure

```
/Фото/{REGION}/
  _REGION.json           # Region car list (TTL: 10 min)
  
  /{CAR}/
    _CAR.json            # Car metadata
    _LINKS.json          # Car links
    
    /1. Dealer photos/
      /{SLOT}/
        _PHOTOS.json     # Photo index (SSOT, TTL: 2 min)
        _SLOT.json       # Quick stats (derived)
        _LOCK.json       # Soft lock (TTL: 5 min)
        _DIRTY.json      # Inconsistency flag
        _PUBLISHED.json  # Published URLs
        photo_*.jpg      # Actual files
```

#### Index Files

**_PHOTOS.json** (Single Source of Truth):
```json
{
  "version": 1,
  "count": 5,
  "limit": 40,
  "updatedAt": "2026-02-09T12:00:00Z",
  "cover": "photo_001.jpg",
  "items": [
    {"name": "photo_001.jpg", "size": 1024000, "modified": "..."}
  ]
}
```

**_REGION.json** (Cache):
```json
{
  "version": 1,
  "updated_at": "2026-02-09T12:00:00Z",
  "cars": [...]
}
```

**_LOCK.json** (Concurrency Control):
```json
{
  "locked_by": "user@example.com",
  "locked_at": "2026-02-09T12:00:00Z",
  "expires_at": "2026-02-09T12:05:00Z",
  "operation": "upload",
  "slot_path": "/Фото/R1/Car/slot"
}
```

**_DIRTY.json** (Consistency Flag):
```json
{
  "marked_at": "2026-02-09T12:00:00Z",
  "reason": "Verify failed: missing files in index",
  "slot_path": "/Фото/R1/Car/slot"
}
```

### 4. TTL and Caching

```
Index Type        | Default TTL | Purpose
------------------|-------------|----------------------------------
_REGION.json      | 10 min      | Stable data, reduce API calls
_PHOTOS.json      | 2 min       | Dynamic data, faster refresh
_SLOT.json        | 2 min       | Derived from _PHOTOS.json

Post-Write Behavior:
- TTL bypassed (skipTTL=true)
- Fresh data used immediately
- No unnecessary reconcile
```

### 5. Concurrency and Atomicity

**Lock Mechanism:**
- Acquire _LOCK.json before index update
- TTL: 5 minutes (prevents deadlock)
- Retry: 5 attempts with 1s delay
- Always released in finally block

**Atomic Writes:**
- Upload to `._PHOTOS.json.tmp`
- Atomic rename to `_PHOTOS.json`
- Network failure → tmp file → original intact

**Parallel Safety:**
```
Time | Upload A        | Upload B
─────────────────────────────────
T0   | Acquire lock ✓  | Try lock ❌ (held)
T1   | Write index     | Waiting (retry)
T2   | Release lock ✓  | -
T3   | Done            | Acquire lock ✓
T4   | -               | Write index
T5   | -               | Release lock ✓

Result: Both files in _PHOTOS.json ✅
```

## Enforcement

### 1. Structural

- Single public API: `src/lib/infrastructure/storage/index.ts`
- Internal modules not exported
- Type system prevents direct imports
- All operations funnel through API

### 2. Operational

- Preflight rejects invalid operations before work
- Pipeline stages are mandatory
- Reconcile auto-triggers on inconsistency
- No manual repair paths

### 3. Testing

- Tests verify single pipeline
- Tests prove no background work
- Tests validate eventual consistency
- Tests check parallel operation safety

## Rules for Future Development

### ✅ DO

- Import from `@/lib/infrastructure/storage`
- Use `executeWritePipeline()` for all writes
- Trust auto-reconcile for consistency
- Add new operations by extending pipeline
- Document pipeline interactions

### ❌ DON'T

- Import from yandexDisk/client directly
- Bypass preflight checks
- Call uploadToYandexDisk directly
- Create alternative write paths
- Add background scanning/polling
- Assume indexes are always present
- Cache without TTL
- Skip path normalization/validation

## System Properties

**Deterministic:**
- Clear 4-stage pipeline
- Predictable state transitions
- No undefined states

**Race-Free:**
- Locks prevent conflicts
- Retry prevents failures
- Merge prevents data loss

**Self-Healing:**
- Missing JSON → reconcile
- Corrupt JSON → reconcile
- Dirty flag → reconcile
- TTL expired → reconcile

**Performant:**
- Region: O(1) with cache
- Car: O(1) deterministic
- Slots: O(n) JSON reads
- No N+1 queries

**Resilient:**
- Network failures → atomic writes
- Concurrent operations → lock retry
- Inconsistent state → auto-heal
- Missing indexes → rebuild

## Verification

### Tests

Run verification tests:
```bash
npx tsx src/lib/__tests__/pipeline-enforcement.test.ts
npx tsx src/lib/__tests__/write-pipeline.test.ts
npx tsx src/lib/__tests__/reconcile.test.ts
```

### Instrumentation

Enable debug logging:
```bash
DEBUG_WRITE_PIPELINE=1
DEBUG_REGION_INDEX=1
DEBUG_CAR_LOADING=1
```

### Metrics

Monitor:
- listFolder calls (should be minimal)
- Cache hit rate (should be high)
- Reconcile triggers (should be rare in steady state)
- Lock conflicts (should be handled gracefully)

## Migration Guide

If you find code that bypasses the pipeline:

1. **Replace direct disk operations:**
   ```typescript
   // ❌ Old way
   import { uploadToYandexDisk } from '@/lib/infrastructure/yandexDisk/client';
   const result = await uploadToYandexDisk({...});
   
   // ✅ New way
   import { executeWritePipeline } from '@/lib/infrastructure/storage';
   const result = await executeWritePipeline({...});
   ```

2. **Use preflight checks:**
   ```typescript
   // ❌ Old way
   await uploadFile(...); // No checks
   
   // ✅ New way
   const preflight = await preflight(slotPath, files, user);
   if (!preflight.success) {
     return error(preflight.error);
   }
   await executeWritePipeline({...});
   ```

3. **Trust auto-reconcile:**
   ```typescript
   // ❌ Old way
   const stats = await listFolder(slotPath); // Expensive
   
   // ✅ New way
   const stats = await getSlotStats(slotPath); // JSON-first, auto-reconcile
   ```

## Summary

This architecture is a complete system replacement, not a feature addition. It:

1. **Declares ONE canonical pipeline** for all operations
2. **Removes all legacy/redundant logic** (no alternative paths)
3. **Enforces pipeline boundaries** structurally (not by convention)
4. **Makes reconcile first-class** (idempotent, auto-triggered)
5. **Proves no background work** (event-driven only)
6. **Provides system-level verification** (tests, docs, logging)
7. **Treats as base architecture** (all future work extends this)

**This is the way the system works. There is no other way.**
