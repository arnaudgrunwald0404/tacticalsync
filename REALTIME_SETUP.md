# Real-Time Synchronization Setup Guide

This guide explains how to enable and use real-time synchronization in your Team Tactical Sync app.

## Overview

Real-time synchronization allows multiple team members to see updates instantly when anyone makes changes to:
- **Priorities** - See when team members add, update, or complete priorities (including previous period priorities)
- **Topics** - Real-time discussion updates
- **Action Items** - Track action item changes as they happen
- **Agenda Items** - See agenda updates immediately
- **Presence** - Know who else is viewing the same meeting

## Prerequisites

- Supabase project with database access
- Admin access to your Supabase dashboard or SQL editor

## Setup Instructions

### 1. Enable Realtime on Database Tables

You need to enable Realtime on specific tables in your Supabase database. There are two ways to do this:

#### Option A: Run the Migration (Recommended)

If you're using Supabase CLI:

```bash
supabase migration up
```

This will run the migration file: `supabase/migrations/20251110000000_enable_realtime.sql`

#### Option B: Manual SQL Execution

Go to your Supabase dashboard → SQL Editor and run:

```sql
-- Enable realtime on meeting_instance_priorities
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_instance_priorities;

-- Enable realtime on meeting_instance_topics
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_instance_topics;

-- Enable realtime on meeting_series_action_items
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_series_action_items;

-- Enable realtime on meeting_series_agenda
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_series_agenda;

-- Enable realtime on teams
ALTER PUBLICATION supabase_realtime ADD TABLE teams;

-- Enable realtime on profiles
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- Enable realtime on team_members
ALTER PUBLICATION supabase_realtime ADD TABLE team_members;
```

### 2. Verify Realtime is Enabled

To verify that Realtime is properly enabled, run this query in your SQL Editor:

```sql
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
```

You should see all the tables listed above in the results.

### 3. Check Supabase Realtime Settings

1. Go to your Supabase dashboard
2. Navigate to **Settings** → **API**
3. Under "Realtime" section, ensure:
   - Realtime is enabled
   - The `eventsPerSecond` limit is appropriate (default is 10)
   - Your tables are listed in the authorized tables

## How It Works

### Real-Time Subscriptions

The app automatically subscribes to changes using the `useMeetingRealtime` hook:

```typescript
useMeetingRealtime({
  meetingId: meeting?.id,
  seriesId: currentSeriesId,
  onPriorityChange: handleRealtimeUpdate,
  onTopicChange: handleRealtimeUpdate,
  onActionItemChange: handleRealtimeUpdate,
  onAgendaChange: handleRealtimeUpdate,
  enabled: true,
});
```

### Presence Tracking

The app shows who's currently viewing the same meeting using the `usePresence` hook:

```typescript
const { onlineUsers } = usePresence({
  roomId: `meeting:${meetingId}`,
  userName: currentUserName,
  userEmail: currentUserEmail,
  avatarUrl: currentUserAvatar,
});
```

### Automatic Updates

When any user makes a change:
1. The change is saved to the database
2. Supabase broadcasts the change to all subscribed clients
3. The app automatically refetches the updated data
4. All users see the change within ~100-300ms

## Features

### 1. Real-Time Data Sync
- Instant updates when priorities, topics, or action items change
- Automatic conflict resolution (last-write-wins)
- Reconnection logic handles network interruptions

### 2. Presence Indicators
- See who else is viewing the meeting
- Display user avatars and names
- Green indicator shows active users
- Hover to see user details

### 3. Performance Optimizations
- Debounced updates to reduce server load
- Only refetch changed data, not entire state
- Efficient subscription management with cleanup

## Troubleshooting

### Issue: Real-time updates not working

**Solution:**
1. Check that Realtime is enabled in Supabase dashboard
2. Verify tables are in the `supabase_realtime` publication
3. Check browser console for connection errors
4. Ensure Row Level Security (RLS) policies allow reading

### Issue: "CHANNEL_ERROR" in console

**Solution:**
- Check your Supabase URL and anon key are correct
- Verify your project is not paused
- Check network connectivity

### Issue: Presence not showing other users

**Solution:**
- Ensure both users are on the same meeting page
- Check that user profiles are loaded correctly
- Verify Realtime is enabled on `profiles` table

### Issue: High latency for updates

**Solution:**
- Check `eventsPerSecond` setting in Supabase dashboard
- Consider upgrading your Supabase plan
- Verify your network connection

## Rate Limits

Supabase Realtime has rate limits:
- **Free tier**: 2 million realtime messages per month
- **Pro tier**: 5 million messages per month
- Each change generates 1 message per subscribed client

For a team of 10 people making 100 changes per meeting:
- Messages per meeting: 10 users × 100 changes = 1,000 messages
- Monthly capacity (free): ~2,000 meetings
- Monthly capacity (pro): ~5,000 meetings

## Testing Real-Time

To test real-time functionality:

1. Open the same meeting in two different browser windows/tabs
2. Log in as different users (or use incognito mode)
3. Make changes in one window (add a priority, update a topic)
4. Watch the changes appear instantly in the other window
5. Verify presence indicators show both users

## Architecture

### Hooks
- `useRealtimeSubscription.ts` - Generic hook for subscribing to table changes
- `useMeetingRealtime.ts` - Specialized hook for meeting data
- `usePresence.ts` - Hook for tracking online users

### Components
- `PresenceIndicator.tsx` - Displays online users with avatars

### Database Tables with Realtime
- `meeting_instance_priorities` - Priority items per meeting
- `meeting_instance_topics` - Discussion topics
- `meeting_series_action_items` - Action items
- `meeting_series_agenda` - Agenda items
- `teams` - Team information
- `profiles` - User profiles
- `team_members` - Team memberships

## Security

Real-time updates respect your existing Row Level Security (RLS) policies:
- Users only receive updates for data they have permission to read
- Changes are validated through RLS before being broadcast
- Authentication is required for all subscriptions

## Future Enhancements

Potential improvements:
- **Collaborative cursors** - Show where other users are editing
- **Typing indicators** - "User X is typing..."
- **Change notifications** - Toast messages for important updates
- **Conflict resolution UI** - Visual indicators for simultaneous edits
- **Optimistic updates** - Show changes before server confirmation
- **Edit locking** - Prevent simultaneous edits of the same item

## Support

If you encounter issues:
1. Check the browser console for error messages
2. Review Supabase dashboard logs
3. Verify your RLS policies
4. Test with the Supabase Realtime Inspector

## References

- [Supabase Realtime Documentation](https://supabase.com/docs/guides/realtime)
- [Supabase Realtime Presence](https://supabase.com/docs/guides/realtime/presence)
- [PostgreSQL Publications](https://www.postgresql.org/docs/current/sql-createpublication.html)

