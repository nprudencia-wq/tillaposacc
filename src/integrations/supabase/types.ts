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
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
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
        }
        Relationships: []
      }
      grn_items: {
        Row: {
          grn_id: string
          id: string
          line_total: number
          name: string
          product_id: string
          quantity: number
          unit_cost: number
        }
        Insert: {
          grn_id: string
          id?: string
          line_total: number
          name: string
          product_id: string
          quantity: number
          unit_cost: number
        }
        Update: {
          grn_id?: string
          id?: string
          line_total?: number
          name?: string
          product_id?: string
          quantity?: number
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
        ]
      }
      grns: {
        Row: {
          created_at: string
          grn_number: string
          id: string
          invoice_number: string | null
          note: string | null
          received_by: string
          supplier_id: string
          total: number
        }
        Insert: {
          created_at?: string
          grn_number?: string
          id?: string
          invoice_number?: string | null
          note?: string | null
          received_by: string
          supplier_id: string
          total: number
        }
        Update: {
          created_at?: string
          grn_number?: string
          id?: string
          invoice_number?: string | null
          note?: string | null
          received_by?: string
          supplier_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "grns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          reason: string
          refunded_by: string
          sale_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: string
          reason: string
          refunded_by: string
          sale_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          reason?: string
          refunded_by?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
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
          product_id: string | null
          quantity: number
          refunded_qty: number
          sale_id: string
          unit_price: number
        }
        Insert: {
          cost_price?: number
          id?: string
          line_total: number
          name: string
          product_id?: string | null
          quantity: number
          refunded_qty?: number
          sale_id: string
          unit_price: number
        }
        Update: {
          cost_price?: number
          id?: string
          line_total?: number
          name?: string
          product_id?: string | null
          quantity?: number
          refunded_qty?: number
          sale_id?: string
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
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          currency: string
          id: string
          method: string
          sale_id: string
        }
        Insert: {
          amount: number
          currency: string
          id?: string
          method: string
          sale_id: string
        }
        Update: {
          amount?: number
          currency?: string
          id?: string
          method?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_paid: number
          cashier_id: string
          change_given: number
          created_at: string
          currency: string
          discount: number
          exchange_rate: number
          id: string
          sale_number: string
          status: string
          subtotal: number
          total: number
        }
        Insert: {
          amount_paid: number
          cashier_id: string
          change_given?: number
          created_at?: string
          currency: string
          discount?: number
          exchange_rate?: number
          id?: string
          sale_number?: string
          status?: string
          subtotal: number
          total: number
        }
        Update: {
          amount_paid?: number
          cashier_id?: string
          change_given?: number
          created_at?: string
          currency?: string
          discount?: number
          exchange_rate?: number
          id?: string
          sale_number?: string
          status?: string
          subtotal?: number
          total?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          business_name: string
          id: number
          updated_at: string
          vat_rate: number
          zig_rate: number
        }
        Insert: {
          business_name?: string
          id?: number
          updated_at?: string
          vat_rate?: number
          zig_rate?: number
        }
        Update: {
          business_name?: string
          id?: number
          updated_at?: string
          vat_rate?: number
          zig_rate?: number
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          balance_after: number
          created_at: string
          id: string
          note: string | null
          product_id: string
          quantity: number
          reference: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          balance_after: number
          created_at?: string
          id?: string
          note?: string | null
          product_id: string
          quantity: number
          reference?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          balance_after?: number
          created_at?: string
          id?: string
          note?: string | null
          product_id?: string
          quantity?: number
          reference?: string | null
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
          supplier_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: string
          paid_by: string
          reference?: string | null
          supplier_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          paid_by?: string
          reference?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
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
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_stock: {
        Args: {
          p_note: string
          p_product: string
          p_qty: number
          p_type: string
        }
        Returns: number
      }
      can_manage_stock: { Args: { _user_id: string }; Returns: boolean }
      can_post_expense: { Args: { _user_id: string }; Returns: boolean }
      can_refund: { Args: { _user_id: string }; Returns: boolean }
      complete_sale: {
        Args: {
          p_currency: string
          p_discount: number
          p_items: Json
          p_payments: Json
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_owner_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
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
      refund_sale: {
        Args: {
          p_items: Json
          p_method: string
          p_reason: string
          p_sale: string
        }
        Returns: Json
      }
      set_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user: string
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
