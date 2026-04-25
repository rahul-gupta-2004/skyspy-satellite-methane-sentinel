import type { LeakHistoryItem } from "./HistoryPanel";
import type { LocationRecord } from "./MapView";

type LocationsPanelProps = {
  locations: LocationRecord[];
  historyItems: LeakHistoryItem[];
  onDeleteLocation: (id: string) => void;
  onUpdateLocation?: (id: string, name: string) => void;
};

export default function LocationsPanel({
  locations,
  historyItems,
  onDeleteLocation,
}: LocationsPanelProps) {
  const getLatestLeak = (locationName: string) => {
    return historyItems.find(item => item.locationName === locationName);
  };

  return (
    <section className="glass-panel locations-panel" style={{ minHeight: "150px", width: "100%", overflow: "hidden" }}>
      <header className="panel-title">Monitoring Nodes ({locations.length})</header>

      <div
        className="locations-slider"
        style={{
          display: "flex",
          gap: "12px",
          overflowX: "auto",
          padding: "4px 4px 12px",
          width: "100%",
          minWidth: 0,
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {locations.length === 0 && (
          <div style={{ color: "#94a3b8", fontSize: "13px", textAlign: "center", padding: "20px" }}>
            No monitoring sites added. Click on the map to add one.
          </div>
        )}

        {locations.map((loc) => (
          <div
            key={loc.id}
            className="location-item"
            style={{
              minWidth: "240px",
              flex: "0 0 240px",
              scrollSnapAlign: "start",
              background: "rgba(30, 41, 59, 0.5)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "12px",
              padding: "16px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: "14px" }}>{loc.name}</div>
                <div style={{ fontSize: "11px", color: "#94a3b8", fontFamily: "monospace" }}>
                  {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDeleteLocation(loc.id)}
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "#fca5a5",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  fontSize: "11px",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.25)"}
                onMouseOut={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)"}
              >
                Delete
              </button>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <div style={{
                fontSize: "10px",
                padding: "2px 6px",
                borderRadius: "4px",
                background: loc.is_active ? "rgba(34, 197, 94, 0.1)" : "rgba(245, 158, 11, 0.1)",
                color: loc.is_active ? "#86efac" : "#fcd34d",
                border: `1px solid ${loc.is_active ? "rgba(34, 197, 94, 0.2)" : "rgba(245, 158, 11, 0.2)"}`
              }}>
                {loc.is_active ? "ACTIVE" : "PAUSED"}
              </div>

              {(() => {
                const latest = getLatestLeak(loc.name);
                if (!latest) return null;
                return (
                  <div style={{ display: "flex", gap: "6px" }}>
                    <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                      Last: <span style={{ color: latest.severity === 'high' ? '#fca5a5' : '#cbd5e1' }}>{latest.severity.toUpperCase()}</span>
                    </div>
                    <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                      Conf: <span style={{ color: "#86efac" }}>{latest.confidenceScore.toFixed(0)}%</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
