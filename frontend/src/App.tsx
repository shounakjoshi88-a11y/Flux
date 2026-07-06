import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { createClient } from "./lib/client";
import { SplashScreen } from "./components/SplashScreen";
import { PerformanceProvider } from "./lib/performance-context";

const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
      <svg className="size-8 animate-spin text-[var(--muted-foreground)]" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function DeepLinkHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const { Browser } = await import("@capacitor/browser");
        App.addListener("appUrlOpen", async (event) => {
          if (cancelled) return;
          (window as any).fluxLog?.("🔗 deep link: " + event.url.substring(0, 60));
          if (event.url.startsWith("com.shounak.flux://auth/callback")) {
            const supabase = createClient();
            try {
              const codeMatch = event.url.match(/[?&]code=([^&]+)/);
              const authCode = codeMatch?.[1] ? decodeURIComponent(codeMatch[1]) : null;
              if (!authCode) throw new Error("No auth code in URL");

              const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
              if (data?.session) {
                (window as any).fluxLog?.("✅ session obtained, navigating to /new");
                navigate("/new");
              } else {
                (window as any).fluxLog?.("❌ exchange failed: " + JSON.stringify(error));
                console.error("Auth code exchange failed:", error);
              }
            } catch (e) {
              (window as any).fluxLog?.("💥 exchange error: " + String(e));
              console.error("Auth code exchange error:", e);
            }
            try { await Browser.close(); } catch {}
          }
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [navigate]);
  return null;
}

export function App() {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  return (
    <PerformanceProvider>
      <BrowserRouter>
        <DeepLinkHandler />
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/c/:slug" element={<Dashboard />} />
            <Route path="/new" element={<Dashboard />} />
            <Route path="/" element={<Dashboard />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </PerformanceProvider>
  );
}

export default App;
