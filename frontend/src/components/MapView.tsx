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

type MapViewProps = {
  currentUserId: string;
  onLocationsChange?: (locations: LocationRecord[]) => void;
  onConsoleLog?: (message: string) => void;
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

export default function MapView({ currentUserId, onLocationsChange, onConsoleLog }: MapViewProps) {
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [clickedPoint, setClickedPoint] = useState<ClickedPoint | null>(null);

  const publishLocations = useCallback(
    (rows: LocationRecord[]) => {
      setLocations(rows);
      onLocationsChange?.(rows);
    },
    [onLocationsChange],
  );

  const fetchLocations = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("locations")
      .select("id, name, latitude, longitude, industry_type, is_active, created_by")
      .eq("created_by", currentUserId)
      .order("created_at", { ascending: false });

    if (error) {
      onConsoleLog?.(`Failed to fetch user locations: ${error.message}`);
      return;
    }

    const rows = (data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      industry_type: String(row.industry_type ?? "industrial"),
      is_active: Boolean(row.is_active),
      created_by: String(row.created_by),
    }));

    publishLocations(rows);
  }, [currentUserId, onConsoleLog, publishLocations]);

  useEffect(() => {
    void fetchLocations();
  }, [fetchLocations]);

  const handleAddLocation = useCallback(
    async (lat: number, lon: number) => {
      if (!supabase) return;

      const { error } = await supabase.from("locations").insert({
        created_by: currentUserId,
        name: "Industrial Site",
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
      await fetchLocations();
    },
    [currentUserId, fetchLocations, onConsoleLog],
  );

  const handleMapClick = useCallback(
    (lat: number, lon: number) => {
      setClickedPoint({ lat, lon });
      void handleAddLocation(lat, lon);
    },
    [handleAddLocation],
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
              <div style={{ minWidth: 190, color: "#dbe7ff" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{location.name}</div>
                <div>Latitude: {location.latitude.toFixed(5)}</div>
                <div>Longitude: {location.longitude.toFixed(5)}</div>
                <div>Type: {location.industry_type}</div>
                <div>Status: {location.is_active ? "Active" : "Inactive"}</div>
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
              <div style={{ minWidth: 170, color: "#dbe7ff" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Selected Coordinates</div>
                <div>Latitude: {clickedPoint.lat.toFixed(5)}</div>
                <div>Longitude: {clickedPoint.lon.toFixed(5)}</div>
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
