import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cached } from "@/lib/offline";
import { methodLabels } from "@/lib/pos";

export interface PaymentType {
  id: string;
  code: string;
  name: string;
  is_cash: boolean;
  is_account?: boolean;
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

export function activeTypes(list: PaymentType[] | undefined) {
  return (list ?? cache).filter((t) => t.active);
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

/** Is this method "put it on the customer's tab" rather than money received? */
export function isAccountMethod(code: string) {
  return !!cache.find((x) => x.code === code)?.is_account;
}
