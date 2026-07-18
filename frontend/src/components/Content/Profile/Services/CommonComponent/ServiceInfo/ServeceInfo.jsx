import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useParams } from "react-router-dom";
import GraphicWorks from "../GraphicWorks/GraphicWorks";
import EstimateTabs from "../EstimateWorks/EstimateCustomerExecutor";
import Chat from "../ChatOrderMaster/ChatOrderMaster";
import CustomerInfo from "../InformationAboutCustomer/InformationAboutCustomer";
import OrderInfo from "../CustomerOrderInfo/OrderInfo";
import ContractAgreement from "../../../Orders/CustomerExecutorContractOrder/CustomerExecutorContract";

const exampleOrder = {
  category: "Ремонт",
  title: "Покраска стен в комнате",
  description: "Покраска стен белой краской, подготовка поверхности.",
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
  id: 123, // Добавлено customerId
  name: "Иван Иванов",
  company: "ООО Ромашка",
  email: "ivanov@example.com",
  phone: "+7 999 123 45 67",
  address: "Москва, ул. Ленина, д. 1",
  notes: "Постоянный клиент, скидка 10%",
};

// Все вкладки для выбранной услуги
const allTabs = [
  { id: "estimateWorks", label: "Смета для работ" },
  { id: "schedule", label: "График выполнения" },
  { id: "chat", label: "Чат с заказчиком" },
  { id: "customerInfo", label: "Информация о заказчике" },
  { id: "orderInfo", label: "Информация о заказе" },
  {
    id: "customerExecutorContract",
    label: "Договор между клиентом и исполнителем",
  },
];

export default function ServiceInfo({ setSelectedService }) {
  const [activeTab, setActiveTab] = useState(allTabs[0].id);

  const navigate = useNavigate();

  const { slug } = useParams(); // деструктурируем объект, чтобы получить параметр slug

  return (
    <div>
      <button
        className="text-blue-600 hover:text-blue-800 mb-4"
        onClick={() => navigate(-1)} // Возврат назад в истории браузера
      >
        ← Назад к услугам
      </button>

      {/* Кнопки вкладок */}
      <div className="flex space-x-4 mb-4">
        {allTabs.map((tab) => (
          <button
            key={tab.id}
            className={`px-3 py-1 ${
              activeTab === tab.id
                ? "border-b-2 border-blue-600 font-semibold text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        {allTabs.find((tab) => tab.id === activeTab)?.label || ""}
      </h2>

      {/* Контент вкладок */}
      <div className="text-gray-700">
        {activeTab === "estimateWorks" && (
          <div>
            <h3 className="font-semibold mb-2">Смета для работ</h3>
            <p>Здесь будет смета для работ по заказу.</p>
            <EstimateTabs />
          </div>
        )}
        {activeTab === "schedule" && (
          <div>
            <h3 className="font-semibold mb-2">График выполнения</h3>
            <p>Здесь будет график выполнения заказа.</p>
            <GraphicWorks />
          </div>
        )}
        {activeTab === "chat" && (
          <div>
            <h3 className="font-semibold mb-2">Чат с заказчиком</h3>
            <p>Здесь будет доступен чат для связи с заказчиком.</p>
            <Chat />
          </div>
        )}
        {activeTab === "customerInfo" && (
          <div>
            <h3 className="font-semibold mb-2">Информация о заказчике</h3>
            <p>Здесь будет информация о заказчике.</p>
            <CustomerInfo customerId={someCustomer.id} />
          </div>
        )}
        {activeTab === "orderInfo" && (
          <div>
            <h3 className="font-semibold mb-2">Информация о заказе</h3>
            <p>Детальная информация по заказу и смета.</p>
            <OrderInfo order={exampleOrder} />
          </div>
        )}
        {activeTab === "customerExecutorContract" && (
          <div>
            <ContractAgreement
              city="Минск"
              date="15 сентября 2025"
              customer={{
                name: "Иванов Иван Иванович",
                address: "г. Минск, ул. Ленина, д.1",
              }}
              contractor={{
                name: "Петров Петр Петрович",
                address: "г. Минск, ул. Советская, д.2",
              }}
              subject="ремонт и отделка квартиры"
              price="45000"
              paymentTerms="единовременно в течение 10 дней после подписания акта"
              workPeriod={{
                from: "20 сентября 2025",
                to: "30 октября 2025",
              }}
              responsibilities={{
                contractor: [
                  "Выполнить работы качественно и в срок",
                  "Соблюдать требования техники безопасности",
                  "Предоставить документацию по выполненным работам",
                ],
                customer: [
                  "Обеспечить доступ к объекту",
                  "Своевременно оплатить работы",
                  "Предоставить необходимую информацию и материалы",
                ],
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
