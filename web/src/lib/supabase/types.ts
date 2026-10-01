// Generated from the `lummy` Supabase project (MCP generate_typescript_types). Do not edit
// by hand: regenerate after every migration.
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
      alert_subscriptions: {
        Row: {
          created_at: string
          event_id: string
          id: number
          tier_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: never
          tier_id?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: never
          tier_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_subscriptions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "catalogue_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_subscriptions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_subscriptions_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_replies: {
        Row: {
          author_id: string | null
          created_at: string
          evidence: Json | null
          from_seller: boolean
          id: number
          note_en: string
          note_id: string
          order_id: string
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          evidence?: Json | null
          from_seller: boolean
          id?: never
          note_en?: string
          note_id?: string
          order_id: string
        }
        Update: {
          author_id?: string | null
          created_at?: string
          evidence?: Json | null
          from_seller?: boolean
          id?: never
          note_en?: string
          note_id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_replies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_replies_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["order_id"]
          },
        ]
      }
      disputes: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          evidence: Json | null
          note_en: string
          note_id: string
          opened_at: string
          order_id: string
          rationale_en: string | null
          rationale_id: string | null
          reason: Database["public"]["Enums"]["dispute_reason"]
          refund_amount: number | null
          seller_penalty: number | null
          verdict_remedy: Database["public"]["Enums"]["remedy"] | null
          verdict_to_seller: boolean | null
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          evidence?: Json | null
          note_en?: string
          note_id?: string
          opened_at?: string
          order_id: string
          rationale_en?: string | null
          rationale_id?: string | null
          reason: Database["public"]["Enums"]["dispute_reason"]
          refund_amount?: number | null
          seller_penalty?: number | null
          verdict_remedy?: Database["public"]["Enums"]["remedy"] | null
          verdict_to_seller?: boolean | null
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          evidence?: Json | null
          note_en?: string
          note_id?: string
          opened_at?: string
          order_id?: string
          rationale_en?: string | null
          rationale_id?: string | null
          reason?: Database["public"]["Enums"]["dispute_reason"]
          refund_amount?: number | null
          seller_penalty?: number | null
          verdict_remedy?: Database["public"]["Enums"]["remedy"] | null
          verdict_to_seller?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      event_requests: {
        Row: {
          category: string
          city: string
          created_at: string
          face_values: Json
          forgery_score: number
          id: string
          organizer_ref: string
          pdf_suspicious: boolean
          pdf_tier: string
          starts_at: string
          status: Database["public"]["Enums"]["seed_status"]
          submitted_by: string | null
          submitter_name: string
          title: string
          venue: string
        }
        Insert: {
          category: string
          city: string
          created_at?: string
          face_values?: Json
          forgery_score?: number
          id?: string
          organizer_ref?: string
          pdf_suspicious?: boolean
          pdf_tier: string
          starts_at: string
          status?: Database["public"]["Enums"]["seed_status"]
          submitted_by?: string | null
          submitter_name: string
          title: string
          venue: string
        }
        Update: {
          category?: string
          city?: string
          created_at?: string
          face_values?: Json
          forgery_score?: number
          id?: string
          organizer_ref?: string
          pdf_suspicious?: boolean
          pdf_tier?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["seed_status"]
          submitted_by?: string | null
          submitter_name?: string
          title?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          category: string
          city: string
          created_at: string
          featured: boolean
          id: string
          image_url: string | null
          rolling_hour: number | null
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          transfer_policy: Database["public"]["Enums"]["transfer_policy"] | null
          venue: string
        }
        Insert: {
          category: string
          city: string
          created_at?: string
          featured?: boolean
          id: string
          image_url?: string | null
          rolling_hour?: number | null
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          transfer_policy?:
            | Database["public"]["Enums"]["transfer_policy"]
            | null
          venue: string
        }
        Update: {
          category?: string
          city?: string
          created_at?: string
          featured?: boolean
          id?: string
          image_url?: string | null
          rolling_hour?: number | null
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          transfer_policy?:
            | Database["public"]["Enums"]["transfer_policy"]
            | null
          venue?: string
        }
        Relationships: []
      }
      ktp_assets: {
        Row: {
          access_open_at: string
          bucket: string
          created_at: string
          id: number
          listing_id: string
          owner_id: string
          path: string
          purge_after: string
          sha256: string
        }
        Insert: {
          access_open_at: string
          bucket?: string
          created_at?: string
          id?: never
          listing_id: string
          owner_id: string
          path: string
          purge_after: string
          sha256: string
        }
        Update: {
          access_open_at?: string
          bucket?: string
          created_at?: string
          id?: never
          listing_id?: string
          owner_id?: string
          path?: string
          purge_after?: string
          sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "ktp_assets_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ktp_assets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_barcodes: {
        Row: {
          barcode_hmac: string
          created_at: string
          format: string
          held: boolean
          listing_id: string
          page: number
        }
        Insert: {
          barcode_hmac: string
          created_at?: string
          format: string
          held?: boolean
          listing_id: string
          page: number
        }
        Update: {
          barcode_hmac?: string
          created_at?: string
          format?: string
          held?: boolean
          listing_id?: string
          page?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_barcodes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          ask_price: number
          autofilled: boolean
          barcode_duplicate: boolean
          barcode_hmac: string | null
          checks: Json | null
          created_at: string
          event_id: string
          extraction: Json | null
          face_value: number
          forensics: Json | null
          forgery_score: number
          gate_ktp: boolean
          id: string
          late_listing: boolean
          pdf_suspicious: boolean
          quantity: number
          seller_id: string | null
          seller_name: string
          splittable: boolean
          status: Database["public"]["Enums"]["listing_status"]
          ticket_path: string | null
          ticket_sha256: string | null
          tier_id: string
          views: number
        }
        Insert: {
          ask_price: number
          autofilled?: boolean
          barcode_duplicate?: boolean
          barcode_hmac?: string | null
          checks?: Json | null
          created_at?: string
          event_id: string
          extraction?: Json | null
          face_value: number
          forensics?: Json | null
          forgery_score?: number
          gate_ktp?: boolean
          id?: string
          late_listing?: boolean
          pdf_suspicious?: boolean
          quantity: number
          seller_id?: string | null
          seller_name: string
          splittable?: boolean
          status?: Database["public"]["Enums"]["listing_status"]
          ticket_path?: string | null
          ticket_sha256?: string | null
          tier_id: string
          views?: number
        }
        Update: {
          ask_price?: number
          autofilled?: boolean
          barcode_duplicate?: boolean
          barcode_hmac?: string | null
          checks?: Json | null
          created_at?: string
          event_id?: string
          extraction?: Json | null
          face_value?: number
          forensics?: Json | null
          forgery_score?: number
          gate_ktp?: boolean
          id?: string
          late_listing?: boolean
          pdf_suspicious?: boolean
          quantity?: number
          seller_id?: string | null
          seller_name?: string
          splittable?: boolean
          status?: Database["public"]["Enums"]["listing_status"]
          ticket_path?: string | null
          ticket_sha256?: string | null
          tier_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "listings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "catalogue_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount: number
          auto_refund_reason: string | null
          auto_released: boolean
          buyer_id: string
          chain_id: number | null
          contract_address: string | null
          created_at: string
          dispute_deadline: string | null
          disputed: boolean
          docs_letter_at: string | null
          docs_seller_id_at: string | null
          escrow_status: Database["public"]["Enums"]["escrow_status"]
          event_date: string
          event_ended_at: string | null
          event_ends_at: string | null
          event_id: string | null
          event_image: string | null
          event_status: Database["public"]["Enums"]["event_status"]
          event_title: string
          fee: number
          gate_ktp: boolean
          id: string
          last_synced_block: number | null
          late_listing: boolean
          listing_id: string | null
          materai: number
          onchain_listing_id: string | null
          onchain_price: string | null
          quantity: number
          seller_id: string | null
          seller_name: string
          tier_name: string
          tx_create: string | null
          tx_fund: string | null
          tx_handover: string | null
          tx_settle: string | null
          tx_withdrawals: string[]
          updated_at: string
        }
        Insert: {
          amount: number
          auto_refund_reason?: string | null
          auto_released?: boolean
          buyer_id: string
          chain_id?: number | null
          contract_address?: string | null
          created_at?: string
          dispute_deadline?: string | null
          disputed?: boolean
          docs_letter_at?: string | null
          docs_seller_id_at?: string | null
          escrow_status?: Database["public"]["Enums"]["escrow_status"]
          event_date: string
          event_ended_at?: string | null
          event_ends_at?: string | null
          event_id?: string | null
          event_image?: string | null
          event_status?: Database["public"]["Enums"]["event_status"]
          event_title: string
          fee?: number
          gate_ktp?: boolean
          id?: string
          last_synced_block?: number | null
          late_listing?: boolean
          listing_id?: string | null
          materai?: number
          onchain_listing_id?: string | null
          onchain_price?: string | null
          quantity: number
          seller_id?: string | null
          seller_name: string
          tier_name: string
          tx_create?: string | null
          tx_fund?: string | null
          tx_handover?: string | null
          tx_settle?: string | null
          tx_withdrawals?: string[]
          updated_at?: string
        }
        Update: {
          amount?: number
          auto_refund_reason?: string | null
          auto_released?: boolean
          buyer_id?: string
          chain_id?: number | null
          contract_address?: string | null
          created_at?: string
          dispute_deadline?: string | null
          disputed?: boolean
          docs_letter_at?: string | null
          docs_seller_id_at?: string | null
          escrow_status?: Database["public"]["Enums"]["escrow_status"]
          event_date?: string
          event_ended_at?: string | null
          event_ends_at?: string | null
          event_id?: string | null
          event_image?: string | null
          event_status?: Database["public"]["Enums"]["event_status"]
          event_title?: string
          fee?: number
          gate_ktp?: boolean
          id?: string
          last_synced_block?: number | null
          late_listing?: boolean
          listing_id?: string | null
          materai?: number
          onchain_listing_id?: string | null
          onchain_price?: string | null
          quantity?: number
          seller_id?: string | null
          seller_name?: string
          tier_name?: string
          tx_create?: string | null
          tx_fund?: string | null
          tx_handover?: string | null
          tx_settle?: string | null
          tx_withdrawals?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "catalogue_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          alert_channel: Database["public"]["Enums"]["alert_channel"]
          created_at: string
          full_name: string
          id: string
          kyc: Database["public"]["Enums"]["kyc_status"]
          payout_bank: string | null
          payout_number: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          alert_channel?: Database["public"]["Enums"]["alert_channel"]
          created_at?: string
          full_name?: string
          id: string
          kyc?: Database["public"]["Enums"]["kyc_status"]
          payout_bank?: string | null
          payout_number?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          alert_channel?: Database["public"]["Enums"]["alert_channel"]
          created_at?: string
          full_name?: string
          id?: string
          kyc?: Database["public"]["Enums"]["kyc_status"]
          payout_bank?: string | null
          payout_number?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      tiers: {
        Row: {
          event_id: string
          face_value: number
          id: string
          name: string
          sort: number
        }
        Insert: {
          event_id: string
          face_value: number
          id: string
          name: string
          sort?: number
        }
        Update: {
          event_id?: string
          face_value?: number
          id?: string
          name?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "catalogue_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      catalogue_events: {
        Row: {
          category: string | null
          city: string | null
          featured: boolean | null
          from_price: number | null
          id: string | null
          image_url: string | null
          listing_count: number | null
          starts_at: string | null
          status: Database["public"]["Enums"]["event_status"] | null
          title: string | null
          transfer_policy: Database["public"]["Enums"]["transfer_policy"] | null
          venue: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_listing: {
        Args: { p_listing_id: string; p_quantity: number }
        Returns: {
          ask_price: number
          autofilled: boolean
          barcode_duplicate: boolean
          barcode_hmac: string | null
          checks: Json | null
          created_at: string
          event_id: string
          extraction: Json | null
          face_value: number
          forensics: Json | null
          forgery_score: number
          gate_ktp: boolean
          id: string
          late_listing: boolean
          pdf_suspicious: boolean
          quantity: number
          seller_id: string | null
          seller_name: string
          splittable: boolean
          status: Database["public"]["Enums"]["listing_status"]
          ticket_path: string | null
          ticket_sha256: string | null
          tier_id: string
          views: number
        }
        SetofOptions: {
          from: "*"
          to: "listings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_listing: {
        Args: { p_listing_id: string; p_quantity: number }
        Returns: undefined
      }
    }
    Enums: {
      alert_channel: "email" | "whatsapp" | "telegram"
      dispute_reason:
        | "GATE_DENIED"
        | "BARCODE_USED"
        | "NAME_MISMATCH"
        | "NOT_DELIVERED"
        | "NOT_AS_LISTED"
        | "EVENT_CANCELLED"
        | "NO_SHOW"
      escrow_status:
        | "Listed"
        | "Funded"
        | "DisputeWindow"
        | "Released"
        | "Refunded"
        | "Cancelled"
      event_status: "scheduled" | "postponed" | "cancelled"
      kyc_status: "unverified" | "verified"
      listing_status: "review" | "active" | "sold" | "rejected" | "cancelled"
      remedy:
        | "REPLACEMENT"
        | "REFUND_PARTIAL"
        | "REFUND_FULL"
        | "RELEASE_SELLER"
      seed_status: "pending" | "approved" | "rejected"
      transfer_policy: "open" | "letter" | "id_match" | "no_resale"
      user_role: "member" | "admin"
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
    Enums: {
      alert_channel: ["email", "whatsapp", "telegram"],
      dispute_reason: [
        "GATE_DENIED",
        "BARCODE_USED",
        "NAME_MISMATCH",
        "NOT_DELIVERED",
        "NOT_AS_LISTED",
        "EVENT_CANCELLED",
        "NO_SHOW",
      ],
      escrow_status: [
        "Listed",
        "Funded",
        "DisputeWindow",
        "Released",
        "Refunded",
        "Cancelled",
      ],
      event_status: ["scheduled", "postponed", "cancelled"],
      kyc_status: ["unverified", "verified"],
      listing_status: ["review", "active", "sold", "rejected", "cancelled"],
      remedy: [
        "REPLACEMENT",
        "REFUND_PARTIAL",
        "REFUND_FULL",
        "RELEASE_SELLER",
      ],
      seed_status: ["pending", "approved", "rejected"],
      transfer_policy: ["open", "letter", "id_match", "no_resale"],
      user_role: ["member", "admin"],
    },
  },
} as const
