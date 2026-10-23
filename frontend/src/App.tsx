import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { AuthProvider } from './contexts/AuthProvider';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import StatusPage from './pages/StatusPage';
import Layout from './components/Layout';
import AdminUsers from './pages/AdminUsers';
import LogsPage from './pages/LogsPage';
import ApmDashboard from './pages/ApmDashboard';
import KubernetesDashboard from './pages/KubernetesDashboard';
import { AuditLogViewer } from './components/AuditLogViewer';
import SystemAdministration from './pages/SystemAdministration';

function ProtectedRoute({ children }: Readonly<{ children: React.ReactNode }>) {
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

function AdminRoute({ children }: Readonly<{ children: React.ReactNode }>) {
  const { hasPermission, permissionsLoaded } = useAuth();
  if (!permissionsLoaded) return <div className="flex min-h-screen items-center justify-center bg-bg"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!hasPermission('system.access')) {
    return <PermissionDeniedRedirect />;
  }
  return <>{children}</>;
}

function PermissionRoute({ permission, children }: Readonly<{ permission: string; children: React.ReactNode }>) {
  const { hasPermission, permissionsLoaded } = useAuth();
  if (!permissionsLoaded) return <div className="flex min-h-screen items-center justify-center bg-bg"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  return hasPermission(permission) ? <>{children}</> : <PermissionDeniedRedirect />;
}

import { useToast } from './contexts/ToastContext';
import { ToastProvider } from './contexts/ToastProvider';

import Profile from './pages/Profile';

function PermissionDeniedRedirect() {
  const { warning } = useToast();
  useEffect(() => { warning('You do not have permission to access that area.'); }, [warning]);
  return <Navigate to="/dashboard" replace />;
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Navigate to="/login" replace />} />
            <Route path="/status/:slug" element={<StatusPage />} />
            <Route path="/admin/users" element={
              <ProtectedRoute>
                <PermissionRoute permission="users.manage"><AdminUsers /></PermissionRoute>
              </ProtectedRoute>
            } />
            <Route
              path="/logs"
              element={
                <ProtectedRoute>
                  <Layout>
                    <PermissionRoute permission="logs.read"><LogsPage /></PermissionRoute>
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
              path="/system"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <Layout>
                      <SystemAdministration />
                    </Layout>
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Layout>
                    <PermissionRoute permission="services.read"><Dashboard /></PermissionRoute>
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/apm"
              element={
                <ProtectedRoute>
                  <Layout>
                    <PermissionRoute permission="apm.read"><ApmDashboard /></PermissionRoute>
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/kubernetes"
              element={
                <ProtectedRoute>
                  <Layout>
                    <PermissionRoute permission="kubernetes.read"><KubernetesDashboard /></PermissionRoute>
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-logs"
              element={
                <ProtectedRoute>
                  <PermissionRoute permission="audit.read">
                    <Layout>
                      <AuditLogViewer />
                    </Layout>
                  </PermissionRoute>
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
