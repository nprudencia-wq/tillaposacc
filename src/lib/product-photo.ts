export async function compressProductPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not process photo")), "image/jpeg", 0.82));
    if (blob.size > 2 * 1024 * 1024) throw new Error("Photo is too large; take a smaller photo");
    return new File([blob], "product-photo.jpg", { type: "image/jpeg" });
  } finally { bitmap.close(); }
}