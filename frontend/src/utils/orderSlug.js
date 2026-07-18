export function buildOrderSlug(title) {
  if (!title) return "order";
  return title
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}
