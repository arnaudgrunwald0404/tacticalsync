-- Seed demo meeting suggestions for Arnaud Grunwald so the
-- "Suggested from your 1:1s" panel renders before Zoom is connected.
-- No-op if the user / team members don't exist, or suggestions already exist.
DO $$
DECLARE
  v_user_id   uuid;
  v_dan       uuid;
  v_eric      uuid;
  v_marcelo   uuid;
  v_mindy     uuid;
  v_kristen   uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'agrunwald@clearcompany.com' LIMIT 1;
  IF v_user_id IS NULL THEN RETURN; END IF;

  -- Skip if already seeded / the user has acted on suggestions
  IF EXISTS (SELECT 1 FROM dci_suggested_tasks WHERE user_id = v_user_id LIMIT 1) THEN RETURN; END IF;

  SELECT id INTO v_dan     FROM cos_team_members WHERE user_id = v_user_id AND name = 'Dan Pope'        LIMIT 1;
  SELECT id INTO v_eric    FROM cos_team_members WHERE user_id = v_user_id AND name = 'Eric Guba'       LIMIT 1;
  SELECT id INTO v_marcelo FROM cos_team_members WHERE user_id = v_user_id AND name = 'Marcelo Paiva'   LIMIT 1;
  SELECT id INTO v_mindy   FROM cos_team_members WHERE user_id = v_user_id AND name = 'Mindy Rosenberg' LIMIT 1;
  SELECT id INTO v_kristen FROM cos_team_members WHERE user_id = v_user_id AND name = 'Kristen Penney'  LIMIT 1;

  -- Need at least one member for realistic attribution
  IF v_dan IS NULL THEN RETURN; END IF;

  INSERT INTO dci_suggested_tasks
    (user_id, date, title, source, source_type, urgency, suggested_category, rationale, raw_context, member_id)
  VALUES
    (v_user_id, CURRENT_DATE, 'Follow up on Dan''s Q3 plan',
      '1:1 with Dan Pope', 'one_on_one', 'urgent', 'now',
      '6 days overdue — blocks your Q3 narrative.',
      'I''ll have the Q3 plan over to you by Friday so you can fold it into the board narrative.', v_dan),

    (v_user_id, CURRENT_DATE, 'Review CM v2 acceptance criteria',
      '1:1 with Eric Guba', 'one_on_one', 'urgent', 'now',
      'You owe this; Candidate Matching v2 ships Jun 27.',
      'Can you sign off on the acceptance criteria before we lock the v2 scope?', v_eric),

    (v_user_id, CURRENT_DATE, 'Unblock the pipeline analytics beta',
      '1:1 with Eric Guba', 'one_on_one', 'watching', 'strategic',
      'At-risk release — slipping past Jul 11.',
      'The analytics beta is blocked on the data contract; it''ll slip past Jul 11 without a decision.', v_eric),

    (v_user_id, CURRENT_DATE, 'Schedule a 1:1 with Mindy',
      '1:1 with Mindy Rosenberg', 'one_on_one', 'urgent', 'now',
      '5 weeks since you last met — don''t let it slide.',
      'We haven''t had a proper 1:1 in over a month — would love to reconnect.', v_mindy),

    (v_user_id, CURRENT_DATE, 'Finalize the Q3 hiring plan with Marcelo',
      '1:1 with Marcelo Paiva', 'one_on_one', 'this_week', 'this_week',
      'Overdue commitment from your last 1:1.',
      'You said you''d get me the headcount numbers so we can finalize the Q3 hiring plan.', v_marcelo),

    (v_user_id, CURRENT_DATE, 'Draft Kristen''s career-growth plan',
      '1:1 with Kristen Penney', 'one_on_one', 'watching', 'people',
      'You owe this; supports her retention.',
      'I''d really value a clearer picture of the growth path here.', v_kristen);
END;
$$;
