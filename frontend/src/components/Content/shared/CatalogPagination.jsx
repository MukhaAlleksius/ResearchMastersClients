import { useLocation, useNavigate } from "react-router-dom";
import {
  getCatalogPageFromSearch,
  getVisiblePageNumbers,
} from "../../../utils/pagination";

export default function CatalogPagination({ totalPages = 0 }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = getCatalogPageFromSearch(location.search);
  const visiblePages = getVisiblePageNumbers(currentPage, totalPages);

  if (totalPages <= 1) {
    return null;
  }

  const handlePageChange = (page) => {
    const params = new URLSearchParams(location.search);
    params.set("page", String(page));
    navigate(`?${params.toString()}`, { replace: true });
  };

  return (
    <div className="pagination-wrapper">
      <div className="pagination-buttons">
        <button
          type="button"
          className={`pagination-button ${currentPage === 1 ? "disabled" : ""}`}
          onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Предыдущая страница"
        >
          ←
        </button>

        {visiblePages.map((page) => (
          <button
            key={page}
            type="button"
            className={`pagination-button ${currentPage === page ? "active" : ""}`}
            onClick={() => handlePageChange(page)}
            aria-current={currentPage === page ? "page" : undefined}
          >
            {page}
          </button>
        ))}

        <button
          type="button"
          className={`pagination-button ${
            currentPage >= totalPages ? "disabled" : ""
          }`}
          onClick={() =>
            currentPage < totalPages && handlePageChange(currentPage + 1)
          }
          disabled={currentPage >= totalPages}
          aria-label="Следующая страница"
        >
          →
        </button>
      </div>
    </div>
  );
}
