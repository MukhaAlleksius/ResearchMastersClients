import React, { useState, useEffect } from "react";
import { setUnauthorizedHandler } from "./utils/api.js";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import AddBusinessForm from "./components/Content/Admin/BusinessForms/BusinessForms.jsx";
import AdminCancelOrdersList from "./components/Content/Admin/CancelOrders/CancelOrders.jsx";
import AdminCategoriesAndWorks from "./components/Content/Admin/CategoryWorks/CategoryWorks.jsx";
import AdminCountriesRegionsTowns from "./components/Content/Admin/Geography/Geography.jsx";
import AdminDisputeSituation from "./components/Content/Admin/Complaints/AdminDisputeSituation/AdminDisputeSituation.jsx";
import AdminDisputesSituationsList from "./components/Content/Admin/Complaints/AdminDisputesSituationsList.jsx";
import AdminFinances from "./components/Content/Admin/Finances/AdminFinances.jsx";
import AdminLayout from "./components/Content/Admin/AdminLayout.jsx";
import AdminStaffGuard from "./components/Content/Admin/AdminStaffGuard.jsx";
import AnalyticsDashboard from "./components/Content/Profile/Analytics/Analytics.jsx";
import CancelOrderVerdictAdmin from "./components/Content/Admin/CancelOrders/CancelOrderVerductAdmin/CancelOrderVerdictAdmin.jsx";
import CatalogOrderPage from "./components/Content/Orders/CatalogOrderPage.jsx";
import CatalogOrdersCustomers from "./components/Content/Orders/OrdersCustomers.jsx";
import CatalogPage from "./components/Content/CatalogPage/CatalogPage/CatalogPage.jsx";
import ConsiderationCustomer from "./components/Content/Profile/Services/ConsiderationCustomer/ConsiderationCustomer.jsx";
import ContinueExecuteWorkServiceInfo from "./components/Content/Profile/Services/ContinueExecuteWork/ContinueExecuteWork.jsx";
import CustomerOrderView from "./components/Content/Profile/Orders/CustomerOrderView/CustomerOrderView.jsx";
import ExecuteWorkServiceInfo from "./components/Content/Profile/Services/ExecuteWork/ExecuteWork.jsx";
import ExecutorBankAccount from "./components/Content/Profile/ExecutorBankAccount/ExecutorBankAccount.jsx";
import ExecutorModal from "./components/Modals/ExecutorsRegistration/ExecutorRegistrationModal.jsx";
import ExecutorProfile from "./components/Content/ExecutorProfile/ExecutorProfile.jsx";
import Footer from "./components/Footer/Footer.jsx";
import Header from "./components/Header/Header.jsx";
import HeaderUser from "./components/Header/HeaderUser.jsx";
import HomePage from "./components/Content/HomePage/HomePage.jsx";
import LoginModal from "./components/Modals/Enter/LoginModal.jsx";
import MainPage from "./components/Content/Profile/MainPage/MainPage.jsx";
import ManageOrdersAdmin from "./components/Content/Admin/ManageOrders/ManageOrdersAdmin.jsx";
import ManageUsersAdmin from "./components/Content/Admin/ManageUsers/Users/ManageUsersAdmin.jsx";
import MyExecutors from "./components/Content/Profile/MyExecutors/MyExecutors.jsx";
import MyCustomers from "./components/Content/Profile/MyCustomers/MyCustomers.jsx";
import OfferCustomer from "./components/Content/Profile/Services/OfferCustomer/OfferCustomer.jsx";
import OrderPage from "./components/Content/AddOrder/Order.jsx";
import OrderProfileAdmin from "./components/Content/Admin/ManageOrders/OrderProfileAdmin/OrderProfileAdmin.jsx";
import Orders from "./components/Content/Profile/Orders/Orders.jsx";
import PaymentRules from "./components/Content/Legal/PaymentRules.jsx";
import PopularExecutors from "./components/Content/PopulalExecutors/PopularExecutors.js";
import Portfolio from "./components/Content/Profile/Portfolio/Portfolio.jsx";
import PrivacyPolicy from "./components/Content/Legal/PrivacyPolicy.jsx";
import ProfilePage from "./components/Content/Profile/Profile.jsx";
import ProfileSettings from "./components/Content/Profile/ProfileSettings/ProfileSettings.jsx";
import RefusedByCustomerWork from "./components/Content/Profile/Services/RefusedByCustomer/RefusedByCustomerWork.jsx";
import RegisterModal from "./components/Modals/Regisration/RegisterModal.jsx";
import Requisites from "./components/Content/Legal/Requisites.jsx";
import Services from "./components/Content/Profile/Services/Services.jsx";
import SpecializationTab from "./components/Content/Profile/Specializations/Specializations.jsx";
import SupportAdminPanel from "./components/Content/Admin/Supports/SupportAdminPanel.jsx";
import SupportContactPanel from "./components/Content/Profile/Administrator/SupportContactPanel.jsx";
import TermsOfService from "./components/Content/Legal/TermsOfService.jsx";
import UserOrderProfileAdmin from "./components/Content/Admin/ManageUsers/Users/UserProfileAdmin/UserOrdersProfileAdmin/UserOrderProfileAdmin/UserOrderProfileAdmin.jsx";
import UserOrdersProfileAdmin from "./components/Content/Admin/ManageUsers/Users/UserProfileAdmin/UserOrdersProfileAdmin/UserOrdersProfileAdmin.jsx";
import UserProfileAdmin from "./components/Content/Admin/ManageUsers/Users/UserProfileAdmin/UserProfileAdmin.jsx";
import UserServiceProfileAdmin from "./components/Content/Admin/ManageUsers/Users/UserProfileAdmin/UserServicesProfileAdmin/UserServiceProfileAdmin/UserServiceProfileAdmin.jsx";
import UserServicesProfileAdmin from "./components/Content/Admin/ManageUsers/Users/UserProfileAdmin/UserServicesProfileAdmin/UserServicesProfileAdmin.jsx";
import WaitExecuteWorkServiceInfo from "./components/Content/Profile/Services/WaitExecuteWork/WaitExecuteWork.jsx";
import "./index.css";
function App() {
  const [modal, setModal] = useState(null); // null или "executorModal", "registerModal", "loginModal"

  const [isLoggedIn, setIsLoggedIn] = useState(
    localStorage.getItem("access_token"),
  );

  const navigate = useNavigate();

  const openModal = (name) => setModal(name);
  const closeModal = () => setModal(null);

  const handleLoggedIn = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("login");
    localStorage.removeItem("user_role");

    setIsLoggedIn(false);
    navigate("/catalog");
  };

  useEffect(() => {
    setUnauthorizedHandler(() => {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user_id");
      localStorage.removeItem("login");
      localStorage.removeItem("user_role");
      setIsLoggedIn(false);
      navigate("/catalog");
      setModal("loginModal");
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate]);

  return (
    <div>
      {isLoggedIn ? (
        <>
          <HeaderUser onLogout={handleLogout} />
          <div className="app-shell main-content">
            <Routes>
              <Route
                path="/home"
                element={<HomePage openModal={openModal} />}
              />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/orders" element={<CatalogOrdersCustomers />} />
              <Route path="/order/:slug" element={<CatalogOrderPage openModal={openModal} />} />
              <Route path="/add_order" element={<OrderPage />} />

              <Route path="/legal/terms" element={<TermsOfService />} />
              <Route path="/legal/privacy" element={<PrivacyPolicy />} />
              <Route path="/legal/payment" element={<PaymentRules />} />
              <Route path="/legal/requisites" element={<Requisites />} />

              {/* ✅ ЛИЧНЫЙ КАБИНЕТ — маршруты заказов явно в App.js */}
              <Route element={<ProfilePage />}>
                <Route path="/profile" element={<Orders />} />
                <Route path="/profile/orders" element={<Orders />} />
                <Route
                  path="/profile/orders/:orderId"
                  element={<CustomerOrderView />}
                />
                <Route path="/profile/main_page" element={<MainPage />} />
                <Route path="/profile/my_executors" element={<MyExecutors />} />
                <Route path="/profile/services" element={<Services />} />
                <Route path="/profile/my_customers" element={<MyCustomers />} />
                <Route
                  path="/profile/services/execute_work/:slug"
                  element={<ExecuteWorkServiceInfo />}
                />
                <Route
                  path="/profile/services/continue_execute_work/:slug"
                  element={<ContinueExecuteWorkServiceInfo />}
                />
                <Route
                  path="/profile/services/refused_by_customer/:slug"
                  element={<RefusedByCustomerWork />}
                />
                <Route
                  path="/profile/services/refused_by_order/:slug"
                  element={
                    <RefusedByCustomerWork statusLabel="Отказ от заказа" />
                  }
                />
                <Route
                  path="/profile/services/wait_execute_work/:slug"
                  element={<WaitExecuteWorkServiceInfo />}
                />
                <Route
                  path="/profile/services/consideration_customer/:slug"
                  element={<ConsiderationCustomer />}
                />
                <Route
                  path="/profile/services/offer/:slug"
                  element={<OfferCustomer />}
                />
                <Route
                  path="/profile/specialization"
                  element={<SpecializationTab />}
                />
                <Route path="/profile/executor" element={<ProfileSettings />} />
                <Route path="/profile/portfolio" element={<Portfolio />} />
                <Route path="/profile/analytics" element={<AnalyticsDashboard />} />
                <Route
                  path="/profile/executor_bank_account"
                  element={<ExecutorBankAccount />}
                />
                <Route
                  path="/profile/administrator"
                  element={<SupportContactPanel />}
                />
              </Route>

              <Route path="/profile/:slug" element={<ExecutorProfile openModal={openModal} />} />

              {/* ✅ АДМИН - ВСЕ ВКЛАДКИ РАБОТАЮТ */}
              <Route
                path="/admin/*"
                element={
                  <AdminStaffGuard>
                    <AdminLayout />
                  </AdminStaffGuard>
                }
              >
                <Route index element={<Navigate to="manage_users" replace />} />

                {/* Пользователи */}
                <Route path="manage_users" element={<ManageUsersAdmin />} />
                <Route
                  path="manage_users/:userId"
                  element={<UserProfileAdmin />}
                >
                  <Route path="orders" element={<UserOrdersProfileAdmin />} />
                  <Route
                    path="orders/:orderId"
                    element={<UserOrderProfileAdmin />}
                  />
                  <Route
                    path="services"
                    element={<UserServicesProfileAdmin />}
                  />
                  <Route
                    path="services/:orderId"
                    element={<UserServiceProfileAdmin />}
                  />
                </Route>

                {/* Заказы */}
                <Route path="manage_orders" element={<ManageOrdersAdmin />} />
                <Route
                  path="manage_orders/:orderId"
                  element={<OrderProfileAdmin />}
                />

                {/* География */}
                <Route
                  path="geography"
                  element={<AdminCountriesRegionsTowns />}
                />

                <Route path="business_forms" element={<AddBusinessForm />} />

                {/* Категории */}
                <Route
                  path="categories_works"
                  element={<AdminCategoriesAndWorks />}
                />

                {/* Поддержка */}
                <Route path="complaints">
                  <Route index element={<AdminDisputesSituationsList />} />
                  <Route
                    path="complaint/:complaint_id/order/:order_id"
                    element={<AdminDisputeSituation />}
                  />
                </Route>

                <Route path="supports">
                  <Route index element={<SupportAdminPanel />} />
                  {/* <Route
                    path="supports/support_id"
                    element={<AdminDisputeSituation />}
                  /> */}
                </Route>

                <Route
                  path="cancel_orders"
                  element={<AdminCancelOrdersList />}
                />
                <Route
                  path="cancel_order/:cancel_order_customer_id"
                  element={<CancelOrderVerdictAdmin />}
                />

                <Route path="finances" element={<AdminFinances />} />
              </Route>

              <Route path="*" element={<HomePage openModal={openModal} />} />
            </Routes>
          </div>
          <Footer />
        </>
      ) : (
        <>
          <Header openModal={openModal} />
          <div className="app-shell main-content">
            <Routes>
              <Route
                path="/home"
                element={<HomePage openModal={openModal} />}
              />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/orders" element={<CatalogOrdersCustomers />} />
              <Route path="/order/:slug" element={<CatalogOrderPage openModal={openModal} />} />
              <Route path="/add_order" element={<OrderPage openModal={openModal} />} />
              <Route path="/legal/terms" element={<TermsOfService />} />
              <Route path="/legal/privacy" element={<PrivacyPolicy />} />
              <Route path="/legal/payment" element={<PaymentRules />} />
              <Route path="/legal/requisites" element={<Requisites />} />
              <Route path="/profile/:slug" element={<ExecutorProfile openModal={openModal} />} />
              <Route path="*" element={<HomePage openModal={openModal} />} />
            </Routes>
          </div>
          <Footer />
          {modal === "executorModal" && (
            <ExecutorModal isOpen={true} onClose={closeModal} />
          )}

          {modal === "loginModal" && (
            <LoginModal
              onLogin={handleLoggedIn}
              isOpen={true}
              onClose={closeModal}
            />
          )}

          {modal === "registerModal" && (
            <RegisterModal isOpen={true} onClose={closeModal} />
          )}
        </>
      )}
    </div>
  );
}

export default App;
