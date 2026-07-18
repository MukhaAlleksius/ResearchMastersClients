import React from "react";
import { useNavigate } from "react-router-dom";
import "./popular_executors.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar as solidStar } from "@fortawesome/free-solid-svg-icons";
import { faStar as regularStar } from "@fortawesome/free-regular-svg-icons";

const executors = [
  {
    id: "alexey",
    name: "Алексей М.",
    service: "Мастер по ремонту",
    stars: 5,
    reviews: 156,
    gradient: ["#60a5fa", "#2563eb"],
    initials: "АМ",
  },
  {
    id: "elena",
    name: "Елена К.",
    service: "Клининг-сервис",
    stars: 5,
    reviews: 89,
    gradient: ["#f472b6", "#ec4899"],
    initials: "ЕК",
  },
  {
    id: "dmitriy",
    name: "Дмитрий В.",
    service: "IT-специалист",
    stars: 4,
    reviews: 67,
    gradient: ["#34d399", "#059669"],
    initials: "ДВ",
  },
  {
    id: "anna",
    name: "Анна С.",
    service: "Фотограф",
    stars: 5,
    reviews: 123,
    gradient: ["#a78bfa", "#7c3aed"],
    initials: "АС",
  },
];

function StarRating({ stars }) {
  return (
    <div className="pe-stars" aria-label={`Рейтинг ${stars} из 5`}>
      {[...Array(5)].map((_, i) => (
        <FontAwesomeIcon
          key={i}
          icon={i < stars ? solidStar : regularStar}
        />
      ))}
    </div>
  );
}

export default function PopularExecutors() {
  const navigate = useNavigate();

  return (
    <section className="pe-section">
      <div className="pe-container">
        <div className="pe-head">
          <span className="pe-badge">Топ мастеров</span>
          <h2 className="pe-title">Популярные исполнители</h2>
          <p className="pe-subtitle">
            Проверенные специалисты с высоким рейтингом — выберите и свяжитесь
          </p>
        </div>

        <div className="pe-grid">
          {executors.map(
            ({ id, name, service, stars, reviews, gradient, initials }) => (
              <article key={id} className="pe-card">
                <span className="pe-card__verified">Проверен</span>
                <div
                  className="pe-avatar"
                  style={{
                    background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
                  }}
                >
                  <span className="pe-avatar__initials">{initials}</span>
                </div>
                <h3 className="pe-name">{name}</h3>
                <p className="pe-service">{service}</p>
                <div className="pe-rating-row">
                  <StarRating stars={stars} />
                  <span className="pe-rating-value">{stars}.0</span>
                </div>
                <p className="pe-reviews">
                  {reviews} отзыв{reviews > 4 ? "ов" : reviews > 1 ? "а" : ""}
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/catalog")}
                  className="pe-btn-select"
                >
                  Выбрать
                </button>
              </article>
            ),
          )}
        </div>

        <div className="pe-footer">
          <button
            type="button"
            onClick={() => navigate("/catalog")}
            className="pe-btn-catalog"
          >
            Посмотреть всех исполнителей
          </button>
        </div>
      </div>
    </section>
  );
}
