-- Seed CoS data for Arnaud Grunwald (agrunwald@clearcompany.com)
-- No-op if user doesn't exist
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'agrunwald@clearcompany.com' LIMIT 1;
  IF v_user_id IS NULL THEN RETURN; END IF;

  -- Skip if already seeded
  IF EXISTS (SELECT 1 FROM cos_priorities WHERE user_id = v_user_id LIMIT 1) THEN RETURN; END IF;

  -- This Week
  INSERT INTO cos_priorities (user_id, text, category, tier_order) VALUES
    (v_user_id, 'Schedule Artium', 'this_week', 1),
    (v_user_id, 'APIs→MCPs plan for Melissa', 'this_week', 2),
    (v_user_id, 'ClearGo+ClearMAP training launch', 'this_week', 3),
    (v_user_id, 'P&C reviews Thu', 'this_week', 4),
    (v_user_id, 'AI Sourcing Max+Social Media Sourcing go status', 'this_week', 5),
    (v_user_id, 'Dan presentation follow-up/Go-NoGo automation', 'this_week', 6),
    (v_user_id, 'Agents positioning doc', 'this_week', 7),
    (v_user_id, 'Product Launch Council', 'this_week', 8),
    (v_user_id, 'NH pricing in Paprico', 'this_week', 9);

  -- April
  INSERT INTO cos_priorities (user_id, text, category, tier_order) VALUES
    (v_user_id, 'Marketing AI Adoption Ladder', 'april', 1),
    (v_user_id, 'Transform demo+Gavin', 'april', 2),
    (v_user_id, 'Bersin+Galileo', 'april', 3),
    (v_user_id, 'NorthStar demo', 'april', 4),
    (v_user_id, 'Agent intake tool', 'april', 5),
    (v_user_id, 'Adoption analytics', 'april', 6),
    (v_user_id, 'Kombo ADP strategy', 'april', 7),
    (v_user_id, 'LMS UX with Matt', 'april', 8),
    (v_user_id, 'Agents GTM with Matt', 'april', 9);

  -- Strategic
  INSERT INTO cos_priorities (user_id, text, category, tier_order) VALUES
    (v_user_id, 'CRM+Sourcing $5 PEPM transition', 'strategic', 1),
    (v_user_id, 'Enterprise readiness', 'strategic', 2),
    (v_user_id, 'Skills-Perf-Learning', 'strategic', 3),
    (v_user_id, 'Design system', 'strategic', 4),
    (v_user_id, 'LMS churn (21 accounts)', 'strategic', 5),
    (v_user_id, 'Frontline/upmarket positioning', 'strategic', 6),
    (v_user_id, 'ROI+EBR', 'strategic', 7),
    (v_user_id, 'Product office hours', 'strategic', 8);

  -- People
  INSERT INTO cos_priorities (user_id, text, category, tier_order) VALUES
    (v_user_id, 'Artium', 'people', 1),
    (v_user_id, 'Alison+Jeremy', 'people', 2),
    (v_user_id, 'PMs 1:1', 'people', 3),
    (v_user_id, 'Greenshades', 'people', 4),
    (v_user_id, 'ThoughtSpot SVP', 'people', 5),
    (v_user_id, 'Transform follow-ups (Gavin/Traxxion/Unum)', 'people', 6),
    (v_user_id, 'Redbird/Uzio/Turn.ai', 'people', 7);

  -- Team members
  INSERT INTO cos_team_members (user_id, name, role, relationship_type) VALUES
    (v_user_id, 'Dan Pope', 'Direct Report', 'direct_report'),
    (v_user_id, 'Eric Guba', 'Direct Report', 'direct_report'),
    (v_user_id, 'Marcelo Paiva', 'Direct Report', 'direct_report'),
    (v_user_id, 'Matt Yang', 'Collaborator', 'collaborator'),
    (v_user_id, 'Mindy Rosenberg', 'Collaborator', 'collaborator'),
    (v_user_id, 'Kristen Penney', 'Collaborator', 'collaborator');
END;
$$;
