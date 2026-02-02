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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      account_groups: {
        Row: {
          created_at: string
          group_id: number
          group_name: string | null
          id: string
          phone_number: string
        }
        Insert: {
          created_at?: string
          group_id: number
          group_name?: string | null
          id?: string
          phone_number: string
        }
        Update: {
          created_at?: string
          group_id?: number
          group_name?: string | null
          id?: string
          phone_number?: string
        }
        Relationships: []
      }
      bot_settings: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_texts: {
        Row: {
          created_at: string
          id: string
          text_key: string
          text_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          text_key: string
          text_value: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          text_key?: string
          text_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_users: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_admin: boolean
          is_blocked: boolean
          phone_number: string | null
          telegram_id: number
          updated_at: string
          user_state: string | null
          username: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_admin?: boolean
          is_blocked?: boolean
          phone_number?: string | null
          telegram_id: number
          updated_at?: string
          user_state?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_admin?: boolean
          is_blocked?: boolean
          phone_number?: string | null
          telegram_id?: number
          updated_at?: string
          user_state?: string | null
          username?: string | null
        }
        Relationships: []
      }
      keyword_hits: {
        Row: {
          created_at: string
          group_id: number
          group_name: string | null
          id: string
          keyword_id: string | null
          message_preview: string | null
          phone_number: string | null
        }
        Insert: {
          created_at?: string
          group_id: number
          group_name?: string | null
          id?: string
          keyword_id?: string | null
          message_preview?: string | null
          phone_number?: string | null
        }
        Update: {
          created_at?: string
          group_id?: number
          group_name?: string | null
          id?: string
          keyword_id?: string | null
          message_preview?: string | null
          phone_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "keyword_hits_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords"
            referencedColumns: ["id"]
          },
        ]
      }
      keywords: {
        Row: {
          created_at: string
          id: string
          keyword: string
        }
        Insert: {
          created_at?: string
          id?: string
          keyword: string
        }
        Update: {
          created_at?: string
          id?: string
          keyword?: string
        }
        Relationships: []
      }
      order_queue: {
        Row: {
          created_at: string
          driver_message_id: number | null
          driver_telegram_id: number
          id: string
          order_id: string
          queue_position: number
          status: string
        }
        Insert: {
          created_at?: string
          driver_message_id?: number | null
          driver_telegram_id: number
          id?: string
          order_id: string
          queue_position: number
          status?: string
        }
        Update: {
          created_at?: string
          driver_message_id?: number | null
          driver_telegram_id?: number
          id?: string
          order_id?: string
          queue_position?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_by_telegram_id: number | null
          created_at: string
          group_message_id: number | null
          id: string
          message_text: string
          order_type: string
          status: string
          telegram_id: number
        }
        Insert: {
          accepted_by_telegram_id?: number | null
          created_at?: string
          group_message_id?: number | null
          id?: string
          message_text: string
          order_type: string
          status?: string
          telegram_id: number
        }
        Update: {
          accepted_by_telegram_id?: number | null
          created_at?: string
          group_message_id?: number | null
          id?: string
          message_text?: string
          order_type?: string
          status?: string
          telegram_id?: number
        }
        Relationships: []
      }
      userbot_accounts: {
        Row: {
          created_at: string
          id: string
          phone_number: string
          session_string: string | null
          status: string
          two_fa_required: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone_number: string
          session_string?: string | null
          status?: string
          two_fa_required?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          phone_number?: string
          session_string?: string | null
          status?: string
          two_fa_required?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      watched_groups: {
        Row: {
          bot_joined: boolean | null
          bot_joined_at: string | null
          created_at: string
          group_id: number
          group_name: string | null
          id: string
          is_blocked: boolean
        }
        Insert: {
          bot_joined?: boolean | null
          bot_joined_at?: string | null
          created_at?: string
          group_id: number
          group_name?: string | null
          id?: string
          is_blocked?: boolean
        }
        Update: {
          bot_joined?: boolean | null
          bot_joined_at?: string | null
          created_at?: string
          group_id?: number
          group_name?: string | null
          id?: string
          is_blocked?: boolean
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
