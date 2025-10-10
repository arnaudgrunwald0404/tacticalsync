-- Update existing agenda items to match the correct text
UPDATE public.meeting_items
SET title = 'Review last week''s item'
WHERE id = 'c6dfc3ca-7ff5-48e5-a32e-6fc607752ce8';

UPDATE public.meeting_items
SET title = 'Calendar Review'
WHERE id = 'f7513f21-846f-4006-a69f-15e24b00a086';

UPDATE public.meeting_items
SET title = 'Lightning Round'
WHERE id = '028c59cd-1a9a-4b83-8cba-f39d3c6d6f00';

UPDATE public.meeting_items
SET title = 'ELT Scorecard'
WHERE id = '90976519-4cd8-4dbc-a63b-d18a70cc051e';

UPDATE public.meeting_items
SET title = 'Employees At-Risk'
WHERE id = '13fef674-2162-44ba-ae30-bdb2e59e071f';