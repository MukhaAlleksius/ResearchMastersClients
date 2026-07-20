import { useState, useEffect, useCallback } from "react";
import { API, apiFetch } from "../../../../../utils/api.js";
import "../portfolio.css";
import "./portfolio_information.css";

function resolveImageUrl(path) {
  if (!path) return null;
  return path.startsWith("http") ? path : `${API.baseURL}${path}`;
}

function PortfolioInformation({ project, onBack, onImagesChanged }) {
  const [activeInnerTab, setActiveInnerTab] = useState("info");

  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description);
  const [images, setImages] = useState(project.images || []);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [modalImage, setModalImage] = useState(null);
  const [selectedForDelete, setSelectedForDelete] = useState(new Set());

  const master_id = localStorage.getItem("user_id");
  const coverUrl = resolveImageUrl(images[0] || project.coverImage);

  const loadProjectImages = useCallback(async () => {
    if (!master_id) {
      setLoadingImages(false);
      return;
    }

    try {
      setLoadingImages(true);
      const response = await apiFetch(
        `${API.baseURL}/project_images_portfolio_master/${master_id}`,
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const projectsArray = data.projects || [];
      const projectData = projectsArray.find((p) => p.title === project.title);

      setImages(projectData?.images || []);
    } catch (error) {
      console.error("Ошибка загрузки изображений:", error);
    } finally {
      setLoadingImages(false);
    }
  }, [master_id, project.title]);

  useEffect(() => {
    loadProjectImages();
  }, [loadProjectImages]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
  };

  const handleSaveImages = async () => {
    if (selectedFiles.length === 0) {
      alert("Нет файлов для сохранения");
      return;
    }

    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    const projectName = project.title;

    try {
      setUploading(true);

      const response = await apiFetch(
        `${API.baseURL}/upload_images_portfolio_master/?master_id=${encodeURIComponent(
          master_id,
        )}&project_name=${encodeURIComponent(projectName)}`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server error:", response.status, errorText);
        alert(`Ошибка сервера: ${response.status}`);
        return;
      }

      const data = await response.json();
      if (data.success) {
        const newImagePaths = data.saved_files.map(
          (file) =>
            `/portfolio/${master_id}/${projectName}/файлы_изображений/${file.saved_name}`,
        );

        setImages((prev) => [...prev, ...newImagePaths]);
        setSelectedFiles([]);
        onImagesChanged?.();
      } else {
        alert("Ошибка сохранения файлов");
      }
    } catch (error) {
      console.error("Fetch error:", error);
      alert("Ошибка при сохранении: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteSelectedOnServer = async () => {
    if (selectedForDelete.size === 0) {
      alert("Нет выбранных для удаления изображений");
      return;
    }

    const projectName = project.title;

    try {
      for (const img of selectedForDelete) {
        const parts = img.split("/");
        const filename = parts[parts.length - 1];

        const url = new URL(`${API.baseURL}/delete_image_portfolio_master/`);
        url.searchParams.append("master_id", master_id);
        url.searchParams.append("project_name", projectName);
        url.searchParams.append("filename", filename);

        const response = await apiFetch(url.toString(), {
          method: "DELETE",
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Ошибка удаления файла ${filename}:`, errorText);
          alert(`Ошибка удаления файла ${filename}: ${response.status}`);
          return;
        }
      }

      setImages((prev) => prev.filter((img) => !selectedForDelete.has(img)));
      setSelectedForDelete(new Set());
      onImagesChanged?.();
      alert("Выбранные фотографии удалены");
    } catch (error) {
      console.error("Ошибка при удалении:", error);
      alert("Ошибка при удалении: " + error.message);
    }
  };

  const handleSave = () => {
    console.log("Сохраняем изменения:", { title, description, images });
  };

  const toggleSelectImage = (img) => {
    setSelectedForDelete((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(img)) {
        newSet.delete(img);
      } else {
        newSet.add(img);
      }
      return newSet;
    });
  };

  const tabs = [
    { id: "info", label: "Информация" },
    { id: "photos", label: "Фотографии", count: images.length },
    { id: "edit", label: "Редактировать" },
  ];

  return (
    <div className="pf-detail">
      <button type="button" onClick={onBack} className="pf-back">
        ← К списку проектов
      </button>

      <div className="pf-detail__hero">
        {coverUrl && (
          <img
            src={coverUrl}
            alt=""
            className="pf-detail__hero-cover"
            aria-hidden="true"
          />
        )}
        <div className="pf-detail__hero-overlay" aria-hidden="true" />
        <div className="pf-detail__hero-content">
          <h2 className="pf-detail__title">{project.title}</h2>
          <div className="pf-detail__meta">
            {project.category_work && (
              <span className="pf-detail__category">{project.category_work}</span>
            )}
            <span className="pf-detail__meta-pill">
              {images.length} {images.length === 1 ? "фото" : "фото"}
            </span>
          </div>
        </div>
      </div>

      <div className="pf-tabs" role="tablist" aria-label="Разделы проекта">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeInnerTab === tab.id}
            className={`pf-tab ${activeInnerTab === tab.id ? "pf-tab--active" : ""}`}
            onClick={() => setActiveInnerTab(tab.id)}
          >
            {tab.label}
            {tab.count != null && (
              <span className="pf-tab__count">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="pf-panel">
        {activeInnerTab === "info" && (
          <div>
            {project.description ? (
              <p className="pf-panel__text">{project.description}</p>
            ) : (
              <p className="pf-panel__empty-note">
                Описание не указано. Добавьте его во вкладке «Редактировать».
              </p>
            )}
            {project.link && (
              <a
                href={project.link}
                target="_blank"
                rel="noopener noreferrer"
                className="pf-panel__link"
              >
                Ссылка на проект →
              </a>
            )}
          </div>
        )}

        {activeInnerTab === "photos" && (
          <div>
            <div className="pf-gallery-toolbar">
              <p className="pf-gallery-toolbar__hint">
                Нажмите на фото для просмотра. Отметьте галочкой, чтобы удалить.
              </p>
              {selectedForDelete.size > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteSelectedOnServer}
                  className="pf-btn-danger"
                >
                  Удалить выбранные ({selectedForDelete.size})
                </button>
              )}
            </div>

            <div className="pf-gallery">
              {loadingImages ? (
                <div className="pf-gallery-loading">
                  <span className="pf-gallery-loading__spinner" aria-hidden="true" />
                  Загрузка фотографий…
                </div>
              ) : images.length > 0 ? (
                images.map((img, idx) => (
                  <div
                    key={img}
                    className={`pf-gallery__item ${
                      selectedForDelete.has(img)
                        ? "pf-gallery__item--selected"
                        : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="pf-gallery__check"
                      checked={selectedForDelete.has(img)}
                      onChange={() => toggleSelectImage(img)}
                      aria-label={`Выбрать фото ${idx + 1}`}
                    />
                    <img
                      src={resolveImageUrl(img)}
                      alt={`${project.title} фото ${idx + 1}`}
                      className="pf-gallery__img"
                      onClick={() => setModalImage(img)}
                    />
                    <span className="pf-gallery__zoom" aria-hidden="true">
                      Увеличить
                    </span>
                  </div>
                ))
              ) : (
                <div className="pf-gallery-empty">
                  <span className="pf-gallery-empty__icon" aria-hidden="true">
                    ◫
                  </span>
                  <p>Фотографии ещё не загружены</p>
                  <p>Добавьте их в блоке ниже</p>
                </div>
              )}
            </div>

            <div className="pf-upload">
              <p className="pf-upload__title">Загрузить фотографии</p>
              <p className="pf-upload__hint">
                JPG, PNG или WEBP — можно выбрать несколько файлов сразу
              </p>

              <div className="pf-upload__drop">
                <span className="pf-upload__drop-icon" aria-hidden="true">
                  ↑
                </span>
                <p className="pf-upload__drop-text">
                  Выберите файлы с устройства
                </p>
                <div className="pf-upload__actions">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="pf-upload__input"
                  />
                  {selectedFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSaveImages}
                      className="pf-btn-save"
                      disabled={uploading}
                    >
                      {uploading
                        ? "Загрузка…"
                        : `Сохранить (${selectedFiles.length})`}
                    </button>
                  )}
                </div>
              </div>

              {selectedFiles.length > 0 && (
                <div className="pf-upload-preview">
                  {selectedFiles.map((file) => (
                    <img
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="pf-upload-preview__item"
                    />
                  ))}
                </div>
              )}
            </div>

            {modalImage && (
              <div
                className="pf-lightbox"
                onClick={() => setModalImage(null)}
                role="presentation"
              >
                <button
                  type="button"
                  className="pf-lightbox__close"
                  onClick={() => setModalImage(null)}
                  aria-label="Закрыть"
                >
                  ×
                </button>
                <img
                  src={resolveImageUrl(modalImage)}
                  alt="Фото проекта"
                  className="pf-lightbox__img"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>
        )}

        {activeInnerTab === "edit" && (
          <form
            className="pf-edit-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <label className="pf-label" htmlFor="pf-edit-title">
              Заголовок
            </label>
            <input
              id="pf-edit-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="pf-input"
            />

            <label className="pf-label" htmlFor="pf-edit-description">
              Описание
            </label>
            <textarea
              id="pf-edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="pf-textarea"
            />

            <button type="submit" className="pf-btn-primary">
              Сохранить
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default PortfolioInformation;
