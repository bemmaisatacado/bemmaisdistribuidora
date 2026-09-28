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
      ai_features: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          key: string
          model: string | null
          monthly_quota_per_org: number | null
          name: string
          provider_key: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          key: string
          model?: string | null
          monthly_quota_per_org?: number | null
          name: string
          provider_key?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          key?: string
          model?: string | null
          monthly_quota_per_org?: number | null
          name?: string
          provider_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_features_provider_key_fkey"
            columns: ["provider_key"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["key"]
          },
        ]
      }
      ai_providers: {
        Row: {
          created_at: string
          default_model: string | null
          enabled: boolean
          key: string
          name: string
          secret_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_model?: string | null
          enabled?: boolean
          key: string
          name: string
          secret_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_model?: string | null
          enabled?: boolean
          key?: string
          name?: string
          secret_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          created_at: string
          estimated_cost: number | null
          feature_key: string | null
          id: number
          input_tokens: number | null
          latency_ms: number | null
          model: string | null
          organization_id: string | null
          output_tokens: number | null
          provider_key: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          estimated_cost?: number | null
          feature_key?: string | null
          id?: never
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          organization_id?: string | null
          output_tokens?: number | null
          provider_key?: string | null
          status: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          estimated_cost?: number | null
          feature_key?: string | null
          id?: never
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string | null
          organization_id?: string | null
          output_tokens?: number | null
          provider_key?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          entity_id: string | null
          entity_type: string
          id: number
          occurred_at: string
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: never
          occurred_at?: string
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: never
          occurred_at?: string
          organization_id?: string | null
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_followups: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          due_at: string | null
          id: string
          organization_id: string
          owner_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          organization_id: string
          owner_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          organization_id?: string
          owner_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_followups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_interactions: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          kind: string
          next_action: string | null
          next_action_at: string | null
          occurred_at: string
          organization_id: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          kind?: string
          next_action?: string | null
          next_action_at?: string | null
          occurred_at?: string
          organization_id: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          kind?: string
          next_action?: string | null
          next_action_at?: string | null
          occurred_at?: string
          organization_id?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_interactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_relationships: {
        Row: {
          account_manager_id: string | null
          commercial_status: Database["public"]["Enums"]["customer_status"]
          created_at: string
          created_by: string | null
          customer_since: string
          next_action: string | null
          next_action_at: string | null
          next_action_owner_id: string | null
          organization_id: string
          origin: string | null
          updated_at: string
        }
        Insert: {
          account_manager_id?: string | null
          commercial_status?: Database["public"]["Enums"]["customer_status"]
          created_at?: string
          created_by?: string | null
          customer_since?: string
          next_action?: string | null
          next_action_at?: string | null
          next_action_owner_id?: string | null
          organization_id: string
          origin?: string | null
          updated_at?: string
        }
        Update: {
          account_manager_id?: string | null
          commercial_status?: Database["public"]["Enums"]["customer_status"]
          created_at?: string
          created_by?: string | null
          customer_since?: string
          next_action?: string | null
          next_action_at?: string | null
          next_action_owner_id?: string | null
          organization_id?: string
          origin?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_relationships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_compositions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          items: Json
          name: string
          offer_id: string
          organization_id: string
          total_units: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          items?: Json
          name: string
          offer_id: string
          organization_id: string
          total_units?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          items?: Json
          name?: string
          offer_id?: string
          organization_id?: string
          total_units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_compositions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "supplier_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_compositions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          offer_variant_id: string | null
          organization_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          offer_variant_id?: string | null
          organization_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          movement_type?: Database["public"]["Enums"]["inventory_movement_type"]
          offer_variant_id?: string | null
          organization_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_offer_variant_id_fkey"
            columns: ["offer_variant_id"]
            isOneToOne: false
            referencedRelation: "supplier_offer_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account: string
          amount: number
          created_at: string
          created_by: string | null
          direction: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: number
          memo: string | null
          organization_id: string | null
          reference_id: string | null
          reference_type: string | null
          reverses_entry_id: number | null
        }
        Insert: {
          account: string
          amount: number
          created_at?: string
          created_by?: string | null
          direction: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id?: never
          memo?: string | null
          organization_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reverses_entry_id?: number | null
        }
        Update: {
          account?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          direction?: string
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          id?: never
          memo?: string | null
          organization_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reverses_entry_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      org_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_capabilities: {
        Row: {
          capability: Database["public"]["Enums"]["org_capability"]
          created_at: string
          enabled: boolean
          organization_id: string
        }
        Insert: {
          capability: Database["public"]["Enums"]["org_capability"]
          created_at?: string
          enabled?: boolean
          organization_id: string
        }
        Update: {
          capability?: Database["public"]["Enums"]["org_capability"]
          created_at?: string
          enabled?: boolean
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_capabilities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          organization_id: string
          role_key: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role_key: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role_key?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role_key: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role_key: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role_key?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      organization_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          kind: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          kind?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          kind?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_tag_links: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_tag_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_tag_links_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "org_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          account_manager_id: string | null
          city: string | null
          complement: string | null
          country: string
          created_at: string
          created_by: string | null
          district: string | null
          document: string | null
          email: string | null
          id: string
          is_platform: boolean
          legal_name: string | null
          logo_url: string | null
          name: string
          origin: string | null
          person_type: string
          phone: string | null
          postal_code: string | null
          responsible_document: string | null
          responsible_email: string | null
          responsible_name: string | null
          responsible_role: string | null
          responsible_whatsapp: string | null
          slug: string
          state: string | null
          status: Database["public"]["Enums"]["org_status"]
          street: string | null
          street_number: string | null
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          account_manager_id?: string | null
          city?: string | null
          complement?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          district?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_platform?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name: string
          origin?: string | null
          person_type?: string
          phone?: string | null
          postal_code?: string | null
          responsible_document?: string | null
          responsible_email?: string | null
          responsible_name?: string | null
          responsible_role?: string | null
          responsible_whatsapp?: string | null
          slug: string
          state?: string | null
          status?: Database["public"]["Enums"]["org_status"]
          street?: string | null
          street_number?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          account_manager_id?: string | null
          city?: string | null
          complement?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          district?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_platform?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          origin?: string | null
          person_type?: string
          phone?: string | null
          postal_code?: string | null
          responsible_document?: string | null
          responsible_email?: string | null
          responsible_name?: string | null
          responsible_role?: string | null
          responsible_whatsapp?: string | null
          slug?: string
          state?: string | null
          status?: Database["public"]["Enums"]["org_status"]
          street?: string | null
          street_number?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      payment_accounts: {
        Row: {
          created_at: string
          holder_document: string | null
          holder_name: string | null
          id: string
          is_default: boolean
          kind: Database["public"]["Enums"]["payment_account_kind"]
          organization_id: string
          pix_key: string | null
          pix_key_type: string | null
          provider: string | null
          provider_account_id: string | null
          status: Database["public"]["Enums"]["payment_account_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          holder_document?: string | null
          holder_name?: string | null
          id?: string
          is_default?: boolean
          kind: Database["public"]["Enums"]["payment_account_kind"]
          organization_id: string
          pix_key?: string | null
          pix_key_type?: string | null
          provider?: string | null
          provider_account_id?: string | null
          status?: Database["public"]["Enums"]["payment_account_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          holder_document?: string | null
          holder_name?: string | null
          id?: string
          is_default?: boolean
          kind?: Database["public"]["Enums"]["payment_account_kind"]
          organization_id?: string
          pix_key?: string | null
          pix_key_type?: string | null
          provider?: string | null
          provider_account_id?: string | null
          status?: Database["public"]["Enums"]["payment_account_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          beneficiary_organization_id: string | null
          beneficiary_role: string
          created_at: string
          id: string
          payment_id: string
          via_provider_split: boolean
        }
        Insert: {
          amount: number
          beneficiary_organization_id?: string | null
          beneficiary_role: string
          created_at?: string
          id?: string
          payment_id: string
          via_provider_split?: boolean
        }
        Update: {
          amount?: number
          beneficiary_organization_id?: string | null
          beneficiary_role?: string
          created_at?: string
          id?: string
          payment_id?: string
          via_provider_split?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_beneficiary_organization_id_fkey"
            columns: ["beneficiary_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          method: string | null
          organization_id: string | null
          paid_at: string | null
          provider: string | null
          provider_payment_id: string | null
          reference_id: string | null
          reference_type: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          method?: string | null
          organization_id?: string | null
          paid_at?: string | null
          provider?: string | null
          provider_payment_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          method?: string | null
          organization_id?: string | null
          paid_at?: string | null
          provider?: string | null
          provider_payment_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string | null
          organization_id: string
          paid_at: string | null
          payment_account_id: string | null
          provider_reference: string | null
          status: Database["public"]["Enums"]["payout_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: string | null
          organization_id: string
          paid_at?: string | null
          payment_account_id?: string | null
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string | null
          organization_id?: string
          paid_at?: string | null
          payment_account_id?: string | null
          provider_reference?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          description: string | null
          key: string
        }
        Insert: {
          description?: string | null
          key: string
        }
        Update: {
          description?: string | null
          key?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          modality: Database["public"]["Enums"]["commercial_modality"] | null
          name: string
          priority: number
          rule_type: Database["public"]["Enums"]["pricing_rule_type"]
          scope: Database["public"]["Enums"]["pricing_scope"]
          scope_id: string | null
          starts_at: string | null
          tiers: Json
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          modality?: Database["public"]["Enums"]["commercial_modality"] | null
          name: string
          priority?: number
          rule_type: Database["public"]["Enums"]["pricing_rule_type"]
          scope?: Database["public"]["Enums"]["pricing_scope"]
          scope_id?: string | null
          starts_at?: string | null
          tiers?: Json
          updated_at?: string
          value?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          modality?: Database["public"]["Enums"]["commercial_modality"] | null
          name?: string
          priority?: number
          rule_type?: Database["public"]["Enums"]["pricing_rule_type"]
          scope?: Database["public"]["Enums"]["pricing_scope"]
          scope_id?: string | null
          starts_at?: string | null
          tiers?: Json
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          attributes: Json
          barcode: string | null
          created_at: string
          id: string
          is_active: boolean
          product_id: string
          sku: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          barcode?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          product_id: string
          sku: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          barcode?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          product_id?: string
          sku?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          images: Json
          name: string
          owner_organization_id: string | null
          slug: string
          status: Database["public"]["Enums"]["catalog_status"]
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          images?: Json
          name: string
          owner_organization_id?: string | null
          slug: string
          status?: Database["public"]["Enums"]["catalog_status"]
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          images?: Json
          name?: string
          owner_organization_id?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["catalog_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_owner_organization_id_fkey"
            columns: ["owner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      receivables: {
        Row: {
          allocation_id: string | null
          amount: number
          created_at: string
          due_at: string | null
          id: string
          organization_id: string
          status: Database["public"]["Enums"]["receivable_status"]
          updated_at: string
        }
        Insert: {
          allocation_id?: string | null
          amount: number
          created_at?: string
          due_at?: string | null
          id?: string
          organization_id: string
          status?: Database["public"]["Enums"]["receivable_status"]
          updated_at?: string
        }
        Update: {
          allocation_id?: string | null
          amount?: number
          created_at?: string
          due_at?: string | null
          id?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["receivable_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivables_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "payment_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_key: string
        }
        Insert: {
          permission_key: string
          role_key: string
        }
        Update: {
          permission_key?: string
          role_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      roles: {
        Row: {
          description: string | null
          key: string
          name: string
          scope: string
        }
        Insert: {
          description?: string | null
          key: string
          name: string
          scope?: string
        }
        Update: {
          description?: string | null
          key?: string
          name?: string
          scope?: string
        }
        Relationships: []
      }
      store_listings: {
        Row: {
          created_at: string
          id: string
          is_published: boolean
          modality: Database["public"]["Enums"]["commercial_modality"]
          offer_id: string | null
          organization_id: string
          product_id: string
          retail_price: number | null
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_published?: boolean
          modality?: Database["public"]["Enums"]["commercial_modality"]
          offer_id?: string | null
          organization_id: string
          product_id: string
          retail_price?: number | null
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_published?: boolean
          modality?: Database["public"]["Enums"]["commercial_modality"]
          offer_id?: string | null
          organization_id?: string
          product_id?: string
          retail_price?: number | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_listings_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "supplier_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_listings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_listings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          created_by: string | null
          document: string | null
          email: string | null
          features: Json
          id: string
          instagram: string | null
          logo_url: string | null
          mode: Database["public"]["Enums"]["store_mode"]
          name: string
          organization_id: string
          primary_color: string | null
          secondary_color: string | null
          slug: string
          status: Database["public"]["Enums"]["store_status"]
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          features?: Json
          id?: string
          instagram?: string | null
          logo_url?: string | null
          mode?: Database["public"]["Enums"]["store_mode"]
          name: string
          organization_id: string
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          status?: Database["public"]["Enums"]["store_status"]
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document?: string | null
          email?: string | null
          features?: Json
          id?: string
          instagram?: string | null
          logo_url?: string | null
          mode?: Database["public"]["Enums"]["store_mode"]
          name?: string
          organization_id?: string
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["store_status"]
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_offer_variants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          offer_id: string
          organization_id: string
          supply_cost: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          offer_id: string
          organization_id: string
          supply_cost: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          offer_id?: string
          organization_id?: string
          supply_cost?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_offer_variants_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "supplier_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_offer_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_offer_variants_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_offers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lead_time_days: number | null
          modalities: Database["public"]["Enums"]["commercial_modality"][]
          moq: number
          organization_id: string
          product_id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["catalog_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_time_days?: number | null
          modalities?: Database["public"]["Enums"]["commercial_modality"][]
          moq?: number
          organization_id: string
          product_id: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["catalog_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_time_days?: number | null
          modalities?: Database["public"]["Enums"]["commercial_modality"][]
          moq?: number
          organization_id?: string
          product_id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["catalog_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_offers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      inventory_balances: {
        Row: {
          on_hand: number | null
          organization_id: string | null
          reserved: number | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_my_invites: { Args: never; Returns: number }
      admin_customer_list: {
        Args: {
          _capability?: string
          _commercial?: string
          _from?: string
          _has_store?: boolean
          _manager?: string
          _origin?: string
          _page?: number
          _q?: string
          _size?: number
          _state?: string
          _status?: string
          _store_active?: boolean
          _tag?: string
          _to?: string
        }
        Returns: Json
      }
      admin_customer_queues: { Args: never; Returns: Json }
      admin_customer_stats: { Args: { _from?: string }; Returns: Json }
      admin_dashboard_metrics: {
        Args: { _from: string; _to: string }
        Returns: Json
      }
      admin_ops_queue: { Args: never; Returns: Json }
      admin_org_stats: { Args: never; Returns: Json }
      admin_search_organizations: {
        Args: {
          _capability?: string
          _from?: string
          _has_products?: boolean
          _has_store?: boolean
          _page?: number
          _profile?: string
          _q?: string
          _size?: number
          _status?: string
          _tag?: string
          _to?: string
        }
        Returns: Json
      }
      customer_360: { Args: { _org: string }; Returns: Json }
      customer_timeline: { Args: { _org: string }; Returns: Json }
      find_user_id_by_email: { Args: { _email: string }; Returns: string }
      has_org_permission: {
        Args: { _org: string; _perm: string; _uid: string }
        Returns: boolean
      }
      is_customer_org: { Args: { _org: string }; Returns: boolean }
      is_org_member: { Args: { _org: string; _uid: string }; Returns: boolean }
      is_platform_admin: { Args: { _uid: string }; Returns: boolean }
      org_member_directory: {
        Args: { _org: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          last_sign_in_at: string
          member_id: string
          role_key: string
          status: string
          user_id: string
        }[]
      }
      org_summary: { Args: { _org: string }; Returns: Json }
      platform_team: {
        Args: never
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      resolve_platform_price: {
        Args: {
          _buyer_org?: string
          _modality: Database["public"]["Enums"]["commercial_modality"]
          _offer_variant_id: string
        }
        Returns: {
          platform_amount: number
          reseller_cost: number
          rule_id: string
          supply_cost: number
        }[]
      }
    }
    Enums: {
      catalog_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "rejected"
        | "active"
        | "paused"
        | "archived"
      commercial_modality:
        | "drop"
        | "mixed_wholesale"
        | "closed_grade"
        | "retail"
        | "wholesale"
      customer_status: "novo" | "onboarding" | "ativo" | "inativo" | "em_risco"
      inventory_movement_type:
        | "in"
        | "out"
        | "reserve"
        | "release"
        | "adjust"
        | "return"
      ledger_entry_type:
        | "sale"
        | "allocation"
        | "fee"
        | "payout"
        | "refund"
        | "partial_refund"
        | "chargeback"
        | "reversal"
        | "adjustment"
      org_capability:
        | "supply_products"
        | "buy_wholesale"
        | "buy_mixed_wholesale"
        | "buy_closed_grade"
        | "use_dropshipping"
        | "sell_retail"
        | "sell_wholesale"
        | "operate_store"
        | "own_inventory"
      org_status: "pending" | "active" | "suspended" | "archived" | "blocked"
      payment_account_kind: "gateway_recipient" | "pix"
      payment_account_status: "pending" | "active" | "disabled"
      payment_status:
        | "pending"
        | "authorized"
        | "paid"
        | "failed"
        | "refunded"
        | "partially_refunded"
        | "chargeback"
        | "cancelled"
      payout_status: "pending" | "processing" | "paid" | "failed" | "cancelled"
      pricing_rule_type: "percent" | "fixed" | "tiered"
      pricing_scope:
        | "global"
        | "supplier"
        | "category"
        | "brand"
        | "product"
        | "variant"
        | "modality"
        | "organization"
        | "promotion"
      receivable_status: "pending" | "available" | "settled" | "cancelled"
      store_mode: "retail" | "wholesale" | "hybrid"
      store_status: "draft" | "active" | "suspended" | "archived"
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
      catalog_status: [
        "draft",
        "pending_review",
        "approved",
        "rejected",
        "active",
        "paused",
        "archived",
      ],
      commercial_modality: [
        "drop",
        "mixed_wholesale",
        "closed_grade",
        "retail",
        "wholesale",
      ],
      customer_status: ["novo", "onboarding", "ativo", "inativo", "em_risco"],
      inventory_movement_type: [
        "in",
        "out",
        "reserve",
        "release",
        "adjust",
        "return",
      ],
      ledger_entry_type: [
        "sale",
        "allocation",
        "fee",
        "payout",
        "refund",
        "partial_refund",
        "chargeback",
        "reversal",
        "adjustment",
      ],
      org_capability: [
        "supply_products",
        "buy_wholesale",
        "buy_mixed_wholesale",
        "buy_closed_grade",
        "use_dropshipping",
        "sell_retail",
        "sell_wholesale",
        "operate_store",
        "own_inventory",
      ],
      org_status: ["pending", "active", "suspended", "archived", "blocked"],
      payment_account_kind: ["gateway_recipient", "pix"],
      payment_account_status: ["pending", "active", "disabled"],
      payment_status: [
        "pending",
        "authorized",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
        "chargeback",
        "cancelled",
      ],
      payout_status: ["pending", "processing", "paid", "failed", "cancelled"],
      pricing_rule_type: ["percent", "fixed", "tiered"],
      pricing_scope: [
        "global",
        "supplier",
        "category",
        "brand",
        "product",
        "variant",
        "modality",
        "organization",
        "promotion",
      ],
      receivable_status: ["pending", "available", "settled", "cancelled"],
      store_mode: ["retail", "wholesale", "hybrid"],
      store_status: ["draft", "active", "suspended", "archived"],
    },
  },
} as const
