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
      founders_slot_bookings: {
        Row: {
          booking_name: string
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string
          place: string
          user_id: string | null
        }
        Insert: {
          booking_name: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          phone: string
          place: string
          user_id?: string | null
        }
        Update: {
          booking_name?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string
          place?: string
          user_id?: string | null
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          content: string
          created_at: string
          id: string
          mood: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          mood?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          mood?: string | null
          user_id?: string
        }
        Relationships: []
      }
      maps: {
        Row: {
          created_at: string
          id: string
          title: string
          transcript: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title: string
          transcript?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          transcript?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nodes: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          label: string
          map_id: string
          parent_id: string | null
          priority: number
          user_id: string
          x: number
          y: number
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          label: string
          map_id: string
          parent_id?: string | null
          priority?: number
          user_id: string
          x?: number
          y?: number
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          label?: string
          map_id?: string
          parent_id?: string | null
          priority?: number
          user_id?: string
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "nodes_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          app_role: "student" | "other" | null
          avatar_url: string | null
          bonus_map_credits?: number
          created_at: string
          display_name: string | null
          id: string
          persona_label: string | null
          referral_code_used: string | null
          referred_at: string | null
          referred_by_name: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          app_role?: "student" | "other" | null
          avatar_url?: string | null
          bonus_map_credits?: number
          created_at?: string
          display_name?: string | null
          id: string
          persona_label?: string | null
          referral_code_used?: string | null
          referred_at?: string | null
          referred_by_name?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          app_role?: "student" | "other" | null
          avatar_url?: string | null
          bonus_map_credits?: number
          created_at?: string
          display_name?: string | null
          id?: string
          persona_label?: string | null
          referral_code_used?: string | null
          referred_at?: string | null
          referred_by_name?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      onboarding_responses: {
        Row: {
          user_id: string
          role: string | null
          age_bracket: string | null
          heard_from: string | null
          motivation_score: number | null
          created_at: string
        }
        Insert: {
          user_id: string
          role?: string | null
          age_bracket?: string | null
          heard_from?: string | null
          motivation_score?: number | null
          created_at?: string
        }
        Update: {
          user_id?: string
          role?: string | null
          age_bracket?: string | null
          heard_from?: string | null
          motivation_score?: number | null
          created_at?: string
        }
        Relationships: []
      }
      referral_attributions: {
        Row: {
          attributed_at: string
          code: string
          code_kind: string
          coupon_id: string | null
          doctor_id: string | null
          id: string
          premium_plan: string | null
          premium_purchased_at: string | null
          referral_code_id: string | null
          referrer_name: string
          user_id: string
        }
        Insert: {
          attributed_at?: string
          code: string
          code_kind: string
          coupon_id?: string | null
          doctor_id?: string | null
          id?: string
          premium_plan?: string | null
          premium_purchased_at?: string | null
          referral_code_id?: string | null
          referrer_name: string
          user_id: string
        }
        Update: {
          attributed_at?: string
          code?: string
          code_kind?: string
          coupon_id?: string | null
          doctor_id?: string | null
          id?: string
          premium_plan?: string | null
          premium_purchased_at?: string | null
          referral_code_id?: string | null
          referrer_name?: string
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
