# Real-Time Synchronization Testing Guide

This guide walks you through testing the real-time synchronization features of your Team Tactical Sync app.

## Prerequisites

Before testing, ensure:
1. ✅ Realtime is enabled in your Supabase database (run the migration or SQL script)
2. ✅ You have at least 2 test user accounts
3. ✅ You have created a team and meeting
4. ✅ The app is running locally or deployed

## Quick Test Checklist

### 1. Connection Status Test
**Goal:** Verify the real-time connection is working

**Steps:**
1. Log in and navigate to any meeting page
2. Look for the connection status indicator in the top-right (next to the settings icon)
3. Verify it shows "Connected" with a green wifi icon

**Expected Result:**
- ✅ Status shows "Connected" in green
- ✅ Tooltip says "Real-time sync active"

**If Failed:**
- ❌ Check browser console for WebSocket errors
- ❌ Verify Supabase URL and keys are correct
- ❌ Confirm Realtime is enabled in Supabase dashboard

---

### 2. Presence Test
**Goal:** Verify presence tracking shows who's online

**Steps:**
1. Open the meeting page in Browser 1 (logged in as User A)
2. Open the same meeting in Browser 2 or Incognito (logged in as User B)
3. Look for the presence indicator showing "X online" with avatars

**Expected Result:**
- ✅ Browser 1 shows "1 online" with User B's avatar
- ✅ Browser 2 shows "1 online" with User A's avatar
- ✅ Hovering over avatar shows user name and email
- ✅ Green dot appears on avatar indicating online status

**If Failed:**
- ❌ Verify both users are on the exact same meeting page
- ❌ Check that profile data is loaded for both users
- ❌ Confirm `profiles` table has Realtime enabled

---

### 3. Priority Real-Time Sync Test
**Goal:** Verify priorities sync in real-time

**Steps:**
1. In Browser 1: Add a new priority item
2. Watch Browser 2 for the update

**Expected Result:**
- ✅ Priority appears in Browser 2 within 1-2 seconds
- ✅ No page refresh required
- ✅ Console shows "[Realtime] Priority added:" message

**Test Variations:**
- Update existing priority (change title, status, assignee)
- Delete a priority
- Reorder priorities (drag and drop)
- Change completion status for current priorities
- **Mark previous period priority as complete/not complete** - should sync in real-time across all users viewing the meeting

---

### 4. Topic Real-Time Sync Test
**Goal:** Verify topics sync in real-time

**Steps:**
1. In Browser 1: Add a new topic/discussion item
2. Watch Browser 2 for the update

**Expected Result:**
- ✅ Topic appears in Browser 2 within 1-2 seconds
- ✅ All topic details are synced (title, description, assignee)

---

### 5. Action Items Real-Time Sync Test
**Goal:** Verify action items sync in real-time

**Steps:**
1. In Browser 1: Add a new action item
2. Watch Browser 2 for the update

**Expected Result:**
- ✅ Action item appears in Browser 2 within 1-2 seconds
- ✅ All fields sync correctly

**Test Variations:**
- Mark action item as complete
- Update action item details
- Delete action item

---

### 6. Agenda Real-Time Sync Test
**Goal:** Verify agenda items sync in real-time

**Steps:**
1. In Browser 1: Add or edit an agenda item
2. Watch Browser 2 for the update

**Expected Result:**
- ✅ Agenda updates appear in Browser 2 within 1-2 seconds
- ✅ Agenda sidebar updates automatically

---

### 7. Multi-User Concurrent Edit Test
**Goal:** Verify conflict resolution when multiple users edit simultaneously

**Steps:**
1. In Browser 1: Start editing a priority item
2. In Browser 2: Edit the same priority item at the same time
3. Save in Browser 1 first, then Browser 2

**Expected Result:**
- ✅ Last save wins (Browser 2's changes are applied)
- ✅ No errors occur
- ✅ Data remains consistent across both browsers

**Note:** This is "last-write-wins" conflict resolution. More sophisticated conflict resolution can be added later.

---

### 8. Connection Interruption Test
**Goal:** Verify reconnection after network interruption

**Steps:**
1. Open meeting page in Browser 1
2. Open Browser DevTools → Network tab
3. Set "Throttling" to "Offline"
4. Wait 5 seconds
5. Set back to "Online"
6. Make a change in Browser 2

**Expected Result:**
- ✅ Connection status changes to "Offline" (red)
- ✅ After going back online, status returns to "Connected" (green)
- ✅ Changes from Browser 2 appear in Browser 1 after reconnection
- ✅ Console shows "[Realtime] Attempting to reconnect..." messages

---

### 9. Presence Leave Test
**Goal:** Verify presence updates when users leave

**Steps:**
1. Open meeting in Browser 1 and Browser 2
2. Verify both users appear in presence indicator
3. Close Browser 2 or navigate away
4. Watch Browser 1's presence indicator

**Expected Result:**
- ✅ User B's avatar disappears from Browser 1 within 5-10 seconds
- ✅ "X online" count decreases by 1

---

### 10. Performance Test
**Goal:** Verify performance with multiple simultaneous users

**Steps:**
1. Open the same meeting in 5+ browser windows/tabs (or invite real users)
2. Make rapid changes in multiple windows simultaneously

**Expected Result:**
- ✅ All changes propagate to all windows
- ✅ No significant lag or performance degradation
- ✅ No duplicate items appear
- ✅ Order is maintained correctly

---

## Testing with Real Users

For best results, test with actual team members:

1. **Invite 2-3 team members** to join a test meeting
2. **Coordinate via Slack/Teams** to perform actions simultaneously
3. **Have everyone make changes** and verify they see each other's updates
4. **Test presence** by having people join and leave

---

## Monitoring Real-Time Usage

### Check Console Logs
Open browser DevTools → Console and look for:
- `[Realtime] Subscribed to meeting_instance_priorities`
- `[Realtime] Priority added/updated/deleted:`
- `[Presence] Online users:`

### Check Network Activity
Open DevTools → Network tab → WS (WebSocket) filter:
- Look for WebSocket connection to Supabase
- Verify "Status: 101 Switching Protocols"
- Messages should flow when changes occur

### Monitor Supabase Dashboard
1. Go to Supabase Dashboard → Logs → Realtime
2. Watch for connection events
3. Check for any errors

---

## Common Issues and Solutions

### Issue: Changes not syncing
**Solution:**
1. Check connection status indicator
2. Verify Realtime is enabled on the table (run verification SQL)
3. Check browser console for errors
4. Confirm both users are on the exact same meeting URL

### Issue: Presence not showing
**Solution:**
1. Verify both users are authenticated
2. Check that profile data exists for both users
3. Confirm `profiles` table has Realtime enabled
4. Check for RLS policy issues

### Issue: Slow updates (> 5 seconds)
**Solution:**
1. Check network latency in DevTools
2. Verify Supabase region is close to users
3. Check `eventsPerSecond` limit in Supabase settings
4. Consider upgrading Supabase plan

### Issue: Duplicate items appearing
**Solution:**
1. Check that `order_index` is being set correctly
2. Verify no duplicate subscriptions are being created
3. Check for race conditions in insert/update logic

### Issue: Connection keeps dropping
**Solution:**
1. Check internet connection stability
2. Verify Supabase project is not paused
3. Check for firewall/proxy issues blocking WebSockets
4. Try different network (e.g., switch from VPN to direct)

---

## Advanced Testing

### Load Testing
Test with many simultaneous users:
```bash
# Open multiple Chrome instances
for i in {1..10}; do
  open -na "Google Chrome" --args --incognito
done
```

### Stress Testing
Create rapid updates:
1. Write a script to make rapid changes via Supabase client
2. Monitor how the UI handles high-frequency updates
3. Check for memory leaks or performance degradation

### Latency Testing
Measure update latency:
1. Add timestamps to console logs
2. Measure time from save → broadcast → receive → render
3. Aim for < 500ms total latency

---

## Success Criteria

Your real-time implementation is working correctly if:

- ✅ All changes sync within 1-2 seconds
- ✅ Presence accurately shows online users
- ✅ Connection status is accurate
- ✅ Reconnection works after network interruption
- ✅ No duplicate items or data corruption
- ✅ Performance is smooth with 5+ concurrent users
- ✅ No console errors related to Realtime

---

## Next Steps After Testing

Once real-time is working:

1. **Document for your team** how to use the presence feature
2. **Monitor usage** in Supabase dashboard for the first week
3. **Gather feedback** from users about the real-time experience
4. **Consider enhancements** like typing indicators or collaborative cursors

---

## Reporting Issues

If you find bugs:

1. Check browser console for errors
2. Check Supabase dashboard logs
3. Note exact reproduction steps
4. Record network timing (DevTools → Network → WS)
5. Test in different browsers

---

## Useful Commands

### Check Realtime Status (SQL)
```sql
SELECT * FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```

### Test Connection (JavaScript Console)
```javascript
// Test Supabase connection
const { data, error } = await supabase
  .from('profiles')
  .select('id')
  .limit(1);
console.log('Connection test:', error ? 'Failed' : 'Success');
```

### Monitor WebSocket Messages (Browser Console)
```javascript
// Log all WebSocket messages
const ws = performance.getEntriesByType('resource')
  .filter(r => r.name.includes('realtime'));
console.log('WebSocket connections:', ws);
```

---

## Conclusion

Real-time synchronization significantly improves collaboration by ensuring all team members see the same data simultaneously. With proper testing, you can ensure a smooth, reliable experience for your users.

Happy testing! 🚀

