# Fix Duplicate Meeting Instances

## Problem
You're seeing duplicate weeks in the meeting dropdown (e.g., "Week 46 (11/11 - 11/16)" and "Week 46 (11/10 - 11/16)").

## Root Cause
1. The date calculation in `TeamMeetingSetup.tsx` had a bug that mutated the Date object and didn't properly calculate Monday start dates
2. Multiple meeting instances were created for the same week with slightly different start dates

## What Was Fixed

### 1. Code Fix (Already Applied)
✅ Updated `TeamMeetingSetup.tsx` to use proper date utility functions:
- Imported `getMeetingStartDate` and `getISODateString` from `@/lib/dateUtils`
- Replaced manual date arithmetic with proper date utilities
- This prevents future duplicates from being created

### 2. Database Cleanup (Action Required)

You need to run the SQL script to clean up existing duplicates:

#### Steps to Clean Up Duplicates:

1. **Review duplicates** - Run Step 1 in `fix_duplicate_meetings.sql` to see what duplicates exist:
   ```sql
   -- Copy and run the query from STEP 1 in the SQL file
   ```

2. **Preview what will be deleted** - Run Step 2 to see which instances will be removed:
   ```sql
   -- Copy and run the query from STEP 2 in the SQL file
   ```
   - The script keeps the most recent meeting instance per week
   - For weekly meetings, it prefers Monday start dates

3. **Delete duplicates** - Uncomment and run Step 3 to delete duplicates:
   ```sql
   -- Uncomment the DELETE query in STEP 3 and run it
   ```

4. **Verify cleanup** - Run Step 4 to confirm no duplicates remain:
   ```sql
   -- Copy and run the query from STEP 4 in the SQL file
   ```

#### Optional: Prevent Future Duplicates

If you want database-level protection against duplicates, uncomment and run Step 5 to create a trigger that prevents duplicate meeting instances from being created.

## Expected Results

After running the cleanup:
- Only one "Week 46" entry showing "Week 46 (11/10 - 11/16)"
- Only one "Week 45" entry showing "Week 45 (11/4 - 11/9)"
- All future meetings will have correct start dates (Monday for weekly, 1st of month for monthly, etc.)

## How to Run SQL Scripts

You can run these SQL scripts via:
1. **Supabase Dashboard** → Your Project → SQL Editor → New Query
2. **Local psql client** (if you have database credentials)
3. **Supabase CLI**: `supabase db execute -f fix_duplicate_meetings.sql`

## Important Notes

⚠️ **Before deleting duplicates**, make sure to review Step 2 output to ensure the correct meetings are being kept.

✅ The script is designed to keep:
- The meeting instance with Monday start date (for weekly meetings)
- The most recently created instance (if multiple have the same day of week)

🔒 The optional trigger (Step 5) provides database-level protection but may need to be adjusted if you have special use cases.

