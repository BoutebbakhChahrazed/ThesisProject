import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useState } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import LiveMonitor from "./pages/LiveMonitor.tsx";
import FarmerWeather from "./pages/FarmerWeather.tsx";
import FarmerAnalyze from "./pages/FarmerAnalyze.tsx";



import Analytics from "./pages/Analytics.tsx";
import Gallery from "./pages/Gallery.tsx";
import Expert from "./pages/Expert.tsx";
import ExpertDesk from "./pages/ExpertDesk.tsx";
import AuthPage from "./pages/Auth.tsx";
import SettingsPage from "./pages/Settings.tsx";
import Fields from "./pages/Fields.tsx";
import Flights from "./pages/Flights.tsx";
import Drones from "./pages/Drones.tsx";
import Images from "./pages/Images.tsx";
import Segmentations from "./pages/Segmentations.tsx";
import LatestDetections from "./pages/LatestDetections.tsx";

import { Layout } from "./components/Layout.tsx";
import Landing from "./pages/Landing.tsx";
import { useWebSocket } from "./hooks/useWebSocket";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import "leaflet/dist/leaflet.css";

// const queryClient = new QueryClient();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,              // retry failed requests 3 times
      retryDelay: 1000,      // wait 1s between retries
      staleTime: 0,
    },
  },
});

const ProtectedShell = ({ wsUrl, setWsUrl, threshold, setThreshold, wsConnected }: {
  wsUrl: string; setWsUrl: (s: string) => void; threshold: number; setThreshold: (n: number) => void; wsConnected: boolean;
}) => {
  const { user, role, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">Loading...</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;

  const home = role === "agronomist" ? "/expert-desk" : "/live";

  return (
    <Layout wsConnected={wsConnected} dbConnected={true}>
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route path="/live" element={role === "agronomist" ? <Navigate to="/expert-desk" replace /> : <LiveMonitor live={true} />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/expert" element={role === "agronomist" ? <Navigate to="/expert-desk" replace /> : <Expert />} />
        <Route path="/expert-desk" element={role === "agronomist" ? <ExpertDesk /> : <Navigate to="/live" replace />} />
        <Route path="/settings" element={<SettingsPage wsUrl={wsUrl} setWsUrl={setWsUrl} threshold={threshold} setThreshold={setThreshold} />} />
        <Route path="/farmer-weather" element={role === "farmer" ? <FarmerWeather /> : <Navigate to="/live" replace />} />
        <Route path="/farmer-analyze" element={role === "farmer" ? <FarmerAnalyze /> : <Navigate to="/live" replace />} />

        <Route path="/fields" element={<Fields />} />
        <Route path="/flights" element={<Flights />} />
        <Route path="/drones" element={<Drones />} />
        <Route path="/images" element={<Images />} />
        <Route path="/segmentations/:flight_id" element={<Segmentations />} />
        <Route path="/detections/latest" element={<LatestDetections />} />

        <Route path="*" element={<NotFound />} />


      </Routes>

    </Layout>
  );
};

const App = () => {
  const [wsUrl, setWsUrl] = useState("");
  const [threshold, setThreshold] = useState(55);
  const { connected } = useWebSocket(wsUrl || null);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/" element={<Landing />} />
              <Route path="*" element={

                <ProtectedShell wsUrl={wsUrl} setWsUrl={setWsUrl} threshold={threshold} setThreshold={setThreshold} wsConnected={connected} />
              } />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};


export default App;
