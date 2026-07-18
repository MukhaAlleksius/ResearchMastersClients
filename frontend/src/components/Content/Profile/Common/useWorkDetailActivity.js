import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
import { TAB_PRESETS } from "./workDetailTabs.js";
import { useLiveOrderActivity } from "./useLiveOrderActivity.js";
import {
  getTabActivityTypes,
  getSeenActivity,
  markAllActivitySeen,
  markTabActivitySeen,
  getVisibleUpdateInfoForPreset,
  normalizeActivity,
  fetchOrderActivity,
  getRoleFromPreset,
  syncSeenCancelAck,
  syncSeenActivityBaseline,
} from "../../../../utils/orderActivity.js";

function getWorkDetailTabUpdates(presetKey, activity, seenActivity) {
  const updateInfo = getVisibleUpdateInfoForPreset(
    presetKey,
    activity,
    seenActivity,
  );
  const presetTabs = TAB_PRESETS[presetKey] || [];
  const result = {};

  for (const tabId of presetTabs) {
    const tabTypes = getTabActivityTypes(presetKey, tabId);
    const matchingTypes = tabTypes.filter((type) =>
      updateInfo.updateTypes.includes(type),
    );

    if (matchingTypes.length > 0) {
      result[tabId] = { hasUpdate: true };
    }
  }

  return result;
}

export function useWorkDetailActivity({
  activityConfig,
  tabs,
  activeTab,
  onBack,
}) {
  const [seenVersion, setSeenVersion] = useState(0);
  const prevActiveTabRef = useRef(null);
  const activityRef = useRef(activityConfig?.activity);

  const userId = activityConfig?.userId;
  const orderId = activityConfig?.orderId;
  const presetKey = activityConfig?.presetKey;
  const role =
    activityConfig?.role || getRoleFromPreset(presetKey);

  const bumpSeenVersion = useCallback(() => {
    startTransition(() => {
      setSeenVersion((value) => value + 1);
    });
  }, []);

  const handleLiveActivityChange = useCallback(() => {
    bumpSeenVersion();
  }, [bumpSeenVersion]);

  const { activity: liveActivity, refreshActivity } = useLiveOrderActivity({
    orderId,
    userId,
    presetKey,
    role,
    initialActivity: activityConfig?.activity,
    enabled: Boolean(activityConfig && userId && orderId && role),
    onActivityChange: handleLiveActivityChange,
  });

  const effectiveActivity = liveActivity ?? activityConfig?.activity;
  activityRef.current = effectiveActivity;

  const activityKey = useMemo(
    () => JSON.stringify(effectiveActivity ?? null),
    [effectiveActivity],
  );

  const normalizedActivity = useMemo(
    () => normalizeActivity(effectiveActivity),
    [activityKey],
  );

  useEffect(() => {
    if (!userId || !orderId || activityRef.current == null) {
      return;
    }
    if (syncSeenActivityBaseline(userId, orderId, activityRef.current)) {
      bumpSeenVersion();
    }
  }, [userId, orderId, activityKey, bumpSeenVersion]);

  const tabUpdates = useMemo(() => {
    if (!userId || !orderId || !presetKey) {
      return {};
    }
    const seen = getSeenActivity(userId, orderId);
    return getWorkDetailTabUpdates(presetKey, normalizedActivity, seen);
  }, [userId, orderId, presetKey, normalizedActivity, seenVersion]);

  useEffect(() => {
    if (!userId || !orderId || !activeTab || activityRef.current == null) {
      return;
    }

    const prevTab = prevActiveTabRef.current;

    if (prevTab !== null && prevTab !== activeTab) {
      markTabActivitySeen(userId, orderId, prevTab, activityRef.current);
      bumpSeenVersion();
    }

    prevActiveTabRef.current = activeTab;
  }, [activeTab, userId, orderId, bumpSeenVersion, normalizedActivity]);

  useEffect(() => {
    return () => {
      const lastTab = prevActiveTabRef.current;
      if (userId && orderId && lastTab && activityRef.current != null) {
        markTabActivitySeen(userId, orderId, lastTab, activityRef.current);
      }
    };
  }, [userId, orderId]);

  const tabsWithUpdates = useMemo(() => tabs, [tabs]);

  const handleBackWithMark = useCallback(async () => {
    if (userId && orderId) {
      try {
        let fresh = activityRef.current;
        if (role) {
          fresh =
            (await refreshActivity()) ??
            (await fetchOrderActivity(orderId, userId, role));
        }
        syncSeenCancelAck(userId, orderId, fresh);
        if (fresh != null && activeTab) {
          markTabActivitySeen(userId, orderId, activeTab, fresh);
        }
        if (fresh != null) {
          markAllActivitySeen(userId, orderId, fresh);
        }
      } catch {
        const fallback = activityRef.current;
        if (fallback != null) {
          if (activeTab) {
            markTabActivitySeen(userId, orderId, activeTab, fallback);
          }
          markAllActivitySeen(userId, orderId, fallback);
        }
      }
      setSeenVersion((value) => value + 1);
    }
    onBack?.();
  }, [userId, orderId, role, activeTab, refreshActivity, onBack]);

  return {
    tabsWithUpdates,
    handleBackWithMark,
    tabUpdates,
    liveActivity: effectiveActivity,
  };
}
