export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
      invitations: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invite_code: string | null
          invited_by: string
          role: string
          status: string
          team_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invite_code?: string | null
          invited_by: string
          role: string
          status?: string
          team_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invite_code?: string | null
          invited_by?: string
          role?: string
          status?: string
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
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
      profiles: {
        Row: {
          avatar_name: string | null
          avatar_url: string | null
          birthday: string | null
          blue_percentage: number | null
          created_at: string | null
          email: string | null
          first_name: string | null
          full_name: string | null
          green_percentage: number | null
          id: string
          is_admin: boolean | null
          is_rcdo_admin: boolean | null
          is_super_admin: boolean | null
          last_name: string | null
          red_percentage: number | null
          updated_at: string | null
          yellow_percentage: number | null
        }
        Insert: {
          avatar_name?: string | null
          avatar_url?: string | null
          birthday?: string | null
          blue_percentage?: number | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          green_percentage?: number | null
          id: string
          is_admin?: boolean | null
          is_rcdo_admin?: boolean | null
          is_super_admin?: boolean | null
          last_name?: string | null
          red_percentage?: number | null
          updated_at?: string | null
          yellow_percentage?: number | null
        }
        Update: {
          avatar_name?: string | null
          avatar_url?: string | null
          birthday?: string | null
          blue_percentage?: number | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          green_percentage?: number | null
          id?: string
          is_admin?: boolean | null
          is_rcdo_admin?: boolean | null
          is_super_admin?: boolean | null
          last_name?: string | null
          red_percentage?: number | null
          updated_at?: string | null
          yellow_percentage?: number | null
        }
        Relationships: []
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
          sentiment?: number | null
          summary?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
        Relationships: []
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
          created_at: string | null
          created_by: string | null
          defining_objective_id: string
          description: string | null
          display_order: number | null
          end_date: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          owner_user_id: string
          start_date: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          defining_objective_id: string
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          owner_user_id: string
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          defining_objective_id?: string
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          owner_user_id?: string
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
          id: string
          role: string
          team_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: string
          team_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string
          team_id?: string
          updated_at?: string | null
          user_id?: string
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
        ]
      }
      teams: {
        Row: {
          abbreviated_name: string | null
          created_at: string | null
          created_by: string
          id: string
          invite_code: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          abbreviated_name?: string | null
          created_at?: string | null
          created_by: string
          id?: string
          invite_code?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          abbreviated_name?: string | null
          created_at?: string | null
          created_by?: string
          id?: string
          invite_code?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_login_info: {
        Args: { user_id: string }
        Returns: {
          has_logged_in: boolean
          last_active: string
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
    }
    Enums: {
      completion_status_enum: "completed" | "not_completed" | "pending"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      completion_status_enum: ["completed", "not_completed", "pending"],
    },
  },
} as const

