
import { useAuth } from '../contexts/AuthContext';
import { Shield, User, Lock, LogIn, Fingerprint, Activity, FileText, GitBranch, Eye, EyeOff } from 'lucide-react';
import { useEffect, useState, useId } from 'react';
import { apiErrorMessage } from '../utils/apiErrorMessage';
import { requestErrorMessage } from '../utils/requestError';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/Footer';
import { startAuthentication } from '@simplewebauthn/browser';
import { apiClient } from '../services/api';

export default function Login() {
    const formId = useId();
    const { loginKeycloak, loginNative, loginWithToken, isAuthenticated, isLoading, authEnabled, nativeAuthEnabled } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
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
        } catch (err) {
            setError(apiErrorMessage(err, 'Login failed'));
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
            const authResp = await startAuthentication({ optionsJSON: options });

            // 3. Verify
            const result = await apiClient.loginPasskeyVerify(username, authResp);

            if (result.verified && result.token) {
                loginWithToken(result.token, result.user);
            } else {
                setError('Biometric verification failed');
            }

        } catch (error: unknown) {
            console.error(error);
            if (error && typeof error === 'object' && 'name' in error && error.name === 'NotAllowedError') {
                setError('Biometric login cancelled or timed out');
            } else {
                setError(requestErrorMessage(error, 'Biometric login failed', 'error-or-message'));
            }
        } finally {
            setBiometricLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-dvh bg-bg">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="relative flex min-h-dvh flex-col bg-bg">
            <main className="relative flex w-full flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-12">
                <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-gray-800 bg-bg-surface shadow-xl lg:grid-cols-2">
                    <section className="flex flex-col border-b border-gray-800 bg-bg px-6 py-6 sm:px-8 lg:border-b-0 lg:border-r lg:p-10" aria-label="kubiq workspace">
                        <div className="flex items-center gap-3">
                            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/5">
                                <img src={`${import.meta.env.BASE_URL.replace(/\/?$/, "/")}logo/kubiq_logo.png`} alt="" className="size-12 object-contain" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-text">kubiq</p>
                                <p className="text-sm text-text-dim">Uptime Radar</p>
                            </div>
                        </div>
                        <div className="hidden flex-1 flex-col justify-center py-10 lg:flex">
                            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-primary"><span className="h-px w-6 bg-primary" />Your operations workspace</p>
                            <h2 className="text-balance text-4xl font-semibold leading-tight text-text">Your infrastructure,<br /><span className="text-text-dim">in view.</span></h2>
                            <p className="mt-5 max-w-sm text-pretty text-sm leading-6 text-text-dim">Monitor your services, follow their logs and trace requests across your applications.</p>
                        </div>
                        <div className="hidden divide-y divide-gray-800 lg:block">
                            <div className="flex items-center gap-3 py-4"><Activity className="size-5 text-primary" /><span className="text-sm text-text">Service health</span><span className="ml-auto font-mono text-xs text-text-dim">Monitor</span></div>
                            <div className="flex items-center gap-3 py-4"><FileText className="size-5 text-primary" /><span className="text-sm text-text">Application logs</span><span className="ml-auto font-mono text-xs text-text-dim">Explore</span></div>
                            <div className="flex items-center gap-3 py-4"><GitBranch className="size-5 text-primary" /><span className="text-sm text-text">Distributed traces</span><span className="ml-auto font-mono text-xs text-text-dim">Investigate</span></div>
                        </div>
                    </section>
                    <section className="flex flex-col justify-center px-6 py-7 sm:p-8 lg:p-10" aria-labelledby="login-title">
                        <div className="mb-7">
                            <h1 id="login-title" className="text-balance text-2xl font-semibold text-text sm:text-3xl">Welcome back</h1>
                            <p className="mt-2 text-pretty text-sm leading-6 text-text-dim">Sign in to your kubiq workspace.</p>
                        </div>
                    {nativeAuthEnabled && (
                        <form noValidate onSubmit={handleNativeLogin} className="space-y-5">
                            {error && (
                                <div role="alert" className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-3 rounded-lg">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-2">
                                <label htmlFor={`${formId}-username`} className="block text-sm font-medium text-text">Username</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        id={`${formId}-username`}
                                        autoComplete="username"
                                        value={username}
                                        onChange={e => setUsername(e.target.value)}
                                        className="h-12 w-full rounded-lg border border-gray-700 bg-bg px-4 pl-10 text-base text-text outline-none transition-colors placeholder:text-text-dim focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        placeholder="Enter username"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor={`${formId}-password`} className="block text-sm font-medium text-text">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        id={`${formId}-password`}
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        className="h-12 w-full rounded-lg border border-gray-700 bg-bg px-4 pl-10 text-base text-text outline-none transition-colors placeholder:text-text-dim focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        placeholder="Enter password"
                                        style={{ paddingRight: '3.5rem' }}
                                    />
                                    <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center rounded-r-lg text-text-dim hover:text-text focus-visible:outline-2 focus-visible:outline-primary">
                                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="grid gap-3 pt-1 sm:grid-cols-2">
                                <button
                                    type="submit"
                                    disabled={submitting || biometricLoading}
                                    className="flex h-12 items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                                >
                                    {submitting ? 'Signing in...' : <><LogIn className="w-5 h-5" /> Sign In</>}
                                </button>

                                <button
                                    type="button"
                                    onClick={handleBiometricLogin}
                                    disabled={submitting || biometricLoading || !username}
                                    className={`flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${username
                                            ? 'bg-bg-surface hover:bg-gray-800 text-text border-primary/50 hover:border-primary'
                                            : 'bg-gray-800/50 text-gray-500 border-gray-700 cursor-not-allowed'
                                        }`}
                                    title={username ? "Use your passkey" : "Enter username first"}
                                >
                                    {biometricLoading ? 'Verifying...' : <><Fingerprint className="w-5 h-5" /> Use passkey</>}
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
                        <p className="mt-6 border-t border-gray-800 pt-5 text-center text-xs leading-5 text-text-dim">
                            Need access? Ask a kubiq administrator to create your account.
                        </p>
                    )}

                    </section>
                </div>
            </main>
            <Footer />
        </div>
    );
}
