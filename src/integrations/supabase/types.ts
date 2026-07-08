export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      agenda_template_items: {
        Row: {
          created_at: string | null
          duration_minutes: number | null
          id: string
          order_index: number
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          order_index: number
          template_id: string
          title: string
        }
        Update: {
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          order_index?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "agenda_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_system: boolean | null
          name: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      birthday_invites: {
        Row: {
          code: string
          created_at: string | null
          email: string
          email_sent_at: string | null
          id: string
          name: string
          rsvp_status: string | null
          rsvped_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          email: string
          email_sent_at?: string | null
          id?: string
          name: string
          rsvp_status?: string | null
          rsvped_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          email?: string
          email_sent_at?: string | null
          id?: string
          name?: string
          rsvp_status?: string | null
          rsvped_at?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          content: string
          created_at: string | null
          created_by: string
          id: string
          item_id: string
          item_type: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by: string
          id?: string
          item_id: string
          item_type: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string
          id?: string
          item_id?: string
          item_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_comments_created_by_profiles"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commitment_quarters: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          label: string
          start_date: string
          status: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          label: string
          start_date: string
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          label?: string
          start_date?: string
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitment_quarters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitment_quarters_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_agent_feedback: {
        Row: {
          created_at: string
          feedback_type: string
          id: string
          log_id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback_type: string
          id?: string
          log_id: string
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          feedback_type?: string
          id?: string
          log_id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cos_agent_feedback_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "cos_agent_log"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_agent_log: {
        Row: {
          action_id: string | null
          created_at: string
          event_id: string | null
          event_type: string
          id: string
          member_id: string | null
          payload: Json
          user_id: string
        }
        Insert: {
          action_id?: string | null
          created_at?: string
          event_id?: string | null
          event_type: string
          id?: string
          member_id?: string | null
          payload?: Json
          user_id: string
        }
        Update: {
          action_id?: string | null
          created_at?: string
          event_id?: string | null
          event_type?: string
          id?: string
          member_id?: string | null
          payload?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cos_agent_log_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "cos_forgotten_commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_agent_log_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "cos_meeting_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_agent_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cos_one_on_one_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_agent_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_dci_log: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          items_found: number
          items_surfaced: number
          started_at: string
          status: string
          summary: string | null
          trigger_type: string
          user_id: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          items_found?: number
          items_surfaced?: number
          started_at?: string
          status?: string
          summary?: string | null
          trigger_type?: string
          user_id: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          items_found?: number
          items_surfaced?: number
          started_at?: string
          status?: string
          summary?: string | null
          trigger_type?: string
          user_id?: string
        }
        Relationships: []
      }
      cos_dci_logs: {
        Row: {
          brief_generated_at: string | null
          brief_markdown: string | null
          created_at: string
          daily_plan: Json
          data_sources_used: string[] | null
          date: string
          id: string
          notes: string | null
          priority_1: string | null
          priority_1_comment: string | null
          priority_1_status: string | null
          priority_2: string | null
          priority_2_comment: string | null
          priority_2_status: string | null
          priority_3: string | null
          priority_3_comment: string | null
          priority_3_status: string | null
          topic_raised: string | null
          user_id: string
          weekly_obj_1: string | null
          weekly_obj_1_activities: string[] | null
          weekly_obj_1_status: string | null
          weekly_obj_2: string | null
          weekly_obj_2_activities: string[] | null
          weekly_obj_2_status: string | null
          weekly_obj_3: string | null
          weekly_obj_3_activities: string[] | null
          weekly_obj_3_status: string | null
        }
        Insert: {
          brief_generated_at?: string | null
          brief_markdown?: string | null
          created_at?: string
          daily_plan?: Json
          data_sources_used?: string[] | null
          date?: string
          id?: string
          notes?: string | null
          priority_1?: string | null
          priority_1_comment?: string | null
          priority_1_status?: string | null
          priority_2?: string | null
          priority_2_comment?: string | null
          priority_2_status?: string | null
          priority_3?: string | null
          priority_3_comment?: string | null
          priority_3_status?: string | null
          topic_raised?: string | null
          user_id: string
          weekly_obj_1?: string | null
          weekly_obj_1_activities?: string[] | null
          weekly_obj_1_status?: string | null
          weekly_obj_2?: string | null
          weekly_obj_2_activities?: string[] | null
          weekly_obj_2_status?: string | null
          weekly_obj_3?: string | null
          weekly_obj_3_activities?: string[] | null
          weekly_obj_3_status?: string | null
        }
        Update: {
          brief_generated_at?: string | null
          brief_markdown?: string | null
          created_at?: string
          daily_plan?: Json
          data_sources_used?: string[] | null
          date?: string
          id?: string
          notes?: string | null
          priority_1?: string | null
          priority_1_comment?: string | null
          priority_1_status?: string | null
          priority_2?: string | null
          priority_2_comment?: string | null
          priority_2_status?: string | null
          priority_3?: string | null
          priority_3_comment?: string | null
          priority_3_status?: string | null
          topic_raised?: string | null
          user_id?: string
          weekly_obj_1?: string | null
          weekly_obj_1_activities?: string[] | null
          weekly_obj_1_status?: string | null
          weekly_obj_2?: string | null
          weekly_obj_2_activities?: string[] | null
          weekly_obj_2_status?: string | null
          weekly_obj_3?: string | null
          weekly_obj_3_activities?: string[] | null
          weekly_obj_3_status?: string | null
        }
        Relationships: []
      }
      cos_gmail_messages: {
        Row: {
          created_at: string
          gmail_message_id: string
          id: string
          is_from_member: boolean
          message_date: string
          sender_email: string | null
          sender_name: string | null
          snippet: string | null
          subject: string | null
          team_member_id: string | null
          thread_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          gmail_message_id: string
          id?: string
          is_from_member?: boolean
          message_date: string
          sender_email?: string | null
          sender_name?: string | null
          snippet?: string | null
          subject?: string | null
          team_member_id?: string | null
          thread_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          gmail_message_id?: string
          id?: string
          is_from_member?: boolean
          message_date?: string
          sender_email?: string | null
          sender_name?: string | null
          snippet?: string | null
          subject?: string | null
          team_member_id?: string | null
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cos_gmail_messages_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_group_meeting_participants: {
        Row: {
          created_at: string
          email: string | null
          group_meeting_id: string
          id: string
          name: string | null
          team_member_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          group_meeting_id: string
          id?: string
          name?: string | null
          team_member_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          group_meeting_id?: string
          id?: string
          name?: string | null
          team_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cos_group_meeting_participants_group_meeting_id_fkey"
            columns: ["group_meeting_id"]
            isOneToOne: false
            referencedRelation: "cos_group_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_group_meeting_participants_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_group_meeting_sources: {
        Row: {
          created_at: string
          enabled: boolean
          group_meeting_id: string
          id: string
          label: string | null
          origin: string
          ref: string
          source_type: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          group_meeting_id: string
          id?: string
          label?: string | null
          origin?: string
          ref: string
          source_type: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          group_meeting_id?: string
          id?: string
          label?: string | null
          origin?: string
          ref?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cos_group_meeting_sources_group_meeting_id_fkey"
            columns: ["group_meeting_id"]
            isOneToOne: false
            referencedRelation: "cos_group_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_group_meetings: {
        Row: {
          cadence: string | null
          created_at: string
          id: string
          included: boolean
          last_seen_at: string | null
          next_start_at: string | null
          recurrence_key: string
          subject: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cadence?: string | null
          created_at?: string
          id?: string
          included?: boolean
          last_seen_at?: string | null
          next_start_at?: string | null
          recurrence_key: string
          subject?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cadence?: string | null
          created_at?: string
          id?: string
          included?: boolean
          last_seen_at?: string | null
          next_start_at?: string | null
          recurrence_key?: string
          subject?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cos_mcp_integrations: {
        Row: {
          auth_value: string | null
          base_url: string
          config: Json
          created_at: string
          id: string
          integration_key: string
          is_connected: boolean
          last_test_at: string | null
          last_test_error: string | null
          last_test_status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_value?: string | null
          base_url?: string
          config?: Json
          created_at?: string
          id?: string
          integration_key: string
          is_connected?: boolean
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_value?: string | null
          base_url?: string
          config?: Json
          created_at?: string
          id?: string
          integration_key?: string
          is_connected?: boolean
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cos_meeting_actions: {
        Row: {
          completed_at: string | null
          created_at: string
          due_date: string | null
          group_meeting_id: string | null
          id: string
          last_surfaced_at: string | null
          member_id: string | null
          owner: string
          status: string
          surface_count: number
          text: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          group_meeting_id?: string | null
          id?: string
          last_surfaced_at?: string | null
          member_id?: string | null
          owner?: string
          status?: string
          surface_count?: number
          text: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          group_meeting_id?: string | null
          id?: string
          last_surfaced_at?: string | null
          member_id?: string | null
          owner?: string
          status?: string
          surface_count?: number
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cos_meeting_actions_group_meeting_id_fkey"
            columns: ["group_meeting_id"]
            isOneToOne: false
            referencedRelation: "cos_group_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_meeting_actions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_member_quotes: {
        Row: {
          created_at: string
          featured: boolean
          id: string
          quote: string
          said_on: string
          source: string | null
          source_ref: string | null
          team_member_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          featured?: boolean
          id?: string
          quote: string
          said_on: string
          source?: string | null
          source_ref?: string | null
          team_member_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          featured?: boolean
          id?: string
          quote?: string
          said_on?: string
          source?: string | null
          source_ref?: string | null
          team_member_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cos_member_quotes_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_one_on_one_events: {
        Row: {
          attendee_email: string | null
          attendee_emails: string[]
          attendee_name: string | null
          calendar_id: string
          created_at: string
          description: string | null
          end_time: string
          google_event_id: string
          id: string
          inferred_category: string
          last_synced_at: string
          location: string | null
          recurring_event_id: string | null
          start_time: string
          status: string
          team_member_id: string | null
          title: string | null
          updated_at: string
          user_id: string
          zoom_meeting_id: string | null
        }
        Insert: {
          attendee_email?: string | null
          attendee_emails?: string[]
          attendee_name?: string | null
          calendar_id?: string
          created_at?: string
          description?: string | null
          end_time: string
          google_event_id: string
          id?: string
          inferred_category?: string
          last_synced_at?: string
          location?: string | null
          recurring_event_id?: string | null
          start_time: string
          status?: string
          team_member_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          zoom_meeting_id?: string | null
        }
        Update: {
          attendee_email?: string | null
          attendee_emails?: string[]
          attendee_name?: string | null
          calendar_id?: string
          created_at?: string
          description?: string | null
          end_time?: string
          google_event_id?: string
          id?: string
          inferred_category?: string
          last_synced_at?: string
          location?: string | null
          recurring_event_id?: string | null
          start_time?: string
          status?: string
          team_member_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          zoom_meeting_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cos_one_on_one_events_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_one_on_one_prep: {
        Row: {
          content: string
          created_at: string
          data_sources_used: string[]
          event_id: string | null
          generated_at: string
          group_meeting_id: string | null
          id: string
          prep_date: string
          source: string
          status: string
          team_member_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          data_sources_used?: string[]
          event_id?: string | null
          generated_at?: string
          group_meeting_id?: string | null
          id?: string
          prep_date?: string
          source: string
          status?: string
          team_member_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          data_sources_used?: string[]
          event_id?: string | null
          generated_at?: string
          group_meeting_id?: string | null
          id?: string
          prep_date?: string
          source?: string
          status?: string
          team_member_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cos_one_on_one_prep_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cos_one_on_one_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_one_on_one_prep_group_meeting_id_fkey"
            columns: ["group_meeting_id"]
            isOneToOne: false
            referencedRelation: "cos_group_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_one_on_one_prep_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_person_accountabilities: {
        Row: {
          created_at: string
          id: string
          member_id: string
          sort_order: number
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          sort_order?: number
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          sort_order?: number
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cos_person_accountabilities_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_person_topics: {
        Row: {
          created_at: string
          flagged: boolean
          id: string
          member_id: string
          sort_order: number
          status: string | null
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          flagged?: boolean
          id?: string
          member_id: string
          sort_order?: number
          status?: string | null
          text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          flagged?: boolean
          id?: string
          member_id?: string
          sort_order?: number
          status?: string | null
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cos_person_topics_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_prep_batch_log: {
        Row: {
          created_at: string
          errors: Json
          finished_at: string | null
          id: string
          meetings_found: number
          meetings_qualified: number
          preps_cached: number
          preps_generated: number
          slack_messages: number | null
          slack_synced: boolean
          started_at: string
          status: string
          summary: string | null
          trigger_type: string
          user_id: string
          zoom_recordings: number | null
          zoom_synced: boolean
        }
        Insert: {
          created_at?: string
          errors?: Json
          finished_at?: string | null
          id?: string
          meetings_found?: number
          meetings_qualified?: number
          preps_cached?: number
          preps_generated?: number
          slack_messages?: number | null
          slack_synced?: boolean
          started_at?: string
          status?: string
          summary?: string | null
          trigger_type?: string
          user_id: string
          zoom_recordings?: number | null
          zoom_synced?: boolean
        }
        Update: {
          created_at?: string
          errors?: Json
          finished_at?: string | null
          id?: string
          meetings_found?: number
          meetings_qualified?: number
          preps_cached?: number
          preps_generated?: number
          slack_messages?: number | null
          slack_synced?: boolean
          started_at?: string
          status?: string
          summary?: string | null
          trigger_type?: string
          user_id?: string
          zoom_recordings?: number | null
          zoom_synced?: boolean
        }
        Relationships: []
      }
      cos_prep_schedule: {
        Row: {
          always_include: string[]
          created_at: string
          dci_enabled: boolean
          dci_instructions: string | null
          dci_last_run_at: string | null
          dci_last_run_status: string | null
          dci_run_hour_local: number | null
          dci_slack_dm: boolean
          dci_sources: string[]
          dci_timezone: string | null
          enabled: boolean
          enrich_stackone: boolean
          included_group_series: string[]
          last_run_at: string | null
          last_run_preps_generated: number | null
          last_run_status: string | null
          max_others_after_exclude: number
          prep_tools: string[]
          run_hour_local: number
          run_hour_utc: number
          slack_channels: string[]
          slack_user_id: string | null
          sync_slack_before: boolean
          sync_zoom_before: boolean
          timezone: string
          tool_tiers: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          always_include?: string[]
          created_at?: string
          dci_enabled?: boolean
          dci_instructions?: string | null
          dci_last_run_at?: string | null
          dci_last_run_status?: string | null
          dci_run_hour_local?: number | null
          dci_slack_dm?: boolean
          dci_sources?: string[]
          dci_timezone?: string | null
          enabled?: boolean
          enrich_stackone?: boolean
          included_group_series?: string[]
          last_run_at?: string | null
          last_run_preps_generated?: number | null
          last_run_status?: string | null
          max_others_after_exclude?: number
          prep_tools?: string[]
          run_hour_local?: number
          run_hour_utc?: number
          slack_channels?: string[]
          slack_user_id?: string | null
          sync_slack_before?: boolean
          sync_zoom_before?: boolean
          timezone?: string
          tool_tiers?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          always_include?: string[]
          created_at?: string
          dci_enabled?: boolean
          dci_instructions?: string | null
          dci_last_run_at?: string | null
          dci_last_run_status?: string | null
          dci_run_hour_local?: number | null
          dci_slack_dm?: boolean
          dci_sources?: string[]
          dci_timezone?: string | null
          enabled?: boolean
          enrich_stackone?: boolean
          included_group_series?: string[]
          last_run_at?: string | null
          last_run_preps_generated?: number | null
          last_run_status?: string | null
          max_others_after_exclude?: number
          prep_tools?: string[]
          run_hour_local?: number
          run_hour_utc?: number
          slack_channels?: string[]
          slack_user_id?: string | null
          sync_slack_before?: boolean
          sync_zoom_before?: boolean
          timezone?: string
          tool_tiers?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cos_prep_settings: {
        Row: {
          id: string
          prep_instructions: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          prep_instructions?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          prep_instructions?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cos_prep_topic_mentions: {
        Row: {
          created_at: string
          id: string
          prep_id: string
          snippet: string | null
          topic_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          prep_id: string
          snippet?: string | null
          topic_id: string
        }
        Update: {
          created_at?: string
          id?: string
          prep_id?: string
          snippet?: string | null
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cos_prep_topic_mentions_prep_id_fkey"
            columns: ["prep_id"]
            isOneToOne: false
            referencedRelation: "cos_one_on_one_prep"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_prep_topic_mentions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "cos_relationship_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_priorities: {
        Row: {
          archived_at: string | null
          category: string
          created_at: string
          done_at: string | null
          flagged: boolean
          id: string
          notes: string | null
          status: string | null
          text: string
          tier_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          category: string
          created_at?: string
          done_at?: string | null
          flagged?: boolean
          id?: string
          notes?: string | null
          status?: string | null
          text: string
          tier_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          category?: string
          created_at?: string
          done_at?: string | null
          flagged?: boolean
          id?: string
          notes?: string | null
          status?: string | null
          text?: string
          tier_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cos_relationship_topics: {
        Row: {
          category: string
          context_snippet: string | null
          created_at: string
          first_mentioned_at: string
          group_meeting_id: string | null
          id: string
          last_mentioned_at: string
          mention_count: number
          prep_id: string | null
          resolved_at: string | null
          sentiment: string
          status: string
          team_member_id: string
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          context_snippet?: string | null
          created_at?: string
          first_mentioned_at?: string
          group_meeting_id?: string | null
          id?: string
          last_mentioned_at?: string
          mention_count?: number
          prep_id?: string | null
          resolved_at?: string | null
          sentiment?: string
          status?: string
          team_member_id: string
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          context_snippet?: string | null
          created_at?: string
          first_mentioned_at?: string
          group_meeting_id?: string | null
          id?: string
          last_mentioned_at?: string
          mention_count?: number
          prep_id?: string | null
          resolved_at?: string | null
          sentiment?: string
          status?: string
          team_member_id?: string
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cos_relationship_topics_group_meeting_id_fkey"
            columns: ["group_meeting_id"]
            isOneToOne: false
            referencedRelation: "cos_group_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_relationship_topics_prep_id_fkey"
            columns: ["prep_id"]
            isOneToOne: false
            referencedRelation: "cos_one_on_one_prep"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cos_relationship_topics_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_settings: {
        Row: {
          agent_config: Json
          calendar_sync_rules: Json
          col1_sections: Json | null
          col2_sections: Json | null
          col3_label: string | null
          layout_config: Json | null
          notification_preferences: Json
          onboarding_completed: Json
          status_options: Json
          tab_labels: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_config?: Json
          calendar_sync_rules?: Json
          col1_sections?: Json | null
          col2_sections?: Json | null
          col3_label?: string | null
          layout_config?: Json | null
          notification_preferences?: Json
          onboarding_completed?: Json
          status_options?: Json
          tab_labels?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_config?: Json
          calendar_sync_rules?: Json
          col1_sections?: Json | null
          col2_sections?: Json | null
          col3_label?: string | null
          layout_config?: Json | null
          notification_preferences?: Json
          onboarding_completed?: Json
          status_options?: Json
          tab_labels?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cos_slack_messages: {
        Row: {
          channel_id: string
          channel_name: string | null
          content: string
          created_at: string
          id: string
          is_dm: boolean
          message_date: string
          message_ts: string
          sender_name: string | null
          sender_slack_id: string | null
          team_member_id: string | null
          thread_ts: string | null
          user_id: string
        }
        Insert: {
          channel_id: string
          channel_name?: string | null
          content: string
          created_at?: string
          id?: string
          is_dm?: boolean
          message_date: string
          message_ts: string
          sender_name?: string | null
          sender_slack_id?: string | null
          team_member_id?: string | null
          thread_ts?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string
          channel_name?: string | null
          content?: string
          created_at?: string
          id?: string
          is_dm?: boolean
          message_date?: string
          message_ts?: string
          sender_name?: string | null
          sender_slack_id?: string | null
          team_member_id?: string | null
          thread_ts?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cos_slack_messages_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_team_members: {
        Row: {
          agent_overrides: Json
          context_notes: string | null
          created_at: string
          email: string | null
          health_score_updated_at: string | null
          id: string
          last_1on1_date: string | null
          name: string
          relationship_health_score: number | null
          relationship_type: string
          reports_to_id: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_overrides?: Json
          context_notes?: string | null
          created_at?: string
          email?: string | null
          health_score_updated_at?: string | null
          id?: string
          last_1on1_date?: string | null
          name: string
          relationship_health_score?: number | null
          relationship_type: string
          reports_to_id?: string | null
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_overrides?: Json
          context_notes?: string | null
          created_at?: string
          email?: string | null
          health_score_updated_at?: string | null
          id?: string
          last_1on1_date?: string | null
          name?: string
          relationship_health_score?: number | null
          relationship_type?: string
          reports_to_id?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cos_team_members_reports_to_id_fkey"
            columns: ["reports_to_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_weekend_vibes: {
        Row: {
          art_style: string | null
          created_at: string | null
          friday_prompt: string | null
          id: string
          image_url: string | null
          monday_reflection: string | null
          updated_at: string | null
          user_id: string
          week_of: string
        }
        Insert: {
          art_style?: string | null
          created_at?: string | null
          friday_prompt?: string | null
          id?: string
          image_url?: string | null
          monday_reflection?: string | null
          updated_at?: string | null
          user_id: string
          week_of: string
        }
        Update: {
          art_style?: string | null
          created_at?: string | null
          friday_prompt?: string | null
          id?: string
          image_url?: string | null
          monday_reflection?: string | null
          updated_at?: string | null
          user_id?: string
          week_of?: string
        }
        Relationships: []
      }
      cos_zoom_recordings: {
        Row: {
          ai_summary: string | null
          created_at: string
          duration_minutes: number | null
          has_transcript: boolean
          id: string
          last_synced_at: string
          participant_emails: string[]
          participant_names: string[]
          recording_files: Json
          start_time: string
          team_member_id: string | null
          topic: string | null
          updated_at: string
          user_id: string
          zoom_meeting_id: string
          zoom_meeting_uuid: string
        }
        Insert: {
          ai_summary?: string | null
          created_at?: string
          duration_minutes?: number | null
          has_transcript?: boolean
          id?: string
          last_synced_at?: string
          participant_emails?: string[]
          participant_names?: string[]
          recording_files?: Json
          start_time: string
          team_member_id?: string | null
          topic?: string | null
          updated_at?: string
          user_id: string
          zoom_meeting_id: string
          zoom_meeting_uuid: string
        }
        Update: {
          ai_summary?: string | null
          created_at?: string
          duration_minutes?: number | null
          has_transcript?: boolean
          id?: string
          last_synced_at?: string
          participant_emails?: string[]
          participant_names?: string[]
          recording_files?: Json
          start_time?: string
          team_member_id?: string | null
          topic?: string | null
          updated_at?: string
          user_id?: string
          zoom_meeting_id?: string
          zoom_meeting_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "cos_zoom_recordings_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      cos_zoom_transcripts: {
        Row: {
          content: string
          content_type: string
          fetched_at: string
          id: string
          quotes_extracted_at: string | null
          recording_id: string
          suggestions_extracted_at: string | null
          user_id: string
          word_count: number | null
        }
        Insert: {
          content: string
          content_type?: string
          fetched_at?: string
          id?: string
          quotes_extracted_at?: string | null
          recording_id: string
          suggestions_extracted_at?: string | null
          user_id: string
          word_count?: number | null
        }
        Update: {
          content?: string
          content_type?: string
          fetched_at?: string
          id?: string
          quotes_extracted_at?: string | null
          recording_id?: string
          suggestions_extracted_at?: string | null
          user_id?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cos_zoom_transcripts_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: true
            referencedRelation: "cos_zoom_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      dci_meeting_schedule: {
        Row: {
          action_items_extracted: boolean
          attendees: string[]
          created_at: string
          date: string
          end_time: string
          id: string
          start_time: string
          title: string
          transcript_checked: boolean
          updated_at: string
          user_id: string
          zoom_meeting_id: string | null
        }
        Insert: {
          action_items_extracted?: boolean
          attendees?: string[]
          created_at?: string
          date?: string
          end_time: string
          id?: string
          start_time: string
          title: string
          transcript_checked?: boolean
          updated_at?: string
          user_id: string
          zoom_meeting_id?: string | null
        }
        Update: {
          action_items_extracted?: boolean
          attendees?: string[]
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          start_time?: string
          title?: string
          transcript_checked?: boolean
          updated_at?: string
          user_id?: string
          zoom_meeting_id?: string | null
        }
        Relationships: []
      }
      dci_suggested_tasks: {
        Row: {
          created_at: string
          date: string
          id: string
          member_id: string | null
          rationale: string | null
          raw_context: string | null
          recording_id: string | null
          source: string | null
          source_type: string | null
          status: string
          suggested_category: string | null
          title: string
          updated_at: string
          urgency: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          member_id?: string | null
          rationale?: string | null
          raw_context?: string | null
          recording_id?: string | null
          source?: string | null
          source_type?: string | null
          status?: string
          suggested_category?: string | null
          title: string
          updated_at?: string
          urgency?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          member_id?: string | null
          rationale?: string | null
          raw_context?: string | null
          recording_id?: string | null
          source?: string | null
          source_type?: string | null
          status?: string
          suggested_category?: string | null
          title?: string
          updated_at?: string
          urgency?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dci_suggested_tasks_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dci_suggested_tasks_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "cos_zoom_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_permissions: {
        Row: {
          created_at: string | null
          feature_key: string
          id: string
          is_enabled: boolean
          role_tag: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          feature_key: string
          id?: string
          is_enabled?: boolean
          role_tag: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          feature_key?: string
          id?: string
          is_enabled?: boolean
          role_tag?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      inbox_delegations: {
        Row: {
          agent_log: Json
          answers: Json
          approval_summary: string | null
          created_at: string
          current_question: Json | null
          id: string
          item_id: string
          plan: string | null
          result: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_log?: Json
          answers?: Json
          approval_summary?: string | null
          created_at?: string
          current_question?: Json | null
          id?: string
          item_id: string
          plan?: string | null
          result?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_log?: Json
          answers?: Json
          approval_summary?: string | null
          created_at?: string
          current_question?: Json | null
          id?: string
          item_id?: string
          plan?: string | null
          result?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_delegations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inbox_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_item_tags: {
        Row: {
          item_id: string
          tag_id: string
        }
        Insert: {
          item_id: string
          tag_id: string
        }
        Update: {
          item_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_item_tags_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inbox_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "inbox_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_items: {
        Row: {
          agent_payload: Json | null
          archived_at: string | null
          body: string | null
          bucket: string | null
          created_at: string
          done_at: string | null
          id: string
          pinned: boolean
          snoozed_until: string | null
          sort_order: number
          source_ref: Json | null
          status: string
          text: string
          type: string
          updated_at: string
          user_id: string
          workflow_status: string | null
        }
        Insert: {
          agent_payload?: Json | null
          archived_at?: string | null
          body?: string | null
          bucket?: string | null
          created_at?: string
          done_at?: string | null
          id?: string
          pinned?: boolean
          snoozed_until?: string | null
          sort_order?: number
          source_ref?: Json | null
          status?: string
          text?: string
          type?: string
          updated_at?: string
          user_id: string
          workflow_status?: string | null
        }
        Update: {
          agent_payload?: Json | null
          archived_at?: string | null
          body?: string | null
          bucket?: string | null
          created_at?: string
          done_at?: string | null
          id?: string
          pinned?: boolean
          snoozed_until?: string | null
          sort_order?: number
          source_ref?: Json | null
          status?: string
          text?: string
          type?: string
          updated_at?: string
          user_id?: string
          workflow_status?: string | null
        }
        Relationships: []
      }
      inbox_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          member_id: string | null
          name: string
          parent_id: string | null
          sort_order: number
          type: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          member_id?: string | null
          name: string
          parent_id?: string | null
          sort_order?: number
          type: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          member_id?: string | null
          name?: string
          parent_id?: string | null
          sort_order?: number
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_tags_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_tags_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "inbox_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_views: {
        Row: {
          created_at: string
          filter_json: Json
          id: string
          is_starred: boolean
          name: string
          sort_json: Json
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          filter_json?: Json
          id?: string
          is_starred?: boolean
          name: string
          sort_json?: Json
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          filter_json?: Json
          id?: string
          is_starred?: boolean
          name?: string
          sort_json?: Json
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invite_code: string | null
          invited_by: string | null
          role: string
          status: Database["public"]["Enums"]["invitation_status"] | null
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invite_code?: string | null
          invited_by?: string | null
          role?: string
          status?: Database["public"]["Enums"]["invitation_status"] | null
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invite_code?: string | null
          invited_by?: string | null
          role?: string
          status?: Database["public"]["Enums"]["invitation_status"] | null
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_instance_priorities: {
        Row: {
          activities: string
          assigned_to: string | null
          completion_status: Database["public"]["Enums"]["completion_status_enum"]
          created_at: string | null
          created_by: string
          id: string
          instance_id: string
          order_index: number
          outcome: string
          title: string
          updated_at: string | null
        }
        Insert: {
          activities: string
          assigned_to?: string | null
          completion_status?: Database["public"]["Enums"]["completion_status_enum"]
          created_at?: string | null
          created_by: string
          id?: string
          instance_id: string
          order_index: number
          outcome: string
          title: string
          updated_at?: string | null
        }
        Update: {
          activities?: string
          assigned_to?: string | null
          completion_status?: Database["public"]["Enums"]["completion_status_enum"]
          created_at?: string | null
          created_by?: string
          id?: string
          instance_id?: string
          order_index?: number
          outcome?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_meeting_instance_priorities_assigned_to"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_meeting_instance_priorities_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_instance_priorities_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "meeting_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_instance_topics: {
        Row: {
          assigned_to: string | null
          completion_status: Database["public"]["Enums"]["completion_status_enum"]
          created_at: string | null
          created_by: string
          id: string
          instance_id: string
          notes: string | null
          order_index: number
          time_minutes: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          completion_status?: Database["public"]["Enums"]["completion_status_enum"]
          created_at?: string | null
          created_by: string
          id?: string
          instance_id: string
          notes?: string | null
          order_index: number
          time_minutes?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          completion_status?: Database["public"]["Enums"]["completion_status_enum"]
          created_at?: string | null
          created_by?: string
          id?: string
          instance_id?: string
          notes?: string | null
          order_index?: number
          time_minutes?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_meeting_instance_topics_assigned_to"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_meeting_instance_topics_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_instance_topics_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "meeting_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_instances: {
        Row: {
          created_at: string | null
          id: string
          series_id: string
          start_date: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          series_id: string
          start_date: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          series_id?: string
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_instances_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "meeting_series"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_series: {
        Row: {
          created_at: string | null
          created_by: string
          frequency: string
          id: string
          name: string
          parking_lot: string | null
          team_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          frequency: string
          id?: string
          name: string
          parking_lot?: string | null
          team_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          frequency?: string
          id?: string
          name?: string
          parking_lot?: string | null
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_series_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_series_action_items: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          completion_status: Database["public"]["Enums"]["completion_status_enum"]
          created_at: string | null
          created_by: string
          due_date: string | null
          id: string
          notes: string | null
          order_index: number
          series_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completion_status?: Database["public"]["Enums"]["completion_status_enum"]
          created_at?: string | null
          created_by: string
          due_date?: string | null
          id?: string
          notes?: string | null
          order_index: number
          series_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completion_status?: Database["public"]["Enums"]["completion_status_enum"]
          created_at?: string | null
          created_by?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          order_index?: number
          series_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_meeting_series_action_items_assigned_to"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_meeting_series_action_items_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_series_action_items_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "meeting_series"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_series_agenda: {
        Row: {
          assigned_to: string | null
          completion_status: string | null
          created_at: string | null
          created_by: string
          id: string
          notes: string | null
          order_index: number
          series_id: string
          time_minutes: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          completion_status?: string | null
          created_at?: string | null
          created_by: string
          id?: string
          notes?: string | null
          order_index: number
          series_id: string
          time_minutes?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          completion_status?: string | null
          created_at?: string | null
          created_by?: string
          id?: string
          notes?: string | null
          order_index?: number
          series_id?: string
          time_minutes?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_meeting_series_agenda_assigned_to"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_meeting_series_agenda_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_series_agenda_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "meeting_series"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_commitments: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          flagged: boolean
          id: string
          month_number: number
          quarter_id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          flagged?: boolean
          id?: string
          month_number: number
          quarter_id: string
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          flagged?: boolean
          id?: string
          month_number?: number
          quarter_id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_commitments_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "commitment_quarters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_commitments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prep_generation_log: {
        Row: {
          created_at: string
          data_sources_used: string[]
          duration_ms: number | null
          error_message: string | null
          group_meeting_id: string | null
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          prep_id: string | null
          team_member_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          data_sources_used?: string[]
          duration_ms?: number | null
          error_message?: string | null
          group_meeting_id?: string | null
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          prep_id?: string | null
          team_member_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          data_sources_used?: string[]
          duration_ms?: number | null
          error_message?: string | null
          group_meeting_id?: string | null
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          prep_id?: string | null
          team_member_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prep_generation_log_group_meeting_id_fkey"
            columns: ["group_meeting_id"]
            isOneToOne: false
            referencedRelation: "cos_group_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_generation_log_prep_id_fkey"
            columns: ["prep_id"]
            isOneToOne: false
            referencedRelation: "cos_one_on_one_prep"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_generation_log_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      priority_categorizations: {
        Row: {
          category: string
          created_at: string
          id: string
          item_id: string
          item_type: string
          quarter_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          item_id: string
          item_type: string
          quarter_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          item_id?: string
          item_type?: string
          quarter_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "priority_categorizations_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "commitment_quarters"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_name: string | null
          avatar_url: string | null
          birthday: string | null
          blue_percentage: number | null
          created_at: string | null
          department: string | null
          email: string
          first_name: string | null
          full_name: string
          green_percentage: number | null
          id: string
          is_admin: boolean | null
          is_rcdo_admin: boolean | null
          is_super_admin: boolean | null
          last_name: string | null
          manager_email: string | null
          red_percentage: number | null
          role_tags: string[] | null
          updated_at: string | null
          yellow_percentage: number | null
        }
        Insert: {
          avatar_name?: string | null
          avatar_url?: string | null
          birthday?: string | null
          blue_percentage?: number | null
          created_at?: string | null
          department?: string | null
          email: string
          first_name?: string | null
          full_name: string
          green_percentage?: number | null
          id: string
          is_admin?: boolean | null
          is_rcdo_admin?: boolean | null
          is_super_admin?: boolean | null
          last_name?: string | null
          manager_email?: string | null
          red_percentage?: number | null
          role_tags?: string[] | null
          updated_at?: string | null
          yellow_percentage?: number | null
        }
        Update: {
          avatar_name?: string | null
          avatar_url?: string | null
          birthday?: string | null
          blue_percentage?: number | null
          created_at?: string | null
          department?: string | null
          email?: string
          first_name?: string | null
          full_name?: string
          green_percentage?: number | null
          id?: string
          is_admin?: boolean | null
          is_rcdo_admin?: boolean | null
          is_super_admin?: boolean | null
          last_name?: string | null
          manager_email?: string | null
          red_percentage?: number | null
          role_tags?: string[] | null
          updated_at?: string | null
          yellow_percentage?: number | null
        }
        Relationships: []
      }
      quarterly_priorities: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          flagged: boolean
          id: string
          quarter_id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          flagged?: boolean
          id?: string
          quarter_id: string
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          flagged?: boolean
          id?: string
          quarter_id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_priorities_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "commitment_quarters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_priorities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rc_canvas_states: {
        Row: {
          created_at: string
          edges: Json
          nodes: Json
          room: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          edges?: Json
          nodes?: Json
          room: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          edges?: Json
          nodes?: Json
          room?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      rc_checkins: {
        Row: {
          blockers: string | null
          created_at: string | null
          created_by: string
          date: string
          id: string
          next_steps: string | null
          parent_id: string
          parent_type: string
          percent_to_goal: number | null
          sentiment: number | null
          summary: string | null
          updated_at: string | null
        }
        Insert: {
          blockers?: string | null
          created_at?: string | null
          created_by: string
          date?: string
          id?: string
          next_steps?: string | null
          parent_id: string
          parent_type: string
          percent_to_goal?: number | null
          sentiment?: number | null
          summary?: string | null
          updated_at?: string | null
        }
        Update: {
          blockers?: string | null
          created_at?: string | null
          created_by?: string
          date?: string
          id?: string
          next_steps?: string | null
          parent_id?: string
          parent_type?: string
          percent_to_goal?: number | null
          sentiment?: number | null
          summary?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rc_checkins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rc_cycles: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string
          end_date: string
          id: string
          start_date: string
          status: string
          team_id: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by: string
          end_date: string
          id?: string
          start_date: string
          status?: string
          team_id?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string
          end_date?: string
          id?: string
          start_date?: string
          status?: string
          team_id?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rc_cycles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rc_defining_objectives: {
        Row: {
          confidence_pct: number | null
          created_at: string | null
          created_by: string | null
          display_order: number | null
          end_date: string | null
          health: string | null
          hypothesis: string | null
          id: string
          last_health_calc_at: string | null
          locked_at: string | null
          locked_by: string | null
          owner_user_id: string
          rallying_cry_id: string
          start_date: string | null
          status: string
          title: string
          updated_at: string | null
          weight_pct: number | null
        }
        Insert: {
          confidence_pct?: number | null
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          end_date?: string | null
          health?: string | null
          hypothesis?: string | null
          id?: string
          last_health_calc_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          owner_user_id: string
          rallying_cry_id: string
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string | null
          weight_pct?: number | null
        }
        Update: {
          confidence_pct?: number | null
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          end_date?: string | null
          health?: string | null
          hypothesis?: string | null
          id?: string
          last_health_calc_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          owner_user_id?: string
          rallying_cry_id?: string
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          weight_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rc_defining_objectives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_defining_objectives_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_defining_objectives_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_defining_objectives_rallying_cry_id_fkey"
            columns: ["rallying_cry_id"]
            isOneToOne: false
            referencedRelation: "rc_rallying_cries"
            referencedColumns: ["id"]
          },
        ]
      }
      rc_do_metrics: {
        Row: {
          created_at: string | null
          current_numeric: number | null
          defining_objective_id: string
          direction: string
          display_order: number | null
          id: string
          last_updated_at: string | null
          name: string
          source: string | null
          target_numeric: number | null
          type: string
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_numeric?: number | null
          defining_objective_id: string
          direction: string
          display_order?: number | null
          id?: string
          last_updated_at?: string | null
          name: string
          source?: string | null
          target_numeric?: number | null
          type: string
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_numeric?: number | null
          defining_objective_id?: string
          direction?: string
          display_order?: number | null
          id?: string
          last_updated_at?: string | null
          name?: string
          source?: string | null
          target_numeric?: number | null
          type?: string
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rc_do_metrics_defining_objective_id_fkey"
            columns: ["defining_objective_id"]
            isOneToOne: false
            referencedRelation: "rc_defining_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      rc_links: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          kind: string
          parent_id: string
          parent_type: string
          ref_id: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          kind: string
          parent_id: string
          parent_type: string
          ref_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          kind?: string
          parent_id?: string
          parent_type?: string
          ref_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rc_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rc_rallying_cries: {
        Row: {
          created_at: string | null
          cycle_id: string
          id: string
          locked_at: string | null
          locked_by: string | null
          narrative: string | null
          owner_user_id: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          cycle_id: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          narrative?: string | null
          owner_user_id: string
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          cycle_id?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          narrative?: string | null
          owner_user_id?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rc_rallying_cries_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: true
            referencedRelation: "rc_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_rallying_cries_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_rallying_cries_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rc_strategic_initiatives: {
        Row: {
          accepts_sub_sis: boolean
          benchmark: string | null
          created_at: string | null
          created_by: string | null
          defining_objective_id: string
          description: string | null
          display_order: number | null
          end_date: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          owner_user_id: string | null
          parent_si_id: string | null
          participant_user_ids: string[] | null
          primary_success_metric: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          accepts_sub_sis?: boolean
          benchmark?: string | null
          created_at?: string | null
          created_by?: string | null
          defining_objective_id: string
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          owner_user_id?: string | null
          parent_si_id?: string | null
          participant_user_ids?: string[] | null
          primary_success_metric?: string | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          accepts_sub_sis?: boolean
          benchmark?: string | null
          created_at?: string | null
          created_by?: string | null
          defining_objective_id?: string
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          owner_user_id?: string | null
          parent_si_id?: string | null
          participant_user_ids?: string[] | null
          primary_success_metric?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rc_strategic_initiatives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_strategic_initiatives_defining_objective_id_fkey"
            columns: ["defining_objective_id"]
            isOneToOne: false
            referencedRelation: "rc_defining_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_strategic_initiatives_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_strategic_initiatives_parent_si_id_fkey"
            columns: ["parent_si_id"]
            isOneToOne: false
            referencedRelation: "rc_strategic_initiatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_strategic_initiatives_parent_si_id_fkey"
            columns: ["parent_si_id"]
            isOneToOne: false
            referencedRelation: "rc_top_level_strategic_initiatives"
            referencedColumns: ["id"]
          },
        ]
      }
      rc_tasks: {
        Row: {
          actual_delivery_date: string | null
          completion_criteria: string | null
          created_at: string | null
          created_by: string
          display_order: number | null
          id: string
          notes: string | null
          owner_user_id: string | null
          start_date: string | null
          status: string
          strategic_initiative_id: string
          target_delivery_date: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          actual_delivery_date?: string | null
          completion_criteria?: string | null
          created_at?: string | null
          created_by: string
          display_order?: number | null
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          start_date?: string | null
          status?: string
          strategic_initiative_id: string
          target_delivery_date?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          actual_delivery_date?: string | null
          completion_criteria?: string | null
          created_at?: string | null
          created_by?: string
          display_order?: number | null
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          start_date?: string | null
          status?: string
          strategic_initiative_id?: string
          target_delivery_date?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_rc_tasks_created_by_profiles"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_rc_tasks_owner_user_id_profiles"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_tasks_strategic_initiative_id_fkey"
            columns: ["strategic_initiative_id"]
            isOneToOne: false
            referencedRelation: "rc_strategic_initiatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_tasks_strategic_initiative_id_fkey"
            columns: ["strategic_initiative_id"]
            isOneToOne: false
            referencedRelation: "rc_top_level_strategic_initiatives"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_meetings: {
        Row: {
          created_at: string | null
          created_by: string | null
          frequency: Database["public"]["Enums"]["meeting_frequency"]
          id: string
          name: string
          team_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          frequency?: Database["public"]["Enums"]["meeting_frequency"]
          id?: string
          name: string
          team_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          frequency?: Database["public"]["Enums"]["meeting_frequency"]
          id?: string
          name?: string
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_meetings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string | null
          custom_avatar_url: string | null
          id: string
          role: Database["public"]["Enums"]["member_role"]
          team_id: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          custom_avatar_url?: string | null
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          team_id?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          custom_avatar_url?: string | null
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          team_id?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_team_members_user_id_profiles"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_reporting_lines: {
        Row: {
          created_at: string
          id: string
          manager_id: string
          report_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          manager_id: string
          report_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          manager_id?: string
          report_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_reporting_lines_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_reporting_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_reporting_lines_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          abbreviated_name: string | null
          created_at: string | null
          created_by: string | null
          frequency: Database["public"]["Enums"]["meeting_frequency"] | null
          id: string
          invite_code: string
          name: string
          standing_agenda_items: Json | null
          updated_at: string | null
        }
        Insert: {
          abbreviated_name?: string | null
          created_at?: string | null
          created_by?: string | null
          frequency?: Database["public"]["Enums"]["meeting_frequency"] | null
          id?: string
          invite_code?: string
          name: string
          standing_agenda_items?: Json | null
          updated_at?: string | null
        }
        Update: {
          abbreviated_name?: string | null
          created_at?: string | null
          created_by?: string | null
          frequency?: Database["public"]["Enums"]["meeting_frequency"] | null
          id?: string
          invite_code?: string
          name?: string
          standing_agenda_items?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      topic_status: {
        Row: {
          created_at: string | null
          id: string
          status: string
          topic_id: string
          updated_at: string | null
          updated_by: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          status: string
          topic_id: string
          updated_at?: string | null
          updated_by: string
        }
        Update: {
          created_at?: string | null
          id?: string
          status?: string
          topic_id?: string
          updated_at?: string | null
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_status_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_calendar_credentials: {
        Row: {
          access_token: string | null
          auto_sync_enabled: boolean
          auto_sync_midday_hour_utc: number
          auto_sync_morning_hour_utc: number
          created_at: string
          expires_at: string | null
          last_sync_at: string | null
          last_sync_status: string | null
          provider: string
          refresh_token: string
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          auto_sync_enabled?: boolean
          auto_sync_midday_hour_utc?: number
          auto_sync_morning_hour_utc?: number
          created_at?: string
          expires_at?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider?: string
          refresh_token: string
          scope: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          auto_sync_enabled?: boolean
          auto_sync_midday_hour_utc?: number
          auto_sync_morning_hour_utc?: number
          created_at?: string
          expires_at?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider?: string
          refresh_token?: string
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_data_source_configs: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          source_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          source_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          source_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_slack_credentials: {
        Row: {
          access_token: string
          created_at: string
          last_sync_at: string | null
          last_sync_status: string | null
          provider: string
          scope: string
          slack_email: string | null
          slack_team_id: string | null
          slack_team_name: string | null
          slack_user_id: string | null
          sync_channels: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider?: string
          scope: string
          slack_email?: string | null
          slack_team_id?: string | null
          slack_team_name?: string | null
          slack_user_id?: string | null
          sync_channels?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider?: string
          scope?: string
          slack_email?: string | null
          slack_team_id?: string | null
          slack_team_name?: string | null
          slack_user_id?: string | null
          sync_channels?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_zoom_credentials: {
        Row: {
          access_token: string | null
          created_at: string
          expires_at: string | null
          last_sync_at: string | null
          last_sync_status: string | null
          provider: string
          refresh_token: string
          scope: string
          updated_at: string
          user_id: string
          zoom_email: string | null
          zoom_user_id: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider?: string
          refresh_token: string
          scope: string
          updated_at?: string
          user_id: string
          zoom_email?: string | null
          zoom_user_id?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider?: string
          refresh_token?: string
          scope?: string
          updated_at?: string
          user_id?: string
          zoom_email?: string | null
          zoom_user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      cos_forgotten_commitments: {
        Row: {
          created_at: string | null
          days_pending: number | null
          due_date: string | null
          id: string | null
          member_id: string | null
          surface_count: number | null
          text: string | null
          urgency: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          days_pending?: never
          due_date?: string | null
          id?: string | null
          member_id?: string | null
          surface_count?: number | null
          text?: string | null
          urgency?: never
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          days_pending?: never
          due_date?: string | null
          id?: string | null
          member_id?: string | null
          surface_count?: number | null
          text?: string | null
          urgency?: never
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cos_meeting_actions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "cos_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      rc_top_level_strategic_initiatives: {
        Row: {
          accepts_sub_sis: boolean | null
          benchmark: string | null
          created_at: string | null
          created_by: string | null
          defining_objective_id: string | null
          description: string | null
          display_order: number | null
          end_date: string | null
          id: string | null
          locked_at: string | null
          locked_by: string | null
          owner_user_id: string | null
          parent_si_id: string | null
          participant_user_ids: string[] | null
          primary_success_metric: string | null
          start_date: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          accepts_sub_sis?: boolean | null
          benchmark?: string | null
          created_at?: string | null
          created_by?: string | null
          defining_objective_id?: string | null
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string | null
          locked_at?: string | null
          locked_by?: string | null
          owner_user_id?: string | null
          parent_si_id?: string | null
          participant_user_ids?: string[] | null
          primary_success_metric?: string | null
          start_date?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          accepts_sub_sis?: boolean | null
          benchmark?: string | null
          created_at?: string | null
          created_by?: string | null
          defining_objective_id?: string | null
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string | null
          locked_at?: string | null
          locked_by?: string | null
          owner_user_id?: string | null
          parent_si_id?: string | null
          participant_user_ids?: string[] | null
          primary_success_metric?: string | null
          start_date?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rc_strategic_initiatives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_strategic_initiatives_defining_objective_id_fkey"
            columns: ["defining_objective_id"]
            isOneToOne: false
            referencedRelation: "rc_defining_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_strategic_initiatives_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_strategic_initiatives_parent_si_id_fkey"
            columns: ["parent_si_id"]
            isOneToOne: false
            referencedRelation: "rc_strategic_initiatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_strategic_initiatives_parent_si_id_fkey"
            columns: ["parent_si_id"]
            isOneToOne: false
            referencedRelation: "rc_top_level_strategic_initiatives"
            referencedColumns: ["id"]
          },
        ]
      }
      user_calendar_credentials_public: {
        Row: {
          auto_sync_enabled: boolean | null
          auto_sync_midday_hour_utc: number | null
          auto_sync_morning_hour_utc: number | null
          connected: boolean | null
          created_at: string | null
          expires_at: string | null
          last_sync_at: string | null
          last_sync_status: string | null
          provider: string | null
          scope: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auto_sync_enabled?: boolean | null
          auto_sync_midday_hour_utc?: number | null
          auto_sync_morning_hour_utc?: number | null
          connected?: never
          created_at?: string | null
          expires_at?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider?: string | null
          scope?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auto_sync_enabled?: boolean | null
          auto_sync_midday_hour_utc?: number | null
          auto_sync_morning_hour_utc?: number | null
          connected?: never
          created_at?: string | null
          expires_at?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider?: string | null
          scope?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_slack_credentials_public: {
        Row: {
          connected: boolean | null
          created_at: string | null
          last_sync_at: string | null
          last_sync_status: string | null
          provider: string | null
          scope: string | null
          slack_email: string | null
          slack_team_name: string | null
          sync_channels: string[] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          connected?: never
          created_at?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider?: string | null
          scope?: string | null
          slack_email?: string | null
          slack_team_name?: string | null
          sync_channels?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          connected?: never
          created_at?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider?: string | null
          scope?: string | null
          slack_email?: string | null
          slack_team_name?: string | null
          sync_channels?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_zoom_credentials_public: {
        Row: {
          connected: boolean | null
          created_at: string | null
          expires_at: string | null
          last_sync_at: string | null
          last_sync_status: string | null
          provider: string | null
          scope: string | null
          updated_at: string | null
          user_id: string | null
          zoom_email: string | null
        }
        Insert: {
          connected?: never
          created_at?: string | null
          expires_at?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider?: string | null
          scope?: string | null
          updated_at?: string | null
          user_id?: string | null
          zoom_email?: string | null
        }
        Update: {
          connected?: never
          created_at?: string | null
          expires_at?: string | null
          last_sync_at?: string | null
          last_sync_status?: string | null
          provider?: string | null
          scope?: string | null
          updated_at?: string | null
          user_id?: string | null
          zoom_email?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_manage_permissions: { Args: { user_id: string }; Returns: boolean }
      check_team_member_role: {
        Args: {
          _required_role: Database["public"]["Enums"]["member_role"]
          _team_id: string
          _user_id: string
        }
        Returns: boolean
      }
      get_recurring_meeting: {
        Args: { meeting_id: string }
        Returns: {
          frequency: string
          id: string
          name: string
        }[]
      }
      get_user_login_info: {
        Args: { user_id: string }
        Returns: {
          has_logged_in: boolean
          last_active: string
        }[]
      }
      get_users_login_info_batch: {
        Args: { user_ids: string[] }
        Returns: {
          has_logged_in: boolean
          last_active: string
          user_id: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_team_admin: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      rcdo_convert_si_to_sub_si_mode: {
        Args: { p_si_id: string }
        Returns: string
      }
      rcdo_promote_task_to_sub_si: {
        Args: { p_task_id: string }
        Returns: string
      }
    }
    Enums: {
      completion_status_enum: "completed" | "not_completed" | "pending"
      invitation_status: "pending" | "accepted" | "expired" | "declined"
      item_type: "agenda" | "topic" | "priority" | "team_topic" | "action_item"
      meeting_frequency: "daily" | "weekly" | "bi-weekly" | "monthly"
      member_role: "admin" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      completion_status_enum: ["completed", "not_completed", "pending"],
      invitation_status: ["pending", "accepted", "expired", "declined"],
      item_type: ["agenda", "topic", "priority", "team_topic", "action_item"],
      meeting_frequency: ["daily", "weekly", "bi-weekly", "monthly"],
      member_role: ["admin", "member"],
    },
  },
} as const
