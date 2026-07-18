import { useCallback, useEffect, useRef, useState } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../utils/api.js";
export const CONTRACT_POLL_MS = 5000;

const EMPTY_STATUS = {
  loading: true,
  exists: false,
  customerSigned: false,
  executorSigned: false,
  isReady: false,
};

export async function fetchContractStatus(orderId) {
  if (!orderId) {
    return { ...EMPTY_STATUS, loading: false };
  }

  try {
    const response = await apiFetch(buildApiUrl(`/contract/${orderId}`));

    if (response.status === 404) {
      return { ...EMPTY_STATUS, loading: false };
    }

    if (!response.ok) {
      return { ...EMPTY_STATUS, loading: false };
    }

    const data = await response.json();
    if (!data || Object.keys(data).length === 0) {
      return { ...EMPTY_STATUS, loading: false };
    }

    const customerSigned = Boolean(data.subscribe_customer);
    const executorSigned = Boolean(data.subscribe_executor);

    return {
      loading: false,
      exists: true,
      customerSigned,
      executorSigned,
      isReady: customerSigned && executorSigned,
    };
  } catch {
    return { ...EMPTY_STATUS, loading: false };
  }
}

export function getContractBlockReason(status) {
  if (!status || status.loading || status.isReady) return null;

  if (!status.exists) {
    return "Договор ещё не составлен заказчиком";
  }
  if (!status.customerSigned && !status.executorSigned) {
    return "Договор не подписан заказчиком и исполнителем";
  }
  if (!status.customerSigned) {
    return "Договор не подписан заказчиком";
  }
  if (!status.executorSigned) {
    return "Договор не подписан исполнителем";
  }

  return "Договор не готов к началу работ";
}

export function useContractStatus(
  orderId,
  { pollWhileNotReady = false, pollIntervalMs = CONTRACT_POLL_MS } = {},
) {
  const [status, setStatus] = useState(EMPTY_STATUS);

  const refetch = useCallback(
    async ({ silent = false } = {}) => {
      if (!orderId) {
        setStatus({ ...EMPTY_STATUS, loading: false });
        return;
      }

      if (!silent) {
        setStatus((prev) => ({ ...prev, loading: true }));
      }

      const next = await fetchContractStatus(orderId);
      setStatus(next);
      return next;
    },
    [orderId],
  );

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!pollWhileNotReady || !orderId || status.isReady) {
      return undefined;
    }

    const timerId = setInterval(() => {
      refetch({ silent: true });
    }, pollIntervalMs);

    return () => clearInterval(timerId);
  }, [pollWhileNotReady, pollIntervalMs, orderId, status.isReady, refetch]);

  return { ...status, refetch };
}

function formatDateToRu(dateString) {
  if (!dateString || dateString === "дата окончания") return dateString;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return dateString;
  }
}

export function formatContractFromServer(serverContract, orderId) {
  const budgetDisplay = serverContract.budget
    ? `${Number(serverContract.budget).toLocaleString()} ${
        serverContract.currency || "BYN"
      }${serverContract.budget_type ? ` (${serverContract.budget_type})` : ""}`
    : "Не указана";

  return {
    contractData: serverContract,
    contract: {
      title: serverContract.title_work || "Договор подряда на выполнение работ",
      subject: serverContract.name_work || "",
      addressWork: serverContract.address_work || "",
      workPeriodFrom: formatDateToRu(serverContract.date_start_work) || "",
      workPeriodTo:
        formatDateToRu(serverContract.date_end_work) || "дата окончания",
      price: budgetDisplay,
      currentCurrency: serverContract.currency || "BYN",
      budgetType: serverContract.budget_type || "",
      customerName: serverContract.customer_name || "Не указано",
      contractorName: serverContract.executor_name || "Не указано",
      customerSigned: Boolean(serverContract.subscribe_customer),
      contractorSigned: Boolean(serverContract.subscribe_executor),
      city: "Минск",
      date: new Date().toLocaleDateString("ru-RU"),
      orderId,
    },
  };
}

function getContractRevision(serverContract) {
  if (!serverContract) return null;
  return JSON.stringify({
    id: serverContract.id,
    subscribe_customer: serverContract.subscribe_customer,
    subscribe_executor: serverContract.subscribe_executor,
    budget: serverContract.budget,
    currency: serverContract.currency,
    budget_type: serverContract.budget_type,
    title_work: serverContract.title_work,
    name_work: serverContract.name_work,
    address_work: serverContract.address_work,
    date_start_work: serverContract.date_start_work,
    date_end_work: serverContract.date_end_work,
  });
}

export async function fetchContractDocument(orderId) {
  if (!orderId) {
    return { exists: false, contractData: null, contract: null };
  }

  try {
    const response = await apiFetch(buildApiUrl(`/contract/${orderId}`));

    if (response.status === 404 || !response.ok) {
      return { exists: false, contractData: null, contract: null };
    }

    const serverContract = await response.json();
    if (!serverContract || Object.keys(serverContract).length === 0) {
      return { exists: false, contractData: null, contract: null };
    }

    const formatted = formatContractFromServer(serverContract, orderId);
    return {
      exists: true,
      ...formatted,
      revision: getContractRevision(serverContract),
    };
  } catch {
    return { exists: false, contractData: null, contract: null };
  }
}

export function useLiveContract(
  orderId,
  {
    enabled = true,
    pollIntervalMs = CONTRACT_POLL_MS,
    pollWhileIncomplete = true,
    onUpdated,
  } = {},
) {
  const [contractData, setContractData] = useState(null);
  const [contract, setContract] = useState(null);
  const [exists, setExists] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
  const revisionRef = useRef(null);
  const contractRef = useRef(contract);
  contractRef.current = contract;
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  const applyDocument = useCallback((document) => {
    if (!document?.exists) {
      const hadContract = revisionRef.current != null;
      revisionRef.current = null;
      setContractData(null);
      setContract(null);
      setExists(false);
      return hadContract;
    }

    if (document.revision === revisionRef.current) {
      setExists(true);
      return false;
    }

    revisionRef.current = document.revision;
    setContractData(document.contractData);
    setContract(document.contract);
    setExists(true);
    onUpdatedRef.current?.();
    return true;
  }, []);

  const refetch = useCallback(
    async ({ silent = false } = {}) => {
      if (!orderId) {
        revisionRef.current = null;
        setContractData(null);
        setContract(null);
        setExists(false);
        setIsLoading(false);
        return { exists: false };
      }

      if (!silent) {
        setIsLoading(true);
      } else {
        setIsPolling(true);
      }

      try {
        const document = await fetchContractDocument(orderId);
        applyDocument(document);
        return document;
      } finally {
        if (!silent) {
          setIsLoading(false);
        } else {
          setIsPolling(false);
        }
      }
    },
    [orderId, applyDocument],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    refetch();
  }, [enabled, refetch]);

  useEffect(() => {
    if (!enabled || !orderId) return undefined;

    const shouldKeepPolling = () => {
      if (!pollWhileIncomplete) return true;
      if (!revisionRef.current) return true;
      const current = contractRef.current;
      if (!current?.customerSigned || !current?.contractorSigned) return true;
      return false;
    };

    let cancelled = false;

    const poll = () => {
      if (cancelled || !shouldKeepPolling()) return;
      refetch({ silent: true });
    };

    poll();
    const timerId = setInterval(poll, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [enabled, orderId, pollIntervalMs, pollWhileIncomplete, refetch]);

  return {
    contractData,
    contract,
    exists,
    isLoading,
    isPolling,
    refetch,
  };
}
