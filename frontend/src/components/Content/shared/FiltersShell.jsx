import React, { useState, useRef, useEffect } from "react";

export default function FiltersShell({ children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={rootRef}
      className={`filters-bar ${isOpen ? "filters-bar--open" : ""}`}
    >
      <button
        type="button"
        className="filters-bar__trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="filters-bar-popover"
        aria-label={isOpen ? "Скрыть фильтры" : "Показать фильтры"}
        title="Фильтры"
      >
        <i className="fas fa-filter" aria-hidden="true" />
        <span className="filters-bar__label">Фильтры</span>
      </button>

      {isOpen && (
        <div
          id="filters-bar-popover"
          className="filters-bar__popover"
          role="region"
          aria-label="Фильтры"
        >
          {children}
        </div>
      )}
    </div>
  );
}
