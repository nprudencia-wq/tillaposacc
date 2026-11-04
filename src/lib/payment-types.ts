import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cached } from "@/lib/offline";
import { methodLabels } from "@/lib/pos";

export interface PaymentType {
  id: string;
  code: string;
  name: string;
  is_cash: boolean;
  active: boolean;
  sort_order: number;
}

// The latest list is kept here so code outside React (receipts, report rows) can label a method.
let cache: PaymentType[] = [];

export function setPaymentTypeCache(list: PaymentType[]) {
  cache = list;
}

export function paymentTypeCache() {
  return cache;
}

/** Name shown for a stored method: the shop's own list first, then the old built-in labels. */
export function methodLabel(code: string) {
  return cache.find((t) => t.code === code)?.name ?? methodLabels[code] ?? code;
}

/** Does this method put money in (or take it out of) the cash drawer? */
export function isCashMethod(code: string) {
  const t = cache.find((x) => x.code === code);
  return t ? t.is_cash : code === "cash";
}

// Used before the list has loaded, or if the read fails, so the till always has something to offer.
const FALLBACK_TYPES: PaymentType[] = [
  { id: "cash", code: "cash", name: "Cash", is_cash: true, active: true, sort_order: 1 },
  { id: "mobile_money", code: "mobile_money", name: "Mobile money", is_cash: false, active: true, sort_order: 2 },
  { id: "bank_transfer", code: "bank_transfer", name: "Bank transfer", is_cash: false, active: true, sort_order: 3 },
  { id: "card", code: "card", name: "Card", is_cash: false, active: true, sort_order: 4 },
];

export function activeTypes(list: PaymentType[] | undefined) {
  const on = (list ?? cache).filter((t) => t.active);
  return on.length ? on : FALLBACK_TYPES;
}

export function usePaymentTypes() {
  return useQuery({
    queryKey: ["payment-types"],
    queryFn: async () => {
      const list = await cached("payment-types", async () => {
        const { data, error } = await supabase
          .from("payment_types")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });
        if (error) throw error;
        return (data ?? []) as PaymentType[];
      });
      setPaymentTypeCache(list);
      return list;
    },
  });
}
