import { useAuth } from '../contexts/AuthContext';
import { Shield } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // If already authenticated, redirect to dashboard
    if (!isLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg via-bg to-bg-surface flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle animated background effect */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.03),transparent_50%)]"></div>
      <div className="absolute top-20 left-20 w-72 h-72 bg-primary/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-primary/3 rounded-full blur-3xl"></div>

      <div className="max-w-md w-full relative z-10">
        {/* Logo and Title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-primary/20 to-primary/5 rounded-3xl mb-6 shadow-lg shadow-primary/10">
            <img src="/logo/kubiq_logo.png" alt="Kubiq Logo" className="w-16 h-16 object-contain" />
          </div>
          <h1 className="text-4xl font-bold text-text mb-3 tracking-tight">kubiq</h1>
          <p className="text-text-dim text-sm">Cloud-Native Service Health Dashboard</p>
        </div>

        {/* Sign In Card */}
        <div className="bg-bg-surface/80 backdrop-blur-sm rounded-2xl border border-gray-800/50 shadow-2xl p-8 hover:border-gray-700/50 transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <button
              onClick={login}
              className="flex-1 py-3.5 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 rounded-xl font-semibold text-lg transition-all duration-200 shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]"
            >
              Sign In with OIDC
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
