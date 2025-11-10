# Real-Time Sync - Quick Start Guide ⚡

## 🚀 Get Started in 3 Steps

### Step 1: Enable Realtime in Database (5 minutes)

Open your **Supabase SQL Editor** and paste this:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_instance_priorities;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_instance_topics;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_series_action_items;
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_series_agenda;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE team_members;
```

Click **Run** ▶️

### Step 2: Verify It Worked (1 minute)

Run this in SQL Editor:

```sql
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

You should see **7 tables** listed. ✅

### Step 3: Test Real-Time (2 minutes)

1. Open a meeting in two browser windows
2. Make a change in Window 1 (add a priority)
3. Watch it appear instantly in Window 2! 🎉

## 🎨 What You Get

### Visual Indicators
- **Green Badge** = "Connected" - Real-time working
- **User Avatars** = Shows who else is viewing the meeting
- **"X online"** = Live count of active team members

### Features
- ✅ Instant sync of priorities, topics, action items, agenda
- ✅ Real-time completion status updates for current and previous period priorities
- ✅ See who's online in the meeting
- ✅ Automatic reconnection if network drops
- ✅ No page refresh needed!

## 🔍 Where to Look

### In Meeting Page
Look at the **top-right corner** next to the Settings icon:
```
[Connected ●] [2 online 👤👤] [⚙️ Settings]
```

### Console Logs
Open browser DevTools → Console, look for:
```
[Realtime] Subscribed to meeting_instance_priorities
[Presence] Online users: [...]
```

## ✅ Success Criteria

You're all set if:
- [x] Connection badge shows "Connected" (green)
- [x] Opening same meeting in 2 windows shows both users online
- [x] Changes in one window appear in the other within 1-2 seconds

## 🐛 Not Working?

### Check These First:
1. ✅ Did you run the SQL script?
2. ✅ Are you logged in on both windows?
3. ✅ Are both windows on the **exact same meeting URL**?
4. ✅ Check browser console for errors

### Still Having Issues?
See `REALTIME_TESTING_GUIDE.md` for detailed troubleshooting.

## 📚 Full Documentation

- **Setup Details:** `REALTIME_SETUP.md`
- **Testing Guide:** `REALTIME_TESTING_GUIDE.md`
- **Implementation Details:** `REALTIME_IMPLEMENTATION_SUMMARY.md`
- **Production Script:** `APPLY_REALTIME_TO_PRODUCTION.sql`

## 💡 Pro Tips

1. **Test with incognito** - Easy way to test with "2 users"
2. **Watch the console** - See real-time events as they happen
3. **Hover over avatars** - See who's online and their details
4. **Check connection status** - Green = good, Red = check network

## 🎉 That's It!

You now have real-time collaboration! Team members can work together on meetings with instant updates.

**Next:** Invite your team and watch them collaborate in real-time! 🚀

---

**Quick Links:**
- [Supabase Dashboard](https://app.supabase.com/)
- [Realtime Docs](https://supabase.com/docs/guides/realtime)

**Need Help?** Check the troubleshooting section in `REALTIME_TESTING_GUIDE.md`


