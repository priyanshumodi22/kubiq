
import { useAuth } from '../contexts/AuthContext';
import { Shield, User, Lock, LogIn, Fingerprint } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Footer from '../components/Footer';
import { startAuthentication } from '@simplewebauthn/browser';
import { apiClient } from '../services/api';

export default function Login() {
  const { loginKeycloak, loginNative, loginWithToken, isAuthenticated, isLoading, authEnabled, nativeAuthEnabled } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    // If already authenticated, redirect to dashboard
    if (!isLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleNativeLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setSubmitting(true);
      try {
          await loginNative({ username, password });
      } catch (err: any) {
          setError(err.response?.data?.message || 'Login failed');
      } finally {
          setSubmitting(false);
      }
  };

  const handleBiometricLogin = async () => {
    if (!username) {
        setError('Please enter your username first');
        return;
    }

    setBiometricLoading(true);
    setError('');

    try {
        // 1. Get challenge
        const options = await apiClient.loginPasskeyOptions(username);

        // 2. Browser Prompt
        const authResp = await startAuthentication(options);

        // 3. Verify
        const result = await apiClient.loginPasskeyVerify(username, authResp);

        if (result.verified && result.token) {
            loginWithToken(result.token, result.user);
        } else {
            setError('Biometric verification failed');
        }

    } catch (error: any) {
        console.error(error);
        if (error.name === 'NotAllowedError') {
            setError('Biometric login cancelled or timed out');
        } else {
             const serverError = error.response?.data?.error || error.response?.data?.message;
             setError(serverError || error.message || 'Biometric login failed');
        }
    } finally {
        setBiometricLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg via-bg to-bg-surface flex items-center justify-center p-4 pb-20 relative overflow-hidden">
      {/* Subtle animated background effect */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.03),transparent_50%)]"></div>
      <div className="absolute top-20 left-20 w-72 h-72 bg-primary/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-primary/3 rounded-full blur-3xl"></div>

      <div className="max-w-md w-full relative z-10">
        {/* Logo and Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-primary/20 to-primary/5 rounded-3xl mb-6 shadow-lg shadow-primary/10">
             <img
               src={`${
                 import.meta.env.BASE_URL.endsWith('/')
                   ? import.meta.env.BASE_URL
                   : import.meta.env.BASE_URL + '/'
               }logo/kubiq_logo.png`}
               alt="Kubiq Logo"
               className="w-16 h-16 object-contain"
             />
          </div>
          <h1 className="text-4xl font-bold text-text mb-2 tracking-tight">kubiq</h1>
          <p className="text-text-dim text-sm">High-Availability Monitor</p>
        </div>

        {/* Sign In Card */}
        <div className="bg-bg-surface/80 backdrop-blur-sm rounded-2xl border border-gray-800/50 shadow-2xl p-8 transition-all duration-300">
           
           {nativeAuthEnabled && (
               <form onSubmit={handleNativeLogin} className="space-y-4 mb-6">
                   {error && (
                       <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-3 rounded-lg">
                           {error}
                       </div>
                   )}
                   
                   <div className="space-y-2">
                       <label className="text-sm text-text-dim">Username</label>
                       <div className="relative">
                           <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                           <input 
                               type="text" 
                               value={username}
                               onChange={e => setUsername(e.target.value)}
                               className="w-full bg-black/20 border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                               placeholder="Enter username"
                           />
                       </div>
                   </div>

                   <div className="space-y-2">
                       <label className="text-sm text-text-dim">Password</label>
                       <div className="relative">
                           <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                           <input 
                               type="password"
                               value={password}
                               onChange={e => setPassword(e.target.value)}
                               className="w-full bg-black/20 border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                               placeholder="Enter password"
                           />
                       </div>
                   </div>

                   <div className="grid grid-cols-2 gap-3 pt-2">
                        <button
                            type="submit"
                            disabled={submitting || biometricLoading}
                            className="flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/90 rounded-lg font-semibold text-white transition-all shadow-lg shadow-primary/20 hover:shadow-primary/30 disabled:opacity-50"
                        >
                            {submitting ? 'Signing in...' : <><LogIn className="w-5 h-5"/> Sign In</>}
                        </button>

                        <button
                            type="button"
                            onClick={handleBiometricLogin}
                            disabled={submitting || biometricLoading || !username}
                            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold transition-all border ${
                                !username 
                                ? 'bg-gray-800/50 text-gray-500 border-gray-700 cursor-not-allowed' 
                                : 'bg-bg-surface hover:bg-gray-800 text-text border-primary/50 hover:border-primary'
                            }`}
                            title={!username ? "Enter username first" : "Login with Fingerprint"}
                        >
                            {biometricLoading ? 'Scanning...' : <><Fingerprint className="w-5 h-5"/> Bio Login</>}
                        </button>
                   </div>
               </form>
           )}

           {authEnabled && (
              <>
                  {nativeAuthEnabled && (
                      <div className="relative my-6">
                          <div className="absolute inset-0 flex items-center">
                              <div className="w-full border-t border-gray-700"></div>
                          </div>
                          <div className="relative flex justify-center text-sm">
                              <span className="px-2 bg-bg-surface text-gray-500">Or continue with</span>
                          </div>
                      </div>
                  )}

                  <button
                    onClick={loginKeycloak}
                    className="w-full flex items-center justify-center gap-3 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium text-text transition-all border border-gray-700 hover:border-gray-600"
                  >
                    <Shield className="w-5 h-5 text-primary" />
                    Sign In with SSO
                  </button>
              </>
           )}

           {nativeAuthEnabled && (
               <div className="mt-6 text-center text-sm text-text-dim">
                   Don't have an account? {' '}
                   <Link to="/register" className="text-primary hover:underline hover:text-primary-light">
                       Create account
                   </Link>
               </div>
           )}

        </div>
      </div>
      <Footer />
    </div>
  );
}
