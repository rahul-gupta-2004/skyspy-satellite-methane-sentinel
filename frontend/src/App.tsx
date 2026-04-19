import { useCallback, useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import axios from "axios";
import MapView, { type LocationRecord } from "./components/MapView.tsx";
import HistoryPanel, { type LeakHistoryItem } from "./components/HistoryPanel.tsx";
import ConsolePanel from "./components/ConsolePanel.tsx";
import ModelHealth from "./components/ModelHealth.tsx";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
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

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [historyItems, setHistoryItems] = useState<LeakHistoryItem[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [modelHealthScore, setModelHealthScore] = useState(0.72);
  const [isAuditing, setIsAuditing] = useState(false);

  const appendLog = useCallback((message: string) => {
    setConsoleLogs((prev) => [...prev, message]);
  }, []);

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const severityFromLeak = (methane: number, confidence: number): "low" | "medium" | "high" => {
    if (methane > 2100) return "high";
    if (confidence >= 60) return "medium";
    return "low";
  };

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

      const rows = (data ?? []).map((row) => ({
        id: String(row.id),
        locationName: locationMap.get(String(row.location_id)) ?? "Unknown location",
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

  const handleLocationsChange = (updatedLocations: LocationRecord[]) => {
    setLocations(updatedLocations);
    if (session) {
      void fetchLeakHistory(session.user.id, updatedLocations);
    }
  };

  if (isLoadingAuth) {
    return <div className="auth-shell">Checking session...</div>;
  }

  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1 className="auth-title">SkySpy Login</h1>
          <p className="auth-subtitle">Authenticate with Google to access the methane dashboard.</p>

          {!isSupabaseConfigured && (
            <p className="auth-error">
              Missing Supabase env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
            </p>
          )}

          {authError && <p className="auth-error">{authError}</p>}

          <button type="button" className="auth-google-button" onClick={handleGoogleLogin}>
            Continue With Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-root">
      <section className="dashboard-map-panel">
        <MapView
          currentUserId={session.user.id}
          onLocationsChange={handleLocationsChange}
          onConsoleLog={appendLog}
        />
      </section>

      <aside className="dashboard-side-panel">
        <div className="dashboard-auth-card">
          <div className="dashboard-auth-label">Signed in as</div>
          <div className="dashboard-auth-email">{session.user.email ?? "Unknown user"}</div>
          <button type="button" className="dashboard-logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>

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
  );
}

export default App;