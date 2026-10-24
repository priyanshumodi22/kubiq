
import React, { useState, useEffect, useRef, useId } from 'react';
import { Link } from 'react-router-dom';
import { startRegistration } from '@simplewebauthn/browser';
import { apiClient, type PasskeyAuthenticatorAttachment } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  User,
  Shield,
  Key,
  Smartphone,
  Mail,
  Lock,
  Fingerprint,
  Plus,
  X,
  CheckCircle2,
  ArrowLeft,
  Edit2,
  ExternalLink,
  Camera,
  BadgeCheck,
  Crop,
  ZoomIn,
  Move
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { readAvatarFile } from '../utils/readAvatarFile';
import { ProfilePasskeys, type ProfilePasskey } from './ProfilePasskeys';

// --- Utility for Tailwind Classes ---
function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

type AvatarEditor = {
  source: string;
  image: HTMLImageElement;
  zoom: number;
  offsetX: number;
  offsetY: number;
};

// --- Icons ---
// Using Lucide icons imported above

// --- Components ---

const SectionHeader = ({ title, description }: { title: string; description: string }) => (
  <div className="mb-6">
    <h2 className="text-2xl font-bold bg-linear-to-r from-primary to-blue-400 bg-clip-text text-transparent">
      {title}
    </h2>
    <p className="text-text-dim text-sm mt-1">{description}</p>
  </div>
);

const InputGroup = ({
  label,
  icon: Icon,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; icon: React.ElementType }) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  return (
  <div className="space-y-2">
    <label htmlFor={inputId} className="text-sm font-medium text-text-dim ml-1">{label}</label>
    <div className="relative group">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors">
        <Icon className="w-5 h-5" />
      </div>
      <input
        id={inputId}
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
};

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
  const { provider, roles, refreshCurrentUser } = useAuth();
  const isNative = provider === 'native';
  const [activeTab, setActiveTab] = useState<'details' | 'security'>('details');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarEditor, setAvatarEditor] = useState<AvatarEditor | null>(null);

  // Logic State
  const [profile, setProfile] = useState({ username: '', email: '', avatarUrl: '' });
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [passkeys, setPasskeys] = useState<ProfilePasskey[]>([]);

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
        email: user.email || '',
        avatarUrl: user.avatarUrl || ''
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
      await refreshCurrentUser();
      success('Profile updated successfully');
    } catch (err: any) {
      error(err.response?.data?.message || 'Failed to update');
    } finally {
      setLoading(p => ({ ...p, profile: false }));
    }
  };

  const handleAvatarSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      error('Choose a PNG, JPEG, or WebP image.');
      return;
    }

    try {
      const source = await readAvatarFile(file);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error('Unable to process image'));
        nextImage.src = source;
      });
      setAvatarEditor({ source, image, zoom: 1, offsetX: 0, offsetY: 0 });
    } catch {
      error('Could not prepare that image. Try a smaller image.');
    }
  };

  const applyAvatarCrop = () => {
    if (!avatarEditor) return;
    try {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to prepare image');
      const scale = Math.max(size / avatarEditor.image.width, size / avatarEditor.image.height) * avatarEditor.zoom;
      const width = avatarEditor.image.width * scale;
      const height = avatarEditor.image.height * scale;
      const overflowX = Math.max(0, width - size) / 2;
      const overflowY = Math.max(0, height - size) / 2;
      context.drawImage(
        avatarEditor.image,
        (size - width) / 2 + avatarEditor.offsetX * overflowX,
        (size - height) / 2 + avatarEditor.offsetY * overflowY,
        width,
        height
      );
      const avatarUrl = canvas.toDataURL('image/webp', 0.82);
      if (avatarUrl.length > 360_000) throw new Error('Image is too detailed');
      setProfile(current => ({ ...current, avatarUrl }));
      setAvatarEditor(null);
      success('Display picture cropped. Save changes to apply it.');
    } catch {
      error('Could not prepare that image. Try a smaller image.');
    }
  };

  const firstKubiqRole = roles.find(role => role.toLowerCase().startsWith('kubiq'));
  const currentRole = firstKubiqRole || roles[0] || 'No role assigned';

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

  const handleRegisterPasskey = async (authenticatorAttachment: PasskeyAuthenticatorAttachment) => {
    if (!newPasskeyName.trim()) return error('Please name your device');

    setLoading(p => ({ ...p, register: true }));
    try {
      const options = await apiClient.registerPasskeyOptions(authenticatorAttachment);
      const attResp = await startRegistration({ optionsJSON: options });
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
    } catch {
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
    } catch {
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
        <div className="absolute inset-0 bg-linear-to-br from-bg via-bg to-bg-surface"></div>
        {/* Radial gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05),transparent_50%)]"></div>
        {/* Blur orbs */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 -right-20 w-80 h-80 bg-primary/3 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-1/4 w-72 h-72 bg-primary/4 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="flex items-center gap-4 mb-6 md:mb-8">
          <Link to="/dashboard" className="p-2 bg-bg-surface/30 backdrop-blur-md border border-white/5 rounded-lg hover:bg-white/5 transition-colors group">
            <ArrowLeft className="w-5 h-5 text-text-dim group-hover:text-text" />
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-text">User Settings</h1>
            <p className="text-text-dim text-xs md:text-sm">Manage your account and preferences</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">

          {/* Sidebar Nav */}
          <div className="md:col-span-3 flex flex-row md:flex-col md:self-start gap-4 md:gap-6">
            <div className="w-full shrink-0 min-h-[260px] md:h-[260px] bg-bg-surface/30 backdrop-blur-md border border-white/5 rounded-2xl p-4 md:p-6 flex flex-col items-center justify-center text-center">
              <div className="relative mb-2 md:mb-4 shrink-0">
                <div className="w-16 h-16 md:w-24 md:h-24 overflow-hidden bg-linear-to-br from-primary to-blue-600 rounded-full flex items-center justify-center shadow-xl shadow-blue-500/20 ring-4 ring-bg/50">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt={`${profile.username}'s avatar`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xl md:text-3xl font-bold text-white">{profile.username.substring(0, 2).toUpperCase()}</span>
                  )}
                </div>
                {isNative && (
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full border-2 border-bg bg-primary text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/70"
                    aria-label="Change display picture"
                    title="Change display picture"
                  >
                    <Camera className="w-3.5 h-3.5 mx-auto" />
                  </button>
                )}
                <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleAvatarSelection} />
              </div>
              <h2 className="text-lg md:text-xl font-bold truncate w-full">{profile.username}</h2>
              <div className="flex flex-col gap-1 md:gap-2 mt-1 items-center">
                <span className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-[10px] md:text-xs text-primary font-medium">
                  {currentRole}
                </span>
                {!isNative && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-[10px] md:text-xs">
                    <ExternalLink className="w-3 h-3 md:w-3 md:h-3" /> <span className="hidden sm:inline">Managed by SSO</span><span className="sm:hidden">SSO</span>
                  </span>
                )}
              </div>
            </div>

            <nav className="w-full flex flex-col justify-center space-y-2">
              {[
                { id: 'details', label: 'Personal Details', icon: User },
                { id: 'security', label: 'Login & Security', icon: Shield },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-xl transition-all duration-200 text-sm md:text-base",
                    activeTab === tab.id
                      ? "bg-primary text-white shadow-lg shadow-blue-500/20 font-medium"
                      : "text-text-dim hover:bg-white/5 hover:text-text"
                  )}
                >
                  <tab.icon className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Main Content */}
          <div className="md:col-span-9 md:max-w-3xl">
            <div className="bg-bg-surface/30 backdrop-blur-md border border-white/5 rounded-3xl p-6 md:p-7 relative overflow-hidden">
              {/* Background Glow */}
              <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />

              {activeTab === 'details' && (
                <div className="animate-scale-up max-w-2xl">
                  <SectionHeader
                    title="Personal Information"
                    description="Manage your public profile and contact info."
                  />

                  <form onSubmit={handleUpdateProfile} className="rounded-2xl border border-white/7 bg-black/10 p-5 md:p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <InputGroup
                        label="Username"
                        icon={User}
                        value={profile.username}
                        onChange={e => setProfile({ ...profile, username: e.target.value })}
                        disabled={!isNative}
                      />
                      <InputGroup
                        label="Email Address"
                        icon={Mail}
                        type="email"
                        value={profile.email}
                        onChange={e => setProfile({ ...profile, email: e.target.value })}
                        disabled={!isNative}
                      />
                    </div>

                    <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-xs text-text-dim">
                        <BadgeCheck className="h-4 w-4 text-primary" />
                        {isNative ? 'Your display picture and profile are stored securely in kubiq.' : 'Profile details are managed by your identity provider.'}
                      </div>
                      <Button type="submit" isLoading={loading.profile} disabled={!isNative} className="self-end">
                        {isNative ? 'Save Changes' : 'Managed externally'}
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="animate-scale-up">

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
                        onChange={e => setPasswords({ ...passwords, current: e.target.value })}
                        disabled={!isNative}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <InputGroup
                          label="New Password"
                          icon={Key}
                          type="password"
                          value={passwords.new}
                          onChange={e => setPasswords({ ...passwords, new: e.target.value })}
                          disabled={!isNative}
                        />
                        <InputGroup
                          label="Confirm New Password"
                          icon={CheckCircle2}
                          type="password"
                          value={passwords.confirm}
                          onChange={e => setPasswords({ ...passwords, confirm: e.target.value })}
                          disabled={!isNative}
                        />
                      </div>
                      <div className="flex justify-end pt-2">
                        <Button type="submit" isLoading={loading.password} disabled={!isNative}>
                          {isNative ? 'Update Password' : 'Managed externally'}
                        </Button>
                      </div>
                    </form>
                  </section>

                  {/* Passkeys Section */}
                  <section className="mt-16 border-t border-white/10 pt-10">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                          <Fingerprint className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold">Passkeys</h3>
                          <p className="text-text-dim text-sm">Use Face ID, fingerprint, Windows Hello, or a security key.</p>
                        </div>
                      </div>
                      <Button variant="outline" onClick={() => setShowPasskeyModal(true)} disabled={!isNative} className="w-full sm:w-auto">
                        <Plus className="w-4 h-4 shrink-0" /> Add Passkey
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ProfilePasskeys loading={loading.passkeys} passkeys={passkeys} isNative={isNative} onRename={startRenamePasskey} onDelete={confirmDeletePasskey} />
                    </div>
                  </section>

                </div>
              )}
            </div>
          </div>
        </div>

        {/* Passkey Modal */}
        {avatarEditor && (() => {
          const frameSize = 248;
          const scale = Math.max(frameSize / avatarEditor.image.width, frameSize / avatarEditor.image.height) * avatarEditor.zoom;
          const width = avatarEditor.image.width * scale;
          const height = avatarEditor.image.height * scale;
          const overflowX = Math.max(0, width - frameSize) / 2;
          const overflowY = Math.max(0, height - frameSize) / 2;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-bg-surface shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex items-start justify-between border-b border-white/8 px-6 py-5">
                  <div>
                    <div className="flex items-center gap-2 text-primary"><Crop className="h-5 w-5" /><span className="text-xs font-semibold tracking-[0.16em] uppercase">Display picture</span></div>
                    <h3 className="mt-1 text-xl font-bold text-text">Crop your photo</h3>
                    <p className="mt-1 text-sm text-text-dim">Adjust the framing before it becomes your kubiq display picture.</p>
                  </div>
                  <button type="button" onClick={() => setAvatarEditor(null)} className="rounded-lg p-2 text-text-dim transition-colors hover:bg-white/5 hover:text-text" aria-label="Close photo editor"><X className="h-5 w-5" /></button>
                </div>
                <div className="grid gap-7 p-6 md:grid-cols-[248px_1fr] md:items-center">
                  <div className="relative mx-auto h-[248px] w-[248px] overflow-hidden rounded-full border-4 border-primary/40 bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
                    <img
                      src={avatarEditor.source}
                      alt="Crop preview"
                      className="absolute max-w-none select-none"
                      style={{ width, height, left: frameSize / 2 + avatarEditor.offsetX * overflowX, top: frameSize / 2 + avatarEditor.offsetY * overflowY, transform: 'translate(-50%, -50%)' }}
                    />
                    <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/30" />
                  </div>
                  <div className="space-y-5">
                    <label className="block">
                      <span className="mb-2 flex items-center gap-2 text-sm font-medium text-text"><ZoomIn className="h-4 w-4 text-primary" />Zoom</span>
                      <input aria-label="Zoom photo" type="range" min="1" max="2.5" step="0.05" value={avatarEditor.zoom} onChange={event => setAvatarEditor(current => current ? { ...current, zoom: Number(event.target.value) } : current)} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-primary" />
                    </label>
                    <label className="block">
                      <span className="mb-2 flex items-center gap-2 text-sm font-medium text-text"><Move className="h-4 w-4 text-primary" />Move horizontally</span>
                      <input aria-label="Move photo horizontally" type="range" min="-1" max="1" step="0.05" value={avatarEditor.offsetX} onChange={event => setAvatarEditor(current => current ? { ...current, offsetX: Number(event.target.value) } : current)} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-primary" />
                    </label>
                    <label className="block">
                      <span className="mb-2 flex items-center gap-2 text-sm font-medium text-text"><Move className="h-4 w-4 text-primary" />Move vertically</span>
                      <input aria-label="Move photo vertically" type="range" min="-1" max="1" step="0.05" value={avatarEditor.offsetY} onChange={event => setAvatarEditor(current => current ? { ...current, offsetY: Number(event.target.value) } : current)} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-primary" />
                    </label>
                  </div>
                </div>
                <div className="flex flex-col-reverse gap-3 border-t border-white/8 px-6 py-5 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setAvatarEditor(null)}>Cancel</Button>
                  <Button type="button" onClick={applyAvatarCrop}>Use this picture</Button>
                </div>
              </div>
            </div>
          );
        })()}

        {showPasskeyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-bg-surface border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Fingerprint className="w-5 h-5 text-primary" />
                  Name your passkey
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

              <p className="mt-5 text-sm leading-6 text-text-dim">Use this device for Face ID, fingerprint, Windows Hello, or your device unlock. Choose another device for a USB, NFC, or nearby-device passkey.</p>

              <div className="grid grid-cols-2 gap-3 mt-8">
                <Button variant="outline" className="w-full" onClick={() => setShowPasskeyModal(false)}>Cancel</Button>
                <Button variant="outline" className="w-full" onClick={() => handleRegisterPasskey('cross-platform')} isLoading={loading.register}>
                  Another device
                </Button>
                <Button className="col-span-2 w-full" onClick={() => handleRegisterPasskey('platform')} isLoading={loading.register}>
                  Use this device
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
            <div className="bg-bg-surface border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
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
