import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from "react";
import { apiFetch, buildApiUrl } from "../../../utils/api.js";
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
  faBolt,
  faFaucet,
} from "@fortawesome/free-solid-svg-icons";
import "./service_categories.css";

const FALLBACK_CATEGORIES = [
  {
    id: 1,
    title: "Ремонт и отделка",
    slug: "stroitelstvo",
    iconName: "Строитель",
    accent: "#9a5b3c",
    description: "Ремонт, отделка и строительные работы",
    works: [
      { id: 1, name: "Штукатурка", cost: 15, currency: "BYN", unit: "м²" },
      { id: 2, name: "Укладка плитки", cost: 25, currency: "BYN", unit: "м²" },
      { id: 3, name: "Поклейка обоев", cost: 8, currency: "BYN", unit: "м²" },
    ],
  },
  {
    id: 2,
    title: "Электрика",
    slug: "elektrika",
    iconName: "Работа",
    accent: "#a16207",
    description: "Монтаж и ремонт электропроводки, розеток и освещения",
    works: [
      { id: 4, name: "Установка розетки / выключателя", cost: 15, currency: "BYN", unit: "шт" },
      { id: 5, name: "Прокладка кабеля", cost: 5, currency: "BYN", unit: "м.п." },
      { id: 6, name: "Сборка электрощита", cost: 80, currency: "BYN", unit: "шт" },
    ],
  },
  {
    id: 3,
    title: "Сантехника",
    slug: "santehnika",
    iconName: "Работа",
    accent: "#0f766e",
    description: "Установка и ремонт сантехнического оборудования",
    works: [
      { id: 7, name: "Установка смесителя", cost: 30, currency: "BYN", unit: "шт" },
      { id: 8, name: "Установка унитаза", cost: 50, currency: "BYN", unit: "шт" },
      { id: 9, name: "Замена труб", cost: 20, currency: "BYN", unit: "м.п." },
    ],
  },
];

function mapWork(work, index) {
  return {
    id: work.work_id || work.id || index,
    name: work.name_work || work.name || "",
    cost: work.cost,
    currency: work.currency || "BYN",
    unit: work.unit_measurement || work.unit || "",
  };
}

const ICON_BY_NAME = {
  Программист: faLaptopCode,
  Строитель: faHammer,
  Водитель: faTruck,
  Повар: faSpa,
  Уборка: faBroom,
  Обучение: faGraduationCap,
  Работа: faTasks,
  Фото: faCamera,
};

const ICON_BY_SLUG = {
  elektrika: faBolt,
  santehnika: faFaucet,
  stroitelstvo: faHammer,
};

function iconFor(iconName, slug) {
  if (slug && ICON_BY_SLUG[slug]) return ICON_BY_SLUG[slug];
  return ICON_BY_NAME[iconName] || faTasks;
}

function withIcons(categories) {
  return categories.map((category) => ({
    ...category,
    icon: iconFor(category.iconName, category.slug),
  }));
}

export default function ServiceCategories() {
  const [categoriesWorks, setCategoriesWorks] = useState([]);
  const gridRef = useRef(null);
  const navigate = useNavigate();

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
        setCategoriesWorks(withIcons(FALLBACK_CATEGORIES));
        return;
      }

      const formattedData = await Promise.all(
        data.map(async (cat) => {
          const id = cat.category_work_id || cat.id;
          let works = [];
          try {
            const worksResponse = await apiFetch(
              buildApiUrl(`/works_for_category_work/${id}`),
            );
            if (worksResponse.ok) {
              const worksData = await worksResponse.json();
              works = Array.isArray(worksData) ? worksData.map(mapWork) : [];
            }
          } catch {
            works = [];
          }

          return {
            id,
            title: cat.name || "Без названия",
            slug: cat.slug,
            icon: iconFor(cat.icon_name, cat.slug),
            accent: cat.icon_color || "#334155",
            description: cat.description || "Описание услуги",
            works: works.filter((work) => work.name),
          };
        }),
      );

      setCategoriesWorks(formattedData);
    } catch (error) {
      console.error("Ошибка загрузки категорий:", error);
      setCategoriesWorks(withIcons(FALLBACK_CATEGORIES));
    }
  };

  useEffect(() => {
    fetchCategoriesWorks();
  }, []);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;

    let frame = 0;
    const equalize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const cards = [...grid.querySelectorAll(".home-category-card")];
        if (!cards.length) return;
        cards.forEach((card) => {
          card.style.minHeight = "";
          card.style.height = "auto";
        });
        const maxHeight = cards.reduce(
          (max, card) => Math.max(max, card.getBoundingClientRect().height),
          0,
        );
        cards.forEach((card) => {
          card.style.height = "";
          card.style.minHeight = `${Math.ceil(maxHeight)}px`;
        });
      });
    };

    equalize();
    window.addEventListener("resize", equalize);
    document.fonts?.ready?.then(equalize);

    let lastWidth = grid.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = grid.clientWidth;
      if (nextWidth === lastWidth) return;
      lastWidth = nextWidth;
      equalize();
    });
    observer.observe(grid);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", equalize);
      observer.disconnect();
    };
  }, [categoriesWorks]);

  return (
    <section className="home-categories">
      <div className="home-categories__container">
        <header className="home-categories__head">
          <p className="home-categories__kicker">Каталог</p>
          <h2 className="home-categories__title">Специализации</h2>
          <p className="home-categories__subtitle">
            Выберите направление — откроется список исполнителей
          </p>
        </header>
        <div className="home-categories__grid" ref={gridRef}>
          {categoriesWorks.map(
            ({ id, title, slug, icon, accent, description, works }) => {
              const preview = (works || []).slice(0, 3);
              return (
                <div
                  key={id}
                  className="home-category-card-wrap"
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
                  <article
                    className="home-category-card"
                    style={{ "--card-accent": accent || "#334155" }}
                  >
                    <div className="home-category-card__top">
                      <span className="home-category-card__mark" aria-hidden="true">
                        <FontAwesomeIcon icon={icon} />
                      </span>
                    </div>
                    <h3 className="home-category-card__title">{title}</h3>
                    <p className="home-category-card__desc">{description}</p>
                    {preview.length > 0 && (
                      <ul className="home-category-card__works">
                        {preview.map((work) => (
                          <li key={work.id}>
                            <span className="home-category-card__work-name">
                              {work.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <span className="home-category-card__cta">
                      Исполнители
                      <span className="home-category-card__arrow" aria-hidden="true">
                        →
                      </span>
                    </span>
                  </article>
                </div>
              );
            },
          )}
        </div>
      </div>
    </section>
  );
}
