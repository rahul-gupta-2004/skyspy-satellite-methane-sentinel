import { useEffect, useRef, useState } from "react";

type ConsolePanelProps = {
  logs: string[];
};

const streamingTemplateLogs = [
  "Scanning region...",
  "Fetching Sentinel-5P data...",
  "Analyzing CH4 levels...",
  "Anomaly detected at coordinates",
];

export default function ConsolePanel({ logs }: ConsolePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleLogs, setVisibleLogs] = useState<string[]>([]);
  const queueRef = useRef<string[]>([]);
  const lastSeenLogCountRef = useRef(0);

  useEffect(() => {
    if (logs.length <= lastSeenLogCountRef.current) {
      return;
    }

    const newLogs = logs.slice(lastSeenLogCountRef.current);
    queueRef.current.push(...newLogs);
    lastSeenLogCountRef.current = logs.length;
  }, [logs]);

  useEffect(() => {
    let index = 0;
    const templateTickerId = window.setInterval(() => {
      queueRef.current.push(streamingTemplateLogs[index]);
      index = (index + 1) % streamingTemplateLogs.length;
    }, 10000);

    return () => {
      window.clearInterval(templateTickerId);
    };
  }, []);

  useEffect(() => {
    const streamId = window.setInterval(() => {
      const nextLog = queueRef.current.shift();
      if (!nextLog) return;

      setVisibleLogs((prev) => [...prev, nextLog].slice(-50));
    }, 500);

    return () => {
      window.clearInterval(streamId);
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [visibleLogs]);

  return (
    <section className="glass-panel console-panel">
      <header className="panel-title">Realtime Console</header>
      <div ref={containerRef} className="console-log-list">
        {visibleLogs.length === 0 ? (
          <div className="console-placeholder">Waiting for system events...</div>
        ) : (
          visibleLogs.map((log, index) => (
            <div key={`${log}-${index}`} className="console-log-item">
              <span className="console-index">[{String(index + 1).padStart(2, "0")}]</span> {log}
            </div>
          ))
        )}
        <div className="console-cursor">█</div>
      </div>
    </section>
  );
}
