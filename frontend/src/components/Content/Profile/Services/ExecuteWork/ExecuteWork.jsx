import { useEffect, useMemo, useState } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import Chat from "../CommonComponent/ChatOrderMaster/ChatOrderMaster";
import CustomerInfo from "../CommonComponent/InformationAboutCustomer/InformationAboutCustomer";
import EstimateWorks from "../CommonComponent/EstimateWorksMaterials/EstimateWorks";
import OrderInfoWithMyResponse from "../CommonComponent/CustomerOrderInfo/OrderInfoWithMyResponse";
import ContractAgreement from "../../Orders/CommonComponents/CustomerExecutorContractOrder/CustomerExecutorContract";
import ReportWorks from "../CommonComponent/GraphicWorks/Report/ReportWorks";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import { EstimateEarningsMeta } from "../../Common/EstimateEarningsSummary";
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

export default function ExecuteWorkServiceInfo({ service, onBack }) {
  const [activeTab, setActiveTab] = useWorkDetailInitialTab("executor_execute");
  const [customerId, setCustomerId] = useState(service?.customer_id ?? null);
  const [orderDetails, setOrderDetails] = useState(null);
  const navigate = useNavigate();
  const { slug } = useParams();

  const orderId = service?.id || slug;
  const order = orderDetails || service || FALLBACK_ORDER;
  const categoryWorkId =
    orderDetails?.category_work_id || service?.category_work_id || null;

  useEffect(() => {
    if (service?.customer_id) {
      setCustomerId(service.customer_id);
    }

    if (!orderId) return;

    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch(buildApiUrl(`/order/${orderId}`));
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (cancelled) return;
        setOrderDetails(data);
        if (data?.customer_id) {
          setCustomerId(data.customer_id);
        }
      } catch (err) {
        console.error("Не удалось загрузить заказ:", err);
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
      backLabel="Назад к услугам"
      onBack={onBack || (() => navigate(-1))}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      meta={
        <EstimateEarningsMeta
          orderId={orderId}
          estimateUserId={localStorage.getItem("user_id")}
          orderBudget={order?.budget}
          orderCurrency={order?.currency}
        />
      }
    >
      {activeTab === "estimateWorks" && (
        <EstimateWorks
          order_id={orderId}
          category_work_id={categoryWorkId}
        />
      )}

      {activeTab === "schedule" && <ReportWorks />}

      {activeTab === "customerExecutorContract" && (
        <ContractAgreement
          role="executor"
          order={order}
          executor_id={localStorage.getItem("user_id")}
        />
      )}

      {activeTab === "chat" && <Chat order_id={orderId} />}

      {activeTab === "customerInfo" && (
        <CustomerInfo customerId={customerId} />
      )}

      {activeTab === "orderInfo" && (
        <OrderInfoWithMyResponse order={order} embedded />
      )}
    </WorkDetailLayout>
  );
}
