import { useCallback, useEffect, useMemo, useState } from "react";
import { API, apiFetch } from "../../../../../../../utils/api.js";
import { resolveEstimateCurrency } from "../../../../../../../utils/estimateStorage.js";
import {
  buildPriceMap,
  formatDate,
  getPriceForWork,
  normalizeIsoDate,
} from "./reportUtils.js";

export function useWorksReportData(orderId) {
  const [worksFromGraphicWorks, setWorksFromGraphicWorks] = useState([]);
  const [estimateWorks, setEstimateWorks] = useState([]);
  const [currency, setCurrency] = useState("BYN");
  const [loading, setLoading] = useState(false);

  const user_id = localStorage.getItem("user_id");
  const priceMap = useMemo(() => buildPriceMap(estimateWorks), [estimateWorks]);

  const fetchWorksFromGraphicWorks = useCallback(async () => {
    if (!user_id || !orderId) {
      setWorksFromGraphicWorks([]);
      return;
    }
    setLoading(true);
    try {
      const response = await apiFetch(
        `${API.baseURL}/works_from_graphic_works/${user_id}/${orderId}`,
      );
      const data = response.ok ? await response.json() : [];
      setWorksFromGraphicWorks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setWorksFromGraphicWorks([]);
    } finally {
      setLoading(false);
    }
  }, [user_id, orderId]);

  const fetchEstimatePrices = useCallback(async () => {
    if (!user_id || !orderId) return;
    try {
      const response = await apiFetch(
        `${API.baseURL}/works_estimate_full/${user_id}/${orderId}`,
      );
      if (!response.ok) {
        setEstimateWorks([]);
        return;
      }
      const data = await response.json();
      const works = Array.isArray(data?.works) ? data.works : [];
      setEstimateWorks(works);
      setCurrency(resolveEstimateCurrency(data, user_id, orderId));
    } catch (error) {
      console.error(error);
      setEstimateWorks([]);
    }
  }, [user_id, orderId]);

  useEffect(() => {
    fetchWorksFromGraphicWorks();
    fetchEstimatePrices();
  }, [fetchWorksFromGraphicWorks, fetchEstimatePrices]);

  const tableData = useMemo(
    () =>
      worksFromGraphicWorks
        .filter((w) => w.work_date)
        .map((w) => {
          const qty = Number(w.quantity || 0);
          const pricePerUnit = getPriceForWork(w, priceMap);
          return {
            key: w.id,
            date: normalizeIsoDate(w.work_date),
            displayDate: formatDate(w.work_date),
            workName: w.name_work,
            totalQuantity: qty,
            unit: w.unit_measurement || "",
            pricePerUnit,
            earned: qty * pricePerUnit,
          };
        }),
    [worksFromGraphicWorks, priceMap],
  );

  return {
    tableData,
    currency,
    loading,
    refresh: fetchWorksFromGraphicWorks,
  };
}
