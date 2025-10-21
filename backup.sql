


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


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_first_name TEXT;
  user_last_name TEXT;
  user_full_name TEXT;
  user_avatar_url TEXT;
BEGIN
  -- Extract data from OAuth metadata
  user_first_name := NEW.raw_user_meta_data->>'given_name';
  user_last_name := NEW.raw_user_meta_data->>'family_name';
  user_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
  
  -- Build full name from first and last, or use provided full_name
  user_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    CASE 
      WHEN user_first_name IS NOT NULL AND user_last_name IS NOT NULL 
      THEN user_first_name || ' ' || user_last_name
      WHEN user_first_name IS NOT NULL 
      THEN user_first_name
      ELSE NEW.email
    END
  );

  INSERT INTO public.profiles (
    id, 
    email, 
    full_name,
    first_name,
    last_name,
    avatar_url
  )
  VALUES (
    NEW.id,
    NEW.email,
    user_full_name,
    user_first_name,
    user_last_name,
    user_avatar_url
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_team_member"("_team_id" "uuid", "_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id
  );
END;
$$;


ALTER FUNCTION "public"."is_team_member"("_team_id" "uuid", "_user_id" "uuid") OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid",
    "user_id" "uuid",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "invited_by" "uuid",
    "status" "public"."invitation_status" DEFAULT 'pending'::"public"."invitation_status",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval)
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meeting_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meeting_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "outcome" "text",
    "notes" "text",
    "assigned_to" "uuid",
    "time_minutes" integer,
    "is_completed" boolean DEFAULT false,
    "order_index" integer NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_future" boolean DEFAULT false,
    "type" "public"."item_type" NOT NULL,
    "due_date" "date",
    "completion_status" "text",
    CONSTRAINT "meeting_items_completion_status_check" CHECK (("completion_status" = ANY (ARRAY['completed'::"text", 'not_completed'::"text"])))
);


ALTER TABLE "public"."meeting_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."meeting_items"."is_future" IS 'When true, this priority will be copied to the next meeting iteration until marked as false';



COMMENT ON COLUMN "public"."meeting_items"."due_date" IS 'Due date for action items';



COMMENT ON COLUMN "public"."meeting_items"."completion_status" IS 'Completion status for meeting items';



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
    "avatar_name" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


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
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."weekly_meetings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid",
    "recurring_meeting_id" "uuid",
    "week_start_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."weekly_meetings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agenda_template_items"
    ADD CONSTRAINT "agenda_template_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agenda_templates"
    ADD CONSTRAINT "agenda_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_items"
    ADD CONSTRAINT "meeting_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_meetings"
    ADD CONSTRAINT "recurring_meetings_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."weekly_meetings"
    ADD CONSTRAINT "weekly_meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_meetings"
    ADD CONSTRAINT "weekly_meetings_recurring_meeting_week_unique" UNIQUE ("recurring_meeting_id", "week_start_date");



CREATE INDEX "idx_agenda_template_items_template_id" ON "public"."agenda_template_items" USING "btree" ("template_id");



CREATE INDEX "idx_agenda_templates_user_id" ON "public"."agenda_templates" USING "btree" ("user_id");



CREATE INDEX "idx_comments_item_id" ON "public"."comments" USING "btree" ("item_id");



CREATE INDEX "idx_invitations_email" ON "public"."invitations" USING "btree" ("email");



CREATE INDEX "idx_invitations_status" ON "public"."invitations" USING "btree" ("status");



CREATE INDEX "idx_invitations_team_id" ON "public"."invitations" USING "btree" ("team_id");



CREATE UNIQUE INDEX "idx_invitations_unique_pending_email_team" ON "public"."invitations" USING "btree" ("email", "team_id") WHERE ("status" = 'pending'::"public"."invitation_status");



CREATE INDEX "idx_meeting_items_due_date" ON "public"."meeting_items" USING "btree" ("due_date");



CREATE INDEX "idx_meeting_items_is_future" ON "public"."meeting_items" USING "btree" ("is_future") WHERE ("is_future" = true);



CREATE INDEX "idx_meeting_items_meeting_id" ON "public"."meeting_items" USING "btree" ("meeting_id");



CREATE INDEX "idx_recurring_meetings_team_id" ON "public"."recurring_meetings" USING "btree" ("team_id");



CREATE INDEX "idx_team_members_team_id" ON "public"."team_members" USING "btree" ("team_id");



CREATE INDEX "idx_team_members_user_id" ON "public"."team_members" USING "btree" ("user_id");



CREATE INDEX "idx_teams_abbreviated_name" ON "public"."teams" USING "btree" ("abbreviated_name");



CREATE INDEX "idx_topic_status_topic_id" ON "public"."topic_status" USING "btree" ("topic_id");



CREATE UNIQUE INDEX "idx_topic_status_unique_topic" ON "public"."topic_status" USING "btree" ("topic_id");



CREATE INDEX "idx_topic_status_updated_at" ON "public"."topic_status" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_weekly_meetings_recurring_meeting_id" ON "public"."weekly_meetings" USING "btree" ("recurring_meeting_id");



CREATE INDEX "idx_weekly_meetings_team_id" ON "public"."weekly_meetings" USING "btree" ("team_id");



CREATE OR REPLACE TRIGGER "update_agenda_templates_updated_at" BEFORE UPDATE ON "public"."agenda_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."agenda_template_items"
    ADD CONSTRAINT "agenda_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."agenda_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agenda_templates"
    ADD CONSTRAINT "agenda_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."meeting_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_items"
    ADD CONSTRAINT "meeting_items_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."meeting_items"
    ADD CONSTRAINT "meeting_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."meeting_items"
    ADD CONSTRAINT "meeting_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."weekly_meetings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_meetings"
    ADD CONSTRAINT "recurring_meetings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_status"
    ADD CONSTRAINT "topic_status_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."meeting_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_status"
    ADD CONSTRAINT "topic_status_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."weekly_meetings"
    ADD CONSTRAINT "weekly_meetings_recurring_meeting_id_fkey" FOREIGN KEY ("recurring_meeting_id") REFERENCES "public"."recurring_meetings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_meetings"
    ADD CONSTRAINT "weekly_meetings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



CREATE POLICY "Allow all operations on team_members" ON "public"."team_members" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to create teams" ON "public"."teams" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to delete teams" ON "public"."teams" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to update teams" ON "public"."teams" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to view teams" ON "public"."teams" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can create teams" ON "public"."teams" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Authenticated users can update teams" ON "public"."teams" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can view teams" ON "public"."teams" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Team admins can create recurring meetings" ON "public"."recurring_meetings" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "recurring_meetings"."team_id") AND ("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"public"."member_role")))));



CREATE POLICY "Team admins can delete recurring meetings" ON "public"."recurring_meetings" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "recurring_meetings"."team_id") AND ("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"public"."member_role")))));



CREATE POLICY "Team admins can delete teams" ON "public"."teams" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "teams"."id") AND ("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"public"."member_role")))));



CREATE POLICY "Team admins can manage invitations" ON "public"."invitations" USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "invitations"."team_id") AND ("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"public"."member_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "invitations"."team_id") AND ("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"public"."member_role")))));



CREATE POLICY "Team admins can update recurring meetings" ON "public"."recurring_meetings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "recurring_meetings"."team_id") AND ("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"public"."member_role")))));



CREATE POLICY "Team admins can update teams" ON "public"."teams" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "teams"."id") AND ("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"public"."member_role")))));



CREATE POLICY "Team members and invited users can view recurring meetings" ON "public"."recurring_meetings" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "recurring_meetings"."team_id") AND ("team_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."invitations"
     JOIN "public"."profiles" ON (("profiles"."id" = "auth"."uid"())))
  WHERE (("invitations"."team_id" = "recurring_meetings"."team_id") AND ("invitations"."email" = "profiles"."email") AND ("invitations"."status" = 'pending'::"public"."invitation_status") AND ("invitations"."expires_at" > "now"()))))));



CREATE POLICY "Team members can create comments" ON "public"."comments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."meeting_items" "mi"
     JOIN "public"."weekly_meetings" "wm" ON (("wm"."id" = "mi"."meeting_id")))
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "wm"."team_id")))
  WHERE (("mi"."id" = "comments"."item_id") AND ("tm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Team members can create items" ON "public"."meeting_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."weekly_meetings" "wm"
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "wm"."team_id")))
  WHERE (("wm"."id" = "meeting_items"."meeting_id") AND ("tm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Team members can create meetings" ON "public"."weekly_meetings" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "weekly_meetings"."team_id") AND ("team_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Team members can delete items" ON "public"."meeting_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."weekly_meetings" "wm"
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "wm"."team_id")))
  WHERE (("wm"."id" = "meeting_items"."meeting_id") AND ("tm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Team members can update items" ON "public"."meeting_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."weekly_meetings" "wm"
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "wm"."team_id")))
  WHERE (("wm"."id" = "meeting_items"."meeting_id") AND ("tm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Team members can view comments" ON "public"."comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."meeting_items" "mi"
     JOIN "public"."weekly_meetings" "wm" ON (("wm"."id" = "mi"."meeting_id")))
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "wm"."team_id")))
  WHERE (("mi"."id" = "comments"."item_id") AND ("tm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Team members can view items" ON "public"."meeting_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."weekly_meetings" "wm"
     JOIN "public"."team_members" "tm" ON (("tm"."team_id" = "wm"."team_id")))
  WHERE (("wm"."id" = "meeting_items"."meeting_id") AND ("tm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Team members can view meetings" ON "public"."weekly_meetings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "weekly_meetings"."team_id") AND ("team_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Team members can view team invitations and users can view their" ON "public"."invitations" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "invitations"."team_id") AND ("team_members"."user_id" = "auth"."uid"())))) OR ("email" IN ( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



CREATE POLICY "Team members can view teams" ON "public"."teams" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "teams"."id") AND ("team_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Team members can view topic statuses" ON "public"."topic_status" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."meeting_items" "mi"
     JOIN "public"."weekly_meetings" "wm" ON (("mi"."meeting_id" = "wm"."id")))
     JOIN "public"."team_members" "tm" ON (("wm"."team_id" = "tm"."team_id")))
  WHERE (("mi"."id" = "topic_status"."topic_id") AND ("tm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Topic owners and admins can update status" ON "public"."topic_status" USING ((EXISTS ( SELECT 1
   FROM (("public"."meeting_items" "mi"
     JOIN "public"."weekly_meetings" "wm" ON (("mi"."meeting_id" = "wm"."id")))
     JOIN "public"."team_members" "tm" ON (("wm"."team_id" = "tm"."team_id")))
  WHERE (("mi"."id" = "topic_status"."topic_id") AND ("tm"."user_id" = "auth"."uid"()) AND (("mi"."assigned_to" = "auth"."uid"()) OR ("tm"."role" = 'admin'::"public"."member_role"))))));



CREATE POLICY "Users can accept their invitations" ON "public"."invitations" FOR UPDATE USING (("email" = (( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text"));



CREATE POLICY "Users can create items for their own templates" ON "public"."agenda_template_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."agenda_templates"
  WHERE (("agenda_templates"."id" = "agenda_template_items"."template_id") AND ("agenda_templates"."user_id" = "auth"."uid"()) AND ("agenda_templates"."is_system" = false)))));



CREATE POLICY "Users can create their own templates" ON "public"."agenda_templates" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("is_system" = false)));



CREATE POLICY "Users can delete items of their own templates" ON "public"."agenda_template_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."agenda_templates"
  WHERE (("agenda_templates"."id" = "agenda_template_items"."template_id") AND ("agenda_templates"."user_id" = "auth"."uid"()) AND ("agenda_templates"."is_system" = false)))));



CREATE POLICY "Users can delete their own templates" ON "public"."agenda_templates" FOR DELETE USING ((("auth"."uid"() = "user_id") AND ("is_system" = false)));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update items of their own templates" ON "public"."agenda_template_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."agenda_templates"
  WHERE (("agenda_templates"."id" = "agenda_template_items"."template_id") AND ("agenda_templates"."user_id" = "auth"."uid"()) AND ("agenda_templates"."is_system" = false)))));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own templates" ON "public"."agenda_templates" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND ("is_system" = false)));



CREATE POLICY "Users can view all profiles" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Users can view items of their own templates and system template" ON "public"."agenda_template_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."agenda_templates"
  WHERE (("agenda_templates"."id" = "agenda_template_items"."template_id") AND (("agenda_templates"."user_id" = "auth"."uid"()) OR ("agenda_templates"."is_system" = true))))));



CREATE POLICY "Users can view their own templates and system templates" ON "public"."agenda_templates" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("is_system" = true)));



ALTER TABLE "public"."agenda_template_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agenda_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meeting_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurring_meetings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topic_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_meetings" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






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



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_team_member"("_team_id" "uuid", "_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_team_member"("_team_id" "uuid", "_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_team_member"("_team_id" "uuid", "_user_id" "uuid") TO "service_role";



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



GRANT ALL ON TABLE "public"."meeting_items" TO "anon";
GRANT ALL ON TABLE "public"."meeting_items" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_items" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_meetings" TO "anon";
GRANT ALL ON TABLE "public"."recurring_meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_meetings" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."topic_status" TO "anon";
GRANT ALL ON TABLE "public"."topic_status" TO "authenticated";
GRANT ALL ON TABLE "public"."topic_status" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_meetings" TO "anon";
GRANT ALL ON TABLE "public"."weekly_meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_meetings" TO "service_role";









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































RESET ALL;
