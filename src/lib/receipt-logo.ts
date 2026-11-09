import { supabase } from "@/integrations/supabase/client";
import { cached } from "@/lib/offline";

export async function receiptLogoSource(source: string): Promise<string> {
  if (/^(data:|blob:|https?:)/.test(source)) return source;
  return cached(`receipt-logo:${source}`, async () => {
    const { data, error } = await supabase.storage.from("product-images").download(source);
    if (error) throw error;
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read logo"));
      reader.onerror = () => reject(new Error("Could not read logo"));
      reader.readAsDataURL(data);
    });
  });
}

export async function prepareReceiptLogo(file: File): Promise<File> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPG or WebP logo");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 576 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Logo processing is unavailable");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Could not process logo")), "image/png"));
    return new File([blob], "receipt-logo.png", { type: "image/png" });
  } finally { bitmap.close(); }
}