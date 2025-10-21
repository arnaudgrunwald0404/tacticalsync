export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      agenda_template_items: {
        Row: {
          created_at: string
          duration_minutes: number
          id: string
          order_index: number
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          duration_minutes: number
          id?: string
          order_index: number
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          order_index?: number
          template_id?: string
          title?: string
        }
      }
      agenda_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          team_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          team_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          team_id?: string | null
        }
      }
      meeting_series_agenda: {
        Row: {
          id: string
          series_id: string
          title: string
          notes: string | null
          assigned_to: string | null
          time_minutes: number | null
          order_index: number
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          series_id: string
          title: string
          notes?: string | null
          assigned_to?: string | null
          time_minutes?: number | null
          order_index: number
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          series_id?: string
          title?: string
          notes?: string | null
          assigned_to?: string | null
          time_minutes?: number | null
          order_index?: number
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      // ... other tables ...
    }
  }
}