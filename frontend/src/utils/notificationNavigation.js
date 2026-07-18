/** Для уведомлений, созданных до добавления ?tab= в action_path. */
const NOTIFICATION_TAB_FALLBACK = {
  new_message: "chat",
  estimate_updated: "estimateWorks",
  schedule_updated: "schedule",
  executor_response: "orderResponesExecutors",
  executor_response_updated: "orderResponesExecutors",
  order_updated: "orderInfo",
  contract_updated: "customerExecutorContract",
  contract_signed: "customerExecutorContract",
  cancel_requested: "customerCancelOrder",
  cancel_decision: "customerCancelOrder",
  order_refused: "customerCancelOrder",
  complaint_message: "complaints",
  payment_updated: "payment",
  work_started: "schedule",
  start_date_updated: "orderInfo",
  executor_assigned: "orderInfo",
  customer_status_changed: "orderInfo",
  executor_status_changed: "orderInfo",
  customer_order_offer: "orderInfo",
  customer_accepted_proposal: "orderInfo",
  counterparty_info_updated: "executorInfo",
};

function resolveNotificationTabFallback(notificationType, pathname = "") {
  if (
    notificationType === "cancel_requested" ||
    notificationType === "cancel_decision" ||
    notificationType === "order_refused"
  ) {
    return pathname.includes("/profile/services/")
      ? "executorCancelOrder"
      : "customerCancelOrder";
  }

  if (notificationType === "counterparty_info_updated") {
    return pathname.includes("/profile/services/")
      ? "customerInfo"
      : "executorInfo";
  }

  return NOTIFICATION_TAB_FALLBACK[notificationType] || null;
}

/**
 * Разбирает action_path уведомления: путь + вкладка (?tab=chat).
 * Вкладка передаётся в location.state, query-параметр убирается из URL.
 */
export function buildNotificationNavigateTarget(actionPath, notificationType) {
  if (!actionPath) return null;

  try {
    const url = new URL(actionPath, window.location.origin);
    let tab = url.searchParams.get("tab");
    if (!tab && notificationType) {
      tab = resolveNotificationTabFallback(notificationType, url.pathname);
    }
    if (tab) {
      url.searchParams.delete("tab");
    }

    const search = url.search || "";
    return {
      pathname: url.pathname,
      search,
      state: tab ? { activeTab: tab } : undefined,
    };
  } catch {
    const tab = notificationType
      ? resolveNotificationTabFallback(notificationType, actionPath)
      : null;
    return {
      pathname: actionPath,
      search: "",
      state: tab ? { activeTab: tab } : undefined,
    };
  }
}
