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
                Найдите надёжного исполнителя для любой задачи
              </h1>
              <p className="hero-text">
                Разместите заказ, получите отклики от специалистов и выберите
                лучшее предложение — быстро, удобно и с прозрачной ценой.
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
              <div className="hero-stats">
                <div className="stat-item stat-item--support">
                  <span className="stat-item__icon" aria-hidden="true">
                    🕐
                  </span>
                  <div className="stat-item__body">
                    <strong>24/7</strong>
                    <span>Поддержка клиентов</span>
                  </div>
                </div>
                <div className="stat-item stat-item--secure">
                  <span className="stat-item__icon" aria-hidden="true">
                    🛡️
                  </span>
                  <div className="stat-item__body">
                    <strong>100%</strong>
                    <span>Безопасные сделки</span>
                  </div>
                </div>
              </div>
            </div>

            <aside className="hero-aside hero-aside--no-visual">
              <div className="hero-card">
                <div className="hero-card-header">
                  <span className="hero-card-header__badge">3 шага</span>
                  Как это работает
                </div>
                <ol className="hero-steps">
                  <li>
                    <span>1</span>
                    <div>
                      <strong>Опубликуйте задачу</strong>
                      <p>Укажите срок, бюджет и описание работ</p>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>Получите отклики</strong>
                      <p>Исполнители предложат цену и сроки</p>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>Выберите мастера</strong>
                      <p>Сравните предложения и начните работу</p>
                    </div>
                  </li>
                </ol>
                <div className="hero-card-note">
                  Все категории услуг — на одной платформе
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="intro-section">
        <div className="intro-container">
          <div className="intro-card">
            <div className="intro-card__icon" aria-hidden="true">
              ✓
            </div>
            <div className="intro-card__content">
              <h2>Удобство, проверенные отзывы и понятный выбор</h2>
              <p>
                Быстро переходите к нужной услуге, смотрите рейтинги и выбирайте
                исполнителей с подходящими отзывами и ценами.
              </p>
            </div>
          </div>
        </div>
      </section>

      <ServiceCategories />
    </div>
  );
}
