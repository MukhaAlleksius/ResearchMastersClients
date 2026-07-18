/** Статусы заказа, в которых заказчик может удалить заказ. */
export const CUSTOMER_DELETABLE_ORDER_STATUSES = [
  "Не предложенные исполнителям",
  "Самостоятельное выполнение",
  "В поиске исполнителя",
  "Ожидают выполнения",
];

export function canCustomerDeleteOrder(statusOrderCustomer) {
  const status = statusOrderCustomer || "";
  if (!status) return false;

  if (status.includes("В процессе выполнения") || status.includes("Выполнен")) {
    return false;
  }

  return CUSTOMER_DELETABLE_ORDER_STATUSES.some((allowed) =>
    status.includes(allowed),
  );
}
