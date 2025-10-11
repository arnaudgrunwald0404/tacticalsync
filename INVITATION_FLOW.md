# Team Invitation Flow

## Overview
This document explains how team invitations work in TacticalSync.

## How It Works

### 1. **Sending Invitations**
- Team admins can invite users via email from:
  - Team Settings page (`/team/:teamId/settings`)
  - Team Invite page (`/team/:teamId/invite`)
- When invitations are sent:
  - A record is created in the `invitations` table with status `pending`
  - An email is sent to the recipient using the Resend API via the `send-invitation-email` Edge Function
  - The invitation expires after 7 days

### 2. **Receiving Invitations**
- When a user logs in or refreshes their dashboard:
  - The system checks for pending invitations sent to their email address
  - Invitations are displayed at the top of the Dashboard in a dedicated section
  - Each invitation shows:
    - Team name
    - Who invited them
    - Accept/Decline buttons

### 3. **Real-Time Updates**
- The Dashboard subscribes to changes in the `invitations` table
- When a new invitation is created, it appears instantly without page refresh
- When an invitation is accepted, the teams list updates automatically

### 4. **Accepting Invitations**
When a user clicks "Accept":
1. A new record is created in `team_members` table (user is added to the team)
2. The invitation status is updated to `accepted`
3. A success toast message is shown
4. The teams list refreshes to show the newly joined team
5. The invitation disappears from the pending list

### 5. **Declining Invitations**
When a user clicks "Decline":
1. The invitation status is updated to `declined`
2. A toast message confirms the decline
3. The invitation disappears from the pending list

## Database Structure

### `invitations` Table
```sql
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  status invitation_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);
```

### RLS Policies
- **Users can view invitations sent to them**: Allows users to see invitations sent to their email address
- **Team members can view team invitations**: Allows team members to see all invitations for their team
- **Team admins can manage invitations**: Allows team admins to create, update, and delete invitations
- **Users can accept their invitations**: Allows users to update invitation status to accept/decline

## Files Modified

### Frontend
- `src/pages/Dashboard.tsx`: Added invitation display, accept/decline functionality, and real-time subscriptions
- `src/pages/TeamInvite.tsx`: Sends invitation emails via Edge Function
- `src/pages/MeetingSettings.tsx`: Sends invitation emails via Edge Function

### Database
- `update_invitation_rls_policy.sql`: Updated RLS policy to allow users to view their invitations
- `apply_invitation_rls_to_production.sql`: Production-ready SQL script

### Backend
- `supabase/functions/send-invitation-email/index.ts`: Edge Function that sends branded invitation emails via Resend

## To Apply to Production

Run this SQL in your Supabase dashboard SQL editor:

```sql
-- Copy the contents of apply_invitation_rls_to_production.sql
```

## Testing the Flow

1. **As Team Admin:**
   - Go to Team Settings
   - Invite a user by email
   - Check that invitation email is sent

2. **As Invited User:**
   - Log in with the invited email
   - See the invitation at the top of the Dashboard
   - Click "Accept" to join the team
   - Verify you can now see the team and its meetings

3. **Real-Time Test:**
   - Open Dashboard in one browser tab
   - In another tab/browser, send an invitation to that user's email
   - The invitation should appear instantly without page refresh

