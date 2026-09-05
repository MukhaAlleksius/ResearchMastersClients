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

  return Array.from(byId.values()).sort((a, b) => {
    const tb = new Date(b.created_at || 0).getTime();
    const ta = new Date(a.created_at || 0).getTime();
    if (tb !== ta) return tb - ta;
    return Number(b.id || 0) - Number(a.id || 0);
  });
}

/** Ставит заказ с указанным id первым, не выкидывая остальные. */
export function moveOrderToFront(orders, orderId) {
  if (!Array.isArray(orders) || orderId == null) return orders;
  const id = Number(orderId);
  if (!Number.isFinite(id)) return orders;

  const index = orders.findIndex((order) => Number(order?.id) === id);
  if (index <= 0) return orders;

  const next = orders.slice();
  const [item] = next.splice(index, 1);
  next.unshift(item);
  return next;
}

function pluralizeRu(count, one, few, many) {
  const abs = Math.abs(Number(count) || 0) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/** Подпись для числа откликнувшихся исполнителей: «3 исполнителя». */
export function formatExecutorResponses(count) {
  const n = Number(count);
  const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (safe === 0) return "нет откликов";
  return `${safe} ${pluralizeRu(safe, "исполнитель", "исполнителя", "исполнителей")}`;
}
