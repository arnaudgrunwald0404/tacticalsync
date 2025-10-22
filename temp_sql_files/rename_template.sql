-- Rename the existing template from "Opening Comments Template" to "Beem's Agenda"
UPDATE public.agenda_templates 
SET name = 'Beem''s Agenda'
WHERE is_system = TRUE AND name = 'Opening Comments Template';
