# Product Requirements Document (PRD)
## TacticalSync - Team Meeting Collaboration Platform

**Version:** 1.0  
**Last Updated:** November 10, 2025  
**Status:** Production-Ready  
**Author:** Arnaud Grunwald  

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Product Vision & Goals](#product-vision--goals)
3. [Target Users & Personas](#target-users--personas)
4. [Core Features](#core-features)
5. [User Stories](#user-stories)
6. [Technical Architecture](#technical-architecture)
7. [Security & Compliance](#security--compliance)
8. [Success Metrics](#success-metrics)
9. [Future Roadmap](#future-roadmap)

---

## Executive Summary

**TacticalSync** is a real-time team meeting collaboration platform designed to streamline recurring team meetings (tactical, strategic, and ad-hoc). The platform enables teams to manage structured agendas, track priorities and action items across meeting cycles, and collaborate in real-time with presence awareness.

### Key Value Propositions
- **Structured Meeting Framework**: Pre-built agenda templates and customizable meeting structures
- **Real-Time Collaboration**: Multiple team members can collaborate simultaneously with instant sync
- **Cross-Period Tracking**: Priorities and action items persist across meeting instances
- **Role-Based Access**: Granular permissions for members, admins, and super admins
- **Zero Setup Friction**: Quick team creation, invitation system, and OAuth authentication

### Current State
- ✅ **Production-ready** with 114 automated E2E tests
- ✅ **Real-time sync** via Supabase Realtime
- ✅ **Responsive design** optimized for desktop, tablet, and mobile
- ✅ **Comprehensive security** with Row Level Security (RLS) policies

---

## Product Vision & Goals

### Vision Statement
*"Empower teams to run efficient, structured meetings that drive accountability and measurable outcomes."*

### Strategic Goals
1. **Reduce Meeting Overhead**: Cut meeting prep time by 50% with pre-structured agendas
2. **Increase Accountability**: Track action items and priorities across meeting cycles
3. **Enable Remote Collaboration**: Support distributed teams with real-time sync
4. **Scale Team Efficiency**: Support teams from 2 to 200+ members

### Success Criteria
- Teams run weekly meetings in < 30 minutes (vs. 60+ min industry average)
- 90%+ action item completion rate
- 100% meeting attendance visibility
- < 5 second sync latency for real-time updates

---

## Target Users & Personas

### Primary Persona: Team Leader (Admin)
**Name**: Sarah Martinez  
**Role**: Engineering Manager  
**Age**: 35-45  
**Tech Savvy**: High  

**Goals**:
- Run efficient weekly tactical meetings
- Track team priorities across sprints
- Ensure action items don't fall through cracks
- Maintain meeting structure and consistency

**Pain Points**:
- Meetings go off-topic and run long
- Action items get lost in Slack threads
- Hard to see what's blocking team progress
- No visibility into previous week's outcomes

**How TacticalSync Helps**:
- Structured agenda keeps meetings on track
- Priority tracking shows week-over-week progress
- Action items persist across meetings
- Historical view of previous periods

---

### Secondary Persona: Team Member
**Name**: Alex Johnson  
**Role**: Software Engineer  
**Age**: 25-35  
**Tech Savvy**: High  

**Goals**:
- Know exactly what's expected each week
- Update priorities without interrupting flow
- See team priorities and blockers
- Access meetings on mobile

**Pain Points**:
- Unclear what to prepare for meetings
- Forget to update status before meetings
- Don't know what teammates are working on
- Can't access meeting notes on mobile

**How TacticalSync Helps**:
- Clear priority structure with outcomes/activities
- Real-time updates (no "forgot to update" excuse)
- Transparent visibility into team work
- Fully responsive mobile interface

---

### Tertiary Persona: Super Admin
**Name**: Jordan Kim  
**Role**: VP of Operations  
**Age**: 40-50  
**Tech Savvy**: Medium-High  

**Goals**:
- Roll out meeting structure across organization
- Create standardized meeting templates
- Monitor meeting health across teams
- Maintain consistent practices

**Pain Points**:
- Each team does meetings differently
- No standardization across departments
- Can't see organizational patterns
- Limited oversight capabilities

**How TacticalSync Helps**:
- System-wide agenda templates
- Super admin role for oversight
- Cross-team visibility
- Standardized meeting frameworks

---

## Core Features

### 1. Authentication & User Management

#### 1.1 Multi-Provider Authentication
**Status**: ✅ Complete

**Capabilities**:
- Email/password signup and signin
- Google OAuth integration
- Email verification with magic links
- Password reset flow
- Session management with automatic refresh

**User Experience**:
- Branded login page with gradient design
- Clear navigation between signup/signin
- Visual feedback for all auth states
- Verification email with console output for development

**Technical Implementation**:
- Supabase Auth with PKCE flow
- Automatic profile creation on signup
- Real-time auth state changes
- Hash fragment cleanup after OAuth

---

#### 1.2 Profile Management
**Status**: ✅ Complete

**Capabilities**:
- User profiles with first name, last name, email
- Avatar support (URL or generated avatars)
- Profile completion prompts
- Birthday and insights fields

**User Experience**:
- Profile completion modal on first login
- Fancy avatar generation with colorful designs
- Hover tooltips showing full names

---

### 2. Team Management

#### 2.1 Team Creation & Setup
**Status**: ✅ Complete

**Capabilities**:
- Create teams with full name and abbreviated name
- Automatic team membership for creator
- Creator becomes admin by default
- Team-specific settings and configuration

**User Experience**:
- Clean team creation form with validation
- Auto-generated abbreviated names
- Immediate navigation to team dashboard

**Technical Details**:
- UUID-based team IDs
- Cascade delete protections
- RLS policies for data isolation

---

#### 2.2 Team Invitation System
**Status**: ✅ Complete

**Two Invitation Methods**:

**A. Email Invitations**
- Admin sends email invite to specific address
- Email sent via Resend API (Edge Function)
- Branded invitation emails
- 7-day expiration period
- Real-time notification on dashboard

**B. Invite Links**
- Generate shareable invite codes
- Public links that don't require email
- Same role assignment capabilities
- Instant team joining

**Invitation Workflow**:
1. Admin sends invitation (email or link)
2. Recipient receives invitation
3. Recipient accepts/declines
4. Team membership created on acceptance
5. Real-time dashboard updates

**Technical Implementation**:
- `invitations` table with status tracking
- Real-time Postgres subscriptions
- RLS policies for invitation access
- Edge Function for email sending

---

#### 2.3 Role-Based Access Control
**Status**: ✅ Complete

**Three Role Levels**:

**Member** (Default)
- View all team meetings and content
- Add/edit own priorities, topics, action items
- Participate in real-time collaboration
- View agenda items

**Admin** (Team-Level)
- All member permissions
- Create/edit/delete meeting series
- Edit meeting agendas
- Invite new team members
- Manage team settings
- View all team members' work

**Super Admin** (Platform-Level)
- All admin permissions across ALL teams
- Create system-wide agenda templates
- Override team-level restrictions
- Platform configuration access
- Currently: `agrunwald@clearcompany.com`

**Technical Implementation**:
- `role` column in `team_members` table
- `is_super_admin` column in `profiles` table
- `useRoles()` hook for permission checks
- Comprehensive RLS policies enforcing roles

---

### 3. Meeting Series Management

#### 3.1 Recurring Meeting Series
**Status**: ✅ Complete

**Meeting Frequencies**:
- **Daily**: Meets every weekday
- **Weekly**: Meets once per week (Monday default)
- **Bi-weekly**: Meets every two weeks
- **Monthly**: Meets once per month (1st of month default)

**Meeting Types**:
- **Tactical**: Short-term execution focus (~30 min)
- **Strategic**: Long-term planning (~60-90 min)
- **Ad Hoc**: One-off or irregular meetings

**Meeting Setup Flow**:
1. Admin selects "Create Meeting" from team dashboard
2. Choose frequency and type
3. Auto-generated name (e.g., "Team Weekly Tactical")
4. Customize meeting name (optional)
5. First meeting instance auto-created

**Naming Convention**:
- Format: `[Team Abbreviated Name] [Frequency] [Type]`
- Example: "Eng Weekly Tactical"
- Manual override supported

**Technical Implementation**:
- `meeting_series` table stores recurring definition
- `meeting_instances` table stores individual occurrences
- Automatic instance creation based on frequency
- Start date calculation using date utilities

---

#### 3.2 Meeting Instances
**Status**: ✅ Complete

**Instance Management**:
- Automatic creation for current period
- Navigate between past/future instances
- Each instance has unique start date
- Data isolated per instance (priorities, topics)

**Period Labels**:
- **Daily**: "Monday, Nov 10, 2025"
- **Weekly**: "Week 45, 2025" (ISO week numbers)
- **Bi-weekly**: "Nov 4-17, 2025"
- **Monthly**: "November 2025"

**Navigation**:
- Dropdown selector for all instances
- "Previous Period" and "Next Period" buttons
- Visual indicator for current vs. past meetings

**Data Persistence**:
- Agenda items persist across ALL instances (series-level)
- Priorities are instance-specific (don't carry over)
- Topics are instance-specific
- Action items persist across ALL instances (series-level)

---

### 4. Meeting Agenda System

#### 4.1 Standing Agenda Items
**Status**: ✅ Complete

**Characteristics**:
- Defined at series level (same for all instances)
- Ordered list with drag-and-drop reordering
- Each item has:
  - Title (required)
  - Assigned to (optional - team member)
  - Duration in minutes (optional)
  - Notes field (rich text per instance)
  - Completion checkbox (per instance)
  - Order index

**User Experience**:
- Sidebar display with collapsible cards
- Hover edit button for admins
- Inline editing mode
- Checkbox for completion tracking
- Notes expand/collapse per item
- Real-time autosave (2-second debounce)

**Technical Features**:
- Drag-and-drop reordering (@hello-pangea/dnd)
- Rich text editor for notes (TipTap)
- Smart name formatting (firstname only, full names when needed)
- HTML-to-plain-text conversion
- Temporary IDs for optimistic UI updates

---

#### 4.2 Agenda Templates
**Status**: ✅ Complete

**Two Template Types**:

**System Templates** (Super Admin Only):
- Pre-built by platform admin
- Available to all users
- Cannot be edited by regular users
- Example: "Beem Weekly Meeting" template with:
  - Opening Comments (2 min)
  - Past Action Items (4 min)
  - Calendar Review (2 min)
  - Priority Review + Setting (10 min)
  - Team Scorecard (10 min)
  - Employees At-Risk (10 min)

**User Templates**:
- Created by individual users
- Private to creator
- Fully editable
- Shareable via adoption

**Template Adoption**:
- One-click adoption from template
- Copies all items to meeting series
- Preserves item order and durations
- User can edit after adoption

**Template Management**:
- Create/edit/delete own templates
- Add/remove template items
- Reorder items with drag-and-drop
- Set durations for each item

**Technical Implementation**:
- `agenda_templates` table
- `agenda_template_items` table
- `is_system` flag for system templates
- RLS policies for template access

---

### 5. Meeting Content Management

#### 5.1 Priorities System
**Status**: ✅ Complete

**Purpose**: Track team members' key focus areas for the meeting period

**Data Structure**:
- **Title**: What are you working on?
- **Outcome**: What's the measurable result?
- **Activities**: Specific tasks/actions
- **Assigned To**: Team member (required)
- **Status**: `pending`, `in_progress`, `completed`, `at_risk`
- **Instance-Specific**: Each meeting period has fresh priorities

**User Experience**:
- Grid/card layout per team member
- Collapsible sections by user
- "Add Priority" button per user
- Inline editing
- Status badges with color coding
- Filter: "Show Mine Only" toggle
- "Previous Period" view for reference

**Workflow**:
1. Before meeting: Team members add 2-4 priorities
2. During meeting: Review and update statuses
3. After meeting: Mark completed items
4. Next meeting: Start fresh (previous visible for reference)

**Real-Time Features**:
- Live updates when team members add priorities
- Presence indicators show who's editing
- Automatic conflict resolution
- Optimistic UI updates

**Technical Details**:
- `meeting_instance_priorities` table
- Foreign key to specific meeting instance
- Real-time Postgres subscriptions
- Cascade delete on instance deletion

---

#### 5.2 Topics System
**Status**: ✅ Complete

**Purpose**: Agenda items for discussion that arise during the week

**Data Structure**:
- **Title**: Topic name/question
- **Notes**: Discussion notes (rich text)
- **Assigned To**: Person raising the topic
- **Time Minutes**: Estimated discussion time
- **Order Index**: Display order

**User Experience**:
- List view with cards
- "Add Topic" button
- Drag-and-drop reordering
- Expand/collapse notes
- Delete topics
- Timer suggestions

**Workflow**:
1. During week: Team adds topics as they arise
2. Before meeting: Review and prioritize topics
3. During meeting: Discuss and take notes
4. After meeting: Topics don't carry to next period

**Real-Time Features**:
- Instant sync when topics added
- Live reordering visible to all
- Concurrent editing support

**Technical Details**:
- `meeting_instance_topics` table
- Instance-specific (don't persist)
- RLS policies for team member access

---

#### 5.3 Action Items System
**Status**: ✅ Complete

**Purpose**: Track tasks and commitments across meeting periods

**Data Structure**:
- **Title**: Action item description
- **Notes**: Additional context
- **Assigned To**: Responsible team member
- **Due Date**: Optional deadline
- **Status**: `pending`, `in_progress`, `completed`, `cancelled`
- **Series-Level**: Persists across all meeting instances

**User Experience**:
- Grouped by status
- Color-coded status badges
- Due date indicators
- "Add Action Item" button
- Quick status updates
- Filter by assignee
- Overdue highlighting

**Workflow**:
1. During meeting: Capture action items
2. Between meetings: Team members update progress
3. Next meeting: Review pending items first
4. Mark completed or roll forward

**Status Definitions**:
- **Pending**: Not started yet
- **In Progress**: Currently being worked on
- **Completed**: Done (archived automatically)
- **Cancelled**: No longer needed

**Real-Time Features**:
- Live status updates
- Presence on action items being edited
- Automatic completion notifications

**Technical Details**:
- `meeting_series_action_items` table
- Linked to series (not instance)
- Visible across ALL meeting instances
- Completion tracking per item

---

### 6. Real-Time Collaboration

#### 6.1 Live Data Synchronization
**Status**: ✅ Complete

**Synchronized Entities**:
- ✅ Priorities (add, update, delete, status change)
- ✅ Topics (add, update, delete, reorder)
- ✅ Action Items (add, update, delete, status change)
- ✅ Agenda Items (add, update, delete, reorder, notes)

**Synchronization Behavior**:
- **Latency**: < 1 second typical
- **Conflict Resolution**: Last-write-wins
- **Optimistic Updates**: Immediate local update, sync in background
- **Automatic Refetch**: Full refresh on detected changes

**Technical Implementation**:
- Supabase Realtime with Postgres subscriptions
- Custom hooks: `useMeetingRealtime()`, `useRealtimeSubscription()`
- Subscribe on component mount, unsubscribe on unmount
- Debounced updates to prevent excessive rerendering

---

#### 6.2 Presence Awareness
**Status**: ✅ Complete

**Features**:
- Shows who's currently viewing the meeting
- Real-time join/leave notifications
- User avatars with online indicators
- Hover tooltips with names and emails
- Live user count

**Visual Indicators**:
- Green dot = online
- User avatars displayed horizontally
- Tooltip shows: Name, Email, Online status
- Fades in/out as users join/leave

**Technical Implementation**:
- `usePresence()` hook
- Presence channel per meeting room
- Heartbeat mechanism for connectivity
- Automatic cleanup on browser close

---

#### 6.3 Connection Status
**Status**: ✅ Complete

**Status Indicators**:
- 🟢 **Connected**: Real-time sync active
- 🟡 **Connecting**: Attempting connection
- 🔴 **Disconnected**: No real-time sync

**User Experience**:
- Visual indicator in header
- Tooltip with connection details
- Auto-reconnect on network recovery
- No data loss during disconnections

**Technical Implementation**:
- WebSocket connection monitoring
- Automatic reconnection with exponential backoff
- Local state preservation during offline periods
- Sync on reconnection

---

### 7. User Interface & Experience

#### 7.1 Design System
**Status**: ✅ Complete

**Component Library**: shadcn/ui (Radix UI primitives)

**Typography**:
- Atkinson Hyperlegible (headings) - accessibility-focused
- Public Sans (body text) - clean, modern

**Color Palette**:
- Primary: Blue (#2563EB)
- Secondary: Pink (#EC4899)
- Accent: Gradient (blue to pink)
- Neutral: Gray scale
- Success: Green
- Warning: Yellow/Orange
- Error: Red

**Components**:
- 22+ reusable UI components
- Buttons, Cards, Inputs, Selects, Dialogs
- Toast notifications (Sonner)
- Tooltips and popovers
- Animated transitions (Framer Motion)
- Drag-and-drop interfaces
- Rich text editor (TipTap)

---

#### 7.2 Responsive Design
**Status**: ✅ Complete

**Breakpoints**:
- **Mobile**: < 640px (sm)
- **Tablet**: 640px - 1024px (md)
- **Desktop**: > 1024px (lg)

**Responsive Features**:
- Flexible grid layouts
- Collapsible sidebars
- Touch-friendly targets (min 44x44px)
- Optimized font sizes per breakpoint
- Adaptive navigation
- Mobile-optimized forms

**Mobile Optimizations**:
- Bottom navigation for key actions
- Swipe gestures for navigation
- Simplified views on small screens
- Full-screen modals
- Sticky headers

---

#### 7.3 Accessibility
**Status**: ✅ Complete

**WCAG 2.1 AA Compliance**:
- ✅ Keyboard navigation
- ✅ ARIA labels and roles
- ✅ Focus indicators
- ✅ Color contrast ratios
- ✅ Screen reader support
- ✅ Skip navigation links

**Specific Features**:
- Semantic HTML (nav, main, section, article)
- Descriptive alt text for icons
- Form labels and error messages
- Focus trapping in modals
- Keyboard shortcuts (Cmd+S, Cmd+E)
- High-contrast mode compatible

**Typography for Low Vision**:
- Atkinson Hyperlegible font designed for readability
- Enhanced character distinction
- Clear letter spacing

---

#### 7.4 Visual Feedback
**Status**: ✅ Complete

**Loading States**:
- Skeleton loaders for content
- Spinner for async actions
- Progress indicators for multi-step flows

**Success Feedback**:
- Toast notifications for actions
- Green checkmarks
- Success messages

**Error Handling**:
- Inline validation errors
- Toast error messages
- Error boundaries for crashes
- Fallback UI

**Micro-interactions**:
- Button hover states
- Card shadows on hover
- Smooth transitions
- Animated entry/exit
- Ripple effects

---

### 8. Navigation & Information Architecture

#### 8.1 Page Structure
**Status**: ✅ Complete

**Public Pages**:
- `/` - Landing page
- `/auth` - Login/signup
- `/reset-password` - Password reset

**Authenticated Pages**:
- `/dashboard` - User's teams and meetings
- `/profile` - User profile settings
- `/settings` - Application settings

**Team Pages**:
- `/team/:teamId/invite` - Invite members
- `/team/:teamId/meeting/new` - Create meeting series

**Meeting Pages**:
- `/team/:teamId/meeting/:meetingId` - Meeting view (main app)
- `/team/:teamId/meeting/:meetingId/settings` - Meeting settings

**Invitation Pages**:
- `/join/:inviteCode` - Accept invite via link

**Error Pages**:
- `/404` - Not found

---

#### 8.2 Navigation Patterns
**Status**: ✅ Complete

**Top Navigation**:
- Logo (home link)
- User menu (profile, settings, logout)
- Connection status indicator
- Presence indicators

**Context Navigation**:
- Breadcrumbs for deep pages
- Back buttons for linear flows
- Meeting instance selector
- Period navigation (previous/next)

**Sidebar Navigation** (Meeting Page):
- Agenda section
- Priorities section
- Topics section
- Action Items section
- Collapsible sections

---

### 9. Data Management

#### 9.1 Database Schema
**Status**: ✅ Complete

**Core Tables**:

**Users & Profiles**:
- `auth.users` (Supabase managed)
- `profiles` (extended user data)

**Teams**:
- `teams` (team definitions)
- `team_members` (membership + roles)
- `invitations` (pending invites)

**Meetings**:
- `meeting_series` (recurring meeting definitions)
- `meeting_instances` (individual occurrences)
- `meeting_series_agenda` (standing agenda items)
- `meeting_instance_priorities` (per-instance priorities)
- `meeting_instance_topics` (per-instance topics)
- `meeting_series_action_items` (cross-instance action items)

**Templates**:
- `agenda_templates` (template definitions)
- `agenda_template_items` (template items)

**Relationships**:
- Cascading deletes for data integrity
- Foreign key constraints
- Indexed for query performance

---

#### 9.2 Row Level Security (RLS)
**Status**: ✅ Complete

**Security Model**: Zero Trust - All queries filtered by RLS policies

**Policy Examples**:

**Teams**:
- Users can view teams they're members of
- Admins can edit their teams
- Super admins can view/edit all teams

**Meetings**:
- Team members can view team meetings
- Admins can create/edit meeting series
- Super admins have full access

**Content** (Priorities, Topics, Action Items):
- Team members can view team content
- Users can edit their own content
- Admins can edit all team content

**Profiles**:
- Users can view teammates' profiles
- Users can only edit own profile
- Public profile data visible to team members

**Technical Implementation**:
- 50+ RLS policies across all tables
- Policy functions for reusable logic
- Super admin bypass policies
- Invitation-based access grants

---

#### 9.3 Data Migrations
**Status**: ✅ Complete

**Migration Strategy**:
- Versioned SQL migrations (68 files)
- Forward-only migrations
- Idempotent scripts (safe to re-run)
- Comprehensive rollback procedures

**Migration Categories**:
- Schema creation
- Type safety additions
- Foreign key constraints
- Indexes for performance
- Triggers for automation
- RLS policy definitions
- Bug fixes and adjustments

**Validation**:
- Pre-migration health checks
- Post-migration validation
- Automated test coverage

---

## Technical Architecture

### Technology Stack

#### Frontend
- **Framework**: React 18.3.1
- **Build Tool**: Vite 5.4.19
- **Language**: TypeScript 5.8.3
- **Routing**: React Router DOM 6.30.1
- **State Management**: React Context + Hooks
- **UI Library**: shadcn/ui (Radix UI)
- **Styling**: Tailwind CSS 3.4.17
- **Animations**: Framer Motion 12.23.24
- **Rich Text**: TipTap 3.6.6
- **Drag & Drop**: @hello-pangea/dnd 18.0.1
- **Forms**: React Hook Form 7.61.1 + Zod 3.25.76
- **Date Handling**: date-fns 3.6.0
- **Charts**: Recharts 2.15.4

#### Backend
- **BaaS**: Supabase 2.75.0
- **Database**: PostgreSQL (Supabase managed)
- **Authentication**: Supabase Auth
- **Real-Time**: Supabase Realtime
- **Storage**: Supabase Storage
- **Edge Functions**: Deno (for email sending)

#### Testing
- **Unit Tests**: Vitest 3.2.4
- **E2E Tests**: Playwright 1.56.1
- **Test Coverage**: 114 automated tests
- **Browser Coverage**: Chrome, Firefox, Safari

#### Development Tools
- **Linter**: ESLint 9.32.0
- **Git Hooks**: Husky 9.1.7
- **Package Manager**: npm (lock file present)

#### Deployment
- **Hosting**: Netlify (configured)
- **Domain**: Custom domain support
- **CI/CD**: GitHub Actions (automated tests)

---

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client Browser                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │           React SPA (TypeScript)                   │ │
│  │  - React Router                                    │ │
│  │  - React Query (TanStack)                         │ │
│  │  - Context API                                     │ │
│  │  - Custom Hooks                                    │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
                          │ HTTPS
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Supabase Platform                      │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Auth API   │  │  REST API    │  │  Realtime    │ │
│  │              │  │  (PostgREST) │  │  (Phoenix)   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│         │                  │                  │         │
│         └──────────────────┼──────────────────┘         │
│                            ▼                            │
│                  ┌──────────────────┐                  │
│                  │   PostgreSQL     │                  │
│                  │   - 10+ tables   │                  │
│                  │   - RLS enabled  │                  │
│                  │   - Triggers     │                  │
│                  └──────────────────┘                  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐ │
│  │           Edge Functions (Deno)                   │ │
│  │  - send-invitation-email                         │ │
│  │  - get-verification-link                         │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
                          │ HTTPS
                          ▼
┌─────────────────────────────────────────────────────────┐
│              External Services                           │
│  - Resend API (email sending)                           │
│  - Google OAuth                                          │
└─────────────────────────────────────────────────────────┘
```

---

### Data Flow Examples

#### Example 1: Adding a Priority

```
1. User clicks "Add Priority" button
   └─> React state update (optimistic UI)

2. Component calls `supabase.from('meeting_instance_priorities').insert()`
   └─> HTTP POST to Supabase REST API

3. PostgreSQL validates data
   ├─> Check RLS policies (is user a team member?)
   ├─> Validate foreign keys
   └─> Insert into table

4. Realtime publishes change via WebSocket
   └─> All subscribed clients receive update

5. Other users' browsers receive real-time event
   └─> Auto-fetch updated priorities
   └─> Update UI without page refresh

6. Success: Toast notification displayed
```

#### Example 2: Accepting Team Invitation

```
1. User clicks invitation link
   └─> Navigate to /join/:inviteCode

2. Frontend checks if user is authenticated
   └─> If not, redirect to /auth with invite code in URL

3. User signs in/signs up
   └─> Supabase Auth processes authentication
   └─> Redirect back to /join/:inviteCode

4. Frontend validates invite code
   └─> Query invitations table
   └─> Check expiration and status

5. User clicks "Accept"
   └─> Insert into team_members table
   └─> Update invitation status to 'accepted'

6. Real-time subscription fires
   └─> Dashboard auto-updates with new team

7. User redirected to /dashboard
   └─> New team visible immediately
```

---

### Performance Optimizations

**Frontend**:
- Code splitting with React.lazy()
- Debounced autosave (2-second delay)
- Optimistic UI updates
- Memoized expensive calculations
- Virtual scrolling for long lists
- Image lazy loading

**Backend**:
- Database indexes on frequently queried columns
- Composite indexes for complex queries
- Connection pooling (Supabase managed)
- Query optimization (select only needed columns)
- Prepared statements for security and performance

**Real-Time**:
- Selective subscriptions (only relevant data)
- Debounced updates to prevent spam
- Automatic unsubscribe on unmount
- Efficient presence tracking

---

## Security & Compliance

### Authentication Security

**Password Requirements**:
- Minimum 6 characters (Supabase default)
- No maximum length
- No character type requirements (allows pass phrases)

**Session Management**:
- JWT tokens with 1-hour expiration
- Automatic refresh before expiration
- Secure httpOnly cookies
- CSRF protection via PKCE flow

**OAuth Security**:
- PKCE flow for Google OAuth
- State parameter for CSRF protection
- Redirect URI validation
- Automatic email verification

**Email Verification**:
- Required for email/password signups
- Magic links for passwordless auth
- 1-hour expiration on tokens
- One-time use tokens

---

### Data Security

**Row Level Security (RLS)**:
- Enabled on ALL tables
- Policies enforce business logic at database level
- No data leakage possible (database-enforced)
- Super admin policies for platform access

**API Security**:
- Anonymous key for client-side (rate-limited)
- Service key for server-side (never exposed)
- RLS protects even with direct SQL access
- All queries filtered by policies

**Data Encryption**:
- At rest: AES-256 encryption (Supabase default)
- In transit: TLS 1.2+ (HTTPS enforced)
- Database connections: SSL required

---

### Authorization Model

**Permission Matrix**:

| Action | Member | Admin | Super Admin |
|--------|--------|-------|-------------|
| View team meetings | ✅ | ✅ | ✅ (all teams) |
| Create meeting series | ❌ | ✅ | ✅ (all teams) |
| Edit meeting agenda | ❌ | ✅ | ✅ (all teams) |
| Add priorities/topics | ✅ (own) | ✅ (all) | ✅ (all) |
| Edit action items | ✅ (own) | ✅ (all) | ✅ (all) |
| Invite team members | ❌ | ✅ | ✅ (all teams) |
| Edit team settings | ❌ | ✅ | ✅ (all teams) |
| Create system templates | ❌ | ❌ | ✅ |
| Delete team | ❌ | ✅ (own) | ✅ (all) |

---

### Privacy & Data Protection

**Data Minimization**:
- Only collect necessary user data
- Optional fields for personal info
- No tracking or analytics (currently)

**User Rights**:
- View all personal data
- Edit profile information
- Delete account (cascades to user data)
- Export data (manual process)

**Data Retention**:
- Active accounts: Indefinite
- Deleted accounts: Immediate cascade delete
- Meeting data: Tied to team lifecycle

**GDPR Considerations** (if applicable):
- Right to access: ✅ (via profile page)
- Right to rectification: ✅ (edit profile)
- Right to erasure: ✅ (delete account)
- Right to portability: ⚠️ (manual export)
- Consent management: ⚠️ (to be implemented)

---

### Compliance & Auditing

**Audit Trail**:
- `created_at` timestamp on all records
- `updated_at` timestamp on modifications
- `created_by` tracking for content
- Activity logs (to be implemented)

**Monitoring**:
- Database error logging
- Edge Function execution logs
- Authentication event logs
- Real-time connection monitoring

---

## Success Metrics

### Key Performance Indicators (KPIs)

#### User Engagement
- **Active Users**: Daily/Weekly/Monthly active users
- **Team Creation Rate**: New teams per week
- **Meeting Frequency**: Meetings per team per week
- **Session Duration**: Average time in meetings
- **Return Rate**: % of users returning after 7 days

#### Product Usage
- **Priorities Completion Rate**: % of priorities marked completed
- **Action Item Completion**: % of action items completed by due date
- **Agenda Adoption**: % of meetings using templates
- **Real-Time Collaboration**: % of meetings with 2+ concurrent users
- **Mobile Usage**: % of sessions from mobile devices

#### Business Metrics
- **User Acquisition Cost**: Marketing spend / new users
- **Monthly Recurring Revenue**: Subscription revenue (when applicable)
- **Churn Rate**: % of teams that become inactive
- **Customer Lifetime Value**: Projected revenue per user

#### Technical Metrics
- **Page Load Time**: Time to interactive < 2 seconds
- **API Response Time**: P95 < 500ms
- **Real-Time Latency**: Sync delay < 1 second
- **Error Rate**: < 0.1% of requests
- **Uptime**: > 99.9%

---

### Current Performance Baseline

**As of November 2025**:
- ✅ 114 automated E2E tests passing
- ✅ Zero critical bugs in production
- ✅ Page load time: ~1.5 seconds
- ✅ Real-time sync latency: < 500ms typical
- ✅ Mobile responsive: All pages tested
- ✅ Accessibility: WCAG 2.1 AA compliant

---

## Future Roadmap

### Phase 1: Core Enhancements (Q1 2026)

**Priority: High**

1. **Calendar Integration**
   - Sync with Google Calendar
   - Show upcoming meetings
   - Auto-schedule based on frequency
   - Meeting reminders

2. **Meeting Notes Export**
   - Export to PDF
   - Export to Markdown
   - Export to Google Docs
   - Email summary to team

3. **Advanced Search**
   - Search across all meetings
   - Filter by date range
   - Filter by person
   - Full-text search in notes

4. **Notifications System**
   - In-app notifications
   - Email digests
   - Slack integration
   - Mobile push (future)

---

### Phase 2: Collaboration Features (Q2 2026)

**Priority: Medium-High**

1. **Comments & Discussions**
   - Comment on priorities
   - Comment on action items
   - @mentions
   - Threaded discussions

2. **File Attachments**
   - Upload files to topics
   - Attach files to action items
   - Drag-and-drop support
   - Image preview

3. **Meeting Recording**
   - Record meeting audio
   - Auto-transcription
   - Link to timestamps
   - AI-generated summaries

4. **Advanced Templates**
   - Template marketplace
   - Share templates between teams
   - Template versioning
   - Template analytics

---

### Phase 3: Analytics & Insights (Q3 2026)

**Priority: Medium**

1. **Team Analytics Dashboard**
   - Meeting attendance trends
   - Priority completion rates
   - Action item velocity
   - Team health scores

2. **Individual Insights**
   - Personal productivity metrics
   - Workload distribution
   - Commitment tracking
   - Performance trends

3. **Reporting**
   - Executive summaries
   - Custom reports
   - Data visualization
   - Export capabilities

4. **AI-Powered Insights**
   - Meeting effectiveness scoring
   - Suggested agenda improvements
   - Priority recommendations
   - Action item auto-assignment

---

### Phase 4: Enterprise Features (Q4 2026)

**Priority: Medium-Low**

1. **Organization Management**
   - Multi-team hierarchies
   - Org-wide templates
   - Cross-team reporting
   - Centralized admin

2. **Advanced Permissions**
   - Custom roles
   - Granular permissions
   - Department-level access
   - Compliance controls

3. **Integrations**
   - Jira/Linear integration
   - Microsoft Teams
   - Zoom/Meet integration
   - Notion/Confluence

4. **Enterprise Security**
   - SSO (SAML, OIDC)
   - SOC 2 compliance
   - Data residency options
   - Audit logs

---

### Phase 5: Mobile Apps (2027)

**Priority: Low (Web-first strategy)**

1. **iOS Native App**
   - SwiftUI interface
   - Native notifications
   - Offline support
   - iOS widgets

2. **Android Native App**
   - Jetpack Compose
   - Material Design 3
   - Offline support
   - Android widgets

---

## Appendix

### Glossary

- **Meeting Series**: A recurring meeting definition (e.g., "Weekly Tactical")
- **Meeting Instance**: A specific occurrence of a meeting series (e.g., "Week 45, 2025")
- **Priority**: A focus area or goal for a specific meeting period
- **Topic**: A discussion item for a specific meeting
- **Action Item**: A task or commitment that persists across meetings
- **Agenda Item**: A standing item that appears in every meeting of a series
- **Template**: A reusable set of agenda items
- **Real-Time Sync**: Automatic data updates across multiple users without page refresh
- **Presence**: Showing which users are currently viewing a meeting
- **RLS**: Row Level Security - database-level access control

---

### Technical Decisions Log

**Decision 1: Supabase vs. Custom Backend**
- **Date**: October 2024
- **Decision**: Use Supabase as backend-as-a-service
- **Rationale**: Faster development, built-in real-time, managed infrastructure
- **Trade-offs**: Less control, vendor lock-in risk
- **Status**: Confirmed - working well

**Decision 2: shadcn/ui vs. Mantine**
- **Date**: October 2024
- **Decision**: Use shadcn/ui (Radix primitives)
- **Rationale**: Copy-paste components, full control, smaller bundle
- **Trade-offs**: More manual work vs. batteries-included Mantine
- **Status**: Confirmed - good choice

**Decision 3: Instance-Specific vs. Series-Level Data**
- **Date**: November 2024
- **Decision**: Priorities/Topics are instance-specific; Agenda/Actions are series-level
- **Rationale**: Priorities don't carry over week-to-week, but agenda structure persists
- **Trade-offs**: More complex data model
- **Status**: Confirmed - matches user mental model

**Decision 4: Real-Time Library**
- **Date**: November 2024
- **Decision**: Use Supabase Realtime (built-in)
- **Rationale**: Native integration, reliable, WebSocket-based
- **Trade-offs**: Tied to Supabase, limited customization
- **Status**: Confirmed - works excellently

**Decision 5: Testing Strategy**
- **Date**: October 2024
- **Decision**: Playwright for E2E, Vitest for unit tests
- **Rationale**: Fast execution, multi-browser, modern tooling
- **Trade-offs**: Initial setup complexity
- **Status**: Confirmed - 114 tests running smoothly

---

### Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Nov 10, 2025 | Arnaud Grunwald | Initial PRD creation (retroactive documentation) |

---

### Document Maintenance

**Review Schedule**: Quarterly
**Owner**: Product Manager / Engineering Lead
**Last Review**: November 10, 2025
**Next Review**: February 10, 2026

---

**End of Document**


