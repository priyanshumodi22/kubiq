import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import StatusPage from './pages/StatusPage';
import Layout from './components/Layout';
import AdminUsers from './pages/AdminUsers';
import LogsPage from './pages/LogsPage';
import ApmDashboard from './pages/ApmDashboard';
import KubernetesDashboard from './pages/KubernetesDashboard';
import { AuditLogViewer } from './components/AuditLogViewer';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, authEnabled, nativeAuthEnabled } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If no auth provider is enabled, show a configuration error — never bypass
  const anyAuthEnabled = authEnabled || nativeAuthEnabled;
  if (!anyAuthEnabled) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="max-w-md w-full mx-4 p-8 rounded-2xl border border-red-500/30 bg-red-500/5 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Authentication Not Configured</h2>
          <p className="text-text-dim text-sm leading-relaxed">
            No authentication provider is enabled. Please enable <code className="text-red-400">NATIVE_AUTH_ENABLED</code> or <code className="text-red-400">KEYCLOAK_ENABLED</code> in your environment configuration and restart the server.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

import { ToastProvider } from './contexts/ToastContext';

import Profile from './pages/Profile';

function App() {
  // console.log('🚀 [App] BASE_URL:', import.meta.env.BASE_URL);

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
            <Route
              path="/apm"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ApmDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/kubernetes"
              element={
                <ProtectedRoute>
                  <Layout>
                    <KubernetesDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-logs"
              element={
                <ProtectedRoute>
                  <Layout>
                    <AuditLogViewer />
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
