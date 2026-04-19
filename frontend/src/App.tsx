import { useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import LeafletDarkMap from "./components/LeafletDarkMap";
import ModelHealthGauge from "./components/ModelHealthGauge";
import TerminalLogPanel from "./components/TerminalLogPanel";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import "./App.css";

function App() {
  const [selected, setSelected] = useState<{ lat: number; lon: number } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleLocationSelect = (lat: number, lon: number) => {
    setSelected({ lat, lon });
  };

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

  const panelLogs = useMemo(
    () => [
      "Connecting to Sentinel-5P...",
      "Retrieving atmospheric data...",
      "Running anomaly detection...",
      selected
        ? `Leak detected at [${selected.lat.toFixed(4)}, ${selected.lon.toFixed(4)}]`
        : "Leak detected at [lat, lon]",
    ],
    [selected],
  );

  const handleDownloadClick = () => {
    window.dispatchEvent(new Event("skyspy-download-report"));
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
        <LeafletDarkMap onLocationSelect={handleLocationSelect} />
      </section>

      <aside className="dashboard-side-panel">
        <div className="dashboard-auth-card">
          <div className="dashboard-auth-label">Signed in as</div>
          <div className="dashboard-auth-email">{session.user.email ?? "Unknown user"}</div>
          <button type="button" className="dashboard-logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>

        <TerminalLogPanel logs={panelLogs} intervalMs={850} title="Sentinel Console" />

        <ModelHealthGauge score={0.82} width={320} height={220} />

        <button
          type="button"
          className="dashboard-download-button"
          onClick={handleDownloadClick}
        >
          Download Report
        </button>
      </aside>
    </div>
  );
}

export default App;