-- Create a function to get a recurring meeting by ID
CREATE OR REPLACE FUNCTION get_recurring_meeting(meeting_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  frequency text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT rm.id, rm.name, rm.frequency
  FROM recurring_meetings rm
  WHERE rm.id = meeting_id;
END;
$$;
