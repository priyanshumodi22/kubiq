
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { startRegistration } from '@simplewebauthn/browser';
import { apiClient } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { 
  User, 
  Shield, 
  Key, 
  Smartphone, 
  Mail, 
  Lock, 
  Fingerprint, 
  Trash2, 
  Plus, 
  X,
  CheckCircle2,
  Laptop,
  ArrowLeft,
  Edit2
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ConfirmDialog } from '../components/ConfirmDialog';

// --- Utility for Tailwind Classes ---
function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// --- Icons ---
// Using Lucide icons imported above

// --- Components ---

const SectionHeader = ({ title, description }: { title: string; description: string }) => (
  <div className="mb-6">
    <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
      {title}
    </h2>
    <p className="text-text-dim text-sm mt-1">{description}</p>
  </div>
);

const InputGroup = ({ 
  label, 
  icon: Icon, 
  ...props 
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; icon: React.ElementType }) => (
  <div className="space-y-2">
    <label className="text-sm font-medium text-text-dim ml-1">{label}</label>
    <div className="relative group">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors">
        <Icon className="w-5 h-5" />
      </div>
      <input 
        className={cn(
          "w-full bg-bg-surface/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-text placeholder:text-neutral-600",
          "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )} 
        {...props} 
      />
    </div>
  </div>
);

const Button = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  className,
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' | 'outline', isLoading?: boolean }) => {
  const variants = {
    primary: "bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20",
    danger: "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20",
    outline: "bg-transparent border border-white/10 hover:bg-white/5 text-text",
  };

  return (
    <button 
      className={cn(
        "px-6 py-2.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2",
        "active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        className
      )}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  );
};

// --- Page Component ---

const Profile: React.FC = () => {
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState<'details' | 'security'>('details');

  // Logic State
  const [profile, setProfile] = useState({ username: '', email: '' });
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [passkeys, setPasskeys] = useState<any[]>([]);
  
  // Loading States
  const [loading, setLoading] = useState({
    profile: false,
    password: false,
    passkeys: false,
    register: false
  });

  // Modal
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [newPasskeyName, setNewPasskeyName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) apiClient.setToken(token);
      
      setLoading(p => ({ ...p, passkeys: true }));
      const [user, pkList] = await Promise.all([
        apiClient.getCurrentUser(),
        apiClient.getPasskeys()
      ]);
      
      setProfile({
        username: user.username,
        email: user.email || ''
      });
      setPasskeys(pkList);
    } catch (err) {
      console.error(err);
      error('Failed to load profile data');
    } finally {
      setLoading(p => ({ ...p, passkeys: false }));
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(p => ({ ...p, profile: true }));
    try {
      await apiClient.updateProfile(profile);
      success('Profile updated successfully');
    } catch (err: any) {
      error(err.response?.data?.message || 'Failed to update');
    } finally {
      setLoading(p => ({ ...p, profile: false }));
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) return error('Passwords do not match');
    
    setLoading(p => ({ ...p, password: true }));
    try {
      await apiClient.changePassword({
        currentPassword: passwords.current,
        newPassword: passwords.new
      });
      success('Password changed successfully');
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (err: any) {
      error(err.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(p => ({ ...p, password: false }));
    }
  };

  const handleRegisterPasskey = async () => {
    if (!newPasskeyName.trim()) return error('Please name your device');
    
    setLoading(p => ({ ...p, register: true }));
    try {
      const options = await apiClient.registerPasskeyOptions();
      const attResp = await startRegistration(options);
      const verificationResp = await apiClient.registerPasskeyVerify({
        ...attResp,
        passkeyName: newPasskeyName
      });

      if (verificationResp.verified) {
        success('Passkey added!');
        setShowPasskeyModal(false);
        setNewPasskeyName('');
        const pkList = await apiClient.getPasskeys();
        setPasskeys(pkList);
      } else {
        error('Verification failed');
      }
    } catch (err: any) {
      if (err.name === 'InvalidStateError') error('Device already registered');
      else error('Registration failed');
    } finally {
      setLoading(p => ({ ...p, register: false }));
    }
  };

  const [passkeyToDelete, setPasskeyToDelete] = useState<string | null>(null);
  const [passkeyToRename, setPasskeyToRename] = useState<{ id: string, name: string } | null>(null);
  const [renameName, setRenameName] = useState('');

  const confirmDeletePasskey = (id: string) => {
      setPasskeyToDelete(id);
  };

  const startRenamePasskey = (id: string, currentName: string) => {
      setPasskeyToRename({ id, name: currentName });
      setRenameName(currentName);
  };

  const handleRenamePasskey = async () => {
    if (!passkeyToRename || !renameName.trim()) return;
    
    setLoading(p => ({ ...p, passkeys: true }));
    try {
        await apiClient.renamePasskey(passkeyToRename.id, renameName);
        success('Passkey renamed');
        setPasskeys(passkeys.map(pk => pk.id === passkeyToRename.id ? { ...pk, name: renameName } : pk));
        setPasskeyToRename(null);
    } catch (err) {
        error('Failed to rename passkey');
    } finally {
        setLoading(p => ({ ...p, passkeys: false }));
    }
  };

  const handleDeletePasskey = async () => {
    if (!passkeyToDelete) return;

    try {
      await apiClient.deletePasskey(passkeyToDelete);
      success('Passkey removed');
      setPasskeys(passkeys.filter(pk => pk.id !== passkeyToDelete));
    } catch (err) {
      error('Failed to delete');
    } finally {
      setPasskeyToDelete(null); 
    }
  };

  return (
    <div className="relative min-h-screen text-text p-6 md:p-12">
      {/* Background Effects matching Dashboard */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        {/* Gradient base */}
        <div className="absolute inset-0 bg-gradient-to-br from-bg via-bg to-bg-surface"></div>
        {/* Radial gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05),transparent_50%)]"></div>
        {/* Blur orbs */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 -right-20 w-80 h-80 bg-primary/3 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-1/4 w-72 h-72 bg-primary/4 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/dashboard" className="p-2 bg-bg-surface/30 backdrop-blur-md border border-white/5 rounded-lg hover:bg-white/5 transition-colors group">
            <ArrowLeft className="w-5 h-5 text-text-dim group-hover:text-text" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-text">User Settings</h1>
            <p className="text-text-dim text-sm">Manage your account and preferences</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        
        {/* Sidebar Nav */}
        <div className="md:col-span-3 space-y-6">
          <div className="bg-bg-surface/30 backdrop-blur-md border border-white/5 rounded-2xl p-6 flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-primary to-blue-600 rounded-full flex items-center justify-center mb-4 shadow-xl shadow-blue-500/20">
               <span className="text-3xl font-bold text-white">{profile.username.substring(0, 2).toUpperCase()}</span>
            </div>
            <h2 className="text-xl font-bold">{profile.username}</h2>
            <span className="px-3 py-1 bg-white/5 rounded-full text-xs text-text-dim mt-2 capitalize">
               Kubiq User
            </span>
          </div>

          <nav className="space-y-2">
            {[
              { id: 'details', label: 'Personal Details', icon: User },
              { id: 'security', label: 'Login & Security', icon: Shield },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                  activeTab === tab.id 
                    ? "bg-primary text-white shadow-lg shadow-blue-500/20 font-medium" 
                    : "text-text-dim hover:bg-white/5 hover:text-text"
                )}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="md:col-span-9">
           <div className="bg-bg-surface/30 backdrop-blur-md border border-white/5 rounded-3xl p-8 relative overflow-hidden min-h-[600px]">
              {/* Background Glow */}
              <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
              
              {activeTab === 'details' && (
                <div className="animate-scale-up space-y-8 max-w-2xl">
                   <SectionHeader 
                     title="Personal Information" 
                     description="Manage your public profile and contact info."
                   />
                   
                   <form onSubmit={handleUpdateProfile} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <InputGroup 
                          label="Username" 
                          icon={User} 
                          value={profile.username}
                          onChange={e => setProfile({...profile, username: e.target.value})}
                        />
                        <InputGroup 
                          label="Email Address" 
                          icon={Mail} 
                          type="email"
                          value={profile.email}
                          onChange={e => setProfile({...profile, email: e.target.value})}
                        />
                      </div>
                      
                      <div className="pt-4 border-t border-white/5 flex justify-end">
                        <Button type="submit" isLoading={loading.profile}>
                           Save Changes
                        </Button>
                      </div>
                   </form>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="animate-scale-up space-y-12">
                   
                   {/* Password Section */}
                   <section className="max-w-2xl">
                      <SectionHeader 
                         title="Password Settings" 
                         description="Ensure your account is secure with a strong password."
                      />
                      <form onSubmit={handleChangePassword} className="bg-black/20 rounded-2xl p-6 border border-white/5 space-y-5">
                         <InputGroup 
                            label="Current Password" 
                            icon={Lock} 
                            type="password"
                            value={passwords.current}
                            onChange={e => setPasswords({...passwords, current: e.target.value})}
                         />
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                           <InputGroup 
                              label="New Password" 
                              icon={Key} 
                              type="password"
                              value={passwords.new}
                              onChange={e => setPasswords({...passwords, new: e.target.value})}
                           />
                           <InputGroup 
                              label="Confirm New Password" 
                              icon={CheckCircle2} 
                              type="password"
                              value={passwords.confirm}
                              onChange={e => setPasswords({...passwords, confirm: e.target.value})}
                           />
                         </div>
                         <div className="flex justify-end pt-2">
                           <Button type="submit" isLoading={loading.password}>Update Password</Button>
                         </div>
                      </form>
                   </section>

                   {/* Passkeys Section */}
                   <section>
                      <div className="flex items-center justify-between mb-6">
                         <div className="flex items-center gap-3">
                           <div className="p-2 bg-primary/10 rounded-lg">
                             <Fingerprint className="w-6 h-6 text-primary" />
                           </div>
                           <div>
                             <h3 className="text-lg font-bold">Biometric Passkeys</h3>
                             <p className="text-text-dim text-sm">Login passwordless with your devices.</p>
                           </div>
                         </div>
                         <Button variant="outline" onClick={() => setShowPasskeyModal(true)}>
                            <Plus className="w-4 h-4" /> Add Passkey
                         </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {loading.passkeys ? (
                           <div className="col-span-2 text-center py-12 text-text-dim">Loading devices...</div>
                        ) : passkeys.length === 0 ? (
                           <div className="col-span-2 text-center py-8 border border-dashed border-white/10 rounded-xl text-text-dim">
                              No passkeys configured. Add one to login faster!
                           </div>
                        ) : (
                           passkeys.map(pk => (
                             <div key={pk.id} className="group bg-bg-surface/40 hover:bg-bg-surface/60 border border-white/5 rounded-xl p-4 flex items-center justify-between transition-all duration-200">
                                <div className="flex items-center gap-4">
                                   <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                                      {pk.deviceType === 'singleDevice' ? <Smartphone className="w-5 h-5" /> : <Laptop className="w-5 h-5" />}
                                   </div>
                                   <div>
                                      <h4 className="font-semibold text-text group-hover:text-primary transition-colors">{pk.name}</h4>
                                      <p className="text-xs text-text-dim">Added {new Date(pk.createdAt).toLocaleDateString()}</p>
                                   </div>
                                </div>
                                <div className="flex items-center">
                                    <button 
                                      onClick={() => startRenamePasskey(pk.id, pk.name)}
                                      className="p-2 text-text-dim hover:text-white hover:bg-white/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 mr-1"
                                    >
                                       <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => confirmDeletePasskey(pk.id)}
                                      className="p-2 text-text-dim hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                       <Trash2 className="w-4 h-4" />
                                    </button>
                                 </div>
                             </div>
                           ))
                        )}
                      </div>
                   </section>

                </div>
              )}
           </div>
        </div>
      </div>

      {/* Passkey Modal */}
      {showPasskeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Fingerprint className="w-5 h-5 text-primary" /> 
                  Name your Passkey
                </h3>
                <button onClick={() => setShowPasskeyModal(false)} className="text-text-dim hover:text-text">
                   <X className="w-5 h-5" />
                </button>
              </div>
              
              <InputGroup 
                 label="Device Name" 
                 icon={Smartphone}
                 placeholder="e.g. Personal MacBook"
                 value={newPasskeyName}
                 onChange={e => setNewPasskeyName(e.target.value)}
                 autoFocus
              />

              <div className="flex gap-3 mt-8">
                 <Button variant="outline" className="flex-1" onClick={() => setShowPasskeyModal(false)}>Cancel</Button>
                 <Button className="flex-1" onClick={handleRegisterPasskey} isLoading={loading.register}>
                    Continue
                 </Button>
              </div>
           </div>
        </div>
      )}

      <ConfirmDialog 
        isOpen={!!passkeyToDelete}
        onClose={() => setPasskeyToDelete(null)}
        onConfirm={handleDeletePasskey}
        title="Remove Passkey?"
        message="This will remove the passkey from your account. You won't be able to use it to login anymore."
        confirmText="Remove"
        type="danger"
      />

      {/* Rename Passkey Modal */}
      {passkeyToRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-primary" /> 
                  Rename Passkey
                </h3>
                <button onClick={() => setPasskeyToRename(null)} className="text-text-dim hover:text-text">
                   <X className="w-5 h-5" />
                </button>
              </div>
              
              <InputGroup 
                 label="Device Name" 
                 icon={Smartphone}
                 placeholder="e.g. Personal MacBook"
                 value={renameName}
                 onChange={e => setRenameName(e.target.value)}
                 autoFocus
              />

              <div className="flex gap-3 mt-8">
                 <Button variant="outline" className="flex-1" onClick={() => setPasskeyToRename(null)}>Cancel</Button>
                 <Button className="flex-1" onClick={handleRenamePasskey} isLoading={loading.passkeys}>
                    Save Changes
                 </Button>
              </div>
           </div>
        </div>
      )}

      </div>
    </div>
  );
};

export default Profile;
