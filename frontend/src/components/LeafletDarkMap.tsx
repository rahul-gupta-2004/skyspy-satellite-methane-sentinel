import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import L, { type LeafletMouseEvent } from "leaflet";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import MethaneInsightModal from "./MethaneInsightModal";

type LeafletDarkMapProps = {
  onLocationSelect: (lat: number, lon: number) => void;
};

type LatLon = [number, number];

type HeatPoint = {
  center: LatLon;
  radius: number;
  color: string;
  opacity: number;
};

type LeakDetection = {
  methane: number;
  confidence: number;
};

type ReportEntry = {
  methane: number;
  is_anomaly: number;
};

type ModalPayload = {
  confidenceScore: number;
  baselineValue: number;
  currentValue: number;
};

type DetectResponse = {
  status: string;
  coordinates: {
    lat: number;
    lon: number;
  };
  metrics?: {
    silhouette_score?: number;
    model_type?: string;
    samples_analyzed?: number;
    samples?: number;
  };
  detected_leaks: LeakDetection[];
  full_report?: ReportEntry[];
  full_data?: Array<{
    methane: number;
    anomaly: number;
  }>;
};

// Fix default marker icons for bundlers like Vite.
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function interpolateHeatColor(intensity: number): string {
  const clamped = Math.max(0, Math.min(1, intensity));

  if (clamped < 0.5) {
    const t = clamped / 0.5;
    const r = Math.round(46 + (255 - 46) * t);
    const g = Math.round(204 + (206 - 204) * t);
    const b = Math.round(113 + (86 - 113) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  const t = (clamped - 0.5) / 0.5;
  const r = Math.round(255 + (255 - 255) * t);
  const g = Math.round(206 + (59 - 206) * t);
  const b = Math.round(86 + (48 - 86) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function offsetCoordinates(base: LatLon, metersNorth: number, metersEast: number): LatLon {
  const earthRadius = 6378137;
  const dLat = (metersNorth / earthRadius) * (180 / Math.PI);
  const dLon =
    (metersEast / (earthRadius * Math.cos((base[0] * Math.PI) / 180))) *
    (180 / Math.PI);

  return [base[0] + dLat, base[1] + dLon];
}

function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (position: LatLon) => void | Promise<void>;
}) {
  useMapEvents({
    click: (event: LeafletMouseEvent) => {
      const { lat, lng } = event.latlng;
      onMapClick([lat, lng]);
    },
  });

  return null;
}

function LeafletDarkMap({ onLocationSelect }: LeafletDarkMapProps) {
  const [selectedPosition, setSelectedPosition] = useState<LatLon | null>(null);
  const [detectResult, setDetectResult] = useState<DetectResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalPayload, setModalPayload] = useState<ModalPayload | null>(null);

  const handleMapClick = async (position: LatLon) => {
    setSelectedPosition(position);
    onLocationSelect(position[0], position[1]);
    setIsLoading(true);
    setRequestError(null);

    try {
      const response = await axios.get<DetectResponse>("http://127.0.0.1:8000/detect", {
        params: {
          lat: position[0],
          lon: position[1],
        },
      });

      setDetectResult(response.data);
    } catch (error) {
      console.error("Detection request failed:", error);
      setDetectResult(null);
      setRequestError("Detection API unavailable. Check backend/CORS.");
    } finally {
      setIsLoading(false);
    }
  };

  const anomalies = detectResult?.detected_leaks ?? [];
  const hasAnomaly = anomalies.length > 0;

  const reportData = useMemo<ReportEntry[]>(() => {
    if (!detectResult) return [];

    if (Array.isArray(detectResult.full_report)) {
      return detectResult.full_report;
    }

    if (Array.isArray(detectResult.full_data)) {
      return detectResult.full_data.map((entry) => ({
        methane: entry.methane,
        is_anomaly: entry.anomaly,
      }));
    }

    return [];
  }, [detectResult]);

  const normalMethane = reportData.find(
    (entry) => entry.is_anomaly === 1,
  )?.methane;

  const heatPoints = useMemo<HeatPoint[]>(() => {
    if (!selectedPosition || reportData.length === 0) {
      return [];
    }

    const methaneValues = reportData.map((entry) => entry.methane);
    const minMethane = Math.min(...methaneValues);
    const maxMethane = Math.max(...methaneValues);
    const denominator = maxMethane - minMethane || 1;

    const maxPoints = 40;
    const stride = Math.max(1, Math.floor(methaneValues.length / maxPoints));
    const sampled = methaneValues.filter((_, index) => index % stride === 0);

    return sampled.map((methane, index) => {
      const intensity = (methane - minMethane) / denominator;
      const angle = index * 0.75;
      const ringDistance = 16000 + (index % 7) * 9000;
      const north = Math.cos(angle) * ringDistance;
      const east = Math.sin(angle) * ringDistance;
      const center = offsetCoordinates(selectedPosition, north, east);

      return {
        center,
        radius: 50000 + intensity * 160000,
        color: interpolateHeatColor(intensity),
        opacity: 0.18 + intensity * 0.34,
      };
    });
  }, [selectedPosition, reportData]);

  const baselineValue = useMemo(() => {
    if (reportData.length === 0) return 0;

    const normalPoints = reportData.filter((entry) => entry.is_anomaly !== -1);
    const source = normalPoints.length > 0 ? normalPoints : reportData;
    const total = source.reduce((sum, entry) => sum + entry.methane, 0);
    return total / source.length;
  }, [reportData]);

  const openInsightModal = (payload: ModalPayload) => {
    setModalPayload(payload);
    setIsModalOpen(true);
  };

  const handleDownloadReport = useCallback(() => {
    const reportJson = JSON.stringify(anomalies, null, 2);
    const blob = new Blob([reportJson], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = downloadUrl;
    link.download = "skyspy-report.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  }, [anomalies]);

  useEffect(() => {
    const onDownloadRequest = () => {
      handleDownloadReport();
    };

    window.addEventListener("skyspy-download-report", onDownloadRequest);
    return () => {
      window.removeEventListener("skyspy-download-report", onDownloadRequest);
    };
  }, [handleDownloadReport]);

  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: "#05070b", position: "relative" }}>
      <MapContainer
        center={[20, 0]}
        zoom={2}
        minZoom={2}
        style={{ width: "100%", height: "100%" }}
        preferCanvas
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains={["a", "b", "c", "d"]}
        />

        <MapClickHandler onMapClick={handleMapClick} />

        {heatPoints.map((point, index) => (
          <Circle
            key={`heat-${index}`}
            center={point.center}
            radius={point.radius}
            pathOptions={{
              color: point.color,
              fillColor: point.color,
              fillOpacity: point.opacity,
              opacity: 0,
            }}
            interactive={false}
          />
        ))}

        {selectedPosition && hasAnomaly
          ? anomalies.map((anomaly, index) => (
              <CircleMarker
                key={`${anomaly.methane}-${anomaly.confidence}-${index}`}
                center={selectedPosition}
                radius={10 + index * 2}
                eventHandlers={{
                  click: () =>
                    openInsightModal({
                      confidenceScore: anomaly.confidence,
                      baselineValue,
                      currentValue: anomaly.methane,
                    }),
                }}
                pathOptions={{
                  color: "#ff3b30",
                  fillColor: "#ff3b30",
                  fillOpacity: 0.45,
                  weight: 2,
                }}
              >
                <Popup>
                  <div>
                    <div>
                      <strong>Methane level:</strong> {anomaly.methane.toFixed(2)}
                    </div>
                    <div>
                      <strong>Confidence score:</strong> {anomaly.confidence.toFixed(1)}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            ))
          : selectedPosition && (
              <CircleMarker
                center={selectedPosition}
                radius={10}
                eventHandlers={{
                  click: () =>
                    openInsightModal({
                      confidenceScore: 0,
                      baselineValue,
                      currentValue:
                        typeof normalMethane === "number" ? normalMethane : baselineValue,
                    }),
                }}
                pathOptions={{
                  color: "#2ecc71",
                  fillColor: "#2ecc71",
                  fillOpacity: 0.45,
                  weight: 2,
                }}
              >
                <Popup>
                  <div>
                    <div>
                      <strong>Methane level:</strong>{" "}
                      {typeof normalMethane === "number"
                        ? normalMethane.toFixed(2)
                        : "Normal range"}
                    </div>
                    <div>
                      <strong>Confidence score:</strong> 0.0
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            )}
      </MapContainer>

      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 1000,
          background: "rgba(7, 11, 20, 0.78)",
          color: "#e7edf7",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid rgba(255, 255, 255, 0.15)",
          fontSize: 13,
          lineHeight: 1.45,
          maxWidth: 320,
          backdropFilter: "blur(6px)",
        }}
      >
        <div>Click map to run methane detection.</div>
        {selectedPosition && (
          <div>
            Last click: {selectedPosition[0].toFixed(4)}, {selectedPosition[1].toFixed(4)}
          </div>
        )}
        {isLoading && <div style={{ color: "#f6d365" }}>Loading detection...</div>}
        {!isLoading && hasAnomaly && (
          <div style={{ color: "#ff8a80" }}>Anomaly detected. Red overlays active.</div>
        )}
        {!isLoading && selectedPosition && !hasAnomaly && !requestError && (
          <div style={{ color: "#7ce6a1" }}>No anomaly. Green marker shown.</div>
        )}
        {requestError && <div style={{ color: "#ffb4ab" }}>{requestError}</div>}
        <button
          type="button"
          onClick={handleDownloadReport}
          style={{
            marginTop: 8,
            background: "#1f2a44",
            color: "#dbe7ff",
            border: "1px solid rgba(147, 197, 253, 0.4)",
            borderRadius: 8,
            padding: "6px 10px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Download Report
        </button>
      </div>

      <MethaneInsightModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        methaneSeries={reportData}
        confidenceScore={modalPayload?.confidenceScore ?? 0}
        baselineValue={modalPayload?.baselineValue ?? baselineValue}
        currentValue={modalPayload?.currentValue ?? baselineValue}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 16,
          transform: "translateX(-50%)",
          zIndex: 1000,
          background: "rgba(8, 12, 22, 0.72)",
          color: "#dbe7ff",
          border: "1px solid rgba(255, 255, 255, 0.16)",
          borderRadius: 12,
          padding: "8px 14px",
          fontSize: 13,
          lineHeight: 1.35,
          backdropFilter: "blur(8px)",
          pointerEvents: "none",
          boxShadow: "0 12px 28px rgba(0, 0, 0, 0.35)",
          whiteSpace: "nowrap",
        }}
      >
        {selectedPosition
          ? `Lat: ${selectedPosition[0].toFixed(5)} | Lon: ${selectedPosition[1].toFixed(5)}`
          : "Lat: -- | Lon: --"}
      </div>
    </div>
  );
}

export default LeafletDarkMap;
