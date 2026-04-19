import { useState } from "react";

export type LeakHistoryItem = {
  id: string;
  locationName: string;
  methaneLevel: number;
  confidenceScore: number;
  severity: "low" | "medium" | "high";
  detectedAt: string;
};

type HistoryPanelProps = {
  items: LeakHistoryItem[];
};

const severityColors: Record<LeakHistoryItem["severity"], string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
};

export default function HistoryPanel({ items }: HistoryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="glass-panel history-panel" style={{ cursor: "pointer" }}>
      <header 
        className="panel-title" 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
          marginBottom: isExpanded ? "8px" : "0"
        }}
      >
        <span>Leak History ({items.length})</span>
        <span style={{ fontSize: "10px", color: "#64748b" }}>
          {isExpanded ? "Collapse ▲" : "Click to View ▼"}
        </span>
      </header>

      {isExpanded && (
        <div className="history-table-wrap" style={{ animation: "fadeIn 0.2s ease-out" }}>
        <table className="history-table">
          <thead>
            <tr>
              <th>Location</th>
              <th>Methane</th>
              <th>Confidence</th>
              <th>Severity</th>
              <th>Detected</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="history-empty">
                  No leak logs yet.
                </td>
              </tr>
            )}

            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.locationName}</td>
                <td>{item.methaneLevel.toFixed(2)}</td>
                <td>{item.confidenceScore.toFixed(1)}%</td>
                <td>
                  <span
                    className="severity-pill"
                    style={{
                      borderColor: severityColors[item.severity],
                      color: severityColors[item.severity],
                    }}
                  >
                    {item.severity}
                  </span>
                </td>
                <td>{new Date(item.detectedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  );
}
