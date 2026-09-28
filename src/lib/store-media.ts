import { supabase } from "@/integrations/supabase/client";
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};
export function validateStoreImage(file: File): string | null {
  if (!allowed.has(file.type)) return "Use JPG, PNG, WebP, GIF ou SVG.";
  if (file.size > 5 * 1024 * 1024) return "A imagem deve ter no máximo 5 MB.";
  return null;
}
export async function uploadStoreImage(storeId: string, file: File) {
  const invalid = validateStoreImage(file);
  if (invalid) throw new Error(invalid);
  const ext = extensions[file.type];
  const path = `${storeId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("store-media")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("store-media").getPublicUrl(path);
  return data.publicUrl;
}
