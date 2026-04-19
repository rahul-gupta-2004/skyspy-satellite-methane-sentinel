import { useEffect, useRef } from "react";

type ConsolePanelProps = {
  logs: string[];
};

export default function ConsolePanel({ logs }: ConsolePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [logs]);

  return (
    <section className="glass-panel console-panel">
      <header className="panel-title">Realtime Console</header>
      <div ref={containerRef} className="console-log-list">
        {logs.length === 0 ? (
          <div className="console-placeholder">Waiting for system events...</div>
        ) : (
          logs.map((log, index) => (
            <div key={`${log}-${index}`} className="console-log-item">
              <span className="console-index">[{String(index + 1).padStart(2, "0")}]</span> {log}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
