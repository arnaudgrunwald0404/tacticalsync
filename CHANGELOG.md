## 0.1.0 - 2025-10-30

### Added/Changed
- Team member display now uses first/last names with robust fallbacks.
- Avatars now prefer generated `avatar_name` via `FancyAvatar`, falling back to uploaded `avatar_url` and initials.
- Updated `TeamInvite` and `MeetingSettings` to fetch `first_name`, `last_name`, `email`, and `avatar_name`.
- Fixed a toast description fallback lint issue.

### Notes
- This resolves the “Unknown User” and missing avatar issues when profiles rely on `first_name`, `last_name`, and `avatar_name` fields.

