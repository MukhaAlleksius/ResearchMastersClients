import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faStar as solidStar } from "@fortawesome/free-solid-svg-icons";
import { faStar as regularStar } from "@fortawesome/free-regular-svg-icons";

export default function ExecutorCard({
  id,
  gradientFrom,
  gradientTo,
  name,
  role,
  rating = 0,
  reviews = 0,
  executor = {},
  tags = [],
  price,
  onSelect,
}) {
  return (
    <div className="executor-card">
      <div className="executor-card-inner">
        <div className="executor-header">
          <div
            className="executor-avatar"
            style={{
              backgroundImage: `linear-gradient(to right, ${gradientFrom}, ${gradientTo})`,
            }}
          >
            <FontAwesomeIcon
              icon={faUser}
              style={{ color: "white", fontSize: "1.5rem" }}
            />
          </div>
          <div>
            <h3 className="executor-name">{name}</h3>
            <p className="executor-role">{role}</p>
          </div>
        </div>

        <div className="star-rating">
          {[...Array(5)].map((_, i) => (
            <FontAwesomeIcon
              key={i}
              icon={i < Math.floor(rating) ? solidStar : regularStar}
              style={{ color: "#fbbf24", marginRight: 4 }}
            />
          ))}
          <span className="reviews">
            {rating.toFixed(1)} ({reviews} отзыв{reviews > 1 ? "ов" : ""})
          </span>
        </div>

        <p className="executor-description">{executor.description}</p>

        <div className="executor-tags">
          {tags.map((tag) => (
            <span key={tag} className="executor-tag">
              {tag}
            </span>
          ))}
        </div>

        <div className="executor-footer">
          <div className="executor-price">от {price} ₽/час</div>
          <button
            onClick={() => onSelect(id)}
            className="executor-select-button"
          >
            Выбрать
          </button>
        </div>
      </div>
    </div>
  );
}
