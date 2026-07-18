/**
 * Убирает дубликаты заказов с одним id (часто из-за JOIN со статусами в API).
 * При нескольких строках сохраняет последнюю — обычно с актуальным статусом.
 */
export function dedupeOrdersById(orders) {
  if (!Array.isArray(orders)) return [];

  const byId = new Map();

  orders.forEach((order) => {
    const id = order?.id ?? order?.order_id;
    if (id == null) return;

    const key = String(id);
    const prev = byId.get(key);
    byId.set(key, prev ? { ...prev, ...order } : order);
  });

  return Array.from(byId.values());
}
