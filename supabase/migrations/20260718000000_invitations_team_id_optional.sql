-- Team assignment is no longer required when inviting a user; the org chart
-- now carries reporting structure, so invitations can be created without a team.
ALTER TABLE invitations ALTER COLUMN team_id DROP NOT NULL;
