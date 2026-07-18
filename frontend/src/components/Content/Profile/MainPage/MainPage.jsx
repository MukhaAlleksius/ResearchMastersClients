import { useState, useEffect } from "react";
import { API, apiFetch, buildApiUrl, resolveMediaUrl } from "../../../../utils/api.js";
import "./main_page.css";
function StarRating({ rating = 5 }) {
  const fullStars = Math.floor(rating);
  const halfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

  return (
    <div
      className="mp-stars"
      aria-label={`Рейтинг ${rating} из 5`}
      role="img"
    >
      {[...Array(fullStars)].map((_, i) => (
        <span key={`full-${i}`}>★</span>
      ))}
      {halfStar && <span className="mp-stars__half">★</span>}
      {[...Array(emptyStars)].map((_, i) => (
        <span key={`empty-${i}`} className="mp-stars__empty">
          ★
        </span>
      ))}
    </div>
  );
}

function Review({ name, stars, text, date, avatarVariant }) {
  return (
    <article className="mp-review">
      <div className="mp-review__row">
        <div className={`mp-review__avatar mp-review__avatar--${avatarVariant}`}>
          {name.charAt(0)}
        </div>
        <div className="mp-review__content">
          <div className="mp-review__head">
            <h4 className="mp-review__name">{name}</h4>
            <StarRating rating={stars} />
          </div>
          <p className="mp-review__text">{text}</p>
          <p className="mp-review__date">{date}</p>
        </div>
      </div>
    </article>
  );
}

function PortfolioItem({ project, setModalImage }) {
  const visibleImages = project.images.slice(0, 12);
  const extraCount = project.images.length - visibleImages.length;

  return (
    <div className="mp-portfolio-item">
      <h3 className="mp-portfolio-item__title">{project.title}</h3>
      <p className="mp-portfolio-item__desc">{project.description}</p>
      {visibleImages.length > 0 ? (
        <>
          <div className="mp-gallery">
            {visibleImages.map((image, index) => {
              const src = resolveMediaUrl(image);
              return (
                <button
                  key={index}
                  type="button"
                  className="mp-gallery__thumb"
                  onClick={() => setModalImage(src)}
                  aria-label={`Открыть фото ${index + 1}`}
                >
                  <img src={src} alt={`${project.title} ${index + 1}`} />
                </button>
              );
            })}
          </div>
          {extraCount > 0 && (
            <p className="mp-gallery__more">+{extraCount} фото</p>
          )}
        </>
      ) : (
        <p className="mp-geo-empty">Нет изображений</p>
      )}
    </div>
  );
}

function GeographySidebar({ data }) {
  if (!data?.countries || Object.keys(data.countries).length === 0) {
    return <p className="mp-geo-empty">Данные географии не найдены</p>;
  }

  return (
    <div>
      {Object.entries(data.countries).map(([countryKey, countryData]) => (
        <div key={countryKey} className="mp-geo-block">
          <p className="mp-geo-block__country">
            {countryData.name_country || countryKey}
          </p>
          {countryData.regions &&
          Object.keys(countryData.regions).length > 0 ? (
            Object.entries(countryData.regions).map(
              ([regionKey, regionData]) => {
                const townsArray = Array.isArray(regionData.towns)
                  ? regionData.towns
                  : Object.values(regionData.towns || {});
                return (
                  <div key={regionKey}>
                    <p className="mp-geo-block__region">
                      {regionData.name_region || regionKey}
                    </p>
                    {townsArray.length > 0 ? (
                      <ul className="mp-geo-block__towns">
                        {townsArray.map((town, idx) => (
                          <li key={idx}>
                            {typeof town === "object"
                              ? town.name_town
                              : town.toString()}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mp-geo-empty">Города не указаны</p>
                    )}
                  </div>
                );
              },
            )
          ) : (
            <p className="mp-geo-empty">Регионы не указаны</p>
          )}
        </div>
      ))}
    </div>
  );
}

function contactIcon(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("телефон") || t.includes("whatsapp")) return "📱";
  if (t.includes("телеграм")) return "✈️";
  if (t.includes("сайт")) return "🌐";
  return "📇";
}

export default function MainPage() {
  const [profileMaster, setProfileMaster] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [portfolioData, setPortfolioData] = useState([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [modalImage, setModalImage] = useState(null);
  const [hasAvatar, setHasAvatar] = useState(false);
  const [userGeographyExecuteOrder, setUserGeographyExecuteOrders] = useState(
    {},
  );
  const [specializations, setSpecializations] = useState([]);

  const userId = localStorage.getItem("user_id");

  const fetchAvatarProfile = async () => {
    try {
      const res = await apiFetch(buildApiUrl(`/avatar/${userId}`));
      setHasAvatar(res.ok);
    } catch {
      setHasAvatar(false);
    }
  };

  const fetchProfileMaster = async () => {
    try {
      const response = await apiFetch(
        buildApiUrl(`/profile/?user_id=${userId}`),
      );
      if (!response.ok) throw new Error("Не получили данных с сервера");
      setProfileMaster(await response.json());
    } catch (error) {
      console.log("Ошибка: ", error);
      setProfileMaster(null);
    }
  };

  const fetchContactsMaster = async () => {
    try {
      const response = await apiFetch(
        `${API.baseURL}/contacts/`,
      );
      if (!response.ok) throw new Error("Не получили данных с сервера");
      setContacts(await response.json());
    } catch (error) {
      console.log("Ошибка: ", error);
      setContacts([]);
    }
  };

  const fetchUserGeographyOrders = async () => {
    try {
      if (!userId) throw new Error("User ID не найден");
      const response = await apiFetch(
        `${API.baseURL}/geography_execute_orders`,
      );
      if (!response.ok) throw new Error("Не получили данных с сервера");
      setUserGeographyExecuteOrders(await response.json());
    } catch (error) {
      console.log("Ошибка: ", error);
    }
  };

  const fetchSpecializations = async () => {
    try {
      if (!userId) return;
      const response = await apiFetch(
        buildApiUrl(`/categories_works_master/${userId}`),
      );
      if (!response.ok) return;
      const data = await response.json();
      setSpecializations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log("Ошибка загрузки специализаций:", error);
      setSpecializations([]);
    }
  };

  const fetchPortfolioData = async () => {
    try {
      const [portfolioResponse, imagesResponse] = await Promise.all([
        apiFetch(buildApiUrl(`/projects_portfolio_master/${userId}`)),
        apiFetch(buildApiUrl(`/project_images_portfolio_master/${userId}`)),
      ]);
      if (!portfolioResponse.ok) throw new Error("Ошибка портфолио");

      const portfolioStructure = await portfolioResponse.json();
      const imagesData = imagesResponse.ok
        ? await imagesResponse.json()
        : { projects: [] };
      const imageMap = new Map(
        (imagesData.projects || []).map((item) => [
          item.title,
          item.images || [],
        ]),
      );

      const projectsWithImages = (Array.isArray(portfolioStructure)
        ? portfolioStructure
        : []
      ).map((project) => ({
        ...project,
        description: project.description || "Описание работы",
        images: imageMap.get(project.title) || [],
      }));

      setPortfolioData(projectsWithImages);
    } catch (error) {
      console.error("Ошибка портфолио:", error);
      setPortfolioData([]);
    } finally {
      setLoadingPortfolio(false);
    }
  };

  useEffect(() => {
    fetchAvatarProfile();
    fetchProfileMaster();
    fetchContactsMaster();
    fetchUserGeographyOrders();
    fetchSpecializations();
    fetchPortfolioData();
  }, []);

  const locationParts = profileMaster
    ? [profileMaster.country, profileMaster.region, profileMaster.town].filter(
        Boolean,
      )
    : [];

  return (
    <div className="mp-page">
      <header className="mp-hero">
        <div className="mp-hero__inner">
          <div className="mp-hero__avatar-wrap">
            {hasAvatar ? (
              <img
                src={buildApiUrl(`/avatar/${userId}?t=${Date.now()}`)}
                alt="Аватар профиля"
                className="mp-hero__avatar"
                onError={() => setHasAvatar(false)}
              />
            ) : (
              <div
                className="mp-hero__avatar mp-hero__avatar--placeholder"
                aria-hidden="true"
              >
                👤
              </div>
            )}
          </div>

          <div className="mp-hero__body">
            {profileMaster ? (
              <>
                <h1 className="mp-hero__name">
                  {profileMaster.first_name} {profileMaster.last_name}
                </h1>
                {profileMaster.short_review_master && (
                  <p className="mp-hero__tagline">
                    {profileMaster.short_review_master}
                  </p>
                )}
              </>
            ) : (
              <p className="mp-skeleton">Загрузка профиля…</p>
            )}

            <div className="mp-hero__rating">
              <StarRating rating={4.9} />
              <span className="mp-hero__rating-count">4.9 · 156 отзывов</span>
            </div>

            <div className="mp-hero__tags">
              {(specializations.length > 0
                ? specializations.map((spec) => spec.name)
                : ["Специализации не добавлены"]
              ).slice(0, 6).map((tag) => (
                <span key={tag} className="mp-tag">
                  {tag}
                </span>
              ))}
            </div>

            {locationParts.length > 0 && (
              <div className="mp-hero__location">
                {locationParts.map((part) => (
                  <span key={part} className="mp-hero__location-item">
                    📍 {part}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mp-layout">
        <main className="mp-main">
          <section className="mp-card" aria-labelledby="mp-about-title">
            <div className="mp-card__head">
              <span className="mp-card__icon" aria-hidden="true">
                📝
              </span>
              <h2 id="mp-about-title" className="mp-card__title">
                О мастере
              </h2>
            </div>
            <div className="mp-card__body mp-card__body--prose">
              {profileMaster?.bio ? (
                <p style={{ margin: 0 }}>{profileMaster.bio}</p>
              ) : profileMaster ? (
                <p className="mp-geo-empty" style={{ margin: 0 }}>
                  Добавьте описание в настройках профиля
                </p>
              ) : (
                <p className="mp-skeleton">Загрузка…</p>
              )}
            </div>
          </section>

          <section className="mp-card" aria-labelledby="mp-portfolio-title">
            <div className="mp-card__head">
              <span className="mp-card__icon" aria-hidden="true">
                🖼️
              </span>
              <h2 id="mp-portfolio-title" className="mp-card__title">
                Портфолио работ
              </h2>
            </div>
            <div className="mp-card__body">
              {loadingPortfolio ? (
                <div className="mp-loading">
                  <div className="mp-loading__spinner" aria-hidden="true" />
                  <span>Загрузка портфолио…</span>
                </div>
              ) : portfolioData.length > 0 ? (
                <div className="mp-portfolio-list">
                  {portfolioData.map((project, index) => (
                    <PortfolioItem
                      key={project.id || project.title || index}
                      project={project}
                      setModalImage={setModalImage}
                    />
                  ))}
                </div>
              ) : (
                <div className="mp-empty">
                  <span className="mp-empty__icon" aria-hidden="true">
                    🖼️
                  </span>
                  <p>Портфолио пока пусто</p>
                </div>
              )}
            </div>
          </section>

          <section className="mp-card" aria-labelledby="mp-reviews-title">
            <div className="mp-card__head">
              <span className="mp-card__icon" aria-hidden="true">
                ⭐
              </span>
              <h2 id="mp-reviews-title" className="mp-card__title">
                Отзывы клиентов
              </h2>
            </div>
            <div className="mp-card__body">
              <div className="mp-reviews">
                <Review
                  name="Марина К."
                  stars={5}
                  text="Отличная работа! Алексей сделал ремонт ванной комнаты быстро и качественно. Очень аккуратный, все убрал за собой. Рекомендую!"
                  date="2 недели назад"
                  avatarVariant="violet"
                />
                <Review
                  name="Сергей П."
                  stars={5}
                  text="Профессионал своего дела! Установил розетки и выключатели, все работает идеально. Цена адекватная, работа выполнена в срок."
                  date="1 месяц назад"
                  avatarVariant="green"
                />
                <Review
                  name="Анна В."
                  stars={4}
                  text="Хорошо выполнил косметический ремонт в комнате. Единственный минус — немного задержался по срокам, но результат хороший."
                  date="2 месяца назад"
                  avatarVariant="rose"
                />
              </div>
            </div>
          </section>
        </main>

        <aside className="mp-sidebar">
          <div className="mp-card mp-sidebar__card">
            <div className="mp-sidebar__section">
              <h3 className="mp-sidebar__title">Контакты</h3>
              <ul className="mp-info-list">
                {profileMaster && (
                  <>
                    {profileMaster.country && (
                      <li className="mp-info-item">
                        <span className="mp-info-item__icon" aria-hidden="true">
                          📍
                        </span>
                        <span>{profileMaster.country}</span>
                      </li>
                    )}
                    {profileMaster.region && (
                      <li className="mp-info-item">
                        <span className="mp-info-item__icon" aria-hidden="true">
                          🗺️
                        </span>
                        <span>{profileMaster.region}</span>
                      </li>
                    )}
                    {profileMaster.town && (
                      <li className="mp-info-item">
                        <span className="mp-info-item__icon" aria-hidden="true">
                          🏙️
                        </span>
                        <span>{profileMaster.town}</span>
                      </li>
                    )}
                  </>
                )}
                <li className="mp-info-item">
                  <span className="mp-info-item__icon" aria-hidden="true">
                    📅
                  </span>
                  <span>На сайте с 2020 г.</span>
                </li>
                {contacts.map((contact, index) => (
                  <li
                    key={contact.contact_id || contact.id || index}
                    className="mp-info-item"
                  >
                    <span className="mp-info-item__icon" aria-hidden="true">
                      {contactIcon(contact.name_contact)}
                    </span>
                    <span>
                      <strong>{contact.name_contact}</strong>
                      <br />
                      {contact.contact}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mp-sidebar__section">
              <h3 className="mp-sidebar__title">География работ</h3>
              <GeographySidebar data={userGeographyExecuteOrder} />
            </div>

            <div className="mp-sidebar__section">
              <h3 className="mp-sidebar__title">Статистика</h3>
              <div className="mp-stats">
                <div className="mp-stat-row">
                  <span className="mp-stat-row__label">Выполнено заказов</span>
                  <span className="mp-stat-row__value">247</span>
                </div>
                <div className="mp-stat-row">
                  <span className="mp-stat-row__label">Повторных клиентов</span>
                  <span className="mp-stat-row__value">68%</span>
                </div>
                <div className="mp-stat-row">
                  <span className="mp-stat-row__label">Время отклика</span>
                  <span className="mp-stat-row__value">&lt; 1 ч</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {modalImage && (
        <div
          className="mp-lightbox"
          onClick={() => setModalImage(null)}
          role="presentation"
        >
          <button
            type="button"
            className="mp-lightbox__close"
            onClick={() => setModalImage(null)}
            aria-label="Закрыть"
          >
            ×
          </button>
          <img
            src={modalImage}
            alt="Просмотр фото"
            className="mp-lightbox__img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
