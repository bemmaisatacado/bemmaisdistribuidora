// @ts-nocheck -- generated database types are out of date with the live schema
export function sanitizePageContent(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .trim();
}
export function ordered<T extends { position: number }>(items: T[]) {
  return [...items].sort((a, b) => a.position - b.position);
}
export function visible<T extends { is_enabled: boolean }>(items: T[]) {
  return ordered(items.filter((item) => item.is_enabled));
}
export function validateMediaMeta(type: string, size: number) {
  return (
    ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"].includes(type) &&
    size <= 5 * 1024 * 1024
  );
}
export function hasUnpublishedChanges(draftRevision: number, publishedRevision: number) {
  return draftRevision !== publishedRevision;
}
export function publicSnapshot<T>(published: T | null, draft: T) {
  return published ?? draft;
}
