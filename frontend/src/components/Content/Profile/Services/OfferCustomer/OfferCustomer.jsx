import React, { useEffect, useState, useMemo } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import EstimateWorks from "../CommonComponent/EstimateWorksMaterials/EstimateWorks";
import OrderInfoAnswerExecutor from "../CommonComponent/CustomerOrderInfo/OrderInfoAnswerExecutor";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import {
  getWorkDetailTabs,
  useWorkDetailInitialTab,
} from "../../Common/workDetailTabs";

export default function OfferCustomer({ orderId, onBack, userId, listActivity }) {
  const [activeTab, setActiveTab] = useWorkDetailInitialTab("executor_offer");
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();
  const { slug } = useParams();
  const orderIdFinal = orderId || slug || order?.id;

  useEffect(() => {
    const loadOrder = async () => {
      const id = orderId || slug;
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await apiFetch(buildApiUrl(`/order/${id}`));
        if (!response.ok) {
          throw new Error(`Ошибка HTTP: ${response.status}`);
        }
        setOrder(await response.json());
      } catch (err) {
        console.error("Ошибка получения данных:", err);
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
  }, [orderId, slug]);

  const tabs = useMemo(() => getWorkDetailTabs("executor_offer"), []);

  return (
    <WorkDetailLayout
      title={order?.title || "Предложение заказчика"}
      subtitle={orderIdFinal ? `Услуга № ${orderIdFinal}` : undefined}
      backLabel="Назад к услугам"
      onBack={onBack || (() => navigate(-1))}
      activityConfig={
        userId && orderIdFinal
          ? {
              userId,
              orderId: orderIdFinal,
              presetKey: "executor_offer",
              activity: listActivity,
            }
          : undefined
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      loading={loading}
      loadingText="Загрузка заказа..."
    >
      {activeTab === "estimateWorks" && (
        <EstimateWorks
          order_id={orderIdFinal}
          category_work_id={order?.category_work_id}
        />
      )}

      {activeTab === "orderInfo" && order && (
        <OrderInfoAnswerExecutor order={order} embedded />
      )}
    </WorkDetailLayout>
  );
}
