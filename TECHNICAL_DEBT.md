# Technical Debt

This document tracks known technical debt in the codebase.

## 1. Duplicate Car Detail Pages

**Location:** `app/cars/id/` and `app/cars/[vin]/`

**Issue:** 
- Both directories contain nearly identical page.tsx files (491 lines each)
- Both contain identical CSS files (405 lines each)
- Differences are minimal (parameter name and API endpoints)

**Rationale:**
- Legacy ID-based page kept for backward compatibility
- VIN-based page is the canonical implementation
- Full refactoring would require more extensive testing

**Recommendation:**
- Create shared component for car detail logic
- Extract common CSS to `app/cars/shared/carDetail.module.css`
- Refactor when legacy ID-based page is deprecated

**Priority:** Low (functional duplication for compatibility)

---

## 2. Frontend Component Duplication

**Location:** SlotCard component instances in `app/cars/[vin]/page.tsx`

**Issue:**
- SlotCard component instantiated identically in three sections (dealer, buyout, dummies)
- Same props pattern repeated

**Recommendation:**
- Extract slot rendering into helper function
- Reduce code repetition

**Priority:** Low (minor duplication, clear pattern)

---

## Future Considerations

When the legacy ID-based endpoints are deprecated:
1. Remove `app/cars/id/` directory completely
2. Remove ID-based API endpoints from `app/api/cars/[id]/`
3. Simplify documentation to only mention VIN-based endpoints
4. Add migration notices for any remaining users of ID-based APIs

**Estimated Effort:** 2-4 hours
**Target Date:** After VIN-based APIs are fully adopted (3-6 months)
