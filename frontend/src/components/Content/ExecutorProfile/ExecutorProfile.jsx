import { useState, useEffect, useCallback } from "react";
import { API, apiFetch, buildApiUrl, resolveMediaUrl } from "../../../utils/api.js";
import { useLocation } from "react-router-dom";
import MakeOrderExecutorModal from "./MakeOrderExecutor/MakeOrderExecutorModal";
import { dedupeOrdersById } from "../../../utils/orders.js";
import { formatMoney } from "../../../utils/currency";
import "./executor_profile.css";
const STATUS_SEARCHING_EXECUTOR = "в поиске исполнителя";

function isOrderAvailableForExecutorOffer(order, executorId) {
  const status = (order?.status_order_customer || "").trim().toLowerCase();
  if (status !== STATUS_SEARCHING_EXECUTOR) {
    return false;
  }
  if (
    executorId != null &&
    order?.executor_id != null &&
    String(order.executor_id) === String(executorId)
  ) {
    return false;
  }
  return true;
}

function StarRating({ rating = 5, onDark = true }) {
  const fullStars = Math.floor(rating);
  const halfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

  return (
    <div className="ep-stars" aria-label={`Рейтинг ${rating} из 5`} role="img">
      {[...Array(fullStars)].map((_, i) => (
        <span key={`full-${i}`}>★</span>
      ))}
      {halfStar && <span className="ep-stars__half">★</span>}
      {[...Array(emptyStars)].map((_, i) => (
        <span
          key={`empty-${i}`}
          className={onDark ? "ep-stars__empty" : undefined}
          style={onDark ? undefined : { color: "#cbd5e1" }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function Review({ name, stars, text, date, avatarVariant }) {
  return (
    <article className="ep-review">
      <div className="ep-review__row">
        <div
          className={`ep-review__avatar ep-review__avatar--${avatarVariant}`}
        >
          {name.charAt(0)}
        </div>
        <div className="ep-review__content">
          <div className="ep-review__head">
            <h4 className="ep-review__name">{name}</h4>
            <StarRating rating={stars} onDark={false} />
          </div>
          <p className="ep-review__text">{text}</p>
          <p className="ep-review__date">{date}</p>
        </div>
      </div>
    </article>
  );
}

function resolveImageUrl(path) {
  return resolveMediaUrl(path);
}

function PortfolioItem({ project, onOpenLightbox }) {
  const images = project.images || [];

  return (
    <div className="ep-portfolio-item">
      <h3 className="ep-portfolio-item__title">{project.title}</h3>
      {project.description && (
        <p className="ep-portfolio-item__desc">{project.description}</p>
      )}
      {images.length > 0 ? (
        <div className="ep-gallery">
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              className="ep-gallery__thumb"
              onClick={() => onOpenLightbox(images, index)}
              aria-label={`Открыть фото ${index + 1} из ${images.length}`}
            >
              <img
                src={resolveImageUrl(image)}
                alt={`${project.title} — фото ${index + 1}`}
                loading="lazy"
                draggable={false}
              />
            </button>
          ))}
        </div>
      ) : (
        <p className="ep-empty">Нет изображений</p>
      )}
    </div>
  );
}

function PhotoLightbox({ viewer, onClose, onNavigate }) {
  useEffect(() => {
    if (!viewer) return undefined;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onNavigate(-1);
      if (e.key === "ArrowRight") onNavigate(1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewer, onClose, onNavigate]);

  if (!viewer) return null;

  const { images, index } = viewer;
  const hasMultiple = images.length > 1;

  const handleTouchStart = (e) => {
    e.currentTarget.dataset.touchX = String(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    if (!hasMultiple) return;
    const startX = Number(e.currentTarget.dataset.touchX);
    if (Number.isNaN(startX)) return;
    const deltaX = e.changedTouches[0].clientX - startX;
    if (Math.abs(deltaX) > 48) {
      onNavigate(deltaX > 0 ? -1 : 1);
    }
    delete e.currentTarget.dataset.touchX;
  };

  return (
    <div
      className="ep-lightbox"
      onClick={onClose}
      role="presentation"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button
        type="button"
        className="ep-lightbox__close"
        onClick={onClose}
        aria-label="Закрыть"
      >
        ×
      </button>

      {hasMultiple && (
        <>
          <button
            type="button"
            className="ep-lightbox__nav ep-lightbox__nav--prev"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(-1);
            }}
            aria-label="Предыдущее фото"
          >
            ‹
          </button>
          <button
            type="button"
            className="ep-lightbox__nav ep-lightbox__nav--next"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(1);
            }}
            aria-label="Следующее фото"
          >
            ›
          </button>
          <span className="ep-lightbox__counter">
            {index + 1} / {images.length}
          </span>
        </>
      )}

      <img
        src={resolveImageUrl(images[index])}
        alt={`Просмотр фото ${index + 1}`}
        className="ep-lightbox__img"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </div>
  );
}

function GeographySidebar({ data }) {
  if (!data?.countries || Object.keys(data.countries).length === 0) {
    return <p className="ep-empty">Данные географии не найдены</p>;
  }

  return (
    <div>
      {Object.entries(data.countries).map(([countryKey, countryData]) => (
        <div key={countryKey} className="ep-geo-block">
          <p className="ep-geo-block__country">
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
                    <p className="ep-geo-block__region">
                      {regionData.name_region || regionKey}
                    </p>
                    {townsArray.length > 0 ? (
                      <ul className="ep-geo-block__towns">
                        {townsArray.map((town, idx) => (
                          <li key={idx}>
                            {typeof town === "object"
                              ? town.name_town
                              : town.toString()}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="ep-empty">Города не указаны</p>
                    )}
                  </div>
                );
              },
            )
          ) : (
            <p className="ep-empty">Регионы не указаны</p>
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

function getCategoryLabel(category) {
  return (
    category.name_category_work ||
    category.title ||
    category.name ||
    "Специализация"
  );
}

function getWorkName(work) {
  return work.name_work || work.name || work.title || work.work_name || "Работа";
}

function getWorkPrice(work) {
  if (work.cost !== undefined && work.cost !== null) {
    return formatMoney(work.cost, work.currency);
  }
  if (work.price !== undefined && work.price !== null) {
    return formatMoney(work.price, work.currency);
  }
  return "—";
}

function PriceModal({
  open,
  onClose,
  selectedCategory,
  commonWorks,
  masterWorks,
  loading,
}) {
  const [activeTab, setActiveTab] = useState("common");

  useEffect(() => {
    if (open) setActiveTab("common");
  }, [open]);

  if (!open || !selectedCategory) return null;

  const categoryName = getCategoryLabel(selectedCategory);
  const works = activeTab === "common" ? commonWorks : masterWorks;
  const tabLabel =
    activeTab === "common" ? "Общепринятые цены" : "Цены мастера";

  return (
    <div
      className="ep-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="ep-price-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="ep-price-title"
        aria-modal="true"
      >
        <header className="ep-price-modal__header">
          <h2 id="ep-price-title" className="ep-price-modal__title">
            Прайс: {categoryName}
          </h2>
          <button
            type="button"
            className="ep-price-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>
        <div className="ep-price-modal__body">
          {loading ? (
            <div className="ep-price-modal__loading">
              <div className="ep-loading__spinner" aria-hidden="true" />
              <span>Загрузка прайса…</span>
            </div>
          ) : (
            <>
              <div className="ep-price-tabs">
                <button
                  type="button"
                  className={`ep-price-tab ${activeTab === "common" ? "ep-price-tab--active" : ""}`}
                  onClick={() => setActiveTab("common")}
                >
                  Общепринятые ({commonWorks?.length || 0})
                </button>
                <button
                  type="button"
                  className={`ep-price-tab ${activeTab === "master" ? "ep-price-tab--active" : ""}`}
                  onClick={() => setActiveTab("master")}
                >
                  Цены мастера ({masterWorks?.length || 0})
                </button>
              </div>
              <h3 className="ep-price-modal__subtitle">{tabLabel}</h3>
              {!works || works.length === 0 ? (
                <p className="ep-empty">Работы не найдены</p>
              ) : (
                <div className="ep-price-list">
                  {works.map((work, index) => (
                    <div key={work.id || index} className="ep-price-row">
                      <span className="ep-price-row__name">
                        {getWorkName(work)}
                      </span>
                      <span className="ep-price-row__value">
                        {getWorkPrice(work)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function isCategoryActive(selected, category) {
  if (!selected) return false;
  return (
    selected.category_work_id === category.category_work_id ||
    selected.id === category.id
  );
}

export default function ExecutorProfile({ openModal }) {
  const location = useLocation();

  const [contacts, setContacts] = useState([]);
  const [portfolioData, setPortfolioData] = useState([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [photoViewer, setPhotoViewer] = useState(null);
  const [userGeographyExecuteOrder, setUserGeographyExecuteOrders] = useState(
    {},
  );
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const executorId =
    location.state?.customerId ??
    location.state?.executorId ??
    new URLSearchParams(location.search).get("id") ??
    null;

  const fallbackName = {
    first_name: location.state?.first_name ?? "",
    last_name: location.state?.last_name ?? "",
    short_review_master: location.state?.short_review_master ?? "",
    country: location.state?.country ?? "",
    region: location.state?.region ?? "",
    town: location.state?.town ?? "",
    operating_mode: location.state?.operating_mode ?? "",
    bio: location.state?.bio ?? "",
  };

  const [profileMaster, setProfileMaster] = useState(() => {
    if (!executorId) return null;
    if (!fallbackName.first_name && !fallbackName.last_name) return null;
    return {
      id: Number(executorId),
      ...fallbackName,
    };
  });
  const [hasAvatar, setHasAvatar] = useState(false);
  const [ordersCustomer, setOrdersCustomer] = useState([]);
  const [categoriesWorksMaster, setCategoriesWorksMaster] = useState([]);
  const [commonWorks, setCommonWorks] = useState([]);
  const [masterWorks, setMasterWorks] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const openPhotoViewer = useCallback((images, index) => {
    setPhotoViewer({ images, index });
  }, []);

  const closePhotoViewer = useCallback(() => {
    setPhotoViewer(null);
  }, []);

  const navigatePhotoViewer = useCallback((delta) => {
    setPhotoViewer((current) => {
      if (!current?.images?.length) return current;
      const nextIndex =
        (current.index + delta + current.images.length) % current.images.length;
      return { ...current, index: nextIndex };
    });
  }, []);

  const user_id = localStorage.getItem("user_id");
  const isLoggedIn = Boolean(localStorage.getItem("access_token"));
  const isOwnProfile =
    user_id != null &&
    executorId != null &&
    String(user_id) === String(executorId);

  const handleShowSelectOrders = async () => {
    if (!executorId) {
      alert("Не удалось определить исполнителя");
      return;
    }

    try {
      const params = new URLSearchParams({
        exclude_offered_to_executor_id: String(executorId),
      });
      const response = await apiFetch(
        `${API.baseURL}/orders_customer?${params.toString()}`,
      );
      if (!response.ok) throw new Error("Не удалось получить заказы");
      const data = await response.json();
      const eligible = dedupeOrdersById(Array.isArray(data) ? data : []).filter(
        (order) => isOrderAvailableForExecutorOffer(order, executorId),
      );
      setOrdersCustomer(eligible);
      setIsOrderModalOpen(true);
    } catch (error) {
      console.error("Ошибка загрузки заказов:", error);
      alert("Не удалось загрузить ваши заказы");
    }
  };

  const fetchAvatarProfile = async () => {
    if (!executorId) return;
    try {
      const res = await apiFetch(buildApiUrl(`/avatar/${executorId}`));
      setHasAvatar(res.ok);
    } catch {
      setHasAvatar(false);
    }
  };

  const fetchProfileMaster = async () => {
    if (!executorId) return;
    try {
      const response = await apiFetch(
        buildApiUrl("/profile", { user_id: executorId }),
      );
      if (!response.ok) throw new Error("Не получили данных с сервера");
      setProfileMaster(await response.json());
    } catch (error) {
      console.log("Ошибка: ", error);
      if (fallbackName.first_name || fallbackName.last_name) {
        setProfileMaster({
          id: Number(executorId),
          ...fallbackName,
        });
      } else {
        setProfileMaster(null);
      }
    }
  };

  const fetchCategoriesWorksMaster = async () => {
    if (!executorId) return;
    try {
      const response = await apiFetch(
        buildApiUrl(`/categories_works_master/${executorId}`),
      );
      if (!response.ok) throw new Error("Не получили данных с сервера");
      setCategoriesWorksMaster(await response.json());
    } catch (error) {
      console.log("Ошибка: ", error);
      setCategoriesWorksMaster([]);
    }
  };

  const fetchWorksForCategoryWork = async (category_work_id) => {
    const response = await apiFetch(
      buildApiUrl(`/works_for_category_work/${category_work_id}`),
    );
    if (!response.ok) throw new Error("Не получили данных с сервера");
    setCommonWorks(await response.json());
  };

  const fetchWorksMaster = async (category_work_id) => {
    try {
      if (!executorId || !category_work_id) {
        setMasterWorks([]);
        return;
      }
      const [res1, res2] = await Promise.all([
        apiFetch(
          buildApiUrl(
            `/works_master_from_admin/${executorId}/${category_work_id}`,
          ),
        ),
        apiFetch(
          buildApiUrl(
            `/works_master_myself/${executorId}/${category_work_id}`,
          ),
        ),
      ]);
      if (!res1.ok || !res2.ok) throw new Error("Не получили данных с сервера");
      const worksFromAdmin = await res1.json();
      const worksMyself = await res2.json();
      setMasterWorks([...worksFromAdmin, ...worksMyself]);
    } catch (error) {
      console.log("Ошибка:", error);
      setMasterWorks([]);
    }
  };

  const fetchContactsMaster = async () => {
    if (!executorId) return;
    try {
      const response = await apiFetch(
        buildApiUrl(`/users/${executorId}/contacts`),
      );
      if (!response.ok) throw new Error("Не получили данных с сервера");
      setContacts(await response.json());
    } catch (error) {
      console.log("Ошибка: ", error);
      setContacts([]);
    }
  };

  const fetchUserGeographyOrders = async () => {
    if (!executorId) return;
    try {
      const response = await apiFetch(
        buildApiUrl(`/users/${executorId}/geography_execute_orders`),
      );
      if (!response.ok) throw new Error("Не получили данных с сервера");
      setUserGeographyExecuteOrders(await response.json());
    } catch (error) {
      console.log("Ошибка: ", error);
    }
  };

  const fetchPortfolioData = async () => {
    if (!executorId) {
      setLoadingPortfolio(false);
      return;
    }
    try {
      const portfolioResponse = await apiFetch(
        buildApiUrl(`/projects_portfolio_master/${executorId}`),
      );
      if (!portfolioResponse.ok) throw new Error("Ошибка портфолио");
      const portfolioStructure = await portfolioResponse.json();
      const imagesResponse = await apiFetch(
        buildApiUrl(`/project_images_portfolio_master/${executorId}`),
      );
      const imagesData = await imagesResponse.json();

      const projectsWithImages = portfolioStructure.map((project) => ({
        ...project,
        description: project.description || "Описание работы",
        images:
          imagesData.projects.find((p) => p.title === project.title)?.images ||
          [],
      }));

      setPortfolioData(projectsWithImages);
    } catch (error) {
      console.error("Ошибка портфолио:", error);
      setPortfolioData([]);
    } finally {
      setLoadingPortfolio(false);
    }
  };

  const handleOrderSelect = (selectedOrders) => {
    console.log("Выбранные заказы:", selectedOrders);
    setIsOrderModalOpen(false);
  };

  const handleCategoryClick = async (category) => {
    setSelectedCategory(category);
    setIsPriceModalOpen(true);
    setLoadingPrice(true);
    try {
      await Promise.all([
        fetchWorksForCategoryWork(category.category_work_id),
        fetchWorksMaster(category.category_work_id),
      ]);
    } finally {
      setLoadingPrice(false);
    }
  };

  useEffect(() => {
    fetchAvatarProfile();
    fetchProfileMaster();
    fetchContactsMaster();
    fetchUserGeographyOrders();
    fetchPortfolioData();
    fetchCategoriesWorksMaster();
  }, [executorId]);

  const locationParts = profileMaster
    ? [profileMaster.country, profileMaster.region, profileMaster.town].filter(
        Boolean,
      )
    : [];

  const displayTags = categoriesWorksMaster.map(getCategoryLabel).slice(0, 6);
  const showContactCta = !isOwnProfile;

  return (
    <div className="ep-page">
      <header className="ep-hero">
        <div className="ep-hero__top">
          <div className="ep-hero__profile">
            <div className="ep-hero__avatar-wrap">
              {hasAvatar && executorId ? (
                <img
                  src={buildApiUrl(`/avatar/${executorId}`, { t: Date.now() })}
                  alt="Аватар мастера"
                  className="ep-hero__avatar"
                  onError={() => setHasAvatar(false)}
                />
              ) : (
                <div
                  className="ep-hero__avatar ep-hero__avatar--placeholder"
                  aria-hidden="true"
                >
                  👤
                </div>
              )}
            </div>

            <div className="ep-hero__info">
              {profileMaster ? (
                <>
                  <h1 className="ep-hero__name">
                    {profileMaster.first_name} {profileMaster.last_name}
                  </h1>
                  {profileMaster.short_review_master && (
                    <p className="ep-hero__tagline">
                      {profileMaster.short_review_master}
                    </p>
                  )}
                </>
              ) : (
                <p className="ep-skeleton">Загрузка профиля…</p>
              )}

              <div className="ep-hero__rating">
                <StarRating rating={4.9} />
                <span className="ep-hero__rating-count">4.9 · 156 отзывов</span>
              </div>

              {displayTags.length > 0 && (
                <div className="ep-hero__tags">
                  {displayTags.map((tag) => (
                    <span key={tag} className="ep-tag">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {locationParts.length > 0 && (
                <div className="ep-hero__location">
                  {locationParts.map((part) => (
                    <span key={part} className="ep-hero__location-item">
                      📍 {part}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {isLoggedIn && showContactCta && (
            <button
              type="button"
              className="ep-btn ep-btn--cta"
              onClick={handleShowSelectOrders}
            >
              Заказать услугу
            </button>
          )}

          {!isLoggedIn && showContactCta && (
            <div className="ep-guest-cta">
              <p className="ep-guest-cta__text">
                Чтобы обратиться к исполнителю, зарегистрируйтесь или войдите в
                аккаунт.
              </p>
              <div className="ep-guest-cta__buttons">
                <button
                  type="button"
                  className="ep-guest-cta__btn ep-guest-cta__btn--primary"
                  onClick={() => openModal?.("loginModal")}
                >
                  Войти
                </button>
                <button
                  type="button"
                  className="ep-guest-cta__btn ep-guest-cta__btn--secondary"
                  onClick={() => openModal?.("registerModal")}
                >
                  Зарегистрироваться
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="ep-layout">
        <main className="ep-main">
          <section className="ep-specs" aria-labelledby="ep-specs-title">
            <div className="ep-specs__head">
              <h2 id="ep-specs-title" className="ep-specs__title">
                Специализации мастера
              </h2>
              <p className="ep-specs__hint">
                Нажмите на категорию, чтобы посмотреть прайс и список работ
              </p>
            </div>
            <div className="ep-chips">
              {categoriesWorksMaster.length > 0 ? (
                categoriesWorksMaster.map((category) => (
                  <button
                    key={category.id || category.category_work_id}
                    type="button"
                    onClick={() => handleCategoryClick(category)}
                    className={`ep-chip ${
                      isCategoryActive(selectedCategory, category)
                        ? "ep-chip--active"
                        : ""
                    }`}
                  >
                    {getCategoryLabel(category)}
                  </button>
                ))
              ) : (
                <p className="ep-empty">Специализации не найдены</p>
              )}
            </div>
          </section>

          <section className="ep-card" aria-labelledby="ep-about-title">
            <div className="ep-card__head">
              <span className="ep-card__icon" aria-hidden="true">
                📝
              </span>
              <h2 id="ep-about-title" className="ep-card__title">
                О мастере
              </h2>
            </div>
            <div className="ep-card__body ep-card__body--prose">
              {profileMaster?.bio ? (
                <p style={{ margin: 0 }}>{profileMaster.bio}</p>
              ) : profileMaster ? (
                <p className="ep-empty" style={{ margin: 0 }}>
                  Мастер ещё не добавил описание
                </p>
              ) : (
                <p className="ep-skeleton">Загрузка…</p>
              )}
            </div>
          </section>

          <section className="ep-card" aria-labelledby="ep-portfolio-title">
            <div className="ep-card__head">
              <span className="ep-card__icon" aria-hidden="true">
                🖼️
              </span>
              <h2 id="ep-portfolio-title" className="ep-card__title">
                Портфолио работ
              </h2>
            </div>
            <div className="ep-card__body">
              {loadingPortfolio ? (
                <div className="ep-loading">
                  <div className="ep-loading__spinner" aria-hidden="true" />
                  <span>Загрузка портфолио…</span>
                </div>
              ) : portfolioData.length > 0 ? (
                <div className="ep-portfolio-list">
                  {portfolioData.map((project, index) => (
                    <PortfolioItem
                      key={project.id || project.title || index}
                      project={project}
                      onOpenLightbox={openPhotoViewer}
                    />
                  ))}
                </div>
              ) : (
                <div className="ep-empty-state">
                  <span aria-hidden="true">🖼️</span>
                  <p>Портфолио пока пусто</p>
                </div>
              )}
            </div>
          </section>

          <section className="ep-card" aria-labelledby="ep-reviews-title">
            <div className="ep-card__head">
              <span className="ep-card__icon" aria-hidden="true">
                ⭐
              </span>
              <h2 id="ep-reviews-title" className="ep-card__title">
                Отзывы клиентов
              </h2>
            </div>
            <div className="ep-card__body">
              <div className="ep-reviews">
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

        <aside className="ep-sidebar">
          <div className="ep-card ep-sidebar__card">
            <div className="ep-sidebar__section">
              <h3 className="ep-sidebar__title">Контакты</h3>
              <ul className="ep-info-list">
                {profileMaster && (
                  <>
                    {profileMaster.country && (
                      <li className="ep-info-item">
                        <span className="ep-info-item__icon" aria-hidden="true">
                          📍
                        </span>
                        <span>{profileMaster.country}</span>
                      </li>
                    )}
                    {profileMaster.region && (
                      <li className="ep-info-item">
                        <span className="ep-info-item__icon" aria-hidden="true">
                          🗺️
                        </span>
                        <span>{profileMaster.region}</span>
                      </li>
                    )}
                    {profileMaster.town && (
                      <li className="ep-info-item">
                        <span className="ep-info-item__icon" aria-hidden="true">
                          🏙️
                        </span>
                        <span>{profileMaster.town}</span>
                      </li>
                    )}
                  </>
                )}
                <li className="ep-info-item">
                  <span className="ep-info-item__icon" aria-hidden="true">
                    📅
                  </span>
                  <span>На сайте с 2020 г.</span>
                </li>
                {contacts.map((contact, index) => (
                  <li
                    key={contact.contact_id || contact.id || index}
                    className="ep-info-item"
                  >
                    <span className="ep-info-item__icon" aria-hidden="true">
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

            <div className="ep-sidebar__section">
              <h3 className="ep-sidebar__title">География работ</h3>
              <GeographySidebar data={userGeographyExecuteOrder} />
            </div>

            <div className="ep-sidebar__section">
              <h3 className="ep-sidebar__title">Статистика</h3>
              <div className="ep-stats">
                <div className="ep-stat-row">
                  <span className="ep-stat-row__label">Выполнено заказов</span>
                  <span className="ep-stat-row__value">247</span>
                </div>
                <div className="ep-stat-row">
                  <span className="ep-stat-row__label">Повторных клиентов</span>
                  <span className="ep-stat-row__value">68%</span>
                </div>
                <div className="ep-stat-row">
                  <span className="ep-stat-row__label">Время отклика</span>
                  <span className="ep-stat-row__value">&lt; 1 ч</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <PhotoLightbox
        viewer={photoViewer}
        onClose={closePhotoViewer}
        onNavigate={navigatePhotoViewer}
      />

      <PriceModal
        open={isPriceModalOpen}
        onClose={() => setIsPriceModalOpen(false)}
        selectedCategory={selectedCategory}
        commonWorks={commonWorks}
        masterWorks={masterWorks}
        loading={loadingPrice}
      />

      {isOrderModalOpen && (
        <MakeOrderExecutorModal
          ordersCustomer={ordersCustomer}
          closeOrderModal={() => setIsOrderModalOpen(false)}
          handleOrderSelect={handleOrderSelect}
          executorId={executorId}
        />
      )}
    </div>
  );
}
