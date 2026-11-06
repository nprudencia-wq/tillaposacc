import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Product photos are stored as private file paths; show them with a short-lived (1 hour) link. */
export function ProductImage({ src, className }: { src: string | null | undefined; className?: string }) {
  const isPath = !!src && !/^https?:|^data:|^blob:/.test(src);
  const { data } = useQuery({
    queryKey: ["product-image", src],
    enabled: isPath,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => (await supabase.storage.from("product-images").createSignedUrl(src!, 3600)).data?.signedUrl ?? null,
  });
  const url = isPath ? data : src;
  if (!url) return null;
  return <img src={url} alt="" className={className} />;
}
