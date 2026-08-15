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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          archived: boolean
          color: string | null
          created_at: string
          currency: string
          icon: string | null
          id: string
          name: string
          opening_balance: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string | null
          created_at?: string
          currency?: string
          icon?: string | null
          id?: string
          name: string
          opening_balance?: number
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          color?: string | null
          created_at?: string
          currency?: string
          icon?: string | null
          id?: string
          name?: string
          opening_balance?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bills: {
        Row: {
          account_id: string | null
          amount: number
          archived_at: string | null
          category: string | null
          created_at: string
          due_date: string
          id: string
          merchant: string | null
          name: string
          notes: string | null
          paid: boolean
          paid_at: string | null
          payment_method: string | null
          recurrence: string
          recurring_id: string | null
          reminder_days: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          archived_at?: string | null
          category?: string | null
          created_at?: string
          due_date: string
          id?: string
          merchant?: string | null
          name: string
          notes?: string | null
          paid?: boolean
          paid_at?: string | null
          payment_method?: string | null
          recurrence?: string
          recurring_id?: string | null
          reminder_days?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          archived_at?: string | null
          category?: string | null
          created_at?: string
          due_date?: string
          id?: string
          merchant?: string | null
          name?: string
          notes?: string | null
          paid?: boolean
          paid_at?: string | null
          payment_method?: string | null
          recurrence?: string
          recurring_id?: string | null
          reminder_days?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          period: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          id?: string
          period?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          period?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cash_entries: {
        Row: {
          account_id: string | null
          amount: number
          archived_at: string | null
          category: string | null
          created_at: string
          description: string | null
          entry_date: string
          id: string
          location: string | null
          merchant: string | null
          notes: string | null
          payment_method: string | null
          receipt_url: string | null
          recurring_id: string | null
          reference: string | null
          status: string
          tags: string[] | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          archived_at?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          location?: string | null
          merchant?: string | null
          notes?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          recurring_id?: string | null
          reference?: string | null
          status?: string
          tags?: string[] | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          archived_at?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          location?: string | null
          merchant?: string | null
          notes?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          recurring_id?: string | null
          reference?: string | null
          status?: string
          tags?: string[] | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          metadata: Json | null
          read_at: string | null
          severity: string
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          metadata?: Json | null
          read_at?: string | null
          severity?: string
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          metadata?: Json | null
          read_at?: string | null
          severity?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          currency: string
          display_name: string | null
          locale: string
          monthly_goal: number | null
          notify_prefs: Json
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          currency?: string
          display_name?: string | null
          locale?: string
          monthly_goal?: number | null
          notify_prefs?: Json
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          currency?: string
          display_name?: string | null
          locale?: string
          monthly_goal?: number | null
          notify_prefs?: Json
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_rules: {
        Row: {
          account_id: string | null
          active: boolean
          amount: number
          category: string | null
          created_at: string
          end_date: string | null
          frequency: string
          id: string
          interval_count: number
          last_run: string | null
          name: string
          next_run: string
          start_date: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          amount: number
          category?: string | null
          created_at?: string
          end_date?: string | null
          frequency: string
          id?: string
          interval_count?: number
          last_run?: string | null
          name: string
          next_run?: string
          start_date?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          active?: boolean
          amount?: number
          category?: string | null
          created_at?: string
          end_date?: string | null
          frequency?: string
          id?: string
          interval_count?: number
          last_run?: string | null
          name?: string
          next_run?: string
          start_date?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      savings_goals: {
        Row: {
          color: string | null
          created_at: string
          current_amount: number
          icon: string | null
          id: string
          name: string
          target_amount: number
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          current_amount?: number
          icon?: string | null
          id?: string
          name: string
          target_amount: number
          target_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          current_amount?: number
          icon?: string | null
          id?: string
          name?: string
          target_amount?: number
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transfers: {
        Row: {
          amount: number
          created_at: string
          from_account_id: string
          id: string
          notes: string | null
          to_account_id: string
          transfer_date: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          from_account_id: string
          id?: string
          notes?: string | null
          to_account_id: string
          transfer_date?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          from_account_id?: string
          id?: string
          notes?: string | null
          to_account_id?: string
          transfer_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          created_at: string
          start_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          start_date?: string
          user_id: string
        }
        Update: {
          created_at?: string
          start_date?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
