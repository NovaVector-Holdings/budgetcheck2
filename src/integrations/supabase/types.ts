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
      alert_settings: {
        Row: {
          expense_reminder_days: number
          low_funds_threshold: number | null
          updated_at: string
          user_id: string
          weekly_summary: boolean
        }
        Insert: {
          expense_reminder_days?: number
          low_funds_threshold?: number | null
          updated_at?: string
          user_id: string
          weekly_summary?: boolean
        }
        Update: {
          expense_reminder_days?: number
          low_funds_threshold?: number | null
          updated_at?: string
          user_id?: string
          weekly_summary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "alert_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      debt_payments: {
        Row: {
          amount: number
          created_at: string
          debt_id: string
          id: string
          paid_on: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          debt_id: string
          id?: string
          paid_on?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          debt_id?: string
          id?: string
          paid_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debt_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          apr: number | null
          archived: boolean
          balance: number
          created_at: string
          id: string
          minimum_payment: number | null
          name: string
          user_id: string
        }
        Insert: {
          apr?: number | null
          archived?: boolean
          balance: number
          created_at?: string
          id?: string
          minimum_payment?: number | null
          name: string
          user_id: string
        }
        Update: {
          apr?: number | null
          archived?: boolean
          balance?: number
          created_at?: string
          id?: string
          minimum_payment?: number | null
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mm_accounts: {
        Row: {
          archived: boolean
          balance_as_of: string | null
          created_at: string
          credit_limit: number | null
          current_balance: number
          id: string
          institution: string | null
          kind: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          balance_as_of?: string | null
          created_at?: string
          credit_limit?: number | null
          current_balance?: number
          id?: string
          institution?: string | null
          kind?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          balance_as_of?: string | null
          created_at?: string
          credit_limit?: number | null
          current_balance?: number
          id?: string
          institution?: string | null
          kind?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mm_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mm_artifacts: {
        Row: {
          archived: boolean
          check_state: Json
          created_at: string
          id: string
          kind: string
          payload: Json
          source_import_id: string | null
          takeaway: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          check_state?: Json
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          source_import_id?: string | null
          takeaway?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          check_state?: Json
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          source_import_id?: string | null
          takeaway?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mm_artifacts_source_import_id_fkey"
            columns: ["source_import_id"]
            isOneToOne: false
            referencedRelation: "mm_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_artifacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mm_imports: {
        Row: {
          account_id: string | null
          column_map: Json
          created_at: string
          file_name: string | null
          id: string
          period_end: string | null
          period_start: string | null
          txn_count: number
          txns: Json
          user_id: string
        }
        Insert: {
          account_id?: string | null
          column_map?: Json
          created_at?: string
          file_name?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          txn_count?: number
          txns?: Json
          user_id: string
        }
        Update: {
          account_id?: string | null
          column_map?: Json
          created_at?: string
          file_name?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          txn_count?: number
          txns?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mm_imports_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_imports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mm_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mm_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "mm_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mm_pattern_rules: {
        Row: {
          active: boolean
          classify_as: string
          created_at: string
          id: string
          note: string | null
          pattern: string
          user_id: string
        }
        Insert: {
          active?: boolean
          classify_as: string
          created_at?: string
          id?: string
          note?: string | null
          pattern: string
          user_id: string
        }
        Update: {
          active?: boolean
          classify_as?: string
          created_at?: string
          id?: string
          note?: string | null
          pattern?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mm_pattern_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mm_priority_overrides: {
        Row: {
          created_at: string
          id: string
          label: string
          reason: string | null
          ref_id: string
          ref_kind: string
          tier: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          reason?: string | null
          ref_id: string
          ref_kind: string
          tier: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          reason?: string | null
          ref_id?: string
          ref_kind?: string
          tier?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mm_priority_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mm_reserved_funds: {
        Row: {
          amount: number
          archived: boolean
          created_at: string
          id: string
          label: string
          purpose: string | null
          tapped_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          archived?: boolean
          created_at?: string
          id?: string
          label: string
          purpose?: string | null
          tapped_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          archived?: boolean
          created_at?: string
          id?: string
          label?: string
          purpose?: string | null
          tapped_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mm_reserved_funds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mm_sessions: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mm_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mm_spending_caps: {
        Row: {
          cap_amount: number
          category: string
          created_at: string
          id: string
          instrument_label: string | null
          instrument_limit: number | null
          period: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cap_amount: number
          category: string
          created_at?: string
          id?: string
          instrument_label?: string | null
          instrument_limit?: number | null
          period?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cap_amount?: number
          category?: string
          created_at?: string
          id?: string
          instrument_label?: string | null
          instrument_limit?: number | null
          period?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mm_spending_caps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      money_meetings: {
        Row: {
          archived: boolean
          checklist: Json
          created_at: string
          held_on: string
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          archived?: boolean
          checklist?: Json
          created_at?: string
          held_on?: string
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          archived?: boolean
          checklist?: Json
          created_at?: string
          held_on?: string
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_meetings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_expenses: {
        Row: {
          amount: number
          archived: boolean
          category: string
          created_at: string
          due_date: string
          id: string
          name: string
          paid: boolean
          recurring: string
          user_id: string
        }
        Insert: {
          amount: number
          archived?: boolean
          category?: string
          created_at?: string
          due_date: string
          id?: string
          name: string
          paid?: boolean
          recurring?: string
          user_id: string
        }
        Update: {
          amount?: number
          archived?: boolean
          category?: string
          created_at?: string
          due_date?: string
          id?: string
          name?: string
          paid?: boolean
          recurring?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_expenses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          balance_as_of: string | null
          budget_method: string
          cash_on_hand: number | null
          created_at: string
          display_name: string | null
          id: string
          income_low_estimate: number | null
          money_goal: string | null
          monthly_income: number | null
          next_pay_date: string | null
          onboarding_completed: boolean
          pay_frequency: string | null
          second_pay_date: string | null
          spending_buffer: number
          updated_at: string
        }
        Insert: {
          balance_as_of?: string | null
          budget_method?: string
          cash_on_hand?: number | null
          created_at?: string
          display_name?: string | null
          id: string
          income_low_estimate?: number | null
          money_goal?: string | null
          monthly_income?: number | null
          next_pay_date?: string | null
          onboarding_completed?: boolean
          pay_frequency?: string | null
          second_pay_date?: string | null
          spending_buffer?: number
          updated_at?: string
        }
        Update: {
          balance_as_of?: string | null
          budget_method?: string
          cash_on_hand?: number | null
          created_at?: string
          display_name?: string | null
          id?: string
          income_low_estimate?: number | null
          money_goal?: string | null
          monthly_income?: number | null
          next_pay_date?: string | null
          onboarding_completed?: boolean
          pay_frequency?: string | null
          second_pay_date?: string | null
          spending_buffer?: number
          updated_at?: string
        }
        Relationships: []
      }
      savings_deposits: {
        Row: {
          amount: number
          created_at: string
          deposited_on: string
          goal_id: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          deposited_on?: string
          goal_id: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          deposited_on?: string
          goal_id?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_deposits_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "savings_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          name: string
          target_amount: number
          target_date: string | null
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          name: string
          target_amount: number
          target_date?: string | null
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          name?: string
          target_amount?: number
          target_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
