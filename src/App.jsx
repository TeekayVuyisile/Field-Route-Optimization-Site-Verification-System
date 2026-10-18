import { BrowserRouter as Router, Routes, Route, useLocation, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TeamProvider } from './context/TeamContext';
import Navigation from './components/Navigation';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CreateTrip from './pages/CreateTrip';
import TripDetails from './pages/TripDetails';
import MapView from './pages/MapView';
import TripReview from './pages/TripReview';
import Team from './pages/Team';
import { ToastContainer } from 'react-toastify';
import './App.css';

// Remount the map per trip so route/guidance state never carries over
const TripMap = () => {
  const { tripId } = useParams();
  return <MapView key={tripId} />;
};

const AppRoutes = () => {
  const location = useLocation();

  return (
    <ErrorBoundary resetKey={location.pathname}>
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
        <Route
          path="/trip-details"
          element={
            <ProtectedRoute>
              <TripDetails />
            </ProtectedRoute>
          }
        />
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
    </ErrorBoundary>
  );
};

function App() {
  return (
    <AuthProvider>
      <TeamProvider>
        <Router>
          <Navigation />
          <AppRoutes />
          <ToastContainer position="bottom-right" />
        </Router>
      </TeamProvider>
    </AuthProvider>
  );
}

export default App;
