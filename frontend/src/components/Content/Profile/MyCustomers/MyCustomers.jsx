import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API, apiFetch } from "../../../../utils/api.js";
import { Link } from "react-router-dom";
import CustomerInfo from "../Services/CommonComponent/InformationAboutCustomer/InformationAboutCustomer";
import { getCustomerProfileLink } from "../../../../utils/executorProfile";
import "./my_customers.css";

const getInitials = (name) => {
  if (!name || name === "—") return "?";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.charAt(0) || "";
  const b = parts[1]?.charAt(0) || "";
  return (a + b).toUpperCase() || name.charAt(0).toUpperCase();
};

export default function MyCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [search, setSearch] = useState("");

  const executorId = useMemo(
    () => parseInt(localStorage.getItem("user_id"), 10) || null,
    [],
  );

  const fetchCustomers = useCallback(async () => {
    if (!executorId) {
      setError("Не удалось определить пользователя");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(
        `${API.baseURL}/executor_customers/${executorId}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError("Не удалось загрузить список заказчиков");
    } finally {
      setLoading(false);
    }
  }, [executorId]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;

    return customers.filter((item) => {
      const haystack = [
        item.name_customer,
        item.address,
        item.phone,
        item.notification,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [customers, search]);

  const handleSelect = (customerId) => {
    setSelectedCustomerId((prev) => (prev === customerId ? null : customerId));
  };

  const handleSaved = () => {
    fetchCustomers();
  };

  const handleCustomerRemoved = (customerId) => {
    setSelectedCustomerId((prev) => (prev === customerId ? null : prev));
    fetchCustomers();
  };

  const selectedCustomer = useMemo(
    () =>
      filteredCustomers.find((item) => item.customer_id === selectedCustomerId) ||
      null,
    [filteredCustomers, selectedCustomerId],
  );

  if (loading) {
    return (
      <div className="my-customers">
        <div className="my-customers__state">
          <div className="my-customers__spinner" aria-hidden="true" />
          <p>Загрузка заказчиков…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-customers">
        <div className="my-customers__state my-customers__state--error">
          <p>{error}</p>
          <button
            type="button"
            className="my-customers__retry"
            onClick={fetchCustomers}
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="my-customers">
      <header className="my-customers__header">
        <div>
          <h1 className="my-customers__title">Мои заказчики</h1>
          <p className="my-customers__subtitle">
            Контакты сохраняются в базе и подставляются в услугах при совпадении
            заказчика
          </p>
        </div>
        <input
          type="search"
          className="my-customers__search"
          placeholder="Поиск по имени, адресу или телефону…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Поиск заказчиков"
        />
      </header>

      {filteredCustomers.length === 0 ? (
        <div className="my-customers__state">
          <p>
            {customers.length === 0
              ? "Пока нет заказчиков. Они появятся после откликов или назначения на заказы."
              : "По вашему запросу ничего не найдено."}
          </p>
        </div>
      ) : (
        <div className="my-customers__layout">
          <ul className="my-customers__list">
            {filteredCustomers.map((item) => {
              const isActive = selectedCustomerId === item.customer_id;
              const hasContacts = Boolean(item.phone || item.notification);
              const profileLink = getCustomerProfileLink(
                item.customer_id,
                item.name_customer,
              );

              return (
                <li key={item.customer_id}>
                  <div
                    className={`my-customers__card ${isActive ? "my-customers__card--active" : ""}`}
                  >
                    <button
                      type="button"
                      className="my-customers__card-main"
                      onClick={() => handleSelect(item.customer_id)}
                    >
                      <span className="my-customers__avatar" aria-hidden="true">
                        {getInitials(item.name_customer)}
                      </span>
                      <span className="my-customers__card-body">
                        <span className="my-customers__name">
                          {profileLink ? (
                            <Link
                              to={profileLink.pathname}
                              state={profileLink.state}
                              className="my-customers__profile-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.name_customer || "—"}
                            </Link>
                          ) : (
                            item.name_customer || "—"
                          )}
                        </span>
                        <span className="my-customers__meta">
                          {item.address || "Адрес не указан"}
                        </span>
                        <span className="my-customers__meta">
                          {hasContacts
                            ? item.phone || "Телефон не указан"
                            : "Контакты не добавлены"}
                        </span>
                      </span>
                      {!hasContacts && (
                        <span className="my-customers__badge">Нет контактов</span>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <aside className="my-customers__detail">
            {selectedCustomerId ? (
              <CustomerInfo
                key={selectedCustomerId}
                customerId={selectedCustomerId}
                onSaved={handleSaved}
                showRemoveFromList
                customerName={selectedCustomer?.name_customer}
                onRemoved={handleCustomerRemoved}
              />
            ) : (
              <div className="my-customers__detail-placeholder">
                <p>
                  Выберите заказчика из списка, чтобы просмотреть или изменить
                  контакты
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
