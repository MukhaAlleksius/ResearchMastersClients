// ExecutorsGrid.jsx
import "./executors_grid.css"
import ExecutorCard from "../ExecutorCard/ExecutorCard.jsx"

export default function ExecutorsGrid({ executors, onSelectExecutor }) {
  return (
    <div className="executors-grid">
      {executors.map((executor) => (
        <ExecutorCard
          key={executor.id}
          executor={executor}
          onSelect={onSelectExecutor}
        />
      ))}
    </div>
  );
}
