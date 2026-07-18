import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch, buildApiUrl } from "../../../../../../utils/api.js";
import { useNavigate, useParams } from "react-router-dom";
import ContractAgreement from "../../../../Profile/Orders/CommonComponents/CustomerExecutorContractOrder/CustomerExecutorContract";
import CustomerEstimateWorks from "../../../../Profile/Orders/CommonComponents/CustomerEstimateWorksMaterials/CustomerEstimateWorks";
import CustomerReportWorks from "../../../../Profile/Orders/CommonComponents/CustomerReportWorks/CustomerReportWorks";
import OrderInfo from "../../../../Profile/Services/CommonComponent/CustomerOrderInfo/OrderInfo";
import Payment from "../../../../Profile/Orders/CommonComponents/Payment/Payment";
import "./order_complaint_inspector.css";

const allTabs = [
  { id: "estimateWorks", label: "Смета для работ", icon: "📋" },
  { id: "schedule", label: "График выполнения", icon: "📅" },
  { id: "orderInfo", label: "Информация о заказе", icon: "📄" },
  { id: "customerExecutorContract", label: "Договор", icon: "📜" },
  { id: "payment", label: "Оплата", icon: "💳" },
];

const exampleOrder = {
  id: 123,
  category: "Ремонт",
  title: "Покраска стен в комнате",
  description: "Покраска стен белой краской, подготовка поверхности.",
  customer_id: 456,
  budget: 15000,
  budgetType: "Фиксированная цена",
  urgencyLevel: "Средний",
  location: "Москва, ул. Ленина, д.10",
  town: "Москва",
  region: "Московская область",
  deadline: "В течение месяца",
  insurance_required: true,
  createdAt: "2025-09-15T10:00:00Z",
  updatedAt: "2025-09-16T15:30:00Z",
};

const someCustomer = {
  name: "Иван Иванов",
  company: "ООО Ромашка",
  email: "ivanov@example.com",
  phone: "+7 999 123 45 67",
  address: "Москва, ул. Ленина, д. 1",
  notes: "Постоянный клиент, скидка 10%",
};

export default function OrderComplaintInspector({ orderId }) {
  const [activeTab, setActiveTab] = useState(allTabs[0].id);
  const [orderInformation, setOrderInformation] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [executorOrder, setExecutorOrder] = useState(null);
  const [orderResponseExecutor, setOrderResponseExecutor] = useState(null);
  const [payment, setPayment] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const navigate = useNavigate();
  const { slug } = useParams();
  const orderIdFinal = orderId || slug;

  // ✅ 1. Загрузка заказа + customer
  const fetchOrderInfo = useCallback(async () => {
    if (!orderIdFinal) {
      setError("ID заказа не найден");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.log("🔄 Загрузка заказа:", orderIdFinal);

      const response = await apiFetch(
        buildApiUrl(`/order/${orderIdFinal}`),
      );
      if (!response.ok) {
        throw new Error(`Ошибка ${response.status}`);
      }

      const orderData = await response.json();
      console.log("✅ Заказ загружен:", orderData);
      setOrderInformation(orderData);

      // Загрузка customer
      let customerData = null;
      if (orderData.customer_id) {
        console.log("🔄 Загрузка customer:", orderData.customer_id);
        try {
          const customerResponse = await apiFetch(
            buildApiUrl(`/profile/?user_id=${orderData.customer_id}`),
          );
          if (customerResponse.ok) {
            customerData = await customerResponse.json();
            console.log("✅ Customer загружен:", customerData);
          }
        } catch (custErr) {
          console.warn("⚠️ Не удалось загрузить профиль клиента:", custErr);
        }
      }
      setCustomer(customerData || someCustomer);
    } catch (err) {
      console.error("❌ Ошибка:", err);
      setError(err.message);
      setOrderInformation(exampleOrder);
      setCustomer(someCustomer);
    } finally {
      setLoading(false);
    }
  }, [orderIdFinal]);

  // ✅ 2. Загрузка executor_order
  const fetchExecutorOrder = useCallback(async () => {
    try {
      const response = await apiFetch(
        buildApiUrl(`/executor_order/${orderIdFinal}`),
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      console.log("✅ ExecutorOrder data:", data);
      setExecutorOrder(data);
    } catch (error) {
      console.error("❌ Ошибка executor_order:", error);
    }
  }, [orderIdFinal]);

  // ✅ 3. Загрузка order_response_executor
  const fetchOrderResponseExecutor = useCallback(async () => {
    if (!executorOrder?.executor_id) return;
    try {
      const response = await apiFetch(
        buildApiUrl(`/order_response_executor/${executorOrder.executor_id}/${orderIdFinal}`),
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      console.log("✅ OrderResponseExecutor data:", data);
      setOrderResponseExecutor(data);
    } catch (error) {
      console.error("❌ Ошибка order_response_executor:", error);
    }
  }, [orderIdFinal, executorOrder?.executor_id]);

  // ✅ 4. Загрузка платежа
  const fetchPayment = useCallback(async () => {
    if (!orderInformation?.id || !customer?.id) {
      return;
    }

    setPaymentLoading(true);
    try {
      console.log(
        `🔄 Проверяем платёж для заказа ${orderInformation.id} и клиента ${customer.id}`,
      );
      const res = await apiFetch(
        buildApiUrl(`/payment_for_order/${orderInformation.id}/${customer.id}`),
      );

      if (res.ok) {
        const data = await res.json();
        setPayment(data);
        console.log("✅ Платёж найден:", data);
      } else {
        setPayment(null);
      }
    } catch (err) {
      console.error("❌ Ошибка при проверке платежа:", err);
      setPayment(null);
    } finally {
      setPaymentLoading(false);
    }
  }, [orderInformation, customer]);

  // ✅ useEffect'ы
  useEffect(() => {
    fetchOrderInfo();
    fetchExecutorOrder();
  }, [fetchOrderInfo, fetchExecutorOrder]);

  useEffect(() => {
    if (executorOrder?.executor_id) {
      fetchOrderResponseExecutor();
    }
  }, [fetchOrderResponseExecutor]);

  useEffect(() => {
    if (orderInformation && customer) {
      fetchPayment();
    }
  }, [fetchPayment]);

  // ✅ Загрузка
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">
            Загрузка заказа и данных клиента...
          </p>
        </div>
      </div>
    );
  }

  if (!orderInformation) {
    return (
      <div className="p-6 text-red-600">Ошибка загрузки данных заказа.</div>
    );
  }

  const commonProps = {
    orderId: orderIdFinal,
    order: orderInformation,
    customer_id: orderInformation.customer_id,
    executor_id: executorOrder?.executor_id,
    customer: customer,
    categoryWorkId: orderInformation?.category_work_id,
  };

  const TabPanel = ({ tabId }) => {
    switch (tabId) {
      case "estimateWorks":
        return (
          <CustomerEstimateWorks
            order_id={commonProps.orderId}
            category_work_id={commonProps.order?.category_work_id}
            executor_id={commonProps.order?.executor_id}
          />
        );
      case "schedule":
        return <CustomerReportWorks order={commonProps.order} />;
      case "orderInfo":
        return <OrderInfo order={commonProps.order} />;
      case "customerExecutorContract":
        return (
          <ContractAgreement
            order={commonProps.order}
            order_response_executor={orderResponseExecutor}
            customer={commonProps.customer}
          />
        );
      case "payment":
        return (
          <Payment
            order={commonProps.order}
            customerId={commonProps.customer_id}
            executorId={commonProps.executor_id}
            existingPayment={payment}
            onSuccess={(payment) => {
              console.log("Оплата успешна!", payment);
              setPayment(payment);
            }}
          />
        );
      default:
        return <div>Вкладка не найдена</div>;
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Заголовок */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium transition-colors p-2 rounded-lg hover:bg-blue-50"
          >
            ← Назад к заказам
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            {commonProps.order.title}
          </h1>
        </div>
        <div className="flex items-center gap-6 text-sm text-gray-600 bg-gray-50 p-4 rounded-xl flex-wrap">
          <span>ID: {orderIdFinal}</span>
          <span>Бюджет: {commonProps.order.budget?.toLocaleString()} ₽</span>
          <span>Статус: В процессе</span>
          <span>Локация: {commonProps.order.location}</span>
          <span>Заказчик ID: {commonProps.order.customer_id}</span>
          {paymentLoading && (
            <span className="text-blue-600 animate-pulse">
              ⏳ Проверка платежа...
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl shadow-sm">
          <div className="flex items-center justify-between">
            <span>❌ {error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 font-bold text-xl"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Вкладки */}
      <div className="border-b border-gray-200 pb-4 mb-6">
        <nav className="flex flex-wrap gap-2 -mb-px overflow-x-auto pb-2">
          {allTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-xl transition-all group border-b-2 shadow-sm whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600 bg-blue-50"
                  : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-[500px]">
        <TabPanel tabId={activeTab} />
      </div>
    </div>
  );
}
