-- Insert default Opening Comments Template
-- This will be available to all users as a system template
-- We'll mark it as a system template by using a special NULL user_id pattern
-- and update the RLS policies to allow everyone to read system templates

-- First, let's make user_id nullable and add is_system flag to agenda_templates
ALTER TABLE public.agenda_templates 
ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.agenda_templates 
ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;

-- Update RLS policy to allow viewing system templates
DROP POLICY IF EXISTS "Users can view their own templates" ON public.agenda_templates;

CREATE POLICY "Users can view their own templates and system templates"
    ON public.agenda_templates
    FOR SELECT
    USING (auth.uid() = user_id OR is_system = TRUE);

-- Update RLS policy for template items to include system templates
DROP POLICY IF EXISTS "Users can view items of their own templates" ON public.agenda_template_items;

CREATE POLICY "Users can view items of their own templates and system templates"
    ON public.agenda_template_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.agenda_templates
            WHERE agenda_templates.id = agenda_template_items.template_id
            AND (agenda_templates.user_id = auth.uid() OR agenda_templates.is_system = TRUE)
        )
    );

-- Create a function to seed the default template (idempotent)
CREATE OR REPLACE FUNCTION seed_opening_comments_template()
RETURNS void AS $$
DECLARE
    template_id UUID;
BEGIN
    -- Check if template already exists
    SELECT id INTO template_id 
    FROM public.agenda_templates 
    WHERE is_system = TRUE AND name = 'Beem''s Agenda';
    
    -- If it doesn't exist, create it
    IF template_id IS NULL THEN
        -- Insert the template
        INSERT INTO public.agenda_templates (name, description, is_system, user_id)
        VALUES (
            'Beem''s Agenda',
            'Recommended for tactical meetings',
            TRUE,
            NULL  -- System template has no owner
        )
        RETURNING id INTO template_id;
        
        -- Insert template items
        INSERT INTO public.agenda_template_items (template_id, title, duration_minutes, order_index)
        VALUES
            (template_id, 'Leader Opening Comments', 2, 1),
            (template_id, 'Review Last Week''s Items', 4, 2),
            (template_id, 'Calendar Review', 2, 3),
            (template_id, 'Lightning Round', 10, 4),
            (template_id, 'ELT Scorecard', 10, 5),
            (template_id, 'Employees At-Risk', 10, 6);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Run the seed function
SELECT seed_opening_comments_template();

-- Drop the function after use (optional, but keeps things clean)
DROP FUNCTION IF EXISTS seed_opening_comments_template();

