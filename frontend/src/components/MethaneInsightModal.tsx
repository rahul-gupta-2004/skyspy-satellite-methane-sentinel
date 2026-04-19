import Plot from "react-plotly.js";
import type { Data, Layout } from "plotly.js";

type MethanePoint = {
  methane: number;
  is_anomaly: number;
};

type MethaneInsightModalProps = {
  isOpen: boolean;
  onClose: () => void;
  methaneSeries: MethanePoint[];
  confidenceScore: number;
  baselineValue: number;
  currentValue: number;
};

function MethaneInsightModal({
  isOpen,
  onClose,
  methaneSeries,
  confidenceScore,
  baselineValue,
  currentValue,
}: MethaneInsightModalProps) {
  if (!isOpen) {
    return null;
  }

  const xAxis = methaneSeries.map((_, index) => index + 1);
  const methaneValues = methaneSeries.map((point) => point.methane);
  const anomalyIndices = methaneSeries
    .map((point, index) => (point.is_anomaly === -1 ? index : -1))
    .filter((index) => index >= 0);
  const anomalyX = anomalyIndices.map((index) => index + 1);
  const anomalyY = anomalyIndices.map((index) => methaneSeries[index].methane);

  const seriesTrace: Data = {
    x: xAxis,
    y: methaneValues,
    type: "scatter",
    mode: "lines+markers",
    name: "Methane",
    line: { color: "#7dd3fc", width: 2 },
    marker: { color: "#7dd3fc", size: 5 },
  };

  const anomalyTrace: Data = {
    x: anomalyX,
    y: anomalyY,
    type: "scatter",
    mode: "markers",
    name: "Anomaly Spike",
    marker: {
      color: "#ef4444",
      size: 11,
      line: { color: "#fca5a5", width: 1 },
      symbol: "diamond",
    },
  };

  const baselineTrace: Data = {
    x: xAxis,
    y: xAxis.map(() => baselineValue),
    type: "scatter",
    mode: "lines",
    name: "Baseline",
    line: { color: "#22c55e", width: 2, dash: "dash" },
  };

  const currentTrace: Data = {
    x: [xAxis[xAxis.length - 1] ?? 1],
    y: [currentValue],
    type: "scatter",
    mode: "markers",
    name: "Current",
    marker: {
      color: "#f59e0b",
      size: 12,
      symbol: "circle",
      line: { color: "#fde68a", width: 1 },
    },
  };

  const layout: Partial<Layout> = {
    title: {
      text: "Methane Trend Over Time",
      font: { color: "#e5e7eb", size: 18 },
    },
    paper_bgcolor: "#0b1220",
    plot_bgcolor: "#0f172a",
    font: {
      color: "#cbd5e1",
      family: "Consolas, 'Courier New', monospace",
      size: 12,
    },
    margin: { l: 54, r: 24, t: 48, b: 48 },
    xaxis: {
      title: { text: "Time Index", font: { color: "#94a3b8" } },
      gridcolor: "rgba(148, 163, 184, 0.14)",
      zerolinecolor: "rgba(148, 163, 184, 0.2)",
    },
    yaxis: {
      title: { text: "Methane (ppb)", font: { color: "#94a3b8" } },
      gridcolor: "rgba(148, 163, 184, 0.14)",
      zerolinecolor: "rgba(148, 163, 184, 0.2)",
    },
    legend: {
      orientation: "h",
      y: -0.25,
      x: 0,
      font: { color: "#9ca3af" },
    },
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2, 6, 23, 0.78)",
        backdropFilter: "blur(3px)",
        zIndex: 2500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(980px, 96vw)",
          maxHeight: "92vh",
          overflow: "auto",
          background: "linear-gradient(180deg, #0b1220 0%, #111827 100%)",
          border: "1px solid rgba(148, 163, 184, 0.25)",
          borderRadius: 14,
          boxShadow: "0 20px 55px rgba(0, 0, 0, 0.45)",
          padding: 16,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
            gap: 10,
          }}
        >
          <div style={{ color: "#e2e8f0", fontSize: 17, fontWeight: 700 }}>
            Methane Detection Details
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#1f2937",
              color: "#e5e7eb",
              border: "1px solid #374151",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Baseline</div>
            <div style={{ color: "#22c55e", fontSize: 21, fontWeight: 700 }}>
              {baselineValue.toFixed(2)}
            </div>
          </div>

          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Current Value</div>
            <div style={{ color: "#f59e0b", fontSize: 21, fontWeight: 700 }}>
              {currentValue.toFixed(2)}
            </div>
          </div>

          <div style={{ background: "#1f1324", border: "1px solid #4c1d95", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#c4b5fd", fontSize: 12 }}>Confidence Score</div>
            <div style={{ color: "#f5d0fe", fontSize: 26, fontWeight: 800 }}>
              {confidenceScore.toFixed(1)}%
            </div>
          </div>
        </div>

        <Plot
          data={[seriesTrace, baselineTrace, currentTrace, anomalyTrace]}
          layout={layout}
          config={{ displaylogo: false, responsive: true, scrollZoom: true }}
          style={{ width: "100%", height: "480px" }}
          useResizeHandler
        />
      </div>
    </div>
  );
}

export default MethaneInsightModal;
