import { useEffect, useMemo, useState } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import Chat from "../CommonComponent/ChatOrderMaster/ChatOrderMaster";
import CustomerInfo from "../CommonComponent/InformationAboutCustomer/InformationAboutCustomer";
import EstimateWorks from "../CommonComponent/EstimateWorksMaterials/EstimateWorks";
import OrderInfoWithMyResponse from "../CommonComponent/CustomerOrderInfo/OrderInfoWithMyResponse";
import ReportWorks from "../CommonComponent/GraphicWorks/Report/ReportWorks";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import {
  getWorkDetailTabs,
  useWorkDetailInitialTab,
} from "../../Common/workDetailTabs";

const FALLBACK_ORDER = {
  title: "Покраска стен в комнате",
  description: "Покраска стен белой краской, подготовка поверхности.",
  budget: 15000,
  location: "Москва, ул. Ленина, д.10",
};

export default function ExecuteWorkServiceInfo({ service, onBack, userId, listActivity }) {
  const [activeTab, setActiveTab] = useWorkDetailInitialTab("executor_execute");
  const [customerId, setCustomerId] = useState(service?.customer_id ?? null);
  const navigate = useNavigate();
  const { slug } = useParams();

  const orderId = service?.id || slug;
  const order = service || FALLBACK_ORDER;

  useEffect(() => {
    if (service?.customer_id) {
      setCustomerId(service.customer_id);
      return;
    }

    if (!orderId) return;

    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch(buildApiUrl(`/order/${orderId}`));
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (!cancelled && data?.customer_id) {
          setCustomerId(data.customer_id);
        }
      } catch (err) {
        console.error("Не удалось загрузить заказчика:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, service?.customer_id]);

  const tabs = useMemo(
    () =>
      getWorkDetailTabs("executor_execute", {
        chatLabel: "Чат с заказчиком",
      }),
    [],
  );

  return (
    <WorkDetailLayout
      title={order.title}
      subtitle={orderId ? `Услуга № ${orderId}` : undefined}
      backLabel="Назад к услугам"
      onBack={onBack || (() => navigate(-1))}
      activityConfig={
        userId && orderId
          ? {
              userId,
              orderId,
              presetKey: "executor_execute",
              activity: listActivity ?? service?.activity,
            }
          : undefined
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === "estimateWorks" && (
        <EstimateWorks
          order_id={orderId}
          category_work_id={service?.category_work_id}
        />
      )}

      {activeTab === "schedule" && <ReportWorks />}

      {activeTab === "chat" && <Chat order_id={orderId} />}

      {activeTab === "customerInfo" && (
        <CustomerInfo customerId={customerId} />
      )}

      {activeTab === "orderInfo" && (
        <OrderInfoWithMyResponse order={order} embedded />
      )}

      {activeTab === "customerExecutorContract" && (
        <p style={{ color: "#64748b" }}>
          Раздел договора будет доступен в следующих обновлениях.
        </p>
      )}
    </WorkDetailLayout>
  );
}
