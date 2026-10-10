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
      app_user_connections: {
        Row: {
          account_label: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_label?: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_label?: string | null
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      auth_relays: {
        Row: {
          ciphertext: string
          created_at: string
          id_hash: string
          iv: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          id_hash: string
          iv: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          id_hash?: string
          iv?: string
        }
        Relationships: []
      }
      custom_api_integrations: {
        Row: {
          api_url: string
          created_at: string
          description: string
          display_name: string
          headers: Json
          id: string
          is_active: boolean
          method: string
          model_name: string | null
          name: string
          param_location: string
          parameters_schema: Json
          priority: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_url: string
          created_at?: string
          description?: string
          display_name?: string
          headers?: Json
          id?: string
          is_active?: boolean
          method?: string
          model_name?: string | null
          name: string
          param_location?: string
          parameters_schema?: Json
          priority?: number
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_url?: string
          created_at?: string
          description?: string
          display_name?: string
          headers?: Json
          id?: string
          is_active?: boolean
          method?: string
          model_name?: string | null
          name?: string
          param_location?: string
          parameters_schema?: Json
          priority?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      os_actions: {
        Row: {
          action: string
          created_at: string
          id: string
          payload: Json
          result: string | null
          status: string
          target: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          payload?: Json
          result?: string | null
          status?: string
          target: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          payload?: Json
          result?: string | null
          status?: string
          target?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      os_agent_tokens: {
        Row: {
          created_at: string
          last_seen: string | null
          platform: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_seen?: string | null
          platform?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_seen?: string | null
          platform?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      push_cron_config: {
        Row: {
          id: number
          secret: string
        }
        Insert: {
          id?: number
          secret?: string
        }
        Update: {
          id?: number
          secret?: string
        }
        Relationships: []
      }
      push_routines: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_sent_on: string | null
          time_hm: string
          timezone: string
          title: string
          user_id: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_sent_on?: string | null
          time_hm: string
          timezone?: string
          title: string
          user_id: string
          weekdays?: number[]
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_sent_on?: string | null
          time_hm?: string
          timezone?: string
          title?: string
          user_id?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      push_sent_events: {
        Row: {
          event_key: string
          sent_at: string
          user_id: string
        }
        Insert: {
          event_key: string
          sent_at?: string
          user_id: string
        }
        Update: {
          event_key?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sync_blobs: {
        Row: {
          ciphertext: string
          deleted: boolean
          device_id: string | null
          item_key: string
          space_id: string
          updated_at: number
        }
        Insert: {
          ciphertext: string
          deleted?: boolean
          device_id?: string | null
          item_key: string
          space_id: string
          updated_at: number
        }
        Update: {
          ciphertext?: string
          deleted?: boolean
          device_id?: string | null
          item_key?: string
          space_id?: string
          updated_at?: number
        }
        Relationships: [
          {
            foreignKeyName: "sync_blobs_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "sync_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_commands: {
        Row: {
          created_at: string
          from_device: string | null
          id: string
          payload: string
          space_id: string
          status: string
          target: string
        }
        Insert: {
          created_at?: string
          from_device?: string | null
          id?: string
          payload: string
          space_id: string
          status?: string
          target: string
        }
        Update: {
          created_at?: string
          from_device?: string | null
          id?: string
          payload?: string
          space_id?: string
          status?: string
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_commands_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "sync_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_devices: {
        Row: {
          created_at: string
          id: string
          kind: string
          last_seen: string
          name: string
          space_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          last_seen?: string
          name?: string
          space_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          last_seen?: string
          name?: string
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_devices_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "sync_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_pairings: {
        Row: {
          code: string
          created_by: string
          expires_at: string
          space_id: string
          used: boolean
        }
        Insert: {
          code: string
          created_by: string
          expires_at: string
          space_id: string
          used?: boolean
        }
        Update: {
          code?: string
          created_by?: string
          expires_at?: string
          space_id?: string
          used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sync_pairings_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "sync_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_spaces: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          salt: string
          verifier: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          salt: string
          verifier: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          salt?: string
          verifier?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_space_member: { Args: { _space: string }; Returns: boolean }
      redeem_pairing: {
        Args: { _code: string; _kind: string; _name: string }
        Returns: {
          device_id: string
          salt: string
          space_id: string
          verifier: string
        }[]
      }
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
