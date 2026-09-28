import { supabase } from "@/integrations/supabase/client";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
export function validateProductMedia(file: File) {
  if (!ALLOWED.has(file.type)) throw new Error("Envie imagem JPG, PNG ou WebP.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Cada imagem pode ter no máximo 10 MB.");
}
export async function uploadProductMedia(productId: string, file: File) {
  validateProductMedia(file);
  const ext = file.type.split("/")[1];
  const path = `${productId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("product-media")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}
