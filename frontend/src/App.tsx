import { useCallback, useEffect, useState } from "react";
import type { AuthChangeEvent, RealtimePostgresInsertPayload, Session } from "@supabase/supabase-js";
import axios from "axios";
import MapView, { type LeakMapMarker, type LocationRecord } from "./components/MapView.tsx";
import HistoryPanel, { type LeakHistoryItem } from "./components/HistoryPanel.tsx";
import ConsolePanel from "./components/ConsolePanel.tsx";
import ModelHealth from "./components/ModelHealth.tsx";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import LocationsPanel from "./components/LocationsPanel.tsx";
import AddLocationPanel from "./components/AddLocationPanel.tsx";
import "./App.css";

type DetectResponse = {
  metrics?: {
    silhouette_score?: number;
  };
  detected_leaks?: Array<{
    methane: number;
    confidence: number;
  }>;
};

type LeakLogInsert = {
  location_id: string;
  user_id: string;
  methane_level: number;
  confidence_score: number;
  severity: "low" | "medium" | "high";
};

type LeakLogRow = {
  id: string | number;
  location_id: string | number;
  user_id: string;
  methane_level: number;
  confidence_score: number;
  severity: "low" | "medium" | "high";
  detected_at: string;
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [historyItems, setHistoryItems] = useState<LeakHistoryItem[]>([]);
  const [leakMarkers, setLeakMarkers] = useState<LeakMapMarker[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [modelHealthScore, setModelHealthScore] = useState(0.72);
  const [isAuditing, setIsAuditing] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const appendLog = useCallback((message: string) => {
    setConsoleLogs((prev) => [...prev, message]);
  }, []);

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const severityFromLeak = (methane: number, confidence: number): "low" | "medium" | "high" => {
    if (methane > 2100) return "high";
    if (confidence >= 60) return "medium";
    return "low";
  };

  const fetchUserLocations = useCallback(async (userId: string) => {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from("locations")
      .select("id, name, latitude, longitude, industry_type, is_active, created_by")
      .eq("created_by", userId)
      .order("created_at", { ascending: false });

    if (error) {
      appendLog(`Failed to load locations: ${error.message}`);
      return [];
    }

    return (data ?? []).map((loc) => ({
      id: String(loc.id),
      name: String(loc.name),
      latitude: Number(loc.latitude),
      longitude: Number(loc.longitude),
      industry_type: String(loc.industry_type ?? "industrial"),
      is_active: Boolean(loc.is_active),
      created_by: String(loc.created_by),
    }));
  }, [appendLog]);

  const fetchLeakHistory = useCallback(
    async (userId: string, sourceLocations?: LocationRecord[]) => {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("leak_logs")
        .select("id, location_id, user_id, methane_level, confidence_score, severity, detected_at")
        .eq("user_id", userId)
        .order("detected_at", { ascending: false });

      if (error) {
        appendLog(`Failed to load history: ${error.message}`);
        return;
      }

      const locationSource = sourceLocations ?? locations;
      const locationMap = new Map(locationSource.map((location) => [location.id, location.name]));

      const rows = (data ?? [])
        .filter((row) => locationMap.has(String(row.location_id)))
        .map((row) => ({
          id: String(row.id),
          locationName: locationMap.get(String(row.location_id))!,
          methaneLevel: Number(row.methane_level),
          confidenceScore: Number(row.confidence_score),
          severity: (row.severity as "low" | "medium" | "high") ?? "low",
          detectedAt: row.detected_at as string,
        }));

      setHistoryItems(rows);
    },
    [appendLog, locations],
  );

  useEffect(() => {
    if (!notification) return;
    const id = window.setTimeout(() => setNotification(null), 2600);
    return () => window.clearTimeout(id);
  }, [notification]);

  useEffect(() => {
    if (!supabase) {
      setIsLoadingAuth(false);
      return;
    }

    const client = supabase;

    const initSession = async () => {
      const { data, error } = await client.auth.getSession();

      if (error) {
        setAuthError(error.message);
      }

      setSession(data.session ?? null);
      setIsLoadingAuth(false);
    };

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(
      (_event: AuthChangeEvent, nextSession: Session | null) => {
        setSession(nextSession);

        if (nextSession) {
          window.location.hash = "#/dashboard";
        }
      },
    );

    initSession();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;

    let isMounted = true;
    const runBootSequence = async () => {
      const bootLogs = [
        "Connecting to satellite feed...",
        "Fetching Sentinel-5P data...",
        "Running isolation forest...",
      ];

      for (const log of bootLogs) {
        if (!isMounted) return;
        appendLog(log);
        await delay(450);
      }
    };

    void runBootSequence();

    return () => {
      isMounted = false;
    };
  }, [appendLog, session]);

  useEffect(() => {
    if (!supabase || !session) return;

    const client = supabase;
    const channel = client
      .channel(`leak_logs_inserts_${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "leak_logs",
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload: RealtimePostgresInsertPayload<LeakLogRow>) => {
          const row = payload.new;
          const locationId = String(row.location_id);
          const matchedLocation = locations.find((location) => location.id === locationId);
          const locationName = matchedLocation?.name ?? "Unknown location";

          if (matchedLocation) {
            setHistoryItems((prev) => [
              {
                id: String(row.id),
                locationName,
                methaneLevel: Number(row.methane_level),
                confidenceScore: Number(row.confidence_score),
                severity: row.severity,
                detectedAt: row.detected_at,
              },
              ...prev,
            ]);

            setLeakMarkers((prev) => [
              {
                id: String(row.id),
                locationId,
                locationName,
                latitude: matchedLocation.latitude,
                longitude: matchedLocation.longitude,
                methaneLevel: Number(row.methane_level),
                confidenceScore: Number(row.confidence_score),
                severity: row.severity,
                detectedAt: row.detected_at,
              },
              ...prev,
            ].slice(0, 100));
          }

          setNotification("New Leak Detected");
          appendLog(`Realtime alert -> ${locationName} leak recorded.`);
        },
      )
      .subscribe();

    let cancelled = false;
    let running = false;

    const runBackgroundScan = async () => {
      if (running || cancelled) return;
      running = true;

      try {
        const { data: userLocations, error: locationError } = await client
          .from("locations")
          .select("id, name, latitude, longitude, industry_type, is_active, created_by")
          .eq("created_by", session.user.id);

        if (locationError) {
          appendLog(`Background scan skipped: ${locationError.message}`);
          return;
        }

        const normalizedLocations = (userLocations ?? []).map((location) => ({
          id: String(location.id),
          name: String(location.name),
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          industry_type: String(location.industry_type ?? "industrial"),
          is_active: Boolean(location.is_active),
          created_by: String(location.created_by),
        }));

        setLocations(normalizedLocations);

        if (normalizedLocations.length === 0) {
          appendLog("Background scan idle: no saved locations.");
          return;
        }

        const randomIndex = Math.floor(Math.random() * normalizedLocations.length);
        const randomLocation = normalizedLocations[randomIndex];

        appendLog(
          `Background scan -> ${randomLocation.name} (${randomLocation.latitude.toFixed(3)}, ${randomLocation.longitude.toFixed(3)})`,
        );

        const response = await axios.get<DetectResponse>("http://127.0.0.1:8000/detect", {
          params: {
            lat: randomLocation.latitude,
            lon: randomLocation.longitude,
          },
        });

        const score = response.data.metrics?.silhouette_score;
        if (typeof score === "number") {
          setModelHealthScore(score);
        }

        const leaks = response.data.detected_leaks ?? [];
        if (leaks.length === 0) {
          appendLog(`Background scan complete: no anomaly at ${randomLocation.name}`);
          return;
        }

        let insertedAnyLeak = false;
        for (const leak of leaks) {
          const payload: LeakLogInsert = {
            location_id: randomLocation.id,
            user_id: session.user.id,
            methane_level: leak.methane,
            confidence_score: leak.confidence,
            severity: severityFromLeak(leak.methane, leak.confidence),
          };

          const { error: insertError } = await client.from("leak_logs").insert(payload);
          if (insertError) {
            appendLog(`Background leak save failed: ${insertError.message}`);
          } else {
            insertedAnyLeak = true;
          }
        }

        if (insertedAnyLeak) {
          appendLog(`Anomaly detected at location ${randomLocation.name}`);
          await fetchLeakHistory(session.user.id, normalizedLocations);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown background scan error";
        appendLog(`Background scan failed: ${message}`);
      } finally {
        running = false;
      }
    };

    void runBackgroundScan();
    const intervalId = window.setInterval(() => {
      void runBackgroundScan();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      void client.removeChannel(channel);
    };
  }, [appendLog, fetchLeakHistory, locations, session]);

  const handleRunAudit = async () => {
    if (!supabase || !session) return;

    setIsAuditing(true);
    appendLog("Starting AI audit for saved industrial locations...");

    const { data: userLocations, error: locationError } = await supabase
      .from("locations")
      .select("id, name, latitude, longitude, industry_type, is_active, created_by")
      .eq("created_by", session.user.id);

    if (locationError) {
      appendLog(`Failed to fetch locations: ${locationError.message}`);
      setIsAuditing(false);
      return;
    }

    const normalizedLocations = (userLocations ?? []).map((location) => ({
      id: String(location.id),
      name: String(location.name),
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      industry_type: String(location.industry_type ?? "industrial"),
      is_active: Boolean(location.is_active),
      created_by: String(location.created_by),
    }));

    setLocations(normalizedLocations);

    if (normalizedLocations.length === 0) {
      appendLog("No saved locations to audit.");
      setIsAuditing(false);
      return;
    }

    const silhouettes: number[] = [];
    for (const location of normalizedLocations) {
      try {
        appendLog(`Auditing ${location.name} (${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)})`);

        const response = await axios.get<DetectResponse>("http://127.0.0.1:8000/detect", {
          params: {
            lat: location.latitude,
            lon: location.longitude,
          },
        });

        const score = response.data.metrics?.silhouette_score;
        if (typeof score === "number") {
          silhouettes.push(score);
        }

        const leaks = response.data.detected_leaks ?? [];
        if (leaks.length === 0) {
          appendLog(`No anomaly at ${location.name}`);
          continue;
        }

        for (const leak of leaks) {
          const payload: LeakLogInsert = {
            location_id: location.id,
            user_id: session.user.id,
            methane_level: leak.methane,
            confidence_score: leak.confidence,
            severity: severityFromLeak(leak.methane, leak.confidence),
          };

          const { error: insertError } = await supabase.from("leak_logs").insert(payload);
          if (insertError) {
            appendLog(`Failed to save leak log: ${insertError.message}`);
          } else {
            appendLog(`Anomaly detected at location ${location.name}`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown backend error";
        appendLog(`Audit failed for ${location.name}: ${message}`);
      }
    }

    if (silhouettes.length > 0) {
      const avgScore = silhouettes.reduce((sum, value) => sum + value, 0) / silhouettes.length;
      setModelHealthScore(avgScore);
    }

    await fetchLeakHistory(session.user.id, normalizedLocations);
    setIsAuditing(false);
  };

  const handleDownloadReport = () => {
    const blob = new Blob([JSON.stringify(historyItems, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "skyspy-report.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleGoogleLogin = async () => {
    if (!supabase) {
      setAuthError("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      setAuthError(error.message);
    }
  };

  const handleLogout = async () => {
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError(error.message);
      return;
    }

    setSession(null);
    window.location.hash = "#/login";
  };

  const handleDeleteLocation = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("locations").delete().eq("id", id);
    if (error) {
      appendLog(`Failed to delete location: ${error.message}`);
      return;
    }
    appendLog(`Deleted location #${id}`);
    if (session) {
      const normalized = await fetchUserLocations(session.user.id);
      setLocations(normalized);
      void fetchLeakHistory(session.user.id, normalized);
    }
  };

  const handleManualAddLocation = async (name: string, lat: number, lon: number) => {
    if (!supabase || !session) return;
    
    appendLog(`Registering node: ${name}...`);
    const { error } = await supabase.from("locations").insert({
      created_by: session.user.id,
      name,
      latitude: lat,
      longitude: lon,
      industry_type: "industrial",
      is_active: true,
    });

    if (error) {
      appendLog(`Failed to add node: ${error.message}`);
      return;
    }

    appendLog(`Successfully registered ${name}`);
    await handleLocationsChange();
  };

  const handleLocationsChange = async () => {
    if (session) {
      const normalized = await fetchUserLocations(session.user.id);
      setLocations(normalized);
      void fetchLeakHistory(session.user.id, normalized);
    }
  };

  if (isLoadingAuth) {
    return <div className="auth-shell">Checking session...</div>;
  }

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <img src="/logo.png" alt="SkySpy Logo" className="auth-logo" />
          <h1 className="auth-title">Welcome to SkySpy</h1>
          <p className="auth-subtitle">
            Advanced Methane Detection System. <br/>
            Sign in to monitor satellite telemetry in real-time.
          </p>

          {!isSupabaseConfigured && (
            <div className="auth-error-box">
              Missing Configuration: VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY
            </div>
          )}

          {authError && <div className="auth-error-box">{authError}</div>}

          <button type="button" className="auth-google-button" onClick={handleGoogleLogin}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          
          <div style={{ marginTop: 24, fontSize: 13, color: '#64748b' }}>
            New here? Signing in will automatically create your account.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-wrapper">
      <header className="dashboard-header">
        <div className="header-brand">
          <img src="/logo.png" alt="SkySpy Logo" className="header-logo" />
          <span className="header-title">SkySpy</span>
        </div>
        <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="dashboard-auth-email" style={{ marginBottom: 0, fontSize: "14px", color: "#94a3b8" }}>
            {session.user.email}
          </div>
          <button 
            type="button" 
            className="dashboard-logout-button" 
            onClick={handleLogout}
            style={{ width: "auto", padding: "6px 12px" }}
          >
            Logout
          </button>
        </div>
      </header>

      <div className="dashboard-root">
        <section className="dashboard-map-panel">
          <MapView
            currentUserId={session.user.id}
            locations={locations}
            onLocationsChange={handleLocationsChange}
            onConsoleLog={appendLog}
            leakMarkers={leakMarkers}
          />
        </section>

      {notification && <div className="dashboard-toast">{notification}</div>}

      <aside className="dashboard-side-panel">
        <AddLocationPanel onAdd={handleManualAddLocation} />
        <LocationsPanel 
          locations={locations} 
          onDeleteLocation={handleDeleteLocation}
          historyItems={historyItems}
        />

        <div className="dashboard-actions">
          <button
            type="button"
            className="dashboard-primary-button"
            onClick={handleRunAudit}
            disabled={isAuditing}
          >
            {isAuditing ? "Running..." : "Run AI Audit"}
          </button>

          <button
            type="button"
            className="dashboard-download-button"
            onClick={handleDownloadReport}
          >
            Download Report
          </button>
        </div>

        <ModelHealth score={modelHealthScore} />

        <ConsolePanel logs={consoleLogs} />

        <HistoryPanel items={historyItems} />
      </aside>
      </div>
    </div>
  );
}

export default App;