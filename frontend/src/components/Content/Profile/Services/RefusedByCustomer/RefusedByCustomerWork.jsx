import { useState, useEffect, useCallback, useMemo } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../utils/api.js";
import { useParams } from "react-router-dom";
import DeleteExecutorServiceButton from "../CommonComponent/DeleteExecutorService/DeleteExecutorServiceButton";
import EstimateWorks from "../CommonComponent/EstimateWorksMaterials/EstimateWorks";
import GraphicWorks from "../CommonComponent/GraphicWorks/GraphicWorks";
import OrderInfoWithMyResponse from "../CommonComponent/CustomerOrderInfo/OrderInfoWithMyResponse";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import {
  getWorkDetailTabs,
  useWorkDetailInitialTab,
} from "../../Common/workDetailTabs";

const FALLBACK_ORDER = {
  id: 0,
  title: "Заказ",
  customer_id: null,
};

export default function RefusedByCustomerWork({
  orderId,
  onBack,
  statusLabel = "Отказано заказчиком",
}) {
  const [activeTab, setActiveTab] = useWorkDetailInitialTab("executor_refused");
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { slug } = useParams();
  const orderIdFinal = orderId || slug;
  const currentOrder = order || FALLBACK_ORDER;

  const fetchOrderInfo = useCallback(async () => {
    if (!orderIdFinal) {
      setError("ID заказа не найден");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(
        buildApiUrl(`/order/${orderIdFinal}`),
      );
      if (!response.ok) throw new Error(`Ошибка ${response.status}`);

      setOrder(await response.json());
    } catch (err) {
      setError(err.message);
      setOrder(FALLBACK_ORDER);
    } finally {
      setLoading(false);
    }
  }, [orderIdFinal]);

  useEffect(() => {
    fetchOrderInfo();
  }, [fetchOrderInfo]);

  const tabs = useMemo(() => getWorkDetailTabs("executor_refused"), []);

  return (
    <WorkDetailLayout
      title={currentOrder.title || statusLabel}
      subtitle={orderIdFinal ? `Услуга № ${orderIdFinal}` : undefined}
      backLabel="Назад к услугам"
      onBack={onBack}
      loading={loading}
      error={error}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === "orderInfo" && (
        <OrderInfoWithMyResponse
          order={currentOrder}
          embedded
          footer={
            <DeleteExecutorServiceButton
              orderId={orderIdFinal}
              orderTitle={currentOrder.title}
              onDeleted={onBack}
            />
          }
        />
      )}

      {activeTab === "estimateWorks" && (
        <EstimateWorks orderId={orderIdFinal} />
      )}

      {activeTab === "schedule" && (
        <GraphicWorks orderId={orderIdFinal} />
      )}
    </WorkDetailLayout>
  );
}
