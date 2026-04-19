type ModelHealthProps = {
  score: number;
};

function healthColor(score: number): string {
  if (score < 0.3) return "#ef4444";
  if (score < 0.6) return "#f59e0b";
  return "#22c55e";
}

export default function ModelHealth({ score }: ModelHealthProps) {
  const normalized = Math.max(0, Math.min(1, score));
  const color = healthColor(normalized);

  return (
    <section className="glass-panel model-health-panel">
      <header className="panel-title">Model Health</header>
      <div className="health-value" style={{ color }}>
        {normalized.toFixed(3)}
      </div>

      <div className="health-bar-track">
        <div
          className="health-bar-fill"
          style={{ width: `${normalized * 100}%`, background: color }}
        />
      </div>

      <div className="health-scale-row">
        <span>0.0</span>
        <span>Silhouette Score</span>
        <span>1.0</span>
      </div>
    </section>
  );
}
