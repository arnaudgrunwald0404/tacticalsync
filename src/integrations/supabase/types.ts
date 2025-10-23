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
        Relationships: []
      }
      invitations: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invite_code: string
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
          invite_code?: string
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
          invite_code?: string
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
          team_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          frequency: string
          id?: string
          name: string
          team_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          frequency?: string
          id?: string
          name?: string
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
          last_name?: string | null
          red_percentage?: number | null
          updated_at?: string | null
          yellow_percentage?: number | null
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

