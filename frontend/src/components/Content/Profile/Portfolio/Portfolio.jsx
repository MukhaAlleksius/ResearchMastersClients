import React, { useCallback, useEffect, useMemo, useState } from "react";
import CreatableSelect from "react-select/creatable";
import { API, apiFetch } from "../../../../utils/api.js";
import PortfolioInformation from "./PorfolioInformation/PortfolioInformation";
import "./portfolio.css";

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: "44px",
    borderRadius: "10px",
    border: state.isFocused ? "1px solid #6366f1" : "1px solid #cbd5e1",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(99, 102, 241, 0.14)" : "none",
    fontSize: "0.875rem",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  }),
  menu: (base) => ({
    ...base,
    borderRadius: "10px",
    overflow: "hidden",
    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.12)",
    zIndex: 20,
  }),
  option: (base, state) => ({
    ...base,
    fontSize: "0.875rem",
    backgroundColor: state.isSelected
      ? "#6366f1"
      : state.isFocused
        ? "#eef2ff"
        : "#ffffff",
    color: state.isSelected ? "#ffffff" : "#334155",
    cursor: "pointer",
  }),
  placeholder: (base) => ({
    ...base,
    color: "#94a3b8",
  }),
};

function resolveImageUrl(path) {
  if (!path) return null;
  return path.startsWith("http") ? path : `${API.baseURL}${path}`;
}

function enrichProjectsWithImages(projects, imageProjects) {
  const imageMap = new Map(
    (imageProjects || []).map((item) => [item.title, item.images || []]),
  );

  return projects.map((project) => {
    const images = imageMap.get(project.title) || [];
    return {
      ...project,
      images,
      coverImage: images[0] || null,
      imageCount: images.length,
    };
  });
}

function getCategoryInitial(category) {
  const label = (category || "П").trim();
  return label.charAt(0).toUpperCase();
}

function AddPortfolioModal({ visible, onClose, children }) {
  if (!visible) return null;

  return (
    <div className="pf-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="pf-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pf-add-modal-title"
      >
        <header className="pf-modal__header">
          <div>
            <span className="pf-modal__badge">Новый проект</span>
            <h3 id="pf-add-modal-title" className="pf-modal__title">
              Добавить в портфолио
            </h3>
            <p className="pf-modal__subtitle">
              Расскажите о выполненной работе — заказчики увидят её в вашем
              профиле
            </p>
          </div>
          <button
            type="button"
            className="pf-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function PortfolioSkeleton() {
  return (
    <div className="pf-skeleton-grid" aria-hidden="true">
      {[0, 1, 2].map((key) => (
        <div key={key} className="pf-skeleton-card">
          <div className="pf-skeleton-card__media" />
          <div className="pf-skeleton-card__body">
            <div className="pf-skeleton-line pf-skeleton-line--short" />
            <div className="pf-skeleton-line pf-skeleton-line--title" />
            <div className="pf-skeleton-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Portfolio() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const [categoriesWorksMaster, setCategoriesWorksMaster] = useState([]);
  const [categoryWorkMaster, setCategoryWorkMaster] = useState(null);

  const categoriesWorksMasterOptions = categoriesWorksMaster.map((cat) => ({
    value: cat.category_work_id,
    label: cat.name,
    key: cat.category_work_id,
  }));

  const [newProject, setNewProject] = useState({
    title: "",
    description: "",
  });

  const totalPhotos = useMemo(
    () => projects.reduce((sum, project) => sum + (project.imageCount || 0), 0),
    [projects],
  );

  const fetchPortfolioMaster = useCallback(async () => {
    const userId = localStorage.getItem("user_id");
    if (!userId) {
      setProjects([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [projectsResponse, imagesResponse] = await Promise.all([
        apiFetch(`${API.baseURL}/projects_portfolio_master/${userId}`),
        apiFetch(`${API.baseURL}/project_images_portfolio_master/${userId}`),
      ]);

      if (!projectsResponse.ok) {
        throw new Error("Не получили данных с сервера");
      }

      const projectsData = await projectsResponse.json();
      const imagesData = imagesResponse.ok
        ? await imagesResponse.json()
        : { projects: [] };

      setProjects(
        enrichProjectsWithImages(
          Array.isArray(projectsData) ? projectsData : [],
          imagesData.projects,
        ),
      );
    } catch (error) {
      console.log("Ошибка: ", error);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCategoriesWorksMaster = useCallback(async () => {
    try {
      const masterId = localStorage.getItem("user_id");
      const response = await apiFetch(
        `${API.baseURL}/categories_works_master/${masterId}`,
      );
      if (!response.ok) throw new Error("Не получили данных с сервера");
      const data = await response.json();
      setCategoriesWorksMaster(data);
    } catch (error) {
      console.log("Ошибка: ", error);
      setCategoriesWorksMaster([]);
    }
  }, []);

  useEffect(() => {
    fetchPortfolioMaster();
    fetchCategoriesWorksMaster();
  }, [fetchPortfolioMaster, fetchCategoriesWorksMaster]);

  const handleSelectCategoryWorkMaster = (selectedCategoryWork) => {
    setCategoryWorkMaster(selectedCategoryWork);
  };

  const handleNewProjectChange = (e) => {
    const { name, value } = e.target;
    setNewProject((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddProjectSubmit = async (e) => {
    e.preventDefault();

    if (!newProject.title.trim()) {
      alert("Введите название проекта");
      return;
    }

    if (!categoryWorkMaster?.value) {
      alert("Выберите категорию работ");
      return;
    }

    const masterId = +localStorage.getItem("user_id");

    const response = await apiFetch(
      `${API.baseURL}/add_project_portfolio_master`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: masterId,
          title: newProject.title.trim(),
          description: newProject.description.trim(),
          category_id: categoryWorkMaster.value,
        }),
      },
    );

    if (!response.ok) {
      alert("Ошибка при добавлении проекта");
      return;
    }

    await fetchPortfolioMaster();
    setNewProject({ title: "", description: "" });
    setCategoryWorkMaster(null);
    setAddModalVisible(false);
  };

  const closeModal = () => {
    setAddModalVisible(false);
    setCategoryWorkMaster(null);
    setNewProject({ title: "", description: "" });
  };

  if (selectedProject) {
    return (
      <PortfolioInformation
        project={selectedProject}
        onBack={() => setSelectedProject(null)}
        onImagesChanged={fetchPortfolioMaster}
      />
    );
  }

  return (
    <div className="pf-page">
      <header className="pf-header">
        <div className="pf-header__text">
          <h1 className="pf-header__title">Портфолио</h1>
          <p className="pf-header__subtitle">
            {!loading && projects.length > 0
              ? `${projects.length} ${
                  projects.length === 1 ? "проект" : "проектов"
                } · ${totalPhotos} фото — покажите лучшие работы заказчикам`
              : "Покажите лучшие работы с фотографиями и описанием"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddModalVisible(true)}
          className="pf-btn-add"
        >
          <span className="pf-btn-add__icon" aria-hidden="true">
            +
          </span>
          Добавить
        </button>
      </header>

      <div className="pf-grid">
        {loading ? (
          <PortfolioSkeleton />
        ) : projects.length === 0 ? (
          <div className="pf-empty">
            <span className="pf-empty__visual" aria-hidden="true">
              +
            </span>
            <p className="pf-empty__title">Портфолио пока пустое</p>
            <p className="pf-empty__text">
              Создайте первый проект и загрузите фотографии выполненных работ —
              они появятся в вашем профиле для заказчиков
            </p>
            <button
              type="button"
              onClick={() => setAddModalVisible(true)}
              className="pf-btn-add"
            >
              <span className="pf-btn-add__icon" aria-hidden="true">
                +
              </span>
              Добавить проект
            </button>
          </div>
        ) : (
          projects.map((project) => {
            const coverUrl = resolveImageUrl(project.coverImage);

            return (
              <article
                key={project.id ?? `${project.title}-${project.category_work}`}
                className="pf-card"
                onClick={() => setSelectedProject(project)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedProject(project);
                  }
                }}
              >
                <div className="pf-card__media">
                  {coverUrl ? (
                    <>
                      <img
                        src={coverUrl}
                        alt=""
                        className="pf-card__cover"
                        loading="lazy"
                      />
                      <div className="pf-card__media-overlay" aria-hidden="true" />
                    </>
                  ) : (
                    <div className="pf-card__media-placeholder">
                      <span className="pf-card__media-placeholder-icon">
                        {getCategoryInitial(project.category_work)}
                      </span>
                      <span className="pf-card__media-placeholder-text">
                        Нет фото
                      </span>
                    </div>
                  )}
                  {project.imageCount > 0 && (
                    <span className="pf-card__photo-badge">
                      {project.imageCount} фото
                    </span>
                  )}
                </div>

                <div className="pf-card__body">
                  <span className="pf-card__category">
                    {project.category_work || "Без категории"}
                  </span>
                  <h3 className="pf-card__title">
                    {project.title || project.category_work || "Проект"}
                  </h3>
                  <p className="pf-card__desc">
                    {project.description || "Добавьте описание проекта"}
                  </p>
                  <span className="pf-card__footer">
                    Открыть проект
                    <span className="pf-card__footer-arrow" aria-hidden="true">
                      →
                    </span>
                  </span>
                </div>
              </article>
            );
          })
        )}
      </div>

      <AddPortfolioModal visible={addModalVisible} onClose={closeModal}>
        <form onSubmit={handleAddProjectSubmit}>
          <div className="pf-form pf-modal__body">
            <div className="pf-field">
              <label className="pf-label" htmlFor="pf-category">
                Категория работ <span>*</span>
              </label>
              <CreatableSelect
                inputId="pf-category"
                options={categoriesWorksMasterOptions}
                value={categoryWorkMaster}
                onChange={handleSelectCategoryWorkMaster}
                isClearable
                placeholder="Выберите категорию"
                styles={selectStyles}
              />
              <p className="pf-hint">
                Укажите направление, к которому относится проект
              </p>
            </div>

            <div className="pf-field">
              <label className="pf-label" htmlFor="pf-title">
                Название работы <span>*</span>
              </label>
              <input
                id="pf-title"
                type="text"
                name="title"
                placeholder="Например: Ремонт ванной комнаты"
                value={newProject.title}
                onChange={handleNewProjectChange}
                className="pf-input"
                required
              />
            </div>

            <div className="pf-field">
              <label className="pf-label" htmlFor="pf-description">
                Описание
              </label>
              <textarea
                id="pf-description"
                name="description"
                placeholder="Кратко опишите объём работ, сроки и особенности проекта"
                value={newProject.description}
                onChange={handleNewProjectChange}
                rows={4}
                className="pf-textarea"
              />
            </div>
          </div>

          <footer className="pf-modal__footer">
            <button
              type="button"
              className="pf-btn-secondary"
              onClick={closeModal}
            >
              Отмена
            </button>
            <button type="submit" className="pf-btn-primary">
              Добавить проект
            </button>
          </footer>
        </form>
      </AddPortfolioModal>
    </div>
  );
}
