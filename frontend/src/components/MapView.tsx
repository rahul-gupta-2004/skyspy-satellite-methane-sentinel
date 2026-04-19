import { useCallback, useEffect, useMemo, useState } from "react";
import type { MapMouseEvent } from "maplibre-gl";
import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerPopup,
  useMap,
} from "./ui/map";
import { supabase } from "../supabaseClient";

export type LocationRecord = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  industry_type: string;
  is_active: boolean;
  created_by: string;
};

export type LeakMapMarker = {
  id: string;
  locationId: string;
  locationName: string;
  latitude: number;
  longitude: number;
  methaneLevel: number;
  confidenceScore: number;
  severity: "low" | "medium" | "high";
  detectedAt: string;
};

type MapViewProps = {
  currentUserId: string;
  locations: LocationRecord[];
  onLocationsChange?: () => void;
  onConsoleLog?: (message: string) => void;
  leakMarkers?: LeakMapMarker[];
};

type ClickedPoint = {
  lat: number;
  lon: number;
};

function MapClickListener({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;

    const clickHandler = (event: MapMouseEvent) => {
      onMapClick(event.lngLat.lat, event.lngLat.lng);
    };

    map.on("click", clickHandler);
    return () => {
      map.off("click", clickHandler);
    };
  }, [isLoaded, map, onMapClick]);

  return null;
}

function markerColor(isActive: boolean): string {
  return isActive ? "#22c55e" : "#f59e0b";
}

function markerShadow(isActive: boolean): string {
  return isActive
    ? "0 0 0 2px rgba(34, 197, 94, 0.25), 0 8px 20px rgba(16, 185, 129, 0.35)"
    : "0 0 0 2px rgba(245, 158, 11, 0.25), 0 8px 20px rgba(245, 158, 11, 0.35)";
}

function leakSeverityClass(severity: LeakMapMarker["severity"]): string {
  if (severity === "high") return "leak-marker leak-marker-high";
  if (severity === "medium") return "leak-marker leak-marker-medium";
  return "leak-marker leak-marker-low";
}

export default function MapView({
  currentUserId,
  locations,
  onLocationsChange,
  onConsoleLog,
  leakMarkers = [],
}: MapViewProps) {
  const [clickedPoint, setClickedPoint] = useState<ClickedPoint | null>(null);

  const handleAddLocation = useCallback(
    async (lat: number, lon: number) => {
      if (!supabase) return;

      const { error } = await supabase.from("locations").insert({
        created_by: currentUserId,
        name: "Methane Monitoring Node",
        latitude: lat,
        longitude: lon,
        industry_type: "industrial",
        is_active: true,
      });

      if (error) {
        onConsoleLog?.(`Failed to save location: ${error.message}`);
        return;
      }

      onConsoleLog?.(`Saved location [${lat.toFixed(4)}, ${lon.toFixed(4)}]`);
      await onLocationsChange?.();
    },
    [currentUserId, onConsoleLog, onLocationsChange],
  );

  const handleDeleteLocation = useCallback(
    async (id: string) => {
      if (!supabase) return;

      const { error } = await supabase.from("locations").delete().eq("id", id);

      if (error) {
        onConsoleLog?.(`Failed to delete location: ${error.message}`);
        return;
      }

      onConsoleLog?.(`Deleted location record #${id}`);
      await onLocationsChange?.();
    },
    [onConsoleLog, onLocationsChange],
  );

  const handleMapClick = useCallback(
    (lat: number, lon: number) => {
      setClickedPoint({ lat, lon });
    },
    [],
  );

  const activeCount = useMemo(
    () => locations.filter((location) => location.is_active).length,
    [locations],
  );

  return (
    <div className="map-view-shell">
      <Map
        theme="dark"
        center={[0, 20]}
        zoom={1.6}
        minZoom={1}
        maxZoom={16}
        className="map-view-canvas"
      >
        <MapClickListener onMapClick={handleMapClick} />

        <MapControls position="top-left" showZoom showCompass showFullscreen />

        {locations.map((location) => (
          <MapMarker
            key={location.id}
            latitude={location.latitude}
            longitude={location.longitude}
          >
            <MarkerContent>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  border: "2px solid #ffffff",
                  background: markerColor(location.is_active),
                  boxShadow: markerShadow(location.is_active),
                }}
              />
            </MarkerContent>
            <MarkerPopup closeButton>
              <div style={{ minWidth: 190, color: "#1e293b" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{location.name}</div>
                <div>Latitude: {location.latitude.toFixed(5)}</div>
                <div>Longitude: {location.longitude.toFixed(5)}</div>
                <div>Type: {location.industry_type}</div>
                <div style={{ marginBottom: 10 }}>Status: {location.is_active ? "Active" : "Inactive"}</div>
                <button
                  type="button"
                  onClick={() => handleDeleteLocation(location.id)}
                  style={{
                    width: "100%",
                    padding: "8px",
                    background: "rgba(239, 68, 68, 0.2)",
                    color: "#fca5a5",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 700,
                    transition: "all 0.2s"
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.3)"}
                  onMouseOut={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)"}
                >
                  Remove Location
                </button>
              </div>
            </MarkerPopup>
          </MapMarker>
        ))}

        {leakMarkers.map((marker) => (
          <MapMarker key={`leak-${marker.id}`} latitude={marker.latitude} longitude={marker.longitude}>
            <MarkerContent>
              <div className={leakSeverityClass(marker.severity)} />
            </MarkerContent>
            <MarkerPopup closeButton>
              <div style={{ minWidth: 210, color: "#1e293b" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>New Leak Detected</div>
                <div>Location: {marker.locationName}</div>
                <div>Methane: {marker.methaneLevel.toFixed(2)}</div>
                <div>Confidence: {marker.confidenceScore.toFixed(1)}%</div>
                <div>Severity: {marker.severity}</div>
                <div>Detected: {new Date(marker.detectedAt).toLocaleString()}</div>
              </div>
            </MarkerPopup>
          </MapMarker>
        ))}

        {clickedPoint && (
          <MapMarker latitude={clickedPoint.lat} longitude={clickedPoint.lon}>
            <MarkerContent>
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  border: "2px solid #f8fafc",
                  background: "#38bdf8",
                  boxShadow: "0 0 0 2px rgba(56, 189, 248, 0.3), 0 8px 20px rgba(14, 165, 233, 0.35)",
                }}
              />
            </MarkerContent>
            <MarkerPopup>
              <div style={{ minWidth: 170, color: "#1e293b" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Selected Coordinates</div>
                <div>Latitude: {clickedPoint.lat.toFixed(5)}</div>
                <div style={{ marginBottom: 10 }}>Longitude: {clickedPoint.lon.toFixed(5)}</div>
                <button
                  type="button"
                  onClick={() => {
                    void handleAddLocation(clickedPoint.lat, clickedPoint.lon);
                    setClickedPoint(null);
                  }}
                  style={{
                    width: "100%",
                    padding: "8px",
                    background: "rgba(34, 197, 94, 0.2)",
                    color: "#86efac",
                    border: "1px solid rgba(34, 197, 94, 0.3)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 700,
                    transition: "all 0.2s"
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = "rgba(34, 197, 94, 0.3)"}
                  onMouseOut={(e) => e.currentTarget.style.background = "rgba(34, 197, 94, 0.2)"}
                >
                  Monitor This Site
                </button>
              </div>
            </MarkerPopup>
          </MapMarker>
        )}
      </Map>

      <div className="map-view-hud">
        <div>Saved Locations: {locations.length}</div>
        <div>Active: {activeCount}</div>
      </div>
    </div>
  );
}
