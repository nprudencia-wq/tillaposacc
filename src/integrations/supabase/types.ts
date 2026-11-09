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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: string
          store_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: string
          store_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          store_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_stock: {
        Row: {
          branch_id: string
          product_id: string
          quantity: number
          store_id: string | null
        }
        Insert: {
          branch_id: string
          product_id: string
          quantity?: number
          store_id?: string | null
        }
        Update: {
          branch_id?: string
          product_id?: string
          quantity?: number
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_stock_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_main: boolean
          name: string
          store_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_main?: boolean
          name: string
          store_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_main?: boolean
          name?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cashier_shifts: {
        Row: {
          actual_cash_usd: number | null
          actual_cash_zar: number | null
          actual_cash_zig: number | null
          cashier_id: string
          closed_at: string | null
          expected_cash_usd: number | null
          expected_cash_zar: number | null
          expected_cash_zig: number | null
          handover_at: string | null
          handover_by: string | null
          handover_summary: string | null
          id: string
          manager_notes: string | null
          notes: string | null
          opened_at: string
          opening_float_usd: number
          opening_float_zar: number
          opening_float_zig: number
          shift_number: string
          status: string
          store_id: string | null
          variance_usd: number | null
          variance_zar: number | null
          variance_zig: number | null
        }
        Insert: {
          actual_cash_usd?: number | null
          actual_cash_zar?: number | null
          actual_cash_zig?: number | null
          cashier_id: string
          closed_at?: string | null
          expected_cash_usd?: number | null
          expected_cash_zar?: number | null
          expected_cash_zig?: number | null
          handover_at?: string | null
          handover_by?: string | null
          handover_summary?: string | null
          id?: string
          manager_notes?: string | null
          notes?: string | null
          opened_at?: string
          opening_float_usd?: number
          opening_float_zar?: number
          opening_float_zig?: number
          shift_number?: string
          status?: string
          store_id?: string | null
          variance_usd?: number | null
          variance_zar?: number | null
          variance_zig?: number | null
        }
        Update: {
          actual_cash_usd?: number | null
          actual_cash_zar?: number | null
          actual_cash_zig?: number | null
          cashier_id?: string
          closed_at?: string | null
          expected_cash_usd?: number | null
          expected_cash_zar?: number | null
          expected_cash_zig?: number | null
          handover_at?: string | null
          handover_by?: string | null
          handover_summary?: string | null
          id?: string
          manager_notes?: string | null
          notes?: string | null
          opened_at?: string
          opening_float_usd?: number
          opening_float_zar?: number
          opening_float_zig?: number
          shift_number?: string
          status?: string
          store_id?: string | null
          variance_usd?: number | null
          variance_zar?: number | null
          variance_zig?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cashier_shifts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          store_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          store_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_confirmations: {
        Row: {
          confirmed_at: string
          confirmed_by: string
          rand_rate: number
          store_id: string
        }
        Insert: {
          confirmed_at?: string
          confirmed_by: string
          rand_rate: number
          store_id: string
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string
          rand_rate?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "currency_confirmations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          kind: string
          note: string
          period: string | null
          store_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          kind: string
          note?: string
          period?: string | null
          store_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          kind?: string
          note?: string
          period?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_adjustments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_adjustments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          amount: number
          client_ref: string | null
          created_at: string
          currency: string
          customer_id: string
          exchange_rate: number
          id: string
          method: string
          original_amount: number
          payment_number: string
          received_by: string
          reference: string | null
          shift_id: string | null
          store_id: string | null
        }
        Insert: {
          amount: number
          client_ref?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          exchange_rate?: number
          id?: string
          method: string
          original_amount: number
          payment_number?: string
          received_by: string
          reference?: string | null
          shift_id?: string | null
          store_id?: string | null
        }
        Update: {
          amount?: number
          client_ref?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          exchange_rate?: number
          id?: string
          method?: string
          original_amount?: number
          payment_number?: string
          received_by?: string
          reference?: string | null
          shift_id?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "cashier_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          credit_limit: number
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          store_id: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          store_id?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_settlements: {
        Row: {
          auto: boolean
          day: string
          id: string
          lines: Json
          notes: string
          settled_at: string
          settled_by: string
          store_id: string
        }
        Insert: {
          auto?: boolean
          day: string
          id?: string
          lines?: Json
          notes?: string
          settled_at?: string
          settled_by?: string
          store_id?: string
        }
        Update: {
          auto?: boolean
          day?: string
          id?: string
          lines?: Json
          notes?: string
          settled_at?: string
          settled_by?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_settlements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      document_counters: {
        Row: {
          kind: string
          store_id: string
          value: number
        }
        Insert: {
          kind: string
          store_id: string
          value?: number
        }
        Update: {
          kind?: string
          store_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_counters_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          currency: string
          description: string | null
          exchange_rate: number
          expense_date: string
          id: string
          method: string
          original_amount: number
          posted_by: string
          reference: string | null
          store_id: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          currency?: string
          description?: string | null
          exchange_rate?: number
          expense_date?: string
          id?: string
          method?: string
          original_amount: number
          posted_by: string
          reference?: string | null
          store_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          currency?: string
          description?: string | null
          exchange_rate?: number
          expense_date?: string
          id?: string
          method?: string
          original_amount?: number
          posted_by?: string
          reference?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_accounts: {
        Row: {
          active: boolean
          code: string
          created_at: string
          name: string
          store_id: string
          system: boolean
          type: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          name: string
          store_id?: string
          system?: boolean
          type: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          name?: string
          store_id?: string
          system?: boolean
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "gl_accounts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_drafts: {
        Row: {
          created_at: string
          created_by: string
          id: string
          payload: Json
          posted_grn_id: string | null
          store_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          payload?: Json
          posted_grn_id?: string | null
          store_id?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          payload?: Json
          posted_grn_id?: string | null
          store_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "grn_drafts_posted_grn_id_fkey"
            columns: ["posted_grn_id"]
            isOneToOne: false
            referencedRelation: "grns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_drafts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_items: {
        Row: {
          grn_id: string
          id: string
          line_total: number
          name: string
          original_unit_cost: number
          product_id: string
          quantity: number
          store_id: string | null
          unit_cost: number
        }
        Insert: {
          grn_id: string
          id?: string
          line_total: number
          name: string
          original_unit_cost?: number
          product_id: string
          quantity: number
          store_id?: string | null
          unit_cost: number
        }
        Update: {
          grn_id?: string
          id?: string
          line_total?: number
          name?: string
          original_unit_cost?: number
          product_id?: string
          quantity?: number
          store_id?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "grn_items_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "grns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      grns: {
        Row: {
          created_at: string
          currency: string
          exchange_rate: number
          grn_number: string
          id: string
          invoice_number: string | null
          note: string | null
          original_total: number
          received_by: string
          store_id: string | null
          supplier_id: string
          total: number
        }
        Insert: {
          created_at?: string
          currency?: string
          exchange_rate?: number
          grn_number?: string
          id?: string
          invoice_number?: string | null
          note?: string | null
          original_total?: number
          received_by: string
          store_id?: string | null
          supplier_id: string
          total: number
        }
        Update: {
          created_at?: string
          currency?: string
          exchange_rate?: number
          grn_number?: string
          id?: string
          invoice_number?: string | null
          note?: string | null
          original_total?: number
          received_by?: string
          store_id?: string | null
          supplier_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "grns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payment_allocations: {
        Row: {
          amount: number
          client_ref: string
          created_at: string
          document_id: string
          id: string
          payment_id: string
          store_id: string
        }
        Insert: {
          amount: number
          client_ref: string
          created_at?: string
          document_id: string
          id?: string
          payment_id: string
          store_id?: string
        }
        Update: {
          amount?: number
          client_ref?: string
          created_at?: string
          document_id?: string
          id?: string
          payment_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payment_allocations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sales_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "customer_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payment_allocations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          journal_number: string
          memo: string
          posted_by: string
          store_id: string | null
        }
        Insert: {
          created_at?: string
          entry_date: string
          id?: string
          journal_number?: string
          memo: string
          posted_by: string
          store_id?: string | null
        }
        Update: {
          created_at?: string
          entry_date?: string
          id?: string
          journal_number?: string
          memo?: string
          posted_by?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_code: string
          credit: number
          debit: number
          entry_id: string
          id: string
          store_id: string | null
        }
        Insert: {
          account_code: string
          credit?: number
          debit?: number
          entry_id: string
          id?: string
          store_id?: string | null
        }
        Update: {
          account_code?: string
          credit?: number
          debit?: number
          entry_id?: string
          id?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_store_account_fkey"
            columns: ["store_id", "account_code"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["store_id", "code"]
          },
          {
            foreignKeyName: "journal_lines_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          is_account: boolean
          is_cash: boolean
          name: string
          sort_order: number
          store_id: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          is_account?: boolean
          is_cash?: boolean
          name: string
          sort_order?: number
          store_id?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          is_account?: boolean
          is_cash?: boolean
          name?: string
          sort_order?: number
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_types_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          cost_price: number
          effective_from: string
          id: string
          product_id: string
          selling_price: number
          store_id: string | null
        }
        Insert: {
          cost_price: number
          effective_from?: string
          id?: string
          product_id: string
          selling_price: number
          store_id?: string | null
        }
        Update: {
          cost_price?: number
          effective_from?: string
          id?: string
          product_id?: string
          selling_price?: number
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          barcode: string | null
          category_id: string | null
          cost_price: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          max_stock: number
          min_stock: number
          name: string
          selling_price: number
          sku: string | null
          stock: number
          store_id: string | null
          wholesale_price: number
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          max_stock?: number
          min_stock?: number
          name: string
          selling_price?: number
          sku?: string | null
          stock?: number
          store_id?: string | null
          wholesale_price?: number
        }
        Update: {
          active?: boolean
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          max_stock?: number
          min_stock?: number
          name?: string
          selling_price?: number
          sku?: string | null
          stock?: number
          store_id?: string | null
          wholesale_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          store_id: string | null
          username: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name?: string
          id: string
          store_id?: string | null
          username?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          store_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_history: {
        Row: {
          effective_from: string
          id: string
          rand_rate: number
          store_id: string | null
          zig_rate: number
        }
        Insert: {
          effective_from?: string
          id?: string
          rand_rate?: number
          store_id?: string | null
          zig_rate: number
        }
        Update: {
          effective_from?: string
          id?: string
          rand_rate?: number
          store_id?: string | null
          zig_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "rate_history_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          reason: string
          refunded_by: string
          returned_lines: Json
          sale_id: string
          shift_id: string | null
          store_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: string
          reason: string
          refunded_by: string
          returned_lines?: Json
          sale_id: string
          shift_id?: string | null
          store_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          reason?: string
          refunded_by?: string
          returned_lines?: Json
          sale_id?: string
          shift_id?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "cashier_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          cost_price: number
          id: string
          line_total: number
          name: string
          original_price: number | null
          product_id: string | null
          quantity: number
          refunded_qty: number
          sale_id: string
          store_id: string | null
          unit_price: number
        }
        Insert: {
          cost_price?: number
          id?: string
          line_total: number
          name: string
          original_price?: number | null
          product_id?: string | null
          quantity: number
          refunded_qty?: number
          sale_id: string
          store_id?: string | null
          unit_price: number
        }
        Update: {
          cost_price?: number
          id?: string
          line_total?: number
          name?: string
          original_price?: number | null
          product_id?: string | null
          quantity?: number
          refunded_qty?: number
          sale_id?: string
          store_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          currency: string
          exchange_rate: number
          id: string
          method: string
          sale_id: string
          store_id: string | null
          verified: boolean
        }
        Insert: {
          amount: number
          currency: string
          exchange_rate?: number
          id?: string
          method: string
          sale_id: string
          store_id?: string | null
          verified?: boolean
        }
        Update: {
          amount?: number
          currency?: string
          exchange_rate?: number
          id?: string
          method?: string
          sale_id?: string
          store_id?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_paid: number
          cashier_id: string
          change_given: number
          client_ref: string | null
          created_at: string
          currency: string
          customer_id: string | null
          discount: number
          exchange_rate: number
          id: string
          offline: boolean
          rand_rate: number
          sale_number: string
          shift_id: string | null
          status: string
          store_id: string | null
          subtotal: number
          synced_at: string | null
          total: number
          zig_rate: number | null
        }
        Insert: {
          amount_paid: number
          cashier_id: string
          change_given?: number
          client_ref?: string | null
          created_at?: string
          currency: string
          customer_id?: string | null
          discount?: number
          exchange_rate?: number
          id?: string
          offline?: boolean
          rand_rate?: number
          sale_number?: string
          shift_id?: string | null
          status?: string
          store_id?: string | null
          subtotal: number
          synced_at?: string | null
          total: number
          zig_rate?: number | null
        }
        Update: {
          amount_paid?: number
          cashier_id?: string
          change_given?: number
          client_ref?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          discount?: number
          exchange_rate?: number
          id?: string
          offline?: boolean
          rand_rate?: number
          sale_number?: string
          shift_id?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number
          synced_at?: string | null
          total?: number
          zig_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "cashier_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_documents: {
        Row: {
          client_ref: string | null
          created_at: string
          created_by: string
          currency: string
          customer_id: string | null
          customer_name: string
          discount: number
          due_date: string | null
          exchange_rate: number
          id: string
          kind: string
          lines: Json
          notes: string
          number: string
          refund_id: string | null
          sale_id: string | null
          source_id: string | null
          status: string
          store_id: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          client_ref?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          customer_id?: string | null
          customer_name?: string
          discount?: number
          due_date?: string | null
          exchange_rate?: number
          id?: string
          kind: string
          lines?: Json
          notes?: string
          number: string
          refund_id?: string | null
          sale_id?: string | null
          source_id?: string | null
          status?: string
          store_id?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          client_ref?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          customer_id?: string | null
          customer_name?: string
          discount?: number
          due_date?: string | null
          exchange_rate?: number
          id?: string
          kind?: string
          lines?: Json
          notes?: string
          number?: string
          refund_id?: string | null
          sale_id?: string | null
          source_id?: string | null
          status?: string
          store_id?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_documents_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_documents_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sales_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_documents_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          address: string
          bad_debt_provision_rate: number
          billing_exempt: boolean
          business_name: string
          debtor_interest_rate: number
          email: string
          grace_days: number
          id: number
          interest_after_days: number
          interest_auto: boolean
          logo_url: string
          paid_until: string
          phone: string
          plan_name: string
          plan_price_usd: number
          prices_include_vat: boolean
          provision_after_days: number
          rand_rate: number
          receipt_config: Json
          receipt_footer: string
          store_id: string | null
          tax_number: string
          till_count: number
          updated_at: string
          vat_enabled: boolean
          vat_rate: number
          vendor_name: string
          vendor_pay_details: string
          zig_rate: number
        }
        Insert: {
          address?: string
          bad_debt_provision_rate?: number
          billing_exempt?: boolean
          business_name?: string
          debtor_interest_rate?: number
          email?: string
          grace_days?: number
          id?: number
          interest_after_days?: number
          interest_auto?: boolean
          logo_url?: string
          paid_until?: string
          phone?: string
          plan_name?: string
          plan_price_usd?: number
          prices_include_vat?: boolean
          provision_after_days?: number
          rand_rate?: number
          receipt_config?: Json
          receipt_footer?: string
          store_id?: string | null
          tax_number?: string
          till_count?: number
          updated_at?: string
          vat_enabled?: boolean
          vat_rate?: number
          vendor_name?: string
          vendor_pay_details?: string
          zig_rate?: number
        }
        Update: {
          address?: string
          bad_debt_provision_rate?: number
          billing_exempt?: boolean
          business_name?: string
          debtor_interest_rate?: number
          email?: string
          grace_days?: number
          id?: number
          interest_after_days?: number
          interest_auto?: boolean
          logo_url?: string
          paid_until?: string
          phone?: string
          plan_name?: string
          plan_price_usd?: number
          prices_include_vat?: boolean
          provision_after_days?: number
          rand_rate?: number
          receipt_config?: Json
          receipt_footer?: string
          store_id?: string | null
          tax_number?: string
          till_count?: number
          updated_at?: string
          vat_enabled?: boolean
          vat_rate?: number
          vendor_name?: string
          vendor_pay_details?: string
          zig_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_cash_movements: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          reason: string
          shift_id: string
          store_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          id?: string
          reason: string
          shift_id: string
          store_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          reason?: string
          shift_id?: string
          store_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_cash_movements_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "cashier_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_cash_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_pins: {
        Row: {
          failed_attempts: number
          locked_until: string | null
          pin_hash: string
          store_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          failed_attempts?: number
          locked_until?: string | null
          pin_hash: string
          store_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          failed_attempts?: number
          locked_until?: string | null
          pin_hash?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_pins_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_pins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          balance_after: number
          branch_id: string | null
          created_at: string
          id: string
          note: string | null
          product_id: string
          quantity: number
          reference: string | null
          store_id: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          balance_after: number
          branch_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          product_id: string
          quantity: number
          reference?: string | null
          store_id?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          balance_after?: number
          branch_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          product_id?: string
          quantity?: number
          reference?: string | null
          store_id?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          created_at: string
          created_by: string
          from_branch: string
          id: string
          items: Json
          note: string | null
          store_id: string | null
          to_branch: string
          transfer_number: string
        }
        Insert: {
          created_at?: string
          created_by: string
          from_branch: string
          id?: string
          items: Json
          note?: string | null
          store_id?: string | null
          to_branch: string
          transfer_number?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          from_branch?: string
          id?: string
          items?: Json
          note?: string | null
          store_id?: string | null
          to_branch?: string
          transfer_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_branch_fkey"
            columns: ["from_branch"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_branch_fkey"
            columns: ["to_branch"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktake_items: {
        Row: {
          counted_qty: number | null
          name: string
          product_id: string
          stocktake_id: string
          store_id: string | null
          system_qty: number
          unit_cost: number
        }
        Insert: {
          counted_qty?: number | null
          name: string
          product_id: string
          stocktake_id: string
          store_id?: string | null
          system_qty: number
          unit_cost?: number
        }
        Update: {
          counted_qty?: number | null
          name?: string
          product_id?: string
          stocktake_id?: string
          store_id?: string | null
          system_qty?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_items_stocktake_id_fkey"
            columns: ["stocktake_id"]
            isOneToOne: false
            referencedRelation: "stocktakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktakes: {
        Row: {
          category_id: string | null
          completed_at: string | null
          id: string
          note: string | null
          started_at: string
          started_by: string
          status: string
          stocktake_number: string
          store_id: string | null
        }
        Insert: {
          category_id?: string | null
          completed_at?: string | null
          id?: string
          note?: string | null
          started_at?: string
          started_by: string
          status?: string
          stocktake_number?: string
          store_id?: string | null
        }
        Update: {
          category_id?: string | null
          completed_at?: string | null
          id?: string
          note?: string | null
          started_at?: string
          started_by?: string
          status?: string
          stocktake_number?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stocktakes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktakes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_memberships: {
        Row: {
          created_at: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_memberships_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          billing_exempt: boolean
          created_at: string
          id: string
          is_vendor_store: boolean
          name: string
          trial_ends_at: string | null
          trial_started_at: string | null
        }
        Insert: {
          billing_exempt?: boolean
          created_at?: string
          id?: string
          is_vendor_store?: boolean
          name: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
        }
        Update: {
          billing_exempt?: boolean
          created_at?: string
          id?: string
          is_vendor_store?: boolean
          name?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
        }
        Relationships: []
      }
      subscription_payments: {
        Row: {
          amount: number
          decided_at: string | null
          decision_note: string | null
          id: string
          invoice_number: string
          method: string
          months: number
          payer_phone: string | null
          period_from: string | null
          period_to: string | null
          reference: string
          status: string
          store_id: string | null
          submitted_at: string
          submitted_by: string
          tills: number
        }
        Insert: {
          amount: number
          decided_at?: string | null
          decision_note?: string | null
          id?: string
          invoice_number?: string
          method: string
          months: number
          payer_phone?: string | null
          period_from?: string | null
          period_to?: string | null
          reference: string
          status?: string
          store_id?: string | null
          submitted_at?: string
          submitted_by: string
          tills?: number
        }
        Update: {
          amount?: number
          decided_at?: string | null
          decision_note?: string | null
          id?: string
          invoice_number?: string
          method?: string
          months?: number
          payer_phone?: string | null
          period_from?: string | null
          period_to?: string | null
          reference?: string
          status?: string
          store_id?: string | null
          submitted_at?: string
          submitted_by?: string
          tills?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          paid_by: string
          reference: string | null
          store_id: string | null
          supplier_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: string
          paid_by: string
          reference?: string | null
          store_id?: string | null
          supplier_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          paid_by?: string
          reference?: string | null
          store_id?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_returns: {
        Row: {
          created_at: string
          created_by: string
          id: string
          items: Json
          reason: string
          return_number: string
          store_id: string | null
          supplier_id: string
          total: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          items: Json
          reason: string
          return_number?: string
          store_id?: string | null
          supplier_id: string
          total?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          items?: Json
          reason?: string
          return_number?: string
          store_id?: string | null
          supplier_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          store_id: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          store_id?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      time_clock: {
        Row: {
          clock_in: string
          clock_out: string | null
          id: string
          note: string | null
          store_id: string | null
          user_id: string
        }
        Insert: {
          clock_in?: string
          clock_out?: string | null
          id?: string
          note?: string | null
          store_id?: string | null
          user_id: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          id?: string
          note?: string | null
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_clock_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          allowed: boolean
          permission: string
          store_id: string | null
          user_id: string
        }
        Insert: {
          allowed: boolean
          permission: string
          store_id?: string | null
          user_id: string
        }
        Update: {
          allowed?: boolean
          permission?: string
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          store_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      zimra_config: {
        Row: {
          activation_key_set: boolean
          bp_number: string
          certificate_set: boolean
          device_id: string
          device_model: string
          device_serial: string
          device_version: string
          enabled: boolean
          environment: string
          store_id: string
          taxpayer_name: string
          taxpayer_tin: string
          updated_at: string
          vat_number: string
        }
        Insert: {
          activation_key_set?: boolean
          bp_number?: string
          certificate_set?: boolean
          device_id?: string
          device_model?: string
          device_serial?: string
          device_version?: string
          enabled?: boolean
          environment?: string
          store_id?: string
          taxpayer_name?: string
          taxpayer_tin?: string
          updated_at?: string
          vat_number?: string
        }
        Update: {
          activation_key_set?: boolean
          bp_number?: string
          certificate_set?: boolean
          device_id?: string
          device_model?: string
          device_serial?: string
          device_version?: string
          enabled?: boolean
          environment?: string
          store_id?: string
          taxpayer_name?: string
          taxpayer_tin?: string
          updated_at?: string
          vat_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "zimra_config_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      zimra_fiscal_days: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          day_no: number
          id: string
          opened_at: string
          opened_by: string | null
          receipt_counter: number
          status: string
          store_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          day_no: number
          id?: string
          opened_at?: string
          opened_by?: string | null
          receipt_counter?: number
          status?: string
          store_id?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          day_no?: number
          id?: string
          opened_at?: string
          opened_by?: string | null
          receipt_counter?: number
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zimra_fiscal_days_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      zimra_receipts: {
        Row: {
          attempts: number
          created_at: string
          currency: string
          day_no: number
          error: string | null
          fiscal_day_id: string
          global_no: number
          id: string
          previous_hash: string | null
          receipt_counter: number
          receipt_hash: string
          receipt_type: string
          refund_id: string | null
          sale_id: string | null
          signature: string | null
          status: string
          store_id: string
          submitted_at: string | null
          tax_amount: number
          tax_rate: number
          total: number
          zimra_receipt_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          currency: string
          day_no: number
          error?: string | null
          fiscal_day_id: string
          global_no: number
          id?: string
          previous_hash?: string | null
          receipt_counter: number
          receipt_hash: string
          receipt_type: string
          refund_id?: string | null
          sale_id?: string | null
          signature?: string | null
          status?: string
          store_id: string
          submitted_at?: string | null
          tax_amount?: number
          tax_rate?: number
          total: number
          zimra_receipt_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          currency?: string
          day_no?: number
          error?: string | null
          fiscal_day_id?: string
          global_no?: number
          id?: string
          previous_hash?: string | null
          receipt_counter?: number
          receipt_hash?: string
          receipt_type?: string
          refund_id?: string | null
          sale_id?: string | null
          signature?: string | null
          status?: string
          store_id?: string
          submitted_at?: string | null
          tax_amount?: number
          tax_rate?: number
          total?: number
          zimra_receipt_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zimra_receipts_fiscal_day_id_fkey"
            columns: ["fiscal_day_id"]
            isOneToOne: false
            referencedRelation: "zimra_fiscal_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zimra_receipts_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: true
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zimra_receipts_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: true
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zimra_receipts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      zimra_secrets: {
        Row: {
          activation_key: string | null
          certificate: string | null
          private_key: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          activation_key?: string | null
          certificate?: string | null
          private_key?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          activation_key?: string | null
          certificate?: string | null
          private_key?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zimra_secrets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_customer_balance: {
        Args: {
          p_amount: number
          p_customer: string
          p_kind: string
          p_note?: string
        }
        Returns: string
      }
      adjust_stock: {
        Args: {
          p_note: string
          p_product: string
          p_qty: number
          p_type: string
        }
        Returns: number
      }
      auto_close_daily_settlements: {
        Args: { p_day?: string }
        Returns: number
      }
      can_adjust_customer_balance: { Args: never; Returns: boolean }
      can_manage_payment_types: { Args: { _user_id: string }; Returns: boolean }
      can_manage_staff: { Args: { _user_id: string }; Returns: boolean }
      can_manage_stock: { Args: { _user_id: string }; Returns: boolean }
      can_manage_store_member: { Args: { p_target: string }; Returns: boolean }
      can_post_expense: { Args: { _user_id: string }; Returns: boolean }
      can_refund: { Args: { _user_id: string }; Returns: boolean }
      can_view_accounts: { Args: { _user_id: string }; Returns: boolean }
      cancel_sales_document: {
        Args: { p_document: string }
        Returns: undefined
      }
      check_staff_pin: {
        Args: { p_pin: string; p_username: string }
        Returns: string
      }
      clock_in: { Args: never; Returns: string }
      clock_out: { Args: never; Returns: undefined }
      close_offline_shift: {
        Args: {
          p_actual_usd: number
          p_actual_zar: number
          p_actual_zig: number
          p_closed_at: string
          p_id: string
          p_notes: string
        }
        Returns: string
      }
      close_shift: {
        Args: { p_actual_usd: number; p_actual_zig: number; p_notes: string }
        Returns: string
      }
      close_shift_three: {
        Args: {
          p_actual_usd: number
          p_actual_zar: number
          p_actual_zig: number
          p_notes: string
        }
        Returns: string
      }
      complete_offline_sale: {
        Args: {
          p_client_ref: string
          p_currency: string
          p_discount: number
          p_items: Json
          p_payments: Json
          p_shift: string
          p_sold_at: string
        }
        Returns: Json
      }
      complete_offline_sale_v2: {
        Args: {
          p_client_ref: string
          p_currency: string
          p_customer?: string
          p_discount: number
          p_items: Json
          p_payments: Json
          p_shift: string
          p_sold_at: string
        }
        Returns: Json
      }
      complete_sale: {
        Args: {
          p_currency: string
          p_customer?: string
          p_discount: number
          p_items: Json
          p_payments: Json
        }
        Returns: Json
      }
      complete_sale_once: {
        Args: {
          p_client_ref: string
          p_currency: string
          p_customer?: string
          p_discount: number
          p_items: Json
          p_payments: Json
        }
        Returns: Json
      }
      convert_quote_to_invoice: {
        Args: { p_document: string }
        Returns: string
      }
      credit_note_refund: {
        Args: {
          p_client_ref: string
          p_items: Json
          p_method: string
          p_reason: string
          p_sale: string
        }
        Returns: Json
      }
      currency_rate: {
        Args: { p_currency: string; p_rand: number; p_zig: number }
        Returns: number
      }
      current_store_id: { Args: never; Returns: string }
      customer_balance: { Args: { p_customer: string }; Returns: number }
      customer_credit_snapshot: { Args: never; Returns: Json }
      debtor_overdue: {
        Args: { p_asof: string; p_days: number }
        Returns: {
          amount: number
          customer_id: string
        }[]
      }
      decide_subscription_payment: {
        Args: { p_approve: boolean; p_note: string; p_payment: string }
        Returns: undefined
      }
      delete_supplier: { Args: { p_id: string }; Returns: undefined }
      finish_stocktake: {
        Args: { p_apply: boolean; p_stocktake: string }
        Returns: undefined
      }
      gl_lines: {
        Args: { p_to: string }
        Returns: {
          account_code: string
          credit: number
          debit: number
          entry_date: string
          memo: string
          reference: string
          source: string
        }[]
      }
      gl_lines_base: {
        Args: { p_to: string }
        Returns: {
          account_code: string
          credit: number
          debit: number
          entry_date: string
          memo: string
          reference: string
          source: string
        }[]
      }
      gl_method_account: { Args: { p: string }; Returns: string }
      has_permission: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_staff_pin: { Args: { p_user: string }; Returns: boolean }
      invoice_outstanding: { Args: { p_document: string }; Returns: number }
      is_account_method: { Args: { p: string }; Returns: boolean }
      is_cash_method: { Args: { p: string }; Returns: boolean }
      is_owner_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      issue_credit_note: { Args: { p_refund: string }; Returns: string }
      issue_sale_invoice: { Args: { p_sale: string }; Returns: string }
      log_event: {
        Args: { p_action: string; p_details?: string }
        Returns: undefined
      }
      next_document_number: { Args: { p_kind: string }; Returns: string }
      open_offline_shift: {
        Args: {
          p_float_usd: number
          p_float_zar: number
          p_float_zig: number
          p_id: string
          p_opened_at: string
        }
        Returns: Json
      }
      open_shift: {
        Args: { p_float_usd: number; p_float_zig: number }
        Returns: Json
      }
      open_shift_three: {
        Args: { p_float_usd: number; p_float_zar: number; p_float_zig: number }
        Returns: Json
      }
      pay_supplier: {
        Args: {
          p_amount: number
          p_method: string
          p_reference: string
          p_supplier: string
        }
        Returns: undefined
      }
      post_expense: {
        Args: {
          p_amount: number
          p_category: string
          p_currency: string
          p_date: string
          p_description: string
          p_method: string
          p_reference: string
        }
        Returns: string
      }
      post_grn_draft: {
        Args: { p_id: string; p_version: number }
        Returns: Json
      }
      post_journal: {
        Args: { p_date: string; p_lines: Json; p_memo: string }
        Returns: string
      }
      post_sales_invoice: {
        Args: { p_document: string; p_payments: Json }
        Returns: Json
      }
      raise_debtor_interest: { Args: never; Returns: number }
      receive_customer_payment: {
        Args: {
          p_amount: number
          p_currency: string
          p_customer: string
          p_method: string
          p_reference: string
        }
        Returns: string
      }
      receive_goods: {
        Args: {
          p_invoice: string
          p_items: Json
          p_note: string
          p_paid: number
          p_supplier: string
        }
        Returns: Json
      }
      receive_goods_currency: {
        Args: {
          p_currency: string
          p_invoice: string
          p_items: Json
          p_method: string
          p_note: string
          p_paid: number
          p_rate: number
          p_supplier: string
        }
        Returns: Json
      }
      receive_invoice_payment: {
        Args: {
          p_amount: number
          p_client_ref: string
          p_currency: string
          p_document: string
          p_method: string
          p_reference: string
        }
        Returns: string
      }
      receive_offline_customer_payment: {
        Args: {
          p_amount: number
          p_client_ref: string
          p_currency: string
          p_customer: string
          p_method: string
          p_paid_at: string
          p_reference: string
          p_shift: string
        }
        Returns: string
      }
      record_cash_movement: {
        Args: {
          p_amount: number
          p_currency: string
          p_reason: string
          p_type: string
        }
        Returns: undefined
      }
      record_count: {
        Args: { p_product: string; p_qty: number; p_stocktake: string }
        Returns: undefined
      }
      refund_sale: {
        Args: {
          p_items: Json
          p_method: string
          p_reason: string
          p_sale: string
        }
        Returns: Json
      }
      return_to_supplier: {
        Args: { p_items: Json; p_reason: string; p_supplier: string }
        Returns: string
      }
      role_allows: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
      save_branch: {
        Args: { p_active: boolean; p_id: string; p_name: string }
        Returns: string
      }
      save_currency_settings: {
        Args: {
          p_confirm_rand: boolean
          p_rand_rate: number
          p_zig_rate: number
        }
        Returns: undefined
      }
      save_debtor_rules: {
        Args: {
          p_interest: number
          p_interest_days: number
          p_provision: number
          p_provision_days: number
        }
        Returns: undefined
      }
      save_gl_account: {
        Args: {
          p_active: boolean
          p_code: string
          p_name: string
          p_type: string
        }
        Returns: undefined
      }
      save_grn_draft: {
        Args: { p_id: string; p_payload: Json; p_version: number }
        Returns: {
          created_at: string
          created_by: string
          id: string
          payload: Json
          posted_grn_id: string | null
          store_id: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "grn_drafts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_interest_mode: { Args: { p_auto: boolean }; Returns: undefined }
      save_inventory_product: {
        Args: {
          p_expected_stock: number
          p_fields: Json
          p_id: string
          p_reason: string
          p_stock: number
        }
        Returns: string
      }
      save_sales_document: {
        Args: {
          p_currency: string
          p_customer: string
          p_discount: number
          p_due: string
          p_id: string
          p_kind: string
          p_lines: Json
          p_notes: string
        }
        Returns: string
      }
      save_shift_handover: {
        Args: { p_notes: string; p_shift: string; p_summary: string }
        Returns: undefined
      }
      save_zimra_config: { Args: { p: Json }; Returns: undefined }
      set_staff_pin: {
        Args: { p_pin: string; p_user: string }
        Returns: undefined
      }
      set_user_active: {
        Args: { p_active: boolean; p_user: string }
        Returns: undefined
      }
      set_user_permission: {
        Args: { p_allowed: boolean; p_perm: string; p_user: string }
        Returns: undefined
      }
      set_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user: string
        }
        Returns: undefined
      }
      shift_summary: { Args: { p_shift: string }; Returns: Json }
      start_stocktake: {
        Args: { p_category: string; p_note: string }
        Returns: string
      }
      submit_subscription_payment: {
        Args: {
          p_method: string
          p_months: number
          p_phone: string
          p_reference: string
        }
        Returns: string
      }
      subscription_state: { Args: never; Returns: string }
      transfer_stock: {
        Args: { p_from: string; p_items: Json; p_note: string; p_to: string }
        Returns: string
      }
      vendor_update_billing: {
        Args: { p_exempt: boolean; p_price: number; p_tills: number }
        Returns: undefined
      }
      vendor_update_plan: {
        Args: {
          p_details: string
          p_grace: number
          p_paid_until: string
          p_price: number
          p_vendor: string
        }
        Returns: undefined
      }
      verify_payment: { Args: { p_payment: string }; Returns: undefined }
      zimra_close_fiscal_day: { Args: never; Returns: undefined }
      zimra_record_receipt: {
        Args: {
          p_currency: string
          p_refund: string
          p_sale: string
          p_store: string
          p_total: number
          p_type: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "owner"
        | "manager"
        | "supervisor"
        | "cashier"
        | "stock_controller"
        | "accountant"
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
      app_role: [
        "admin",
        "owner",
        "manager",
        "supervisor",
        "cashier",
        "stock_controller",
        "accountant",
      ],
    },
  },
} as const
