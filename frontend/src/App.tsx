import { BrowserRouter, Route, Routes } from "react-router-dom";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

export function App() {
    return <BrowserRouter>
    <Routes>
    <Route path="/auth" element={<Auth />} />
    <Route path="/privacy" element={<Privacy />} />
    <Route path="/terms" element={<Terms />} />
    <Route path="/c/:slug" element={<Dashboard />} />
    <Route path="/new" element={<Dashboard />} />
    <Route path="/" element={<Dashboard />} />
    </Routes>
</BrowserRouter>
}

export default App;