import { resolveNotificationTab } from "./workDetailCatalog.js";

/**
 * Разбирает action_path уведомления: путь + вкладка (?tab=chat).
 * Вкладка передаётся в location.state, query-параметр убирается из URL.
 */
export function buildNotificationNavigateTarget(actionPath, notificationType) {
  if (!actionPath) return null;

  const isCustomerSide = (pathname) =>
    !String(pathname || "").includes("/profile/services/");

  try {
    const url = new URL(actionPath, window.location.origin);
    let tab = url.searchParams.get("tab");
    if (!tab && notificationType) {
      tab = resolveNotificationTab(notificationType, {
        isCustomerSide: isCustomerSide(url.pathname),
      });
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
      ? resolveNotificationTab(notificationType, {
          isCustomerSide: isCustomerSide(actionPath),
        })
      : null;
    return {
      pathname: actionPath,
      search: "",
      state: tab ? { activeTab: tab } : undefined,
    };
  }
}
