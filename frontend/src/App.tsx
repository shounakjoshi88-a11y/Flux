import { BrowserRouter, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";

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

export function App() {
    return <BrowserRouter>
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
}

export default App;