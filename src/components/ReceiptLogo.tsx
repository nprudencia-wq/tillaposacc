import { useQuery } from "@tanstack/react-query";
import { receiptLogoSource } from "@/lib/receipt-logo";

export function ReceiptLogo({ src, className }: { src: string; className?: string }) {
  const { data } = useQuery({ queryKey: ["receipt-logo", src], queryFn: () => receiptLogoSource(src), staleTime: Infinity });
  return data ? <img src={data} alt="Receipt logo" className={className} /> : null;
}