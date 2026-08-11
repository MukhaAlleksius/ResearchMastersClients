import { useNavigate } from "react-router-dom";
import ServiceCategories from "../ServiceCategories/ServiceCategories";
import "../shared/public_content_layout.css";
import "./home_page.css";

export default function HomePage({ openModal }) {
  const navigate = useNavigate();

  const handleBecomeExecutor = () => {
    const isLoggedIn = Boolean(localStorage.getItem("access_token"));
    if (isLoggedIn) {
      navigate("/profile/specialization");
      return;
    }
    if (typeof openModal === "function") {
      openModal("loginModal");
    }
  };

  return (
    <div className="page active home-page public-content-narrow">
      <section className="hero-section">
        <div className="hero-container">
          <div className="hero-grid">
            <div className="hero-copy">
              <span className="hero-badge">Сервис поиска мастеров</span>
              <h1 className="hero-title">
                Fixer — смета, выполненные работы и сделка с исполнителем
              </h1>
              <p className="hero-text">
                Разместите заказ, согласуйте смету, отмечайте выполненные работы
                по датам и ведите переписку в одном месте. Сейчас сервис
                бесплатный: оплата и договор на платформе появятся позже —
                пока расчёт между собой.
              </p>
              <div className="hero-buttons">
                <button
                  type="button"
                  onClick={() => navigate("/add_order")}
                  className="button-primary"
                >
                  Разместить заказ
                </button>
                <button
                  type="button"
                  onClick={handleBecomeExecutor}
                  className="button-outline"
                >
                  Стать исполнителем
                </button>
              </div>
              <p className="hero-pilot-note">
                Пилот бесплатный. Комиссии и онлайн-оплаты пока нет.
              </p>
            </div>

            <aside className="hero-aside hero-aside--no-visual">
              <div className="hero-card">
                <div className="hero-card-header">
                  <span className="hero-card-header__badge">4 шага</span>
                  Как это работает
                </div>
                <ol className="hero-steps">
                  <li>
                    <span>1</span>
                    <div>
                      <strong>Опубликуйте задачу</strong>
                      <p>Опишите работы, срок и ориентир по бюджету</p>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>Выберите исполнителя</strong>
                      <p>Сравните отклики по цене и срокам</p>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>Согласуйте смету и фиксацию работ</strong>
                      <p>
                        Зафиксируйте объём в смете и отмечайте выполненные
                        работы по датам
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>4</span>
                    <div>
                      <strong>Закройте заказ</strong>
                      <p>Общайтесь в чате и отметьте выполнение</p>
                    </div>
                  </li>
                </ol>
                <div className="hero-card-note">
                  Оплата и договор через Fixer — в следующих версиях. Сейчас
                  деньги и документы стороны оформляют сами.
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="intro-section">
        <div className="intro-container">
          <div className="intro-card">
            <div className="intro-card__content">
              <h2>Не только поиск мастера — учёт работ в сделке</h2>
              <p>
                Fixer помогает провести заказ от публикации до закрытия: смета,
                фиксация выполненных работ по датам, чат и статусы. Платёжный
                контур на платформе ещё в разработке.
              </p>
            </div>
          </div>
        </div>
      </section>

      <ServiceCategories />
    </div>
  );
}
