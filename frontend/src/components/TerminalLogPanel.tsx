import { useEffect, useMemo, useRef, useState } from "react";

type TerminalLogPanelProps = {
  logs?: string[];
  intervalMs?: number;
  title?: string;
};

const defaultLogs = [
  "Connecting to Sentinel-5P...",
  "Retrieving atmospheric data...",
  "Running anomaly detection...",
  "Leak detected at [lat, lon]",
];

function TerminalLogPanel({
  logs,
  intervalMs = 1200,
  title = "Sentinel Live Logs",
}: TerminalLogPanelProps) {
  const sourceLogs = useMemo(() => (logs && logs.length > 0 ? logs : defaultLogs), [logs]);
  const [visibleLogs, setVisibleLogs] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleLogs([]);

    if (sourceLogs.length === 0) {
      return;
    }

    let index = 0;
    const id = window.setInterval(() => {
      setVisibleLogs((previous) => {
        if (index >= sourceLogs.length) {
          window.clearInterval(id);
          return previous;
        }

        const next = [...previous, sourceLogs[index]];
        index += 1;
        return next;
      });
    }, Math.max(200, intervalMs));

    return () => window.clearInterval(id);
  }, [sourceLogs, intervalMs]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [visibleLogs]);

  return (
    <section
      style={{
        background: "#05070d",
        border: "1px solid #1c2330",
        borderRadius: 12,
        color: "#8ff7a7",
        padding: 14,
        width: "100%",
        maxWidth: 720,
        boxSizing: "border-box",
        boxShadow: "0 14px 35px rgba(0, 0, 0, 0.35)",
      }}
      aria-label="Terminal log panel"
    >
      <header
        style={{
          color: "#b8c2d1",
          fontFamily: "Consolas, 'Courier New', monospace",
          fontSize: 13,
          marginBottom: 10,
        }}
      >
        {title}
      </header>

      <div
        ref={containerRef}
        style={{
          maxHeight: 260,
          overflowY: "auto",
          fontFamily: "Consolas, 'Courier New', monospace",
          fontSize: 14,
          lineHeight: 1.55,
          paddingRight: 8,
          scrollbarColor: "#2f3d54 #0a111c",
        }}
      >
        {visibleLogs.map((entry, index) => (
          <div key={`${entry}-${index}`} style={{ marginBottom: 4, whiteSpace: "pre-wrap" }}>
            <span style={{ color: "#f7d354" }}>[{String(index + 1).padStart(2, "0")}]</span> {entry}
          </div>
        ))}

        {visibleLogs.length < sourceLogs.length && (
          <div style={{ color: "#6ca8ff", marginTop: 4 }}>...</div>
        )}
      </div>
    </section>
  );
}

export default TerminalLogPanel;
