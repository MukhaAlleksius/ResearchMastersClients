import React, { useState, useEffect, useMemo } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import CustomerInfo from "../CommonComponent/InformationAboutCustomer/InformationAboutCustomer";
import EstimateWorks from "../CommonComponent/EstimateWorksMaterials/EstimateWorks";
import OrderInfoAnswerExecutor from "../CommonComponent/CustomerOrderInfo/OrderInfoAnswerExecutor";
import WorkDetailLayout from "../../Common/WorkDetailLayout";
import {
  getWorkDetailTabs,
  useWorkDetailInitialTab,
} from "../../Common/workDetailTabs";

export default function ConsiderationCustomer({ orderId, onBack, userId, listActivity }) {
  const [activeTab, setActiveTab] = useWorkDetailInitialTab("executor_consideration");
  const [order, setOrder] = useState(null);
  const [executeOrderInfo, setExecuteOrderInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const navigate = useNavigate();
  const { slug } = useParams();
  const orderIdFinal = orderId || slug;

  useEffect(() => {
    const loadOrder = async () => {
      if (!orderIdFinal) {
        setError("ID заказа не найден");
        setLoading(false);
        return;
      }

      const userId = parseInt(localStorage.getItem("user_id"), 10);

      try {
        setLoading(true);
        setError(null);

        const requests = [
          apiFetch(buildApiUrl(`/order/${orderIdFinal}`)),
        ];

        if (userId) {
          requests.push(
            apiFetch(
              buildApiUrl(`/information_about_execute_order/${userId}/${orderIdFinal}`),
            ),
          );
        }

        const [orderResponse, executeInfoResponse] = await Promise.all(requests);

        if (!orderResponse.ok) {
          throw new Error(
            `HTTP ${orderResponse.status}: ${orderResponse.statusText}`,
          );
        }

        setOrder(await orderResponse.json());

        if (executeInfoResponse?.ok) {
          setExecuteOrderInfo(await executeInfoResponse.json());
        } else {
          setExecuteOrderInfo(null);
        }
      } catch (err) {
        console.error("Fetch error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
  }, [orderIdFinal]);

  const tabs = useMemo(() => getWorkDetailTabs("executor_consideration"), []);

  const orderUnavailableNotice = useMemo(() => {
    const reason =
      executeOrderInfo?.unavailability_reason ||
      (executeOrderInfo?.customer_chose_another_executor
        ? "another_executor"
        : null);

    const isUnavailable =
      executeOrderInfo?.order_unavailable ||
      executeOrderInfo?.customer_chose_another_executor;

    if (!isUnavailable || !reason) {
      return null;
    }

    if (reason === "moved_to_draft") {
      return {
        variant: "warning",
        title: "Заказ убран в черновик",
        text:
          executeOrderInfo.message ||
          "Заказчик убрал заказ в черновик. Заказ больше недоступен для выполнения.",
      };
    }

    if (reason === "self_execution") {
      return {
        variant: "warning",
        title: "Самостоятельное выполнение",
        text:
          executeOrderInfo.message ||
          "Заказчик решил выполнить заказ самостоятельно. Заказ больше недоступен для исполнителей.",
      };
    }

    const executorName = executeOrderInfo.selected_executor_name;
    const text = executorName
      ? `${executeOrderInfo.message || "Заказчик выбрал другого исполнителя"}: ${executorName}.`
      : executeOrderInfo.message ||
        "Заказчик выбрал другого исполнителя для этого заказа.";

    return {
      variant: "warning",
      title: "Заказ больше недоступен",
      text,
    };
  }, [executeOrderInfo]);

  return (
    <WorkDetailLayout
      title={order?.title || "Услуга"}
      subtitle={orderIdFinal ? `Услуга № ${orderIdFinal}` : undefined}
      backLabel="Назад к услугам"
      onBack={onBack || (() => navigate(-1))}
      activityConfig={
        userId && orderIdFinal
          ? {
              userId,
              orderId: orderIdFinal,
              presetKey: "executor_consideration",
              activity: listActivity,
            }
          : undefined
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      loading={loading}
      loadingText="Загрузка..."
      error={error}
      onDismissError={() => setError(null)}
      notice={orderUnavailableNotice}
    >
      {activeTab === "estimateWorks" && (
        <EstimateWorks
          order_id={orderIdFinal}
          category_work_id={order?.category_work_id}
        />
      )}

      {activeTab === "customerInfo" && (
        <CustomerInfo customerId={order?.customer_id} />
      )}

      {activeTab === "orderInfo" && order && (
        <OrderInfoAnswerExecutor order={order} embedded />
      )}
    </WorkDetailLayout>
  );
}
