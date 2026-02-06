# Step 3 Visual Guide

## UI Changes Overview

This document shows the visual changes implemented in Step 3.

## Slot Card States

### Before Step 3
Slots had only two states:
- **Empty**: Gray dashed border, file picker
- **Locked**: Green border, "Get Link" button

### After Step 3
Slots now have three states with additional features:

#### 1. Empty Slot (Unchanged)
```
┌─────────────────────────────────┐
│ Slot 1               [Empty]    │
│                                 │
│ [Choose Files...]               │
│ 0 file(s) selected              │
│ ┌─────────────────────────────┐ │
│ │       Upload                │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

#### 2. Locked Slot (Enhanced)
```
┌─────────────────────────────────┐
│ Slot 1              [Filled]    │
│                                 │
│ Files: 5                        │
│ Uploaded: 2/6/2026              │
│                                 │
│ ┌─────────────────────────────┐ │
│ │       Get Link              │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │    Download ZIP   [NEW]     │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Admin Only]                    │
│ ┌─────────────────────────────┐ │
│ │   Mark as Used   [NEW]      │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

#### 3. Used Slot (NEW)
```
┌─────────────────────────────────┐
│ Slot 1      [Filled] [Used]     │  ← Yellow badge
│                                 │
│ Files: 5                        │
│ Uploaded: 2/6/2026              │
│                                 │
│ ┌─────────────────────────────┐ │
│ │       Get Link              │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │    Download ZIP             │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Admin Only]                    │
│ ┌─────────────────────────────┐ │
│ │  Mark as Unused  [NEW]      │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
  ↑ Yellow border indicates used
```

## Color Scheme

### Slot States
| State | Border | Background | Badge Color |
|-------|--------|------------|-------------|
| Empty | Gray dashed | Light gray | Gray "Empty" |
| Locked | Green solid | Light green | Green "Filled" |
| Used | **Yellow solid** | **Light yellow** | **Yellow "Used"** |

### Button Colors
| Button | Color | Purpose |
|--------|-------|---------|
| Upload | Green | Upload files to empty slot |
| Get Link | Purple | Open Yandex Disk share link |
| Download ZIP | **Blue** | Download slot photos as ZIP |
| Mark as Used | **Yellow** | Admin marks slot as processed |
| Mark as Unused | **Gray** | Admin unmarks slot |

## Visual Indicators

### Used Slot Indicators
1. **Yellow Border**: `border: 2px solid #fbbf24`
2. **Yellow Background**: `background: #fffbeb`
3. **"Used" Badge**: Yellow chip next to "Filled"
4. **Reduced Opacity**: `opacity: 0.7`

### Admin-Only Elements
- Toggle button only visible to admin users
- Non-admin users see used status but can't change it

## Button Layouts

### Non-Admin User (Locked Slot)
```
┌─────────────────────────────────┐
│ ┌─────────────────────────────┐ │
│ │  Purple - Get Link          │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │  Blue - Download ZIP        │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### Admin User (Locked Slot)
```
┌─────────────────────────────────┐
│ ┌─────────────────────────────┐ │
│ │  Purple - Get Link          │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │  Blue - Download ZIP        │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │  Yellow - Mark as Used      │ │  ← Admin only
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

## User Flows

### Flow 1: Download Slot Photos

```
User clicks "Download ZIP"
         ↓
Button shows "Preparing..."
         ↓
API fetches file list from Yandex Disk
         ↓
System validates:
- Slot is locked
- User has region access
- Files exist
         ↓
Returns file metadata
         ↓
(Future: Browser downloads ZIP)
(Current: Shows file count)
```

### Flow 2: Mark Slot as Used (Admin)

```
Admin clicks "Mark as Used"
         ↓
Confirmation dialog:
"Mark this slot as USED?"
         ↓
Admin confirms
         ↓
API call to backend
         ↓
Database updated:
- is_used = true
- marked_used_at = now
- marked_used_by = admin_id
         ↓
Slot refreshes with:
- Yellow border
- "Used" badge
- "Mark as Unused" button
```

### Flow 3: View Used Slot (Non-Admin)

```
Non-admin user views car detail
         ↓
Used slots display:
- Yellow border and background
- "Used" badge visible
- "Mark as Used/Unused" button NOT shown
         ↓
User can:
- Get share link ✓
- Download ZIP ✓
- Change used status ✗
```

## Responsive Design

### Desktop (>768px)
- Slots in grid: 3-4 per row
- Buttons full width within slot card
- All features visible

### Mobile (<768px)
- Slots in single column
- Buttons stack vertically
- Touch-friendly spacing

## Accessibility

### Screen Reader Support
- Status badges announced: "Filled", "Used"
- Button labels clear: "Download ZIP for Slot 1"
- Confirmation dialogs accessible

### Keyboard Navigation
- Tab through buttons
- Enter to activate
- Escape to cancel dialogs

### Visual Contrast
- Yellow used indicator: WCAG AA compliant
- Button colors meet contrast requirements
- Focus states visible

## CSS Classes Reference

```css
/* Slot states */
.slotEmpty { }
.slotLocked { }
.slotUsed { }  /* NEW */

/* Status badges */
.statusEmpty { }
.statusLocked { }
.statusUsed { }  /* NEW */

/* Buttons */
.uploadButton { }
.shareButton { }
.downloadButton { }  /* NEW */
.toggleUsedButton { }  /* NEW */
.markUsed { }  /* NEW */
.markUnused { }  /* NEW */

/* Layout */
.buttonGroup { }  /* NEW - stacks buttons */
.statusBadges { }  /* NEW - groups status badges */
```

## Animation & Transitions

### Hover Effects
- Buttons: `translateY(-2px)` on hover
- Smooth color transitions: `0.2s`

### Loading States
- "Preparing..." for download
- "Updating..." for marking
- "Loading..." for share link

### State Changes
- Smooth border color transition
- Fade in/out for badges

## Testing Scenarios

### Visual Testing Checklist
- [ ] Empty slot displays correctly
- [ ] Locked slot shows both buttons
- [ ] Used slot shows yellow styling
- [ ] "Used" badge appears
- [ ] Admin sees toggle button
- [ ] Non-admin doesn't see toggle
- [ ] Buttons disabled states work
- [ ] Loading states show correctly
- [ ] Mobile layout looks good
- [ ] Hover effects work
- [ ] Focus states visible

## Implementation Notes

### Role Detection
```typescript
const [userRole, setUserRole] = useState<string>("");
useEffect(() => {
  fetch("/api/me")
    .then(res => res.json())
    .then(data => setUserRole(data.role));
}, []);
```

### Conditional Rendering
```typescript
{isAdmin && (
  <button onClick={handleToggleUsed}>
    {slot.is_used ? "Mark as Unused" : "Mark as Used"}
  </button>
)}
```

### Visual State
```typescript
<div className={`
  ${styles.slotCard}
  ${isLocked ? styles.slotLocked : styles.slotEmpty}
  ${slot.is_used ? styles.slotUsed : ''}
`}>
```

## Summary

Step 3 UI changes provide:
1. **Clear Visual Feedback**: Yellow = Used
2. **Easy Access**: One-click download
3. **Team Coordination**: Visible used status
4. **Admin Control**: Simple toggle button
5. **Clean Integration**: Matches existing design

All changes maintain the existing purple gradient theme while adding new yellow accent for used state.
