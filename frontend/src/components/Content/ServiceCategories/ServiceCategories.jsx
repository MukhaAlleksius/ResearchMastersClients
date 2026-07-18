import React, { useState, useEffect, useCallback } from "react";
import { API, apiFetch, buildApiUrl } from "../../../utils/api.js";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "react-router-dom";
import {
  faBroom,
  faLaptopCode,
  faHammer,
  faTruck,
  faSpa,
  faGraduationCap,
  faTasks,
  faCamera,
} from "@fortawesome/free-solid-svg-icons";
import "./service_categories.css";

export default function ServiceCategories() {
  const [categoriesWorks, setCategoriesWorks] = useState([]);
  const navigate = useNavigate();

  // ✅ УБРАЛИ transliterate — используем slug из БД!

  // 🔥 НОВАЯ ФУНКЦИЯ — передаёт объект целиком!
  const linkToCatalog = useCallback(
    (categoryObj) => {
      const { title, slug } = categoryObj;

      navigate(`/catalog?category_work=${slug}`, {
        state: {
          categoryTitle: title,
          categorySlug: slug,
        },
      });
    },
    [navigate],
  );

  const fetchCategoriesWorks = async () => {
    try {
      const response = await apiFetch(
        buildApiUrl("/categories_works_for_users"),
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      if (!data || data.length === 0) {
        setCategoriesWorks(getFallbackData());
        return;
      }

      const formattedData = data.map((cat) => ({
        id: cat.category_work_id || cat.id,
        title: cat.name || "Без названия",
        slug: cat.slug, // ✅ ТОЧНЫЙ slug из БД: 'programmirovanie'!
        icon: getIconByName(cat.icon_name),
        iconColorClass: getColorClass(cat.icon_color),
        description: cat.description || "Описание услуги",
        dropdownItems:
          cat.works?.map((work) => ({
            id: work.id,
            name: work.name_work,
            slug: work.slug, // ✅ Точный slug работы из БД!
            cost: work.cost,
            unit: work.unit_measurement,
          })) || [],
      }));

      setCategoriesWorks(formattedData);
    } catch (error) {
      console.error("Ошибка загрузки категорий:", error);
      setCategoriesWorks(getFallbackData());
    }
  };

  const getIconByName = (iconName) => {
    const iconMap = {
      Программист: faLaptopCode,
      Строитель: faHammer,
      Водитель: faTruck,
      Повар: faSpa,
      Уборка: faBroom,
      Обучение: faGraduationCap,
      Работа: faTasks,
      Фото: faCamera,
    };
    return iconMap[iconName] || faTasks;
  };

  const getColorClass = (color) => {
    if (!color) return "blue";
    if (color.includes("#FF") || color.includes("#F")) return "red";
    if (color.includes("#00")) return "green";
    if (color.includes("#2C") || color.includes("#344")) return "dark";
    return "blue";
  };

  const getFallbackData = () => [
    {
      id: 1,
      title: "Программирование",
      slug: "programmirovanie", // ✅ Правильный slug!
      icon: faLaptopCode,
      iconColorClass: "blue",
      description: "Разработка сайтов и приложений",
      dropdownItems: [
        {
          id: 1,
          name: "Создание сайта",
          slug: "sozdanie-sayta",
          cost: 50,
          unit: "час",
        },
        {
          id: 2,
          name: "Мобильное приложение",
          slug: "mobilnoe-prilozhenie",
          cost: 70,
          unit: "час",
        },
      ],
    },
    {
      id: 2,
      title: "Строительство",
      slug: "stroitelstvo", // ✅ Правильный slug!
      icon: faHammer,
      iconColorClass: "orange",
      description: "Ремонт и строительство",
      dropdownItems: [
        {
          id: 3,
          name: "Кирпичная кладка",
          slug: "kirpichnaya-k ladka",
          cost: 20,
          unit: "м²",
        },
        {
          id: 4,
          name: "Штукатурка",
          slug: "shtukaturka",
          cost: 15,
          unit: "м²",
        },
      ],
    },
  ];

  useEffect(() => {
    fetchCategoriesWorks();
  }, []);

  return (
    <section className="home-categories">
      <div className="home-categories__container">
        <header className="home-categories__head">
          <span className="home-categories__badge">Услуги</span>
          <h2 className="home-categories__title">Популярные услуги</h2>
          <p className="home-categories__subtitle">
            Выберите категорию, чтобы перейти в каталог исполнителей
          </p>
        </header>
        <div className="home-categories__grid">
          {categoriesWorks.map(
            ({
              id,
              title,
              slug,
              icon,
              iconColorClass,
              description,
              dropdownItems,
            }) => (
              <div
                key={id}
                className="home-category-dropdown"
                role="button"
                tabIndex={0}
                onClick={() => linkToCatalog({ title, slug })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    linkToCatalog({ title, slug });
                  }
                }}
              >
                <article className="home-category-card">
                  <div
                    className={`home-category-card__glow home-category-card__glow--${iconColorClass}`}
                    aria-hidden="true"
                  />
                  <div className="home-category-card__head">
                    <div
                      className={`home-category-card__icon home-category-card__icon--${iconColorClass}`}
                    >
                      <FontAwesomeIcon icon={icon} fixedWidth />
                    </div>
                    {dropdownItems.length > 0 && (
                      <span className="home-category-card__count">
                        {dropdownItems.length}{" "}
                        {dropdownItems.length === 1
                          ? "услуга"
                          : dropdownItems.length < 5
                            ? "услуги"
                            : "услуг"}
                      </span>
                    )}
                  </div>
                  <h3 className="home-category-card__title">{title}</h3>
                  <p className="home-category-card__desc">{description}</p>
                  {dropdownItems.length > 0 && (
                    <ul className="home-category-card__samples">
                      {dropdownItems.slice(0, 2).map((work) => (
                        <li key={work.id || work.slug}>{work.name}</li>
                      ))}
                    </ul>
                  )}
                  <span className="home-category-card__cta">
                    Смотреть каталог
                    <span className="home-category-card__arrow" aria-hidden>
                      →
                    </span>
                  </span>
                </article>
              </div>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
