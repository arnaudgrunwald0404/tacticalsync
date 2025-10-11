-- Create agenda templates table
CREATE TABLE IF NOT EXISTS public.agenda_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT agenda_templates_name_check CHECK (char_length(name) > 0)
);

-- Create agenda template items table
CREATE TABLE IF NOT EXISTS public.agenda_template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.agenda_templates(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 5,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT agenda_template_items_title_check CHECK (char_length(title) > 0),
    CONSTRAINT agenda_template_items_duration_check CHECK (duration_minutes > 0 AND duration_minutes <= 180)
);

-- Create indexes
CREATE INDEX idx_agenda_templates_user_id ON public.agenda_templates(user_id);
CREATE INDEX idx_agenda_template_items_template_id ON public.agenda_template_items(template_id);

-- Enable RLS
ALTER TABLE public.agenda_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_template_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agenda_templates
CREATE POLICY "Users can view their own templates"
    ON public.agenda_templates
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own templates"
    ON public.agenda_templates
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates"
    ON public.agenda_templates
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates"
    ON public.agenda_templates
    FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for agenda_template_items
CREATE POLICY "Users can view items of their own templates"
    ON public.agenda_template_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.agenda_templates
            WHERE agenda_templates.id = agenda_template_items.template_id
            AND agenda_templates.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create items for their own templates"
    ON public.agenda_template_items
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.agenda_templates
            WHERE agenda_templates.id = agenda_template_items.template_id
            AND agenda_templates.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update items of their own templates"
    ON public.agenda_template_items
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.agenda_templates
            WHERE agenda_templates.id = agenda_template_items.template_id
            AND agenda_templates.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete items of their own templates"
    ON public.agenda_template_items
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.agenda_templates
            WHERE agenda_templates.id = agenda_template_items.template_id
            AND agenda_templates.user_id = auth.uid()
        )
    );

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at on agenda_templates
CREATE TRIGGER update_agenda_templates_updated_at
    BEFORE UPDATE ON public.agenda_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

