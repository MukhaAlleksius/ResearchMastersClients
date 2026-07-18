import "./filters.css";
// Filters.jsx
export default function Filters({ categories, selectedFilters, setFilters }) {
  // Для простоты без управления состоянием, добавьте нужные пропсы и логику для фильтров
  return (
    <div className="filters-container">
      <h3 className="filters-title">Фильтры</h3>

      <div className="filters-grid">
        {/* Категории */}
        <div>
          <label className="filters-label">Категория</label>
          <select className="filters-select">
            {categories.map((cat) => (
              <option key={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Рейтинг */}
        <div>
          <label className="filters-label">Рейтинг от</label>
          <select className="filters-select">
            <option>Любой</option>
            <option>4.5★ и выше</option>
            <option>4.0★ и выше</option>
            <option>3.5★ и выше</option>
          </select>
        </div>

        {/* Цена */}
        <div>
          <label className="filters-label">Цена до</label>
          <input
            type="number"
            placeholder="Укажите бюджет"
            className="filters-input"
          />
        </div>
      </div>
    </div>
  );
}
