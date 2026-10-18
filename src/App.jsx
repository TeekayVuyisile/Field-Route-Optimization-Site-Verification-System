import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TeamProvider } from './context/TeamContext';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { PageLoader } from './components/ui/Loaders';
import { ToastContainer } from 'react-toastify';
import './App.css';

// Each page is its own chunk: the map (Leaflet), import (SheetJS) and review
// (TanStack Table) code only downloads when that page is opened
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CreateTrip = lazy(() => import('./pages/CreateTrip'));
const MapView = lazy(() => import('./pages/MapView'));
const TripReview = lazy(() => import('./pages/TripReview'));
const Team = lazy(() => import('./pages/Team'));

// Remount the map per trip so route/guidance state never carries over
const TripMap = () => {
  const { tripId } = useParams();
  return <MapView key={tripId} />;
};

const AppRoutes = () => {
  const location = useLocation();

  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-trip"
          element={
            <ProtectedRoute>
              <CreateTrip />
            </ProtectedRoute>
          }
        />
        {/* Review is now step 2 of the new-trip wizard; keep old links working */}
        <Route path="/trip-details" element={<Navigate to="/create-trip" replace />} />
        <Route
          path="/trip-review/:id"
          element={
            <ProtectedRoute>
              <TripReview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/team"
          element={
            <ProtectedRoute>
              <Team />
            </ProtectedRoute>
          }
        />
        <Route
          path="/map"
          element={
            <ProtectedRoute>
              <MapView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/map/:tripId"
          element={
            <ProtectedRoute>
              <TripMap />
            </ProtectedRoute>
          }
        />
      </Routes>
      </Suspense>
    </ErrorBoundary>
  );
};

function App() {
  return (
    <AuthProvider>
      <TeamProvider>
        <Router>
          <AppShell>
            <AppRoutes />
          </AppShell>
          <ToastContainer position="bottom-right" />
        </Router>
      </TeamProvider>
    </AuthProvider>
  );
}

export default App;
