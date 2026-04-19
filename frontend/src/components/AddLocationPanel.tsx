import { useState } from "react";

type AddLocationPanelProps = {
  onAdd: (name: string, lat: number, lon: number) => void;
  isAdding?: boolean;
};

export default function AddLocationPanel({ onAdd, isAdding }: AddLocationPanelProps) {
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const l = parseFloat(lat);
    const n = parseFloat(lon);
    
    if (name && !isNaN(l) && !isNaN(n)) {
      onAdd(name, l, n);
      setName("");
      setLat("");
      setLon("");
    }
  };

  return (
    <section className="glass-panel add-location-panel" style={{ marginBottom: "12px" }}>
      <header className="panel-title">Add New Node Manually</header>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <input
          type="text"
          placeholder="Node Name (e.g. South Basin)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{
            background: "rgba(2, 6, 23, 0.6)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: "8px",
            padding: "10px",
            color: "#f8fafc",
            fontSize: "13px"
          }}
        />
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="number"
            step="any"
            placeholder="Latitude"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            required
            style={{
              flex: 1,
              background: "rgba(2, 6, 23, 0.6)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "8px",
              padding: "10px",
              color: "#f8fafc",
              fontSize: "13px"
            }}
          />
          <input
            type="number"
            step="any"
            placeholder="Longitude"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            required
            style={{
              flex: 1,
              background: "rgba(2, 6, 23, 0.6)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "8px",
              padding: "10px",
              color: "#f8fafc",
              fontSize: "13px"
            }}
          />
        </div>
        <button
          type="submit"
          disabled={isAdding}
          style={{
            background: "linear-gradient(135deg, #3b82f6 0%, #1e3a8a 100%)",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "10px",
            fontWeight: 700,
            fontSize: "13px",
            cursor: "pointer",
            transition: "all 0.2s"
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
          onMouseOut={(e) => e.currentTarget.style.transform = "translateY(0)"}
        >
          {isAdding ? "Adding..." : "Register Monitoring Site"}
        </button>
      </form>
    </section>
  );
}
