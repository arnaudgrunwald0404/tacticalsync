# Action Items Activity Period Implementation

## Overview
Completed action items now only display in meeting periods when they were actually active (from creation date to completion date), rather than showing in all future meetings.

## Implementation Details

### 1. Database Changes ✅

**Migration File:** `supabase/migrations/20250111000000_add_completed_at_to_action_items.sql`

**Changes:**
- Added `completed_at` TIMESTAMPTZ column to `meeting_series_action_items` table
- Created index on `completed_at` for efficient filtering
- Added database trigger to automatically set/clear `completed_at` when completion_status changes
- Backfilled existing completed items with `updated_at` as estimate

**To Apply Migration:**
```bash
# If using Supabase CLI
supabase db push

# Or apply directly in Supabase Dashboard
# SQL Editor → Run the migration file
```

### 2. TypeScript Type Updates ✅

**File:** `src/types/action-items.ts`

Added `completed_at` field to `ActionItem` interface:
```typescript
completed_at?: string | null; // Timestamp when marked as completed
```

### 3. Filtering Logic ✅

**File:** `src/pages/TeamMeeting.tsx`

**Added `filteredActionItems` useMemo:**
```typescript
const filteredActionItems = useMemo(() => {
  if (!meeting || !recurringMeeting) return actionItems;
  
  const meetingStart = // calculate from meeting.start_date
  const meetingEnd = getMeetingEndDate(recurringMeeting.frequency, meetingStart);
  
  return actionItems.filter(item => {
    const createdAt = new Date(item.created_at);
    
    // Must be created before or during this period
    if (createdAt > meetingEnd) return false;
    
    // If not completed, always show
    if (!item.completed_at) return true;
    
    // If completed, only show if completed during or after meeting start
    const completedAt = new Date(item.completed_at);
    return completedAt >= meetingStart;
  });
}, [actionItems, meeting, recurringMeeting]);
```

**Updated component to use filtered items:**
```typescript
<ActionItems
  items={filteredActionItems}  // Changed from actionItems
  ...
/>
```

## How It Works

### Display Logic

**Action Item Display Rules:**
1. **Not Completed**: Shows in current and all future meetings
2. **Completed**: Shows only in meetings during its "activity period"

**Activity Period Definition:**
- **Start**: `created_at` date
- **End**: `completed_at` date (or "now" if not completed)

### Examples

**Example 1: Week 1 → Week 2 Completion**
- Created: Week 1 (Jan 1)
- Completed: Week 2 (Jan 8)
- **Displays in:** Week 1, Week 2
- **Hidden in:** Week 3, Week 4, etc.

**Example 2: Still Active**
- Created: Week 1 (Jan 1)
- Completed: Never (still active)
- **Displays in:** Week 1, Week 2, Week 3, etc. (all meetings)

**Example 3: Same Week Completion**
- Created: Week 1 (Jan 1)
- Completed: Week 1 (Jan 3)
- **Displays in:** Week 1 only
- **Hidden in:** Week 2, Week 3, etc.

## Database Trigger Behavior

The trigger automatically manages `completed_at`:

**When marking as completed:**
```sql
-- User toggles checkbox to "completed"
-- Trigger sets: completed_at = NOW()
```

**When unmarking (reopening):**
```sql
-- User toggles checkbox to "not completed"  
-- Trigger sets: completed_at = NULL
```

This ensures:
- Completion timestamp is always accurate
- No manual timestamp management needed in application code
- Reopened items become "active" again and show in future meetings

## Benefits

### 1. **Cleaner Meeting Views**
- Past meetings show only items that were active then
- Future meetings aren't cluttered with old completed items

### 2. **Historical Accuracy**
- Each meeting shows accurate snapshot of what was being tracked
- Easy to review "what were we working on during Q1 2024?"

### 3. **Reduced Cognitive Load**
- Team sees only relevant items for current period
- No need to mentally filter out old completed tasks

### 4. **Performance**
- Fewer items rendered in recent meetings
- Filtering happens client-side after initial fetch (fast)

## Testing Checklist

### Manual Testing

- [ ] Create new action item in current week meeting
- [ ] Verify it shows in current week
- [ ] Navigate to previous week - should NOT show
- [ ] Navigate to next week - should show (not completed yet)
- [ ] Mark item as completed
- [ ] Verify it still shows in current week
- [ ] Navigate to next week - should NOT show
- [ ] Navigate back to week it was created - should show
- [ ] Unmark (reopen) the item
- [ ] Navigate to future weeks - should show again (active)

### Database Testing

- [ ] Apply migration successfully
- [ ] Verify `completed_at` column exists
- [ ] Verify trigger `action_item_completion_timestamp` exists
- [ ] Test trigger: Update status to 'completed' → `completed_at` auto-set
- [ ] Test trigger: Update status to 'not_completed' → `completed_at` cleared

### Edge Cases

- [ ] Items created in future (shouldn't show in current meeting)
- [ ] Items with no `created_at` (shouldn't crash)
- [ ] Meetings with no action items (empty state)
- [ ] Switching between meetings (filter updates correctly)

## Migration Instructions

### Step 1: Apply Database Migration

**Option A: Supabase CLI**
```bash
cd /Users/arnaudgrunwald/AGcodework/team-tactical-sync
supabase db push
```

**Option B: Supabase Dashboard**
1. Go to SQL Editor in Supabase Dashboard
2. Paste contents of `supabase/migrations/20250111000000_add_completed_at_to_action_items.sql`
3. Click "Run"

### Step 2: Verify Migration

Run this query in SQL Editor:
```sql
-- Check if column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'meeting_series_action_items' 
AND column_name = 'completed_at';

-- Check if trigger exists
SELECT trigger_name 
FROM information_schema.triggers 
WHERE trigger_name = 'action_item_completion_timestamp';

-- Check backfilled data
SELECT COUNT(*) as completed_items_with_timestamp
FROM meeting_series_action_items
WHERE completion_status = 'completed' AND completed_at IS NOT NULL;
```

### Step 3: Test in Application

1. Load any meeting page
2. Check browser console - should see no errors
3. Create/complete action items - verify filtering works
4. Navigate between meeting periods - verify items appear/disappear correctly

## Troubleshooting

### Issue: Migration Fails

**Error: Column already exists**
```sql
-- Check if already applied
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'meeting_series_action_items' AND column_name = 'completed_at';
```

If exists, migration was already applied. Skip to Step 2.

### Issue: Items Not Filtering

**Check 1: Verify data**
```sql
SELECT id, title, created_at, completed_at, completion_status 
FROM meeting_series_action_items 
LIMIT 10;
```

**Check 2: Browser console errors**
Open DevTools → Console, look for JavaScript errors

**Check 3: Meeting period dates**
Add console.log in filter function to debug date calculations

### Issue: Trigger Not Working

**Verify trigger exists:**
```sql
SELECT * FROM information_schema.triggers 
WHERE trigger_name = 'action_item_completion_timestamp';
```

**Test trigger manually:**
```sql
-- Create test item
INSERT INTO meeting_series_action_items (series_id, title, completion_status, order_index, created_by)
VALUES ('test-series', 'Test Item', 'not_completed', 0, 'test-user-id')
RETURNING *;

-- Mark as completed (should set completed_at automatically)
UPDATE meeting_series_action_items 
SET completion_status = 'completed' 
WHERE title = 'Test Item'
RETURNING *;

-- Clean up
DELETE FROM meeting_series_action_items WHERE title = 'Test Item';
```

## Future Enhancements

### Potential Improvements

1. **Visual Indicators**
   - Show "Completed on [date]" badge for completed items
   - Gray out completed items vs active items
   - Add "Active from [date] to [date]" tooltip

2. **Filtering Options**
   - Toggle "Show all action items" to see historical ones
   - "Show completed items" checkbox per meeting
   - Filter by date range in settings

3. **Analytics**
   - "Completion rate by week"
   - "Average time to complete"
   - "Items carried over from previous period"

4. **Notifications**
   - Alert when item has been active for >2 weeks
   - Remind about incomplete items from previous periods

