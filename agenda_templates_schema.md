# Agenda Templates Database Schema

## Overview
The agenda templates system consists of two main tables that support both user-created templates and system templates managed by superadmin.

## Tables

### `agenda_templates`
Stores agenda templates for meetings, including both user-created and system templates.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier for the template |
| `user_id` | UUID | REFERENCES auth.users(id) ON DELETE CASCADE | User who created the template (NULL for system templates) |
| `name` | TEXT | NOT NULL | Template name |
| `description` | TEXT | | Optional description of the template |
| `is_system` | BOOLEAN | DEFAULT false | Whether this is a system template (managed by superadmin) |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- `idx_agenda_templates_user_id` ON `agenda_templates(user_id)`
- `idx_agenda_templates_is_system` ON `agenda_templates(is_system)`

### `agenda_template_items`
Stores individual agenda items within templates.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier for the template item |
| `template_id` | UUID | NOT NULL, REFERENCES agenda_templates(id) ON DELETE CASCADE | Reference to the parent template |
| `title` | TEXT | NOT NULL | Title of the agenda item |
| `duration_minutes` | INTEGER | | Optional duration in minutes |
| `order_index` | INTEGER | NOT NULL | Order of the item within the template |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

**Indexes:**
- `idx_agenda_template_items_template_id` ON `agenda_template_items(template_id)`
- `idx_agenda_template_items_order` ON `agenda_template_items(template_id, order_index)`

## Row Level Security (RLS) Policies

### `agenda_templates` Policies

**Read Access:**
- `"Anyone can read templates"` - All authenticated users can read templates

**Write Access:**
- `"Users manage own templates"` - Users can create/edit their own templates (where `user_id` matches their auth ID)
- Superadmin (`agrunwald@clearcompany.com`) can edit system templates (`is_system = true`)

### `agenda_template_items` Policies

**Read Access:**
- `"Anyone can read template items"` - All authenticated users can read template items

**Write Access:**
- `"Users manage own template items"` - Users can manage items for templates they own
- Superadmin can manage items for system templates

## System Templates

### Beem Weekly Meeting Template
The system includes a pre-seeded "Beem Weekly Meeting" template with the following agenda items:

1. **Opening Comments** (2 minutes)
2. **Past Action Items** (4 minutes)
3. **Calendar Review** (2 minutes)
4. **Priority Review + Setting** (10 minutes)
5. **Team Scorecard** (10 minutes)
6. **Employees At-Risk** (10 minutes)

Template ID: `00000000-0000-0000-0000-000000000001`

## Usage Notes

- **System Templates**: Managed only by superadmin (`agrunwald@clearcompany.com`)
- **User Templates**: Created and managed by individual users
- **Template Items**: Automatically ordered by `order_index` within each template
- **Cascading Deletes**: Deleting a template removes all associated template items
- **Performance**: Indexes optimize queries by user, system status, and ordering

## Comments

```sql
COMMENT ON TABLE agenda_templates IS 'Agenda templates for meetings - includes system templates editable by superadmin only';
COMMENT ON TABLE agenda_template_items IS 'Individual agenda items within templates';
COMMENT ON COLUMN agenda_templates.is_system IS 'System templates are managed by superadmin (agrunwald@clearcompany.com)';
COMMENT ON COLUMN agenda_templates.user_id IS 'NULL for system templates, user ID for user-created templates';
```







