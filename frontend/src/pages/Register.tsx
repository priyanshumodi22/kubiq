import { useAuth } from '../contexts/AuthContext';
import { User, Lock, Mail, UserPlus, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Footer from '../components/Footer';

export default function Register() {
  const { registerNative } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      
      if (password !== confirmPassword) {
          setError("Passwords don't match");
          return;
      }
      
      // Basic complexity check
      if (password.length < 6) {
          setError("Password must be at least 6 characters");
          return;
      }

      setSubmitting(true);
      try {
          await registerNative({ username, email, password });
          setSuccess(true);
          setTimeout(() => navigate('/login'), 2000);
      } catch (err: any) {
          setError(err.response?.data?.message || 'Registration failed');
          setSubmitting(false);
      }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg via-bg to-bg-surface flex items-center justify-center p-4 pb-20 relative overflow-hidden">
      {/* Subtle animated background effect */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.03),transparent_50%)]"></div>
      
      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-text mb-2">Create Account</h1>
            <p className="text-text-dim text-sm">Join Kubiq dashboard</p>
        </div>

        <div className="bg-bg-surface/80 backdrop-blur-sm rounded-2xl border border-gray-800/50 shadow-xl p-8 transition-all duration-300">
           
           {success ? (
               <div className="text-center py-8">
                   <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                       <UserPlus className="w-8 h-8 text-green-500" />
                   </div>
                   <h3 className="text-xl font-semibold text-text mb-2">Account Created!</h3>
                   <p className="text-text-dim">Redirecting to login...</p>
               </div>
           ) : (
               <form onSubmit={handleRegister} className="space-y-4">
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
                               placeholder="Choose a username"
                               required
                           />
                       </div>
                   </div>

                   <div className="space-y-2">
                       <label className="text-sm text-text-dim">Email (Optional)</label>
                       <div className="relative">
                           <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                           <input 
                               type="email" 
                               value={email}
                               onChange={e => setEmail(e.target.value)}
                               className="w-full bg-black/20 border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                               placeholder="john@example.com"
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
                               placeholder="Min 6 characters"
                               required
                           />
                       </div>
                   </div>

                   <div className="space-y-2">
                       <label className="text-sm text-text-dim">Confirm Password</label>
                       <div className="relative">
                           <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                           <input 
                               type="password"
                               value={confirmPassword}
                               onChange={e => setConfirmPassword(e.target.value)}
                               className="w-full bg-black/20 border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                               placeholder="Confirm password"
                               required
                           />
                       </div>
                   </div>

                   <button
                       type="submit"
                       disabled={submitting}
                       className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/90 rounded-lg font-semibold text-white transition-all shadow-lg shadow-primary/20 hover:shadow-primary/30 disabled:opacity-50 mt-4"
                   >
                       {submitting ? 'Creating Account...' : <><UserPlus className="w-5 h-5"/> Sign Up</>}
                   </button>
               </form>
           )}

           <div className="mt-6 text-center text-sm">
               <Link to="/login" className="text-text-dim hover:text-white flex items-center justify-center gap-2 transition-colors">
                   <ArrowLeft className="w-4 h-4" /> Back to Login
               </Link>
           </div>

        </div>
      </div>
      <Footer />
    </div>
  );
}
