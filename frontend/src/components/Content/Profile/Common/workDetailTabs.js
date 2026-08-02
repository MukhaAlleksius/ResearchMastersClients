/**
 * UI-слой вкладок заказа/услуги.
 * Данные (TAB_DEFS, TAB_PRESETS, preset keys) — в utils/workDetailCatalog.js.
 */

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  GROUP_LABELS,
  TAB_DEFS,
  TAB_PRESETS,
  getCustomerOrderPresetKey,
  getExecutorServicePresetKey,
} from "../../../../utils/workDetailCatalog.js";

export {
  TAB_DEFS,
  TAB_PRESETS,
  getCustomerOrderPresetKey,
  getExecutorServicePresetKey,
};

/**
 * @param {keyof TAB_PRESETS} presetKey
 * @param {{ badges?: Record<string, string|number>, chatLabel?: string }} [options]
 */
export function getWorkDetailTabs(presetKey, options = {}) {
  const { badges = {}, chatLabel } = options;
  const ids = TAB_PRESETS[presetKey] || [];

  return ids
    .map((id) => {
      const def = TAB_DEFS[id];
      if (!def) return null;

      const tab = { ...def };
      if (id === "chat" && chatLabel) {
        tab.label = chatLabel;
      }

      const badge = badges[id];
      if (badge != null && badge !== "" && badge !== 0 && badge !== "0") {
        tab.badge = String(badge);
      }

      return tab;
    })
    .filter(Boolean);
}

export function getDefaultWorkDetailTab(presetKey) {
  const ids = TAB_PRESETS[presetKey];
  return ids?.[0] || "orderInfo";
}

/** Вкладка из ?tab= или location.state.activeTab (уведомления «Перейти»). */
export function resolveWorkDetailTab(presetKey, location = {}) {
  const available = TAB_PRESETS[presetKey] || [];
  const defaultTab = getDefaultWorkDetailTab(presetKey);

  const fromState = location.state?.activeTab;
  if (fromState && available.includes(fromState)) {
    return fromState;
  }

  const search = location.search || "";
  if (search) {
    const tab = new URLSearchParams(search).get("tab");
    if (tab && available.includes(tab)) {
      return tab;
    }
  }

  return defaultTab;
}

export function useWorkDetailInitialTab(presetKey) {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() =>
    resolveWorkDetailTab(presetKey, location),
  );

  useEffect(() => {
    setActiveTab(resolveWorkDetailTab(presetKey, location));
  }, [presetKey, location.pathname, location.search, location.state?.activeTab]);

  return [activeTab, setActiveTab];
}

export function getTabGroupLabel(groupId) {
  return GROUP_LABELS[groupId] || "";
}
