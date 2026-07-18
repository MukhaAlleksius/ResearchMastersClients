import { useEffect, useState } from "react";
import {
  apiFetch,
  buildApiUrl,
  resolveMediaUrl,
} from "../../../../utils/api.js";
import "./portfolio.css";

function getUserId() {
  return localStorage.getItem("user_id");
}

export default function Portfolio() {
  const userId = getUserId();
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [uploadProject, setUploadProject] = useState("");
  const [modalImage, setModalImage] = useState(null);

  const loadPortfolio = async () => {
    if (!userId) {
      setError("Войдите в аккаунт, чтобы управлять портфолио");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [portfolioResponse, imagesResponse, categoriesResponse] =
        await Promise.all([
          apiFetch(buildApiUrl(`/projects_portfolio_master/${userId}`)),
          apiFetch(buildApiUrl(`/project_images_portfolio_master/${userId}`)),
          apiFetch(buildApiUrl(`/categories_works_master/${userId}`)),
        ]);

      if (!portfolioResponse.ok) {
        throw new Error("Не удалось загрузить портфолио");
      }

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

      const nextProjects = (
        Array.isArray(portfolioStructure) ? portfolioStructure : []
      ).map((project) => ({
        ...project,
        description: project.description || "",
        images: imageMap.get(project.title) || [],
      }));

      setProjects(nextProjects);
      if (nextProjects.length > 0 && !uploadProject) {
        setUploadProject(nextProjects[0].title);
      }

      if (categoriesResponse.ok) {
        const cats = await categoriesResponse.json();
        setCategories(Array.isArray(cats) ? cats : []);
        if (Array.isArray(cats) && cats.length > 0) {
          setCategoryId(String(cats[0].id ?? cats[0].category_id ?? ""));
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Ошибка загрузки портфолио");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortfolio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddProject = async (event) => {
    event.preventDefault();
    if (!userId || !title.trim() || !categoryId) return;

    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(
        buildApiUrl("/add_project_portfolio_master"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: Number(userId),
            title: title.trim(),
            description: description.trim() || null,
            category_id: Number(categoryId),
          }),
        },
      );

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Не удалось добавить проект");
      }

      setTitle("");
      setDescription("");
      setUploadProject(title.trim());
      await loadPortfolio();
    } catch (err) {
      setError(err.message || "Ошибка сохранения проекта");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadImages = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || !uploadProject) return;

    setSaving(true);
    setError("");
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const response = await apiFetch(
        buildApiUrl(
          `/upload_images_portfolio_master/?project_name=${encodeURIComponent(uploadProject)}`,
        ),
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Не удалось загрузить изображения");
      }

      await loadPortfolio();
    } catch (err) {
      setError(err.message || "Ошибка загрузки изображений");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteImage = async (projectName, imagePath) => {
    const filename = String(imagePath).split("/").pop();
    if (!filename || !projectName) return;

    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(
        buildApiUrl(
          `/delete_image_portfolio_master/?project_name=${encodeURIComponent(projectName)}&filename=${encodeURIComponent(filename)}`,
        ),
        { method: "DELETE" },
      );

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Не удалось удалить изображение");
      }

      await loadPortfolio();
    } catch (err) {
      setError(err.message || "Ошибка удаления изображения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pf-page">
      <header className="pf-header">
        <h1 className="pf-title">Портфолио</h1>
        <p className="pf-subtitle">
          Добавляйте проекты и фотографии работ для профиля исполнителя
        </p>
      </header>

      {error ? <div className="pf-alert">{error}</div> : null}

      <section className="pf-card">
        <h2 className="pf-card__title">Новый проект</h2>
        <form className="pf-form" onSubmit={handleAddProject}>
          <label className="pf-field">
            <span>Название</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              minLength={3}
              maxLength={100}
              required
              placeholder="Например: Ремонт квартиры"
            />
          </label>
          <label className="pf-field">
            <span>Описание</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Кратко опишите работу"
            />
          </label>
          <label className="pf-field">
            <span>Категория</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              {categories.length === 0 ? (
                <option value="">Сначала добавьте специализацию</option>
              ) : (
                categories.map((cat) => {
                  const id = cat.id ?? cat.category_id;
                  const name =
                    cat.name ||
                    cat.name_category ||
                    cat.category_work ||
                    `Категория ${id}`;
                  return (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  );
                })
              )}
            </select>
          </label>
          <button
            type="submit"
            className="pf-btn"
            disabled={saving || !categoryId}
          >
            {saving ? "Сохранение..." : "Добавить проект"}
          </button>
        </form>
      </section>

      <section className="pf-card">
        <h2 className="pf-card__title">Фото к проекту</h2>
        <div className="pf-upload-row">
          <select
            value={uploadProject}
            onChange={(e) => setUploadProject(e.target.value)}
            disabled={projects.length === 0}
          >
            {projects.length === 0 ? (
              <option value="">Нет проектов</option>
            ) : (
              projects.map((project) => (
                <option key={project.portfolio_item_id || project.title} value={project.title}>
                  {project.title}
                </option>
              ))
            )}
          </select>
          <label className="pf-btn pf-btn--secondary">
            Загрузить фото
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={!uploadProject || saving}
              onChange={handleUploadImages}
            />
          </label>
        </div>
      </section>

      <section className="pf-card">
        <h2 className="pf-card__title">Мои проекты</h2>
        {loading ? (
          <p className="pf-empty">Загрузка...</p>
        ) : projects.length === 0 ? (
          <p className="pf-empty">Пока нет проектов в портфолио</p>
        ) : (
          <div className="pf-list">
            {projects.map((project) => (
              <article
                key={project.portfolio_item_id || project.title}
                className="pf-item"
              >
                <h3>{project.title}</h3>
                {project.description ? <p>{project.description}</p> : null}
                {project.images?.length ? (
                  <div className="pf-gallery">
                    {project.images.map((image, index) => {
                      const src = resolveMediaUrl(image);
                      return (
                        <div key={`${project.title}-${index}`} className="pf-thumb">
                          <button
                            type="button"
                            onClick={() => setModalImage(src)}
                          >
                            <img src={src} alt={`${project.title} ${index + 1}`} />
                          </button>
                          <button
                            type="button"
                            className="pf-thumb__delete"
                            onClick={() =>
                              handleDeleteImage(project.title, image)
                            }
                          >
                            Удалить
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="pf-empty">Нет изображений</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {modalImage ? (
        <div
          className="pf-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setModalImage(null)}
        >
          <img src={modalImage} alt="Просмотр" />
        </div>
      ) : null}
    </div>
  );
}
