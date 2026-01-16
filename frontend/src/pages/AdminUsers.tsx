import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { Users, Shield, ArrowLeft, RefreshCw, AlertTriangle, ChevronDown, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';

interface UserData {
  id: string;
  username: string;
  email?: string;
  role: 'kubiq-admin' | 'kubiq-viewer';
  lastLogin?: number;
  createdAt?: number;
  enabled?: boolean;
}

import { useToast } from '../contexts/ToastContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

export default function AdminUsers() {
  const { hasRole, isLoading: authLoading, user: currentUser } = useAuth();
  const { success, error: showError } = useToast();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Confirmation Dialog State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getUsers();
      setUsers(data);
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

  if (!hasRole('kubiq-admin')) {
      return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Header />
      
      <main className="flex-grow container mx-auto px-4 py-8">
        
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
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-black/20 border-b border-gray-700/50">
                            <th className="p-4 text-xs font-semibold text-text-dim uppercase tracking-wider w-[30%]">User</th>
                            <th className="p-4 text-xs font-semibold text-text-dim uppercase tracking-wider text-center w-[15%]">Role</th>
                            <th className="p-4 text-xs font-semibold text-text-dim uppercase tracking-wider text-center w-[20%]">Joined</th>
                            <th className="p-4 text-xs font-semibold text-text-dim uppercase tracking-wider text-center w-[20%]">Last Login</th>
                            <th className="p-4 text-xs font-semibold text-text-dim uppercase tracking-wider text-center w-[10%]">Status</th>
                            <th className="p-4 text-xs font-semibold text-text-dim uppercase tracking-wider text-center w-[5%]">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                        {loading && users.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-text-dim">
                                    <div className="animate-spin w-6 h-6 border-b-2 border-primary rounded-full mx-auto mb-2"></div>
                                    Loading users...
                                </td>
                            </tr>
                        ) : users.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-text-dim">No users found.</td>
                            </tr>
                        ) : (
                            users.map((user) => (
                                <tr key={user.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                                                <Users className="w-4.5 h-4.5 text-primary" />
                                            </div>
                                            <div>
                                                <div className="font-medium text-text">{user.username}</div>
                                                {user.email && <div className="text-xs text-text-dim">{user.email}</div>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center justify-center gap-2">
                                            <Shield className={`w-4 h-4 ${user.role === 'kubiq-admin' ? 'text-yellow-500' : 'text-blue-500'}`} />
                                            <div className="relative">
                                                <select 
                                                    value={user.role}
                                                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                                    disabled={String(user.id) === String(currentUser?.id)}
                                                    className={`bg-black/20 border border-gray-700 rounded pl-3 pr-8 py-1.5 text-sm text-text outline-none appearance-none transition-colors ${
                                                        String(user.id) === String(currentUser?.id) ? 'opacity-50 cursor-not-allowed' : 'focus:border-primary cursor-pointer hover:bg-gray-800'
                                                    }`}
                                                >
                                                    <option value="kubiq-viewer">Viewer</option>
                                                    <option value="kubiq-admin">Admin</option>
                                                </select>
                                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4 text-sm text-text-dim text-center">
                                         {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                                    </td>
                                    <td className="p-4 text-sm text-text-dim text-center">
                                        {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                                    </td>
                                    <td className="p-4 text-center">
                                         <button
                                            onClick={() => handleStatusToggle(user)}
                                            disabled={String(user.id) === String(currentUser?.id)}
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                                                user.enabled !== false 
                                                    ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20' 
                                                    : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                                            } ${String(user.id) === String(currentUser?.id) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                            title={String(user.id) === String(currentUser?.id) ? "Cannot disable yourself" : "Toggle Status"}
                                         >
                                             {user.enabled !== false ? (
                                                 <><CheckCircle className="w-3 h-3" /> Active</>
                                             ) : (
                                                 <><XCircle className="w-3 h-3" /> Disabled</>
                                             )}
                                         </button>
                                    </td>
                                    <td className="p-4 text-center">
                                        {String(user.id) !== String(currentUser?.id) && (
                                            <button 
                                                onClick={() => confirmDelete(user.id)}
                                                className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                                                title="Delete User"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>

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
