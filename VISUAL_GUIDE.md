# Visual Guide - UI Changes

## Before: No Region Selector (Broken)

```
┌─────────────────────────────────────────────────────────┐
│  My Cars                          [+ New Car] [Logout]  │
│                                                          │
│  ❌ Admin has NO way to select region                   │
│  ❌ API calls fail with region_required error          │
│  ❌ Can't create cars - no region specified            │
└─────────────────────────────────────────────────────────┘
```

## After: Admin Region Selector (Working)

```
┌─────────────────────────────────────────────────────────┐
│  My Cars    [Region: R1 ▼]          [+ New Car] [Logout]│
│                                                          │
│  ✅ Admin sees region dropdown                          │
│  ✅ Can select: R1, R2, R3, K1, V, S1, S2              │
│  ✅ API calls include ?region=R1                        │
│  ✅ Can create cars in selected region                  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Toyota Camry                                      │  │
│  │ VIN: 1HGBH41JXMN109186                           │  │
│  │ Progress: ████████░░░░░░░ 57% Complete           │  │
│  │ Dealer: 1/1  Buyout: 6/8  Dummies: 1/5          │  │
│  │                                         [Open]    │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## User View (Photographer)

```
┌─────────────────────────────────────────────────────────┐
│  My Cars    Region: R1                        [Logout]  │
│                                                          │
│  ✅ User sees fixed region badge (read-only)            │
│  ✅ NO region selector (user can't change region)       │
│  ✅ NO "+ New Car" button (users can't create cars)     │
│  ✅ Can only upload photos to existing cars             │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Toyota Camry                                      │  │
│  │ VIN: 1HGBH41JXMN109186                           │  │
│  │ Progress: ████████░░░░░░░ 57% Complete           │  │
│  │ Dealer: 1/1  Buyout: 6/8  Dummies: 1/5          │  │
│  │                                         [Open]    │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Region Selector Component Details

### Admin Selector (Interactive Dropdown)
```css
┌─────────────────────────────┐
│ Region: [R1 ▼]              │
│         ┌──────────┐        │
│         │ R1   ✓   │        │
│         │ R2       │        │
│         │ R3       │        │
│         │ K1       │        │
│         │ V        │        │
│         │ S1       │        │
│         │ S2       │        │
│         └──────────┘        │
└─────────────────────────────┘
```

Styling:
- Background: rgba(255, 255, 255, 0.15)
- Padding: 0.5rem 1rem
- Border-radius: 8px
- Select: white background, purple text
- Font-weight: 600

### User Badge (Read-only)
```css
┌─────────────────────────────┐
│  Region: R1                 │
└─────────────────────────────┘
```

Styling:
- Background: rgba(255, 255, 255, 0.2)
- Border: 1px solid rgba(255, 255, 255, 0.3)
- Padding: 0.5rem 1rem
- Border-radius: 8px
- Font-weight: 500

## API Flow Changes

### Before (Broken)
```
Admin → /api/cars
        ↓
        ❌ No region specified
        ↓
        500 Error or wrong region
```

### After (Working)
```
Admin → Select Region in UI (R1)
        ↓
        /api/cars?region=R1
        ↓
        ✅ Backend validates region
        ↓
        Returns cars from R1

Admin → Click "+ New Car"
        ↓
        Passes region=R1 in URL
        ↓
        POST /api/cars { make, model, vin, region: "R1" }
        ↓
        ✅ Creates car in R1
```

## User Journey

### Admin Journey
1. Login with admin@example.com
2. See region selector dropdown
3. Select "R1" from dropdown
4. Car list updates to show R1 cars
5. Click "+ New Car"
6. Create car (region R1 auto-included)
7. Car appears in R1 list
8. Can switch to "R2" and repeat

### User Journey
1. Login with r1@photouploader.ru
2. See "Region: R1" badge (no dropdown)
3. See only R1 cars
4. Can upload photos to existing cars
5. Cannot create new cars (no button)
6. Cannot change region (fixed assignment)

## Code Changes Highlight

### Region Selector UI (app/cars/page.tsx)
```typescript
// NEW: Fetch user role
const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
const [activeRegion, setActiveRegion] = useState<string>("");
const [availableRegions, setAvailableRegions] = useState<string[]>([]);

// NEW: Show selector for admin, badge for user
{isAdmin && activeRegion && (
  <div className={styles.regionSelector}>
    <label>Region:</label>
    <select 
      value={activeRegion}
      onChange={(e) => setActiveRegion(e.target.value)}
    >
      {availableRegions.map(region => (
        <option key={region} value={region}>{region}</option>
      ))}
    </select>
  </div>
)}

{!isAdmin && userInfo && (
  <div className={styles.regionBadge}>
    Region: {userInfo.region}
  </div>
)}
```

### API Region Handling (app/api/cars/route.ts)
```typescript
// NEW: Accept region query param
const queryRegion = searchParams.get("region") || undefined;

// NEW: Validate region for admin
const effectiveRegion = getEffectiveRegion(session, queryRegion);

if (!effectiveRegion) {
  return NextResponse.json(
    { error: "region_required" },
    { status: 400 }
  );
}
```

## Database Auto-Initialization

### Before (Broken)
```
Request → /api/cars
          ↓
          Query: SELECT * FROM cars
          ↓
          ❌ ERROR: relation "cars" does not exist
          ↓
          500 Internal Server Error
```

### After (Working)
```
Request → /api/cars
          ↓
          Call: ensureDbSchema()
          ↓
          Check: Schema initialized?
          ├─ Yes → Skip
          └─ No  → CREATE TABLE IF NOT EXISTS...
          ↓
          Query: SELECT * FROM cars
          ↓
          ✅ SUCCESS: {"success":true,"cars":[]}
```

## Email Normalization

### Before (Broken)
```
User types: " R1@PhotoUploader.RU "
            ↓
            Lookup: "R1@PhotoUploader.RU" in map
            ↓
            Config has: "r1@photouploader.ru"
            ↓
            ❌ Mismatch → user_not_found
```

### After (Working)
```
User types: " R1@PhotoUploader.RU "
            ↓
            Normalize: email.trim().toLowerCase()
            ↓
            Result: "r1@photouploader.ru"
            ↓
            Lookup in map: "r1@photouploader.ru"
            ↓
            ✅ Match found → Login successful
```

## Summary

Three critical fixes transform the system from broken to working:

1. **DB Auto-Init** - Schema creates automatically (no manual SQL)
2. **Email Normalization** - Login works regardless of case/whitespace  
3. **Region Selector** - Admin can manage multiple regions via UI

Result: System is now production-ready and fully functional.
