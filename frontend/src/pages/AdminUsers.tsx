import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { Users, Shield, ArrowLeft, RefreshCw, AlertTriangle, ChevronDown, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { AdminNamespaceScope } from './AdminNamespaceScope';
import { Link, Navigate } from 'react-router-dom';

export interface UserData {
    id: string;
    username: string;
    email?: string;
    role: 'kubiq-admin' | 'kubiq-viewer';
    allowedNamespaces?: string[];
    lastLogin?: number;
    createdAt?: number;
    enabled?: boolean;
}

import { useToast } from '../contexts/ToastContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

function UserIdentity({ user }: Readonly<{ user: UserData }>) {
    return <div><div className="font-medium text-text">{user.username}</div>
        {user.email && <div className="text-xs text-text-dim">{user.email}</div>}
    </div>;
}

export default function AdminUsers() {
    const { hasPermission, isLoading: authLoading, user: currentUser } = useAuth();
    const canManageUsers = hasPermission('users.manage');
    const { success, error: showError } = useToast();
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Confirmation Dialog State
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Role dropdown state
    const [openDropdownUserId, setOpenDropdownUserId] = useState<string | null>(null);
    const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

    // Mobile accordion state
    const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

    // Cluster Namespaces from K8s API
    const [clusterNamespaces, setClusterNamespaces] = useState<string[]>([]);

    // Namespace Scope Editing State
    const [editingNsUserId, setEditingNsUserId] = useState<string | null>(null);
    const [selectedNsList, setSelectedNsList] = useState<string[]>([]);
    const [customNsInput, setCustomNsInput] = useState<string>('');

    const handleStartEditNs = (user: UserData) => {
        if (user.role === 'kubiq-admin') return;
        setEditingNsUserId(user.id);
        setSelectedNsList(user.allowedNamespaces ? [...user.allowedNamespaces] : []);
        setCustomNsInput('');
    };

    const toggleNamespaceSelect = (nsName: string) => {
        const clean = nsName.trim().toLowerCase();
        if (!clean) return;
        if (selectedNsList.includes(clean)) {
            setSelectedNsList(selectedNsList.filter(n => n !== clean));
        } else {
            setSelectedNsList([...selectedNsList, clean]);
        }
    };

    const handleAddCustomNs = () => {
        const parts = customNsInput.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (parts.length === 0) return;
        const next = Array.from(new Set([...selectedNsList, ...parts]));
        setSelectedNsList(next);
        setCustomNsInput('');
    };

    const handleSaveNs = async (userId: string) => {
        try {
            await apiClient.updateUserAllowedNamespaces(userId, selectedNsList);
            setUsers(users.map(u => u.id === userId ? { ...u, allowedNamespaces: selectedNsList } : u));
            setEditingNsUserId(null);
            success('Allowed namespaces updated successfully!');
        } catch (err: any) {
            showError(err.response?.data?.message || 'Failed to update namespaces');
        }
    };

    useEffect(() => {
        loadUsers();
    }, [authLoading, canManageUsers]);

    const loadUsers = async () => {
        if (authLoading || !canManageUsers) return;
        setLoading(true);
        setError(null);
        try {
            const [data, nsList] = await Promise.allSettled([
                apiClient.getUsers(),
                apiClient.getKubernetesNamespaces()
            ]);
            if (data.status === 'fulfilled') {
                setUsers(data.value);
            } else {
                throw data.reason;
            }
            if (nsList.status === 'fulfilled' && Array.isArray(nsList.value)) {
                setClusterNamespaces(nsList.value);
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        try {
            await apiClient.updateUserRole(userId, newRole);
            setUsers(users.map(u => u.id === userId ? { ...u, role: newRole as any } : u));
            success('User role updated successfully');
        } catch (err: any) {
            showError('Failed to update role: ' + (err.response?.data?.message || err.message));
            loadUsers();
        }
    };

    const handleStatusToggle = async (user: UserData) => {
        // Safe comparison
        if (String(user.id) === String(currentUser?.id)) return;
        try {
            const newStatus = !user.enabled;
            await apiClient.updateUserStatus(user.id, newStatus);
            setUsers(users.map(u => u.id === user.id ? { ...u, enabled: newStatus } : u));
            success(`User ${newStatus ? 'enabled' : 'disabled'} successfully`);
        } catch (err: any) {
            showError('Failed to update status: ' + (err.response?.data?.message || err.message));
        }
    };

    const confirmDelete = (userId: string) => {
        setUserToDelete(userId);
        setConfirmOpen(true);
    };

    const handleDeleteUser = async () => {
        if (!userToDelete) return;

        setIsDeleting(true);
        try {
            await apiClient.deleteUser(userToDelete);
            setUsers(users.filter(u => u.id !== userToDelete));
            success('User deleted successfully');
            setConfirmOpen(false);
        } catch (err: any) {
            showError('Failed to delete user: ' + (err.response?.data?.message || err.message));
        } finally {
            setIsDeleting(false);
        }
    };

    if (authLoading) return null;

    if (!canManageUsers) {
        return <Navigate to="/dashboard" replace />;
    }

    const emptyUsersRow = <tr><td colSpan={6} className="p-8 text-center text-text-dim">
        {loading ? <><div className="animate-spin w-6 h-6 border-b-2 border-primary rounded-full mx-auto mb-2" />{'Loading users...'}</> : 'No users found.'}
    </td></tr>;

    return (
        <div className="min-h-screen bg-bg flex flex-col">
            <Header />

            <main className="grow container mx-auto px-4 py-8">

                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <Link to="/dashboard" className="p-2 bg-bg-surface border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors">
                            <ArrowLeft className="w-5 h-5 text-gray-400" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-text flex items-center gap-2">
                                <Users className="w-7 h-7 text-primary" />
                                User Management
                            </h1>
                            <p className="text-text-dim text-sm">Manage user access and roles</p>
                        </div>
                    </div>

                    <button
                        onClick={loadUsers}
                        title="Refresh"
                        className="p-2 bg-bg-surface border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors"
                    >
                        <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl mb-6 flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5" />
                        {error}
                    </div>
                )}

                <div className="bg-bg-surface border border-gray-800 rounded-xl overflow-hidden shadow-xl animate-scale-up">
                    <div className="overflow-x-hidden sm:overflow-x-auto">
                        <table className="w-full text-left border-collapse block sm:table">
                            <thead className="hidden sm:table-header-group">
                                <tr className="bg-black/20 border-b border-gray-700/50 block sm:table-row">
                                    <th className="p-4 text-xs font-semibold text-text-dim uppercase tracking-wider sm:w-[25%] block sm:table-cell">User</th>
                                    <th className="p-4 text-xs font-semibold text-text-dim uppercase tracking-wider text-center sm:w-[15%] block sm:table-cell">Role</th>
                                    <th className="p-4 text-xs font-semibold text-text-dim uppercase tracking-wider text-center sm:w-[20%] block sm:table-cell">Allowed Namespaces (RBAC Scope)</th>
                                    <th className="p-4 text-xs font-semibold text-text-dim uppercase tracking-wider text-center sm:w-[15%] block sm:table-cell">Joined</th>
                                    <th className="p-4 text-xs font-semibold text-text-dim uppercase tracking-wider text-center sm:w-[15%] block sm:table-cell">Status</th>
                                    <th className="p-4 text-xs font-semibold text-text-dim uppercase tracking-wider text-center sm:w-[10%] block sm:table-cell">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/50 block sm:table-row-group">
                                {users.length === 0 ? emptyUsersRow : (
                                    users.map((user) => (
                                        <tr key={user.id} className="flex flex-col sm:table-row hover:bg-white/5 transition-colors group border-b sm:border-0 border-gray-800/50">
                                            <td className="p-4 flex items-center justify-between sm:table-cell bg-black/10 sm:bg-transparent">
                                              <button type="button" aria-label={`Expand ${user.username} details`} aria-expanded={expandedUserId === user.id}
                                                className="w-full text-left flex items-center justify-between focus-visible:outline focus-visible:outline-primary"
                                                onClick={() => setExpandedUserId(prev => prev === user.id ? null : user.id)}>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                                                        <Users className="w-4.5 h-4.5 text-primary" />
                                                    </div>
                                                    <UserIdentity user={user} />
                                                </div>
                                                <ChevronDown className={`sm:hidden w-5 h-5 text-gray-500 transition-transform ${expandedUserId === user.id ? 'rotate-180' : ''}`} />
                                              </button>
                                            </td>
                                            <td className={`p-3 px-4 sm:p-4 items-center justify-between sm:table-cell border-t sm:border-0 border-gray-800/30 ${expandedUserId === user.id ? 'flex' : 'hidden sm:table-cell'}`}>
                                                <span className="sm:hidden text-xs text-text-dim uppercase tracking-wider font-semibold">Role</span>
                                                <div className="flex items-center sm:justify-center gap-2">
                                                    <Shield className={`w-4 h-4 ${user.role === 'kubiq-admin' ? 'text-yellow-500' : 'text-blue-500'}`} />
                                                    <button
                                                        onClick={(e) => {
                                                            if (String(user.id) === String(currentUser?.id)) return;
                                                            if (openDropdownUserId === user.id) {
                                                                setOpenDropdownUserId(null);
                                                            } else {
                                                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                setDropdownRect({ top: r.bottom + 4, left: r.left, width: r.width });
                                                                setOpenDropdownUserId(user.id);
                                                            }
                                                        }}
                                                        disabled={String(user.id) === String(currentUser?.id)}
                                                        className={`flex items-center gap-2 px-3 py-1.5 bg-black/20 border border-gray-700 rounded-lg text-sm text-text transition-colors ${String(user.id) === String(currentUser?.id)
                                                            ? 'opacity-50 cursor-not-allowed'
                                                            : 'hover:border-primary/50 cursor-pointer'
                                                            }`}
                                                    >
                                                        <span>{user.role === 'kubiq-admin' ? 'Admin' : 'Viewer'}</span>
                                                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${openDropdownUserId === user.id ? 'rotate-180' : ''}`} />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className={`p-3 px-4 sm:p-4 items-center justify-between sm:table-cell border-t sm:border-0 border-gray-800/30 text-sm text-text-dim sm:text-center ${expandedUserId === user.id ? 'flex' : 'hidden sm:table-cell'}`}>
                                                <span className="sm:hidden text-xs text-text-dim uppercase tracking-wider font-semibold">Allowed Namespaces</span>
                                                <div className="flex flex-col items-start sm:items-center gap-1.5 max-w-full">
                                                    <AdminNamespaceScope user={user} editingNsUserId={editingNsUserId} selectedNsList={selectedNsList} customNsInput={customNsInput} clusterNamespaces={clusterNamespaces} toggleNamespaceSelect={toggleNamespaceSelect} setCustomNsInput={setCustomNsInput} handleAddCustomNs={handleAddCustomNs} setEditingNsUserId={setEditingNsUserId} handleSaveNs={handleSaveNs} handleStartEditNs={handleStartEditNs} />
                                                </div>
                                            </td>
                                            <td className={`p-3 px-4 sm:p-4 items-center justify-between sm:table-cell border-t sm:border-0 border-gray-800/30 text-sm text-text-dim sm:text-center ${expandedUserId === user.id ? 'flex' : 'hidden sm:table-cell'}`}>
                                                <span className="sm:hidden text-xs text-text-dim uppercase tracking-wider font-semibold">Joined</span>
                                                <span>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}</span>
                                            </td>
                                            <td className={`p-3 px-4 sm:p-4 items-center justify-between sm:table-cell border-t sm:border-0 border-gray-800/30 sm:text-center ${expandedUserId === user.id ? 'flex' : 'hidden sm:table-cell'}`}>
                                                <span className="sm:hidden text-xs text-text-dim uppercase tracking-wider font-semibold">Status</span>
                                                <button
                                                    onClick={() => handleStatusToggle(user)}
                                                    disabled={String(user.id) === String(currentUser?.id)}
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${user.enabled === false
                                                        ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                                                        : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                                                        } ${String(user.id) === String(currentUser?.id) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                                    title={String(user.id) === String(currentUser?.id) ? "Cannot disable yourself" : "Toggle Status"}
                                                >
                                                    {user.enabled === false ? (
                                                        <><XCircle className="w-3 h-3" /> Disabled</>
                                                    ) : (
                                                        <><CheckCircle className="w-3 h-3" /> Active</>
                                                    )}
                                                </button>
                                            </td>
                                            <td className={`p-3 px-4 sm:p-4 items-center justify-between sm:table-cell border-t sm:border-0 border-gray-800/30 sm:text-center ${expandedUserId === user.id ? 'flex' : 'hidden sm:table-cell'}`}>
                                                <span className="sm:hidden text-xs text-text-dim uppercase tracking-wider font-semibold">Actions</span>
                                                <div>
                                                    {String(user.id) === String(currentUser?.id) ? (
                                                        <span className="sm:hidden text-sm text-text-dim">Current User</span>
                                                    ) : (
                                                        <button
                                                            onClick={() => confirmDelete(user.id)}
                                                            className="flex items-center gap-2 p-1.5 px-3 sm:px-1.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                                            title="Delete User"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                            <span className="sm:hidden text-sm font-medium">Delete</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Role dropdown portal */}
                {openDropdownUserId && dropdownRect && createPortal(
                    <>
                        {/* Transparent overlay — click anywhere outside to close */}
                        <button type="button" aria-label="Close role choices" className="fixed inset-0 z-9998" onClick={() => setOpenDropdownUserId(null)} />
                        {/* Dropdown panel */}
                        <div
                            style={{ position: 'fixed', top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width, zIndex: 9999 }}
                            className="bg-bg-surface border border-white/10 rounded-xl shadow-xl overflow-hidden"
                        >
                            {[
                                { value: 'kubiq-viewer', label: 'Viewer' },
                                { value: 'kubiq-admin', label: 'Admin' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        handleRoleChange(openDropdownUserId, opt.value);
                                        setOpenDropdownUserId(null);
                                    }}
                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-primary/20 ${users.find(u => u.id === openDropdownUserId)?.role === opt.value
                                        ? 'text-primary font-medium' : 'text-gray-300'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </>,
                    document.body
                )}

                <ConfirmDialog
                    isOpen={confirmOpen}
                    onClose={() => setConfirmOpen(false)}
                    onConfirm={handleDeleteUser}
                    title="Delete User"
                    message="Are you sure you want to delete this user? This action cannot be undone."
                    confirmText="Delete"
                    type="danger"
                    isLoading={isDeleting}
                />
            </main>
            <Footer />
        </div>
    );
}
