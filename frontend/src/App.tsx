import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import StatusPage from './pages/StatusPage';
import Layout from './components/Layout';
import AdminUsers from './pages/AdminUsers';
import LogsPage from './pages/LogsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, authEnabled } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If auth is disabled, allow access
  if (!authEnabled) {
    return <>{children}</>;
  }

  // If auth is enabled, check authentication
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

import { ToastProvider } from './contexts/ToastContext';

import Profile from './pages/Profile';

function App() {
  console.log('🚀 [App] BASE_URL:', import.meta.env.BASE_URL);

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider>
        <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/status/:slug" element={<StatusPage />} />
          <Route path="/admin/users" element={
              <ProtectedRoute>
                  <AdminUsers />
              </ProtectedRoute>
          } />
          <Route
            path="/logs"
            element={
              <ProtectedRoute>
                <Layout>
                  <LogsPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
             path="/profile"
             element={
               <ProtectedRoute>
                 <Layout>
                   <Profile />
                 </Layout>
               </ProtectedRoute>
             }
           />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
