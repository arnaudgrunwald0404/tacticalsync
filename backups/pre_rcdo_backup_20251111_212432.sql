


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."completion_status_enum" AS ENUM (
    'completed',
    'not_completed',
    'pending'
);


ALTER TYPE "public"."completion_status_enum" OWNER TO "postgres";


COMMENT ON TYPE "public"."completion_status_enum" IS 'Enum for completion status: completed, not_completed, pending';



CREATE TYPE "public"."invitation_status" AS ENUM (
    'pending',
    'accepted',
    'expired',
    'declined'
);


ALTER TYPE "public"."invitation_status" OWNER TO "postgres";


CREATE TYPE "public"."item_type" AS ENUM (
    'agenda',
    'topic',
    'priority',
    'team_topic',
    'action_item'
);


ALTER TYPE "public"."item_type" OWNER TO "postgres";


COMMENT ON TYPE "public"."item_type" IS 'Types of meeting items: agenda (timed items), priority (important topics with desired outcomes), team_topic (team-specific discussion topics), action_item (tasks and follow-ups)';



CREATE TYPE "public"."meeting_frequency" AS ENUM (
    'daily',
    'weekly',
    'bi-weekly',
    'monthly'
);


ALTER TYPE "public"."meeting_frequency" OWNER TO "postgres";


CREATE TYPE "public"."member_role" AS ENUM (
    'admin',
    'member'
);


ALTER TYPE "public"."member_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_team_member_role"("_team_id" "uuid", "_user_id" "uuid", "_required_role" "public"."member_role") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id 
    AND user_id = _user_id 
    AND role = _required_role
  );
END;
$$;


ALTER FUNCTION "public"."check_team_member_role"("_team_id" "uuid", "_user_id" "uuid", "_required_role" "public"."member_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_recurring_meeting"("meeting_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "frequency" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT rm.id, rm.name, rm.frequency
  FROM recurring_meetings rm
  WHERE rm.id = meeting_id;
END;
$$;


ALTER FUNCTION "public"."get_recurring_meeting"("meeting_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_login_info"("user_id" "uuid") RETURNS TABLE("has_logged_in" boolean, "last_active" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  auth_user_record RECORD;
BEGIN
  -- Query auth.users table (requires SECURITY DEFINER)
  SELECT 
    last_sign_in_at,
    created_at
  INTO auth_user_record
  FROM auth.users
  WHERE id = user_id;

  -- Return login info
  RETURN QUERY SELECT
    COALESCE(auth_user_record.last_sign_in_at IS NOT NULL, FALSE) as has_logged_in,
    COALESCE(auth_user_record.last_sign_in_at, auth_user_record.created_at) as last_active;
END;
$$;


ALTER FUNCTION "public"."get_user_login_info"("user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_login_info"("user_id" "uuid") IS 'Returns login information for a user. Requires super admin privileges.';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Insert profile with better error handling
  INSERT INTO public.profiles (id, email, full_name, first_name, last_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'given_name', NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'family_name', NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    avatar_url = EXCLUDED.avatar_url;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (is_admin = TRUE OR is_super_admin = TRUE)
  );
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_admin"() IS 'Returns true if the current user is an admin or super admin.';



CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_super_admin"() IS 'Returns true if the current user is a super admin. Queries super_admins table which has no RLS to avoid recursion.';



CREATE OR REPLACE FUNCTION "public"."is_team_admin"("_team_id" "uuid", "_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id AND role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_team_admin"("_team_id" "uuid", "_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_team_member"("_team_id" "uuid", "_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id
  );
$$;


ALTER FUNCTION "public"."is_team_member"("_team_id" "uuid", "_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_action_item_completed_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- If status is changing to 'completed' and completed_at is not set, set it now
  IF NEW.completion_status = 'completed' AND OLD.completion_status != 'completed' THEN
    NEW.completed_at = NOW();
  END IF;
  
  -- If status is changing from 'completed' to something else, clear completed_at
  IF NEW.completion_status != 'completed' AND OLD.completion_status = 'completed' THEN
    NEW.completed_at = NULL;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_action_item_completed_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_super_admin_on_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.is_super_admin = TRUE THEN
    INSERT INTO public.super_admins (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_super_admin_on_insert"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_super_admin_on_insert"() IS 'Syncs super_admins table when a profile is inserted with is_super_admin = true.';



CREATE OR REPLACE FUNCTION "public"."sync_super_admin_on_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.is_super_admin IS DISTINCT FROM COALESCE(OLD.is_super_admin, FALSE) THEN
    IF NEW.is_super_admin = TRUE THEN
      INSERT INTO public.super_admins (user_id) VALUES (NEW.id)
      ON CONFLICT (user_id) DO NOTHING;
    ELSE
      DELETE FROM public.super_admins WHERE user_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_super_admin_on_update"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_super_admin_on_update"() IS 'Syncs super_admins table when profiles.is_super_admin column changes.';



CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agenda_template_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "duration_minutes" integer DEFAULT 5,
    "order_index" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "agenda_template_items_duration_check" CHECK ((("duration_minutes" > 0) AND ("duration_minutes" <= 180))),
    CONSTRAINT "agenda_template_items_title_check" CHECK (("char_length"("title") > 0))
);


ALTER TABLE "public"."agenda_template_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."agenda_template_items" IS 'Individual agenda items within templates';



CREATE TABLE IF NOT EXISTS "public"."agenda_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "is_system" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "agenda_templates_name_check" CHECK (("char_length"("name") > 0))
);


ALTER TABLE "public"."agenda_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."agenda_templates" IS 'Agenda templates for meetings - includes system templates editable by superadmin only';



COMMENT ON COLUMN "public"."agenda_templates"."user_id" IS 'NULL for system templates, user ID for user-created templates';



COMMENT ON COLUMN "public"."agenda_templates"."is_system" IS 'System templates are managed by superadmin (agrunwald@clearcompany.com)';



CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "item_type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "comments_item_type_check" CHECK (("item_type" = ANY (ARRAY['agenda'::"text", 'priority'::"text", 'topic'::"text", 'action_item'::"text"])))
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."comments"."created_by" IS 'User who created this comment (references profiles.id)';



CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "invited_by" "uuid",
    "status" "public"."invitation_status" DEFAULT 'pending'::"public"."invitation_status",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval),
    "invite_code" "text" DEFAULT ("gen_random_uuid"())::"text",
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    CONSTRAINT "invitations_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text"])))
)
WITH ("fillfactor"='100');


ALTER TABLE "public"."invitations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."invitations"."expires_at" IS 'When the invitation expires (default: 7 days from creation)';



COMMENT ON COLUMN "public"."invitations"."invite_code" IS 'Unique code for invitation links (auto-generated if not provided)';



COMMENT ON COLUMN "public"."invitations"."role" IS 'Role that will be assigned to the user when they accept the invitation';



CREATE TABLE IF NOT EXISTS "public"."meeting_instance_priorities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instance_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "outcome" "text" NOT NULL,
    "activities" "text" NOT NULL,
    "assigned_to" "uuid",
    "order_index" integer NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completion_status" "public"."completion_status_enum" DEFAULT 'not_completed'::"public"."completion_status_enum" NOT NULL,
    CONSTRAINT "check_outcome_length" CHECK (("length"("outcome") > 0)),
    CONSTRAINT "check_title_length" CHECK (("length"("title") >= 0))
);


ALTER TABLE "public"."meeting_instance_priorities" OWNER TO "postgres";


COMMENT ON COLUMN "public"."meeting_instance_priorities"."assigned_to" IS 'User assigned to this priority (references profiles.id)';



COMMENT ON COLUMN "public"."meeting_instance_priorities"."created_by" IS 'User who created this priority (references profiles.id)';



CREATE TABLE IF NOT EXISTS "public"."meeting_instance_topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instance_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "notes" "text",
    "assigned_to" "uuid",
    "time_minutes" integer,
    "order_index" integer NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completion_status" "public"."completion_status_enum" DEFAULT 'not_completed'::"public"."completion_status_enum" NOT NULL,
    CONSTRAINT "check_time_minutes" CHECK ((("time_minutes" IS NULL) OR ("time_minutes" > 0))),
    CONSTRAINT "check_title_length" CHECK (("length"("title") >= 0))
);


ALTER TABLE "public"."meeting_instance_topics" OWNER TO "postgres";


COMMENT ON COLUMN "public"."meeting_instance_topics"."assigned_to" IS 'User assigned to this topic (references profiles.id)';



COMMENT ON COLUMN "public"."meeting_instance_topics"."created_by" IS 'User who created this topic (references profiles.id)';



CREATE TABLE IF NOT EXISTS "public"."meeting_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "start_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "series_id" "uuid" NOT NULL
);


ALTER TABLE "public"."meeting_instances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meeting_series" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "frequency" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "meeting_series_frequency_check" CHECK (("frequency" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'bi-weekly'::"text", 'monthly'::"text"])))
);


ALTER TABLE "public"."meeting_series" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meeting_series_action_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "series_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "notes" "text",
    "assigned_to" "uuid",
    "due_date" "date",
    "order_index" integer NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completion_status" "public"."completion_status_enum" DEFAULT 'not_completed'::"public"."completion_status_enum" NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "check_due_date" CHECK ((("due_date" IS NULL) OR ("due_date" >= CURRENT_DATE))),
    CONSTRAINT "check_title_length" CHECK (("length"("title") >= 0))
);


ALTER TABLE "public"."meeting_series_action_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."meeting_series_action_items"."assigned_to" IS 'User assigned to this action item (references profiles.id)';



COMMENT ON COLUMN "public"."meeting_series_action_items"."created_by" IS 'User who created this action item (references profiles.id)';



COMMENT ON COLUMN "public"."meeting_series_action_items"."completed_at" IS 'Timestamp when action item was marked as completed. Used to determine activity period for display in meetings.';



CREATE TABLE IF NOT EXISTS "public"."meeting_series_agenda" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "series_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "notes" "text",
    "assigned_to" "uuid",
    "time_minutes" integer,
    "order_index" integer NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completion_status" "text" DEFAULT 'not_started'::"text",
    CONSTRAINT "check_time_minutes" CHECK ((("time_minutes" IS NULL) OR ("time_minutes" > 0))),
    CONSTRAINT "check_title_length" CHECK (("length"("title") >= 0)),
    CONSTRAINT "meeting_series_agenda_completion_status_check" CHECK (("completion_status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."meeting_series_agenda" OWNER TO "postgres";


COMMENT ON COLUMN "public"."meeting_series_agenda"."assigned_to" IS 'User assigned to this agenda item (references profiles.id)';



COMMENT ON COLUMN "public"."meeting_series_agenda"."created_by" IS 'User who created this agenda item (references profiles.id)';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text",
    "last_name" "text",
    "birthday" "date",
    "red_percentage" integer,
    "blue_percentage" integer,
    "green_percentage" integer,
    "yellow_percentage" integer,
    "avatar_name" "text",
    "is_super_admin" boolean DEFAULT false,
    "is_admin" boolean DEFAULT false
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."is_super_admin" IS 'When true, user has visibility to all teams and meetings regardless of membership';



COMMENT ON COLUMN "public"."profiles"."is_admin" IS 'When true, user can create teams and meetings (org-level admin). Super admins should also have this set.';



CREATE TABLE IF NOT EXISTS "public"."recurring_meetings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "frequency" "public"."meeting_frequency" DEFAULT 'weekly'::"public"."meeting_frequency" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."recurring_meetings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."super_admins" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."super_admins" OWNER TO "postgres";


COMMENT ON TABLE "public"."super_admins" IS 'Stores super admin user IDs. No RLS to avoid recursion when checking admin status.';



CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid",
    "user_id" "uuid",
    "role" "public"."member_role" DEFAULT 'member'::"public"."member_role" NOT NULL,
    "title" "text",
    "custom_avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."team_members" IS 'RLS enabled with working policies';



COMMENT ON COLUMN "public"."team_members"."user_id" IS 'User ID that references profiles.id (not auth.users.id)';



CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "abbreviated_name" "text",
    "created_by" "uuid",
    "invite_code" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(12), 'base64'::"text") NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "frequency" "public"."meeting_frequency" DEFAULT 'weekly'::"public"."meeting_frequency",
    "standing_agenda_items" "jsonb" DEFAULT '[]'::"jsonb"
)
WITH ("fillfactor"='100');


ALTER TABLE "public"."teams" OWNER TO "postgres";


COMMENT ON TABLE "public"."teams" IS 'RLS enabled with working policies';



COMMENT ON COLUMN "public"."teams"."invite_code" IS 'Unique code for team invitation links';



COMMENT ON COLUMN "public"."teams"."standing_agenda_items" IS 'JSON array of standing agenda items with name, assigned_to, and time_minutes fields';



CREATE TABLE IF NOT EXISTS "public"."topic_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "topic_status_status_check" CHECK (("status" = ANY (ARRAY['done'::"text", 'in_progress'::"text", 'blocked'::"text", 'not_started'::"text"])))
);


ALTER TABLE "public"."topic_status" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agenda_template_items"
    ADD CONSTRAINT "agenda_template_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agenda_templates"
    ADD CONSTRAINT "agenda_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_instance_priorities"
    ADD CONSTRAINT "meeting_instance_priorities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_instance_topics"
    ADD CONSTRAINT "meeting_instance_topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_instances"
    ADD CONSTRAINT "meeting_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_series_action_items"
    ADD CONSTRAINT "meeting_series_action_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_series_agenda"
    ADD CONSTRAINT "meeting_series_agenda_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_series"
    ADD CONSTRAINT "meeting_series_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_meetings"
    ADD CONSTRAINT "recurring_meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "super_admins_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_user_id_key" UNIQUE ("team_id", "user_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topic_status"
    ADD CONSTRAINT "topic_status_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_action_items_assigned_completion" ON "public"."meeting_series_action_items" USING "btree" ("assigned_to", "completion_status");



CREATE INDEX "idx_action_items_completion" ON "public"."meeting_series_action_items" USING "btree" ("completion_status");



CREATE INDEX "idx_action_items_due_date" ON "public"."meeting_series_action_items" USING "btree" ("due_date");



CREATE INDEX "idx_agenda_template_items_order" ON "public"."agenda_template_items" USING "btree" ("template_id", "order_index");



CREATE INDEX "idx_agenda_template_items_template_id" ON "public"."agenda_template_items" USING "btree" ("template_id");



CREATE INDEX "idx_agenda_templates_is_system" ON "public"."agenda_templates" USING "btree" ("is_system");



CREATE INDEX "idx_agenda_templates_user_id" ON "public"."agenda_templates" USING "btree" ("user_id");



CREATE INDEX "idx_comments_created_by" ON "public"."comments" USING "btree" ("created_by");



CREATE INDEX "idx_comments_item_id" ON "public"."comments" USING "btree" ("item_id");



CREATE INDEX "idx_comments_item_type" ON "public"."comments" USING "btree" ("item_type");



CREATE INDEX "idx_invitations_email" ON "public"."invitations" USING "btree" ("email");



CREATE INDEX "idx_invitations_expires_at" ON "public"."invitations" USING "btree" ("expires_at");



CREATE INDEX "idx_invitations_status" ON "public"."invitations" USING "btree" ("status");



CREATE INDEX "idx_invitations_team_id" ON "public"."invitations" USING "btree" ("team_id");



CREATE UNIQUE INDEX "idx_invitations_unique_pending_email_team" ON "public"."invitations" USING "btree" ("email", "team_id") WHERE ("status" = 'pending'::"public"."invitation_status");



CREATE INDEX "idx_meeting_instance_priorities_instance_id" ON "public"."meeting_instance_priorities" USING "btree" ("instance_id");



CREATE INDEX "idx_meeting_instance_topics_instance_id" ON "public"."meeting_instance_topics" USING "btree" ("instance_id");



CREATE INDEX "idx_meeting_instances_series_id" ON "public"."meeting_instances" USING "btree" ("series_id");



CREATE INDEX "idx_meeting_series_action_items_completed_at" ON "public"."meeting_series_action_items" USING "btree" ("completed_at");



CREATE INDEX "idx_meeting_series_action_items_series_id" ON "public"."meeting_series_action_items" USING "btree" ("series_id");



CREATE INDEX "idx_meeting_series_agenda_series_id" ON "public"."meeting_series_agenda" USING "btree" ("series_id");



CREATE INDEX "idx_meeting_series_team_id" ON "public"."meeting_series" USING "btree" ("team_id");



CREATE INDEX "idx_priorities_assigned_completion" ON "public"."meeting_instance_priorities" USING "btree" ("assigned_to", "completion_status");



CREATE INDEX "idx_priorities_completion" ON "public"."meeting_instance_priorities" USING "btree" ("completion_status");



CREATE INDEX "idx_recurring_meetings_team_id" ON "public"."recurring_meetings" USING "btree" ("team_id");



CREATE INDEX "idx_team_members_team_id" ON "public"."team_members" USING "btree" ("team_id");



CREATE INDEX "idx_team_members_user_id" ON "public"."team_members" USING "btree" ("user_id");



CREATE INDEX "idx_teams_abbreviated_name" ON "public"."teams" USING "btree" ("abbreviated_name");



CREATE INDEX "idx_teams_created_by" ON "public"."teams" USING "btree" ("created_by");



CREATE INDEX "idx_teams_invite_code" ON "public"."teams" USING "btree" ("invite_code");



CREATE INDEX "idx_topic_status_topic_id" ON "public"."topic_status" USING "btree" ("topic_id");



CREATE UNIQUE INDEX "idx_topic_status_unique_topic" ON "public"."topic_status" USING "btree" ("topic_id");



CREATE INDEX "idx_topic_status_updated_at" ON "public"."topic_status" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_topics_assigned_completion" ON "public"."meeting_instance_topics" USING "btree" ("assigned_to", "completion_status");



CREATE INDEX "idx_topics_completion" ON "public"."meeting_instance_topics" USING "btree" ("completion_status");



CREATE UNIQUE INDEX "invitations_invite_code_key" ON "public"."invitations" USING "btree" ("invite_code");



CREATE OR REPLACE TRIGGER "action_item_completion_timestamp" BEFORE UPDATE ON "public"."meeting_series_action_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_action_item_completed_at"();



CREATE OR REPLACE TRIGGER "sync_super_admin_on_profiles_insert" AFTER INSERT ON "public"."profiles" FOR EACH ROW WHEN (("new"."is_super_admin" = true)) EXECUTE FUNCTION "public"."sync_super_admin_on_insert"();



CREATE OR REPLACE TRIGGER "sync_super_admin_on_profiles_update" AFTER UPDATE OF "is_super_admin" ON "public"."profiles" FOR EACH ROW WHEN (("new"."is_super_admin" IS DISTINCT FROM COALESCE("old"."is_super_admin", false))) EXECUTE FUNCTION "public"."sync_super_admin_on_update"();



CREATE OR REPLACE TRIGGER "update_action_items_updated_at" BEFORE UPDATE ON "public"."meeting_series_action_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_agenda_templates_updated_at" BEFORE UPDATE ON "public"."agenda_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_agenda_updated_at" BEFORE UPDATE ON "public"."meeting_series_agenda" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_comments_updated_at" BEFORE UPDATE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_invitations_updated_at" BEFORE UPDATE ON "public"."invitations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_meeting_instance_priorities_updated_at" BEFORE UPDATE ON "public"."meeting_instance_priorities" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_meeting_instance_topics_updated_at" BEFORE UPDATE ON "public"."meeting_instance_topics" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_meeting_instances_updated_at" BEFORE UPDATE ON "public"."meeting_instances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_meeting_series_action_items_updated_at" BEFORE UPDATE ON "public"."meeting_series_action_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_meeting_series_agenda_updated_at" BEFORE UPDATE ON "public"."meeting_series_agenda" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_meeting_series_updated_at" BEFORE UPDATE ON "public"."meeting_series" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_priorities_updated_at" BEFORE UPDATE ON "public"."meeting_instance_priorities" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_team_members_updated_at" BEFORE UPDATE ON "public"."team_members" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_topics_updated_at" BEFORE UPDATE ON "public"."meeting_instance_topics" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."agenda_template_items"
    ADD CONSTRAINT "agenda_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."agenda_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agenda_templates"
    ADD CONSTRAINT "agenda_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "fk_comments_created_by_profiles" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_instance_priorities"
    ADD CONSTRAINT "fk_meeting_instance_priorities_assigned_to" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meeting_instance_priorities"
    ADD CONSTRAINT "fk_meeting_instance_priorities_created_by" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_instance_topics"
    ADD CONSTRAINT "fk_meeting_instance_topics_assigned_to" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meeting_instance_topics"
    ADD CONSTRAINT "fk_meeting_instance_topics_created_by" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_series_action_items"
    ADD CONSTRAINT "fk_meeting_series_action_items_assigned_to" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meeting_series_action_items"
    ADD CONSTRAINT "fk_meeting_series_action_items_created_by" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_series_agenda"
    ADD CONSTRAINT "fk_meeting_series_agenda_assigned_to" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meeting_series_agenda"
    ADD CONSTRAINT "fk_meeting_series_agenda_created_by" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "fk_team_members_user_id_profiles" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_instance_priorities"
    ADD CONSTRAINT "meeting_instance_priorities_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."meeting_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_instance_topics"
    ADD CONSTRAINT "meeting_instance_topics_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."meeting_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_instances"
    ADD CONSTRAINT "meeting_instances_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "public"."meeting_series"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_series_action_items"
    ADD CONSTRAINT "meeting_series_action_items_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "public"."meeting_series"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_series_agenda"
    ADD CONSTRAINT "meeting_series_agenda_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "public"."meeting_series"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_series"
    ADD CONSTRAINT "meeting_series_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_series"
    ADD CONSTRAINT "meeting_series_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_meetings"
    ADD CONSTRAINT "recurring_meetings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."super_admins"
    ADD CONSTRAINT "super_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_status"
    ADD CONSTRAINT "topic_status_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



CREATE POLICY "Admins can create meeting series" ON "public"."meeting_series" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."is_admin"() AND ((EXISTS ( SELECT 1
   FROM "public"."team_members" "tm"
  WHERE (("tm"."team_id" = "meeting_series"."team_id") AND ("tm"."user_id" = "auth"."uid"())))) OR "public"."is_super_admin"()) AND ("auth"."uid"() = "created_by")));



CREATE POLICY "Admins can create teams" ON "public"."teams" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."is_admin"() AND ("auth"."uid"() = "created_by")));



CREATE POLICY "Admins can delete team_members" ON "public"."team_members" FOR DELETE USING (("public"."is_super_admin"() OR "public"."is_team_admin"("team_id", "auth"."uid"())));



CREATE POLICY "Admins can update team_members" ON "public"."team_members" FOR UPDATE USING (("public"."is_super_admin"() OR "public"."is_team_admin"("team_id", "auth"."uid"()))) WITH CHECK (("public"."is_super_admin"() OR "public"."is_team_admin"("team_id", "auth"."uid"())));



CREATE POLICY "Allow all operations on team_members" ON "public"."team_members" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to create teams" ON "public"."teams" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to delete teams" ON "public"."teams" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to update teams" ON "public"."teams" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to view teams" ON "public"."teams" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone can read template items" ON "public"."agenda_template_items" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Anyone can read templates" ON "public"."agenda_templates" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can insert action items" ON "public"."meeting_series_action_items" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "created_by")));



CREATE POLICY "Authenticated users can update teams" ON "public"."teams" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can view action items" ON "public"."meeting_series_action_items" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Super admins can update profiles" ON "public"."profiles" FOR UPDATE USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_super_admin"());



CREATE POLICY "Team admins and super admins can manage invitations" ON "public"."invitations" USING (("public"."is_super_admin"() OR "public"."is_team_admin"("team_id", "auth"."uid"()))) WITH CHECK (("public"."is_super_admin"() OR "public"."is_team_admin"("team_id", "auth"."uid"())));



CREATE POLICY "Team admins can create recurring meetings" ON "public"."recurring_meetings" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "recurring_meetings"."team_id") AND ("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"public"."member_role")))));



CREATE POLICY "Team admins can delete recurring meetings" ON "public"."recurring_meetings" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "recurring_meetings"."team_id") AND ("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"public"."member_role")))));



CREATE POLICY "Team admins can delete teams" ON "public"."teams" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "teams"."id") AND ("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"public"."member_role")))));



CREATE POLICY "Team admins can update meeting series" ON "public"."meeting_series" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."team_members" "tm"
  WHERE (("tm"."team_id" = "meeting_series"."team_id") AND ("tm"."user_id" = "auth"."uid"()) AND ("tm"."role" = 'admin'::"public"."member_role")))));



CREATE POLICY "Team admins can update recurring meetings" ON "public"."recurring_meetings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "recurring_meetings"."team_id") AND ("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"public"."member_role")))));



CREATE POLICY "Team admins can update teams" ON "public"."teams" FOR UPDATE USING ((("auth"."uid"() = "created_by") OR "public"."is_super_admin"() OR "public"."is_team_admin"("id", "auth"."uid"()))) WITH CHECK ((("auth"."uid"() = "created_by") OR "public"."is_super_admin"() OR "public"."is_team_admin"("id", "auth"."uid"())));



CREATE POLICY "Team creators can add themselves as admin" ON "public"."team_members" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Team members and invited users can view recurring meetings" ON "public"."recurring_meetings" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "recurring_meetings"."team_id") AND ("team_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."invitations"
  WHERE (("invitations"."team_id" = "recurring_meetings"."team_id") AND ("invitations"."status" = 'pending'::"public"."invitation_status") AND ("lower"("invitations"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text")))))) OR "public"."is_super_admin"()));



CREATE POLICY "Team members can create meeting instances" ON "public"."meeting_instances" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."meeting_series" "ms"
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "ms"."team_id")))
  WHERE (("ms"."id" = "meeting_instances"."series_id") AND ("tm"."user_id" = "auth"."uid"())))) OR "public"."is_super_admin"()));



CREATE POLICY "Team members can delete agenda" ON "public"."meeting_series_agenda" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."meeting_series" "ms"
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "ms"."team_id")))
  WHERE (("ms"."id" = "meeting_series_agenda"."series_id") AND ("tm"."user_id" = "auth"."uid"())))));



COMMENT ON POLICY "Team members can delete agenda" ON "public"."meeting_series_agenda" IS 'Allows any team member to delete agenda items for their team meetings.';



CREATE POLICY "Team members can delete own topics" ON "public"."meeting_instance_topics" FOR DELETE USING ((("auth"."uid"() = "created_by") OR (EXISTS ( SELECT 1
   FROM (("public"."meeting_instances" "mi"
     JOIN "public"."meeting_series" "ms" ON (("ms"."id" = "mi"."series_id")))
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "ms"."team_id")))
  WHERE (("mi"."id" = "meeting_instance_topics"."instance_id") AND ("tm"."user_id" = "auth"."uid"()) AND ("tm"."role" = 'admin'::"public"."member_role"))))));



COMMENT ON POLICY "Team members can delete own topics" ON "public"."meeting_instance_topics" IS 'Allows users to delete topics they created, or team admins to delete any topics in their team meetings.';



CREATE POLICY "Team members can delete priorities" ON "public"."meeting_instance_priorities" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (("public"."meeting_instances" "mi"
     JOIN "public"."meeting_series" "ms" ON (("ms"."id" = "mi"."series_id")))
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "ms"."team_id")))
  WHERE (("mi"."id" = "meeting_instance_priorities"."instance_id") AND ("tm"."user_id" = "auth"."uid"())))));



COMMENT ON POLICY "Team members can delete priorities" ON "public"."meeting_instance_priorities" IS 'Allows any team member to delete priorities for their team meetings.';



CREATE POLICY "Team members can insert agenda" ON "public"."meeting_series_agenda" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."meeting_series" "ms"
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "ms"."team_id")))
  WHERE (("ms"."id" = "meeting_series_agenda"."series_id") AND ("tm"."user_id" = "auth"."uid"())))));



COMMENT ON POLICY "Team members can insert agenda" ON "public"."meeting_series_agenda" IS 'Allows any team member to insert agenda items for their team meetings.';



CREATE POLICY "Team members can insert priorities" ON "public"."meeting_instance_priorities" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."meeting_instances" "mi"
     JOIN "public"."meeting_series" "ms" ON (("ms"."id" = "mi"."series_id")))
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "ms"."team_id")))
  WHERE (("mi"."id" = "meeting_instance_priorities"."instance_id") AND ("tm"."user_id" = "auth"."uid"())))));



COMMENT ON POLICY "Team members can insert priorities" ON "public"."meeting_instance_priorities" IS 'Allows any team member to insert priorities for their team meetings.';



CREATE POLICY "Team members can insert topics" ON "public"."meeting_instance_topics" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."meeting_instances" "mi"
     JOIN "public"."meeting_series" "ms" ON (("ms"."id" = "mi"."series_id")))
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "ms"."team_id")))
  WHERE (("mi"."id" = "meeting_instance_topics"."instance_id") AND ("tm"."user_id" = "auth"."uid"())))));



COMMENT ON POLICY "Team members can insert topics" ON "public"."meeting_instance_topics" IS 'Allows team members to insert topics. Team membership is checked via meeting_instances -> meeting_series -> team_members join.';



CREATE POLICY "Team members can update agenda" ON "public"."meeting_series_agenda" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."meeting_series" "ms"
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "ms"."team_id")))
  WHERE (("ms"."id" = "meeting_series_agenda"."series_id") AND ("tm"."user_id" = "auth"."uid"())))));



COMMENT ON POLICY "Team members can update agenda" ON "public"."meeting_series_agenda" IS 'Allows team members to update agenda items for their team meetings.';



CREATE POLICY "Team members can update own topics" ON "public"."meeting_instance_topics" FOR UPDATE USING ((("auth"."uid"() = "created_by") OR (EXISTS ( SELECT 1
   FROM (("public"."meeting_instances" "mi"
     JOIN "public"."meeting_series" "ms" ON (("ms"."id" = "mi"."series_id")))
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "ms"."team_id")))
  WHERE (("mi"."id" = "meeting_instance_topics"."instance_id") AND ("tm"."user_id" = "auth"."uid"()) AND ("tm"."role" = 'admin'::"public"."member_role"))))));



COMMENT ON POLICY "Team members can update own topics" ON "public"."meeting_instance_topics" IS 'Allows users to update topics they created, or team admins to update any topics in their team meetings.';



CREATE POLICY "Team members can update priorities" ON "public"."meeting_instance_priorities" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (("public"."meeting_instances" "mi"
     JOIN "public"."meeting_series" "ms" ON (("ms"."id" = "mi"."series_id")))
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "ms"."team_id")))
  WHERE (("mi"."id" = "meeting_instance_priorities"."instance_id") AND ("tm"."user_id" = "auth"."uid"())))));



COMMENT ON POLICY "Team members can update priorities" ON "public"."meeting_instance_priorities" IS 'Allows any team member to update priorities for their team meetings.';



CREATE POLICY "Team members can view agenda" ON "public"."meeting_series_agenda" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."meeting_series" "ms"
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "ms"."team_id")))
  WHERE (("ms"."id" = "meeting_series_agenda"."series_id") AND ("tm"."user_id" = "auth"."uid"())))));



COMMENT ON POLICY "Team members can view agenda" ON "public"."meeting_series_agenda" IS 'Allows team members to view agenda items for their team meetings.';



CREATE POLICY "Team members can view each other's profiles" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."team_members" "tm1"
     JOIN "public"."team_members" "tm2" ON (("tm1"."team_id" = "tm2"."team_id")))
  WHERE (("tm1"."user_id" = "auth"."uid"()) AND ("tm2"."user_id" = "profiles"."id")))));



CREATE POLICY "Team members can view meeting instances" ON "public"."meeting_instances" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."meeting_series" "ms"
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "ms"."team_id")))
  WHERE (("ms"."id" = "meeting_instances"."series_id") AND ("tm"."user_id" = "auth"."uid"())))) OR "public"."is_super_admin"()));



CREATE POLICY "Team members can view priorities" ON "public"."meeting_instance_priorities" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."meeting_instances" "mi"
     JOIN "public"."meeting_series" "ms" ON (("ms"."id" = "mi"."series_id")))
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "ms"."team_id")))
  WHERE (("mi"."id" = "meeting_instance_priorities"."instance_id") AND ("tm"."user_id" = "auth"."uid"())))));



COMMENT ON POLICY "Team members can view priorities" ON "public"."meeting_instance_priorities" IS 'Allows team members to view priorities for their team meetings.';



CREATE POLICY "Team members can view team invitations" ON "public"."invitations" FOR SELECT USING (("public"."is_team_member"("team_id", "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "Team members can view team invitations and users can view their" ON "public"."invitations" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "invitations"."team_id") AND ("team_members"."user_id" = "auth"."uid"())))) OR ("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))) OR "public"."is_super_admin"()));



CREATE POLICY "Team members can view teams" ON "public"."teams" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "teams"."id") AND ("team_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Team members can view their recurring meetings" ON "public"."recurring_meetings" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."team_members" "tm"
  WHERE (("tm"."team_id" = "recurring_meetings"."team_id") AND ("tm"."user_id" = "auth"."uid"())))) OR "public"."is_super_admin"()));



CREATE POLICY "Team members can view topics" ON "public"."meeting_instance_topics" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."meeting_instances" "mi"
     JOIN "public"."meeting_series" "ms" ON (("ms"."id" = "mi"."series_id")))
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "ms"."team_id")))
  WHERE (("mi"."id" = "meeting_instance_topics"."instance_id") AND ("tm"."user_id" = "auth"."uid"())))));



COMMENT ON POLICY "Team members can view topics" ON "public"."meeting_instance_topics" IS 'Allows team members to view topics for meetings in their teams.';



CREATE POLICY "Users can accept their invitations" ON "public"."invitations" FOR UPDATE USING (("email" = (( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text"));



CREATE POLICY "Users can create comments" ON "public"."comments" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can create items for their own templates" ON "public"."agenda_template_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."agenda_templates"
  WHERE (("agenda_templates"."id" = "agenda_template_items"."template_id") AND ("agenda_templates"."user_id" = "auth"."uid"()) AND ("agenda_templates"."is_system" = false)))));



CREATE POLICY "Users can create teams" ON "public"."teams" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can create their own templates" ON "public"."agenda_templates" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("is_system" = false)));



CREATE POLICY "Users can delete items of their own templates" ON "public"."agenda_template_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."agenda_templates"
  WHERE (("agenda_templates"."id" = "agenda_template_items"."template_id") AND ("agenda_templates"."user_id" = "auth"."uid"()) AND ("agenda_templates"."is_system" = false)))));



CREATE POLICY "Users can delete their own action items" ON "public"."meeting_series_action_items" FOR DELETE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can delete their own comments" ON "public"."comments" FOR DELETE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can delete their own templates" ON "public"."agenda_templates" FOR DELETE USING ((("auth"."uid"() = "user_id") AND ("is_system" = false)));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can join teams" ON "public"."team_members" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can update invitations sent to them" ON "public"."invitations" FOR UPDATE USING ((("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("lower"("profiles"."email") = "lower"("invitations"."email"))))))) WITH CHECK ((("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("lower"("profiles"."email") = "lower"("invitations"."email")))))));



COMMENT ON POLICY "Users can update invitations sent to them" ON "public"."invitations" IS 'Allows users to update (accept/decline) invitations sent to their email address. Uses case-insensitive email matching via JWT and profiles table.';



CREATE POLICY "Users can update items of their own templates" ON "public"."agenda_template_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."agenda_templates"
  WHERE (("agenda_templates"."id" = "agenda_template_items"."template_id") AND ("agenda_templates"."user_id" = "auth"."uid"()) AND ("agenda_templates"."is_system" = false)))));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own action items" ON "public"."meeting_series_action_items" FOR UPDATE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can update their own comments" ON "public"."comments" FOR UPDATE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own templates" ON "public"."agenda_templates" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND ("is_system" = false)));



CREATE POLICY "Users can view all profiles" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Users can view comments on items they have access to" ON "public"."comments" FOR SELECT USING (true);



CREATE POLICY "Users can view invitations sent to them" ON "public"."invitations" FOR SELECT USING ((("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))) OR "public"."is_super_admin"()));



COMMENT ON POLICY "Users can view invitations sent to them" ON "public"."invitations" IS 'Allows users to view invitations sent to their email. Uses JWT email to avoid querying profiles table and causing RLS recursion.';



CREATE POLICY "Users can view items of their own templates and system template" ON "public"."agenda_template_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."agenda_templates"
  WHERE (("agenda_templates"."id" = "agenda_template_items"."template_id") AND (("agenda_templates"."user_id" = "auth"."uid"()) OR ("agenda_templates"."is_system" = true))))));



CREATE POLICY "Users can view meeting series" ON "public"."meeting_series" FOR SELECT USING ((("auth"."uid"() = "created_by") OR (EXISTS ( SELECT 1
   FROM "public"."team_members" "tm"
  WHERE (("tm"."team_id" = "meeting_series"."team_id") AND ("tm"."user_id" = "auth"."uid"())))) OR "public"."is_super_admin"()));



CREATE POLICY "Users can view team members" ON "public"."team_members" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."is_team_member"("team_id", "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "Users can view teams they belong to" ON "public"."teams" FOR SELECT USING ((("auth"."uid"() = "created_by") OR "public"."is_super_admin"() OR "public"."is_team_member"("id", "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."invitations"
  WHERE (("invitations"."team_id" = "teams"."id") AND ("invitations"."status" = 'pending'::"public"."invitation_status") AND ("lower"("invitations"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



COMMENT ON POLICY "Users can view teams they belong to" ON "public"."teams" IS 'Uses JWT email instead of profiles table to avoid RLS recursion.';



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own teams" ON "public"."teams" FOR SELECT USING ((("auth"."uid"() = "created_by") OR (EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "teams"."id") AND ("team_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view their own templates and system templates" ON "public"."agenda_templates" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("is_system" = true)));



CREATE POLICY "Users manage own template items" ON "public"."agenda_template_items" USING ((EXISTS ( SELECT 1
   FROM "public"."agenda_templates" "t"
  WHERE (("t"."id" = "agenda_template_items"."template_id") AND (("auth"."uid"() = "t"."user_id") OR (("t"."is_system" = true) AND ("lower"(("auth"."jwt"() ->> 'email'::"text")) = 'agrunwald@clearcompany.com'::"text"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."agenda_templates" "t"
  WHERE (("t"."id" = "agenda_template_items"."template_id") AND (("auth"."uid"() = "t"."user_id") OR (("t"."is_system" = true) AND ("lower"(("auth"."jwt"() ->> 'email'::"text")) = 'agrunwald@clearcompany.com'::"text")))))));



COMMENT ON POLICY "Users manage own template items" ON "public"."agenda_template_items" IS 'Uses JWT email instead of profiles table to avoid RLS recursion.';



CREATE POLICY "Users manage own templates" ON "public"."agenda_templates" USING ((("auth"."uid"() = "user_id") OR (("is_system" = true) AND ("lower"(("auth"."jwt"() ->> 'email'::"text")) = 'agrunwald@clearcompany.com'::"text")))) WITH CHECK ((("auth"."uid"() = "user_id") OR (("is_system" = true) AND ("lower"(("auth"."jwt"() ->> 'email'::"text")) = 'agrunwald@clearcompany.com'::"text"))));



COMMENT ON POLICY "Users manage own templates" ON "public"."agenda_templates" IS 'Uses JWT email instead of profiles table to avoid RLS recursion.';



ALTER TABLE "public"."agenda_template_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agenda_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_instance_priorities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_instance_topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_series" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_series_action_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_series_agenda" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurring_meetings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topic_status" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."meeting_instance_priorities";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."meeting_instance_topics";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."meeting_series_action_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."meeting_series_agenda";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."team_members";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."teams";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."check_team_member_role"("_team_id" "uuid", "_user_id" "uuid", "_required_role" "public"."member_role") TO "anon";
GRANT ALL ON FUNCTION "public"."check_team_member_role"("_team_id" "uuid", "_user_id" "uuid", "_required_role" "public"."member_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_team_member_role"("_team_id" "uuid", "_user_id" "uuid", "_required_role" "public"."member_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recurring_meeting"("meeting_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_recurring_meeting"("meeting_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recurring_meeting"("meeting_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_login_info"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_login_info"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_login_info"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_team_admin"("_team_id" "uuid", "_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_team_admin"("_team_id" "uuid", "_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_team_admin"("_team_id" "uuid", "_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_team_member"("_team_id" "uuid", "_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_team_member"("_team_id" "uuid", "_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_team_member"("_team_id" "uuid", "_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_action_item_completed_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_action_item_completed_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_action_item_completed_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_super_admin_on_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_super_admin_on_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_super_admin_on_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_super_admin_on_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_super_admin_on_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_super_admin_on_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."agenda_template_items" TO "anon";
GRANT ALL ON TABLE "public"."agenda_template_items" TO "authenticated";
GRANT ALL ON TABLE "public"."agenda_template_items" TO "service_role";



GRANT ALL ON TABLE "public"."agenda_templates" TO "anon";
GRANT ALL ON TABLE "public"."agenda_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."agenda_templates" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_instance_priorities" TO "anon";
GRANT ALL ON TABLE "public"."meeting_instance_priorities" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_instance_priorities" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_instance_topics" TO "anon";
GRANT ALL ON TABLE "public"."meeting_instance_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_instance_topics" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_instances" TO "anon";
GRANT ALL ON TABLE "public"."meeting_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_instances" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_series" TO "anon";
GRANT ALL ON TABLE "public"."meeting_series" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_series" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_series_action_items" TO "anon";
GRANT ALL ON TABLE "public"."meeting_series_action_items" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_series_action_items" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_series_agenda" TO "anon";
GRANT ALL ON TABLE "public"."meeting_series_agenda" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_series_agenda" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_meetings" TO "anon";
GRANT ALL ON TABLE "public"."recurring_meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_meetings" TO "service_role";



GRANT ALL ON TABLE "public"."super_admins" TO "anon";
GRANT ALL ON TABLE "public"."super_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."super_admins" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."topic_status" TO "anon";
GRANT ALL ON TABLE "public"."topic_status" TO "authenticated";
GRANT ALL ON TABLE "public"."topic_status" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































