import { FormEvent, useEffect, useState } from 'react';
import {
  ChevronDown,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  Loader2,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { KubiAiSettings } from '../components/KubiAiSettings';
import { KubiAvatar } from '../components/KubiAvatar';
import { apiClient } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

type Tab = 'overview' | 'users' | 'roles' | 'authentication' | 'kubi' | 'configuration';
type Role = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  builtIn?: boolean;
};
type Permission = { key: string; label: string };
type ManagedUser = {
  id: string;
  username: string;
  email?: string;
  roles?: string[];
  enabled?: boolean;
  allowedNamespaces?: string[];
  type?: string;
};
const tabs: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard; kubiAvatar?: boolean }> =
  [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'roles', label: 'Roles & permissions', icon: ShieldCheck },
    { id: 'authentication', label: 'Authentication', icon: KeyRound },
    { id: 'kubi', label: 'kubi', icon: LayoutDashboard, kubiAvatar: true },
    { id: 'configuration', label: 'System configuration', icon: SlidersHorizontal },
  ];

function PermissionPicker({
  permissions,
  selected,
  setSelected,
}: Readonly<{
  permissions: Permission[];
  selected: string[];
  setSelected: (next: string[]) => void;
}>) {
  const groups = permissions.reduce<Record<string, Permission[]>>((result, item) => {
    const group = item.key.split('.')[0];
    (result[group] ||= []).push(item);
    return result;
  }, {});
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-black/10 px-4">
      {Object.entries(groups).map(([group, items], index) => {
        const selectedCount = items.filter((item) => selected.includes(item.key)).length;
        return (
          <details
            key={group}
            open={selectedCount > 0 || index === 0}
            className="group border-b border-white/8 last:border-0"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left marker:hidden">
              <span>
                <b className="block text-xs font-semibold tracking-[0.04em] text-text">
                  {group.toLowerCase()}
                </b>
                <span className="mt-1 block text-xs text-text-dim">
                  {selectedCount} of {items.length} permission{items.length === 1 ? '' : 's'}{' '}
                  selected
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-text-dim transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-1 border-t border-white/8 pb-4 pt-3 sm:grid-cols-2">
              {items.map((permission) => (
                <label
                  key={permission.key}
                  className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-sm text-text-dim transition hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(permission.key)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, permission.key]
                          : selected.filter((key) => key !== permission.key)
                      )
                    }
                  />
                  <span>
                    <b className="block text-text">{permission.key}</b>
                    {permission.label}
                  </span>
                </label>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export default function SystemAdministration() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    roles: [] as string[],
  });
  const [newRole, setNewRole] = useState({
    name: '',
    description: '',
    permissions: [] as string[],
  });
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [namespaceDialog, setNamespaceDialog] = useState<ManagedUser | null>(null);
  const [availableNamespaces, setAvailableNamespaces] = useState<string[]>([]);
  const [namespaceLoading, setNamespaceLoading] = useState(false);

  const requiredTabPermission: Record<Tab, string> = {
    overview: 'system.read', users: 'users.manage', roles: 'roles.manage',
    authentication: 'auth.configure', kubi: 'kubi.configure', configuration: 'system.configure',
  };
  const visibleTabs = tabs.filter((tab) => hasPermission(requiredTabPermission[tab.id]));

  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some((tab) => tab.id === activeTab)) setActiveTab(visibleTabs[0].id);
  }, [activeTab, visibleTabs]);

  const loadRoles = async () => {
    const [nextRoles, nextPermissions] = await Promise.all([
      apiClient.getRbacRoles(),
      apiClient.getRbacPermissions(),
    ]);
    setRoles(nextRoles);
    setPermissions(nextPermissions);
  };
  const loadUsers = async () => {
    setUsers(await apiClient.getUsers());
  };
  useEffect(() => {
    if (!['users', 'roles'].includes(activeTab)) return;
    setLoading(true);
    setMessage('');
    (activeTab === 'users' ? Promise.all([loadUsers(), loadRoles()]) : loadRoles())
      .catch((error: any) =>
        setMessage(error?.response?.data?.message || 'Administration data could not be loaded.')
      )
      .finally(() => setLoading(false));
  }, [activeTab]);

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    try {
      const created = await apiClient.createUser(newUser);
      setUsers((current) => [...current, created]);
      setNewUser({ username: '', email: '', password: '', roles: [] });
      setShowCreateUser(false);
      setMessage('User created. The temporary password is never retained by kubiq.');
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'The user could not be created.');
    }
  };
  const toggleStatus = async (user: ManagedUser) => {
    try {
      const updated = await apiClient.updateUserStatus(user.id, user.enabled === false);
      setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'The account status could not be changed.');
    }
  };
  const toggleRole = async (user: ManagedUser, role: string) => {
    const current = user.roles || [];
    const next = current.includes(role)
      ? current.filter((item) => item !== role)
      : [...current, role];
    if (!next.length) return setMessage('A user must retain at least one role.');
    try {
      const updated = await apiClient.updateUserRoles(user.id, next);
      setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'Role assignment could not be changed.');
    }
  };
  const resetPassword = async (user: ManagedUser) => {
    const password = window.prompt(
      `Set a temporary password for ${user.username} (12 characters minimum).`
    );
    if (password === null) return;
    if (password.length < 12) return setMessage('Password must be at least 12 characters.');
    try {
      await apiClient.resetUserPassword(user.id, password);
      setMessage(
        `Temporary password set for ${user.username}; it must be replaced at first sign-in.`
      );
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'Password reset failed.');
    }
  };
  const openNamespaceDialog = async (user: ManagedUser) => {
    if (user.type === 'keycloak')
      return setMessage(
        'Keycloak namespace claims are not configured yet, so kubiq blocks this change rather than creating an unenforced scope.'
      );
    setNamespaceDialog(user);
    setNamespaceLoading(true);
    try {
      const namespaces = await apiClient.getKubernetesNamespaces();
      setAvailableNamespaces(
        [...new Set((Array.isArray(namespaces) ? namespaces : []).map(String))].sort((a, b) =>
          a.localeCompare(b)
        )
      );
    } catch (error: any) {
      setAvailableNamespaces([]);
      setMessage(error?.response?.data?.message || 'Cluster namespaces could not be loaded.');
    } finally {
      setNamespaceLoading(false);
    }
  };
  const saveNamespaces = async (event: FormEvent) => {
    event.preventDefault();
    if (!namespaceDialog) return;
    try {
      const namespaces = namespaceDialog.allowedNamespaces || [];
      const updated = await apiClient.updateUserAllowedNamespaces(namespaceDialog.id, namespaces);
      setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(`Namespace access updated for ${namespaceDialog.username}.`);
      setNamespaceDialog(null);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'Namespace scope could not be changed.');
    }
  };
  const deleteUser = async (user: ManagedUser) => {
    if (!window.confirm(`Delete ${user.username}? This cannot be undone.`)) return;
    try {
      await apiClient.deleteUser(user.id);
      setUsers((items) => items.filter((item) => item.id !== user.id));
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'The user could not be deleted.');
    }
  };
  const saveRole = async (event: FormEvent) => {
    event.preventDefault();
    const data = editingRole || newRole;
    try {
      const saved = editingRole
        ? await apiClient.updateRbacRole(editingRole.id, {
            description: data.description,
            permissions: data.permissions,
          })
        : await apiClient.createRbacRole(data);
      setRoles((items) =>
        editingRole ? items.map((item) => (item.id === saved.id ? saved : item)) : [...items, saved]
      );
      setEditingRole(null);
      setNewRole({ name: '', description: '', permissions: [] });
      setMessage('Role permissions saved and audited.');
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'Role could not be saved.');
    }
  };
  const deleteRole = async (role: Role) => {
    if (role.builtIn || !window.confirm(`Delete custom role ${role.name}?`)) return;
    try {
      await apiClient.deleteRbacRole(role.id);
      setRoles((items) => items.filter((item) => item.id !== role.id));
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'Role could not be deleted.');
    }
  };
  const syncKeycloak = async () => {
    try {
      const result = await apiClient.syncKeycloakClientRoles();
      setMessage(
        `Keycloak reconciliation created ${result.created.length} missing client role(s) and reported ${result.unexpected?.length || 0} unexpected role(s) without deleting them.`
      );
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'Keycloak reconciliation is unavailable.');
    }
  };

  return (
    <main className="relative z-10 mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Background Effects (matched exactly to AuditLogViewer) */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-linear-to-br from-bg via-bg to-bg-surface" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05),transparent_50%)]" />
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-20 w-80 h-80 bg-primary/3 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-1/4 w-72 h-72 bg-primary/4 rounded-full blur-3xl" />
      </div>
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Administration
        </p>
        <h1 className="mt-2 text-3xl font-bold text-text">System Administration</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-dim">
          Manage kubiq identity, access, provider configuration, and system-wide settings.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <nav
          aria-label="System Administration"
          className="rounded-2xl border border-white/10 bg-bg-surface/80 p-3 shadow-xl shadow-black/10 lg:h-fit"
        >
          {visibleTabs.map((tab) => {
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${activeTab === tab.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-text-dim hover:bg-white/5 hover:text-text'}`}
              >
                {tab.kubiAvatar ? (
                  <KubiAvatar state="idle" size={18} className="opacity-90" />
                ) : (
                  <tab.icon className="h-4 w-4" />
                )}
                {tab.label}
              </button>
            );
          })}
          <div className="my-2 border-t border-white/8" />
          <button
            type="button"
            onClick={() => navigate('/audit-logs')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-text-dim transition hover:bg-white/5 hover:text-text"
          >
            <ClipboardList className="h-4 w-4" />
            Audit history
          </button>
        </nav>
        <section className="rounded-3xl border border-white/10 bg-bg-surface/80 p-5 shadow-2xl shadow-black/15 sm:p-7">
          {message && (
            <p
              role="status"
              className="mb-5 rounded-xl border border-primary/20 bg-primary/6 p-3 text-sm text-text-dim"
            >
              {message}
            </p>
          )}
          {loading && (
            <div className="flex gap-2 py-10 text-text-dim">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading administration data…
            </div>
          )}
          {!loading && activeTab === 'overview' && <SystemOverview />}
          {!loading && activeTab === 'users' && (
            <div>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    Directory
                  </p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight">Users</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-text-dim">
                    Provision identities, apply roles, scope Native access, and manage account
                    status.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateUser((current) => !current)}
                  className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-primary hover:text-white"
                >
                  {showCreateUser ? 'Close creator' : 'Create user'}
                </button>
              </div>
              {showCreateUser && (
                <form
                  onSubmit={createUser}
                  className="mt-7 rounded-2xl border border-primary/25 bg-primary/4 p-5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                        New identity
                      </p>
                      <h3 className="mt-1 font-semibold text-text">Create user</h3>
                    </div>
                    <span className="text-xs text-text-dim">Assign at least one role</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <input
                      value={newUser.username}
                      onChange={(event) =>
                        setNewUser((item) => ({ ...item, username: event.target.value }))
                      }
                      placeholder="Username"
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
                      required
                    />
                    <input
                      value={newUser.email}
                      onChange={(event) =>
                        setNewUser((item) => ({ ...item, email: event.target.value }))
                      }
                      placeholder="Email (optional)"
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
                    />
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(event) =>
                        setNewUser((item) => ({ ...item, password: event.target.value }))
                      }
                      placeholder="Temporary password (12+ chars)"
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {roles.map((role) => (
                      <label
                        key={role.id}
                        className="rounded-lg border border-white/10 px-2 py-1 text-xs text-text-dim"
                      >
                        <input
                          className="mr-1"
                          type="checkbox"
                          checked={newUser.roles.includes(role.name)}
                          onChange={(event) =>
                            setNewUser((item) => ({
                              ...item,
                              roles: event.target.checked
                                ? [...item.roles, role.name]
                                : item.roles.filter((value) => value !== role.name),
                            }))
                          }
                        />
                        {role.name}
                      </label>
                    ))}
                  </div>
                  <button
                    disabled={!newUser.roles.length}
                    className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Create user
                  </button>
                </form>
              )}
              <section className="mt-7 overflow-hidden rounded-3xl border border-white/10 bg-black/10">
                <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 sm:px-6">
                  <div>
                    <h3 className="font-semibold text-text">User directory</h3>
                    <p className="mt-1 text-xs text-text-dim">
                      {users.length} managed account{users.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <div className="divide-y divide-white/8">
                  {users.map((user) => (
                    <article
                      key={user.id}
                      className="px-5 py-5 transition hover:bg-white/[0.025] sm:px-6"
                    >
                      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                        <div className="flex min-w-0 gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-sm font-bold text-primary">
                            {user.username.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <b className="text-text">{user.username}</b>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${user.enabled === false ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}
                              >
                                {user.enabled === false ? 'Disabled' : 'Active'}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-xs text-text-dim">
                              {user.email || 'No email address'} · {user.type || 'native'}
                            </p>
                            <p className="mt-1 text-xs text-text-dim">
                              Namespace scope:{' '}
                              {(user.allowedNamespaces || []).join(', ') || 'No access'}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => toggleStatus(user)}
                            className={`rounded-lg px-2 py-1 text-xs ${user.enabled === false ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}
                          >
                            {user.enabled === false ? 'Enable' : 'Disable'}
                          </button>
                          <button
                            onClick={() => resetPassword(user)}
                            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-text-dim"
                          >
                            Reset password
                          </button>
                          <button
                            onClick={() => openNamespaceDialog(user)}
                            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-text-dim"
                          >
                            Namespaces
                          </button>
                          <button
                            onClick={() => deleteUser(user)}
                            className="rounded-lg border border-red-400/30 px-2 py-1 text-xs text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-col gap-2 border-t border-white/8 pt-4 sm:flex-row sm:items-center">
                        <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-dim">
                          Assigned roles
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {roles.map((role) => (
                            <label
                              key={role.id}
                              className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs text-text-dim transition hover:bg-white/6"
                            >
                              <input
                                className="mr-1"
                                type="checkbox"
                                checked={(user.roles || []).includes(role.name)}
                                onChange={() => toggleRole(user, role.name)}
                              />
                              {role.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    </article>
                  ))}
                  {users.length === 0 && (
                    <p className="py-10 text-center text-sm text-text-dim">
                      No users could be loaded.
                    </p>
                  )}
                </div>
              </section>
            </div>
          )}
          {!loading && activeTab === 'roles' && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Access model
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight">Roles & permissions</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-dim">
                Build custom, least-privilege roles. Assign them directly from the Users directory;
                built-in role definitions remain protected.
              </p>
              <form
                onSubmit={saveRole}
                className="mt-7 rounded-2xl border border-primary/25 bg-primary/4 p-5"
              >
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                      Role builder
                    </p>
                    <h3 className="mt-1 font-semibold text-text">
                      {editingRole ? `Edit ${editingRole.name}` : 'Create custom role'}
                    </h3>
                  </div>
                  <span className="text-xs text-text-dim">
                    Expand only the permission areas you need
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {!editingRole && (
                    <input
                      value={newRole.name}
                      onChange={(event) =>
                        setNewRole((item) => ({ ...item, name: event.target.value }))
                      }
                      placeholder="Role name, e.g. incident-reader"
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
                      required
                    />
                  )}
                  <input
                    value={editingRole ? editingRole.description : newRole.description}
                    onChange={(event) =>
                      editingRole
                        ? setEditingRole({ ...editingRole, description: event.target.value })
                        : setNewRole((item) => ({ ...item, description: event.target.value }))
                    }
                    placeholder="Short purpose"
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  />
                </div>
                <PermissionPicker
                  permissions={permissions}
                  selected={editingRole ? editingRole.permissions : newRole.permissions}
                  setSelected={(next) =>
                    editingRole
                      ? setEditingRole({ ...editingRole, permissions: next })
                      : setNewRole((item) => ({ ...item, permissions: next }))
                  }
                />
                <div className="mt-4 flex gap-2">
                  <button
                    disabled={
                      (editingRole ? editingRole.permissions : newRole.permissions).length === 0
                    }
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Save role
                  </button>
                  {editingRole && (
                    <button
                      type="button"
                      onClick={() => setEditingRole(null)}
                      className="rounded-xl border border-white/10 px-4 py-2 text-sm"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
              <aside className="mt-5 flex flex-col gap-4 rounded-2xl bg-white/[0.025] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-text">Keycloak client roles</h3>
                  <p className="mt-1 text-sm text-text-dim">
                    Reconcile kubiq client roles only; realm roles are never read or changed.
                  </p>
                </div>
                <button
                  onClick={syncKeycloak}
                  className="shrink-0 rounded-xl border border-primary/40 px-4 py-2 text-sm text-primary transition hover:bg-primary/10"
                >
                  Reconcile client roles
                </button>
              </aside>
              <section className="mt-7 overflow-hidden rounded-3xl border border-white/10 bg-black/10">
                <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 sm:px-6">
                  <div>
                    <h3 className="font-semibold text-text">Role directory</h3>
                    <p className="mt-1 text-xs text-text-dim">
                      {roles.length} available role{roles.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <div className="divide-y divide-white/8">
                  {roles.map((role) => (
                    <article
                      key={role.id}
                      className="grid gap-4 px-5 py-5 transition hover:bg-white/[0.025] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start sm:px-6"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-text">{role.name}</h3>
                          {role.builtIn && (
                            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                              Built-in
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-text-dim">{role.description}</p>
                        <p className="mt-3 text-xs leading-5 text-text-dim">
                          {role.permissions.includes('*')
                            ? 'Full kubiq system access (*)'
                            : role.permissions.join(' · ')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {role.builtIn ? (
                          <span className="text-xs text-text-dim">Protected role</span>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditingRole(role)}
                              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-text-dim transition hover:border-primary/40 hover:text-text"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteRole(role)}
                              className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/10"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}
          {!loading && activeTab === 'authentication' && <AuthenticationStatus />}
          {!loading && activeTab === 'kubi' && <KubiAiSettings />}
          {!loading && activeTab === 'configuration' && <SystemConfiguration />}
        </section>
      </div>
      {namespaceDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={saveNamespaces}
            role="dialog"
            aria-modal="true"
            aria-labelledby="namespace-dialog-title"
            className="w-full max-w-2xl rounded-2xl border border-primary/30 bg-bg-surface p-6 shadow-2xl shadow-black/50"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Access scope
            </p>
            <h2 id="namespace-dialog-title" className="mt-2 text-xl font-bold text-text">
              Namespaces for {namespaceDialog.username}
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-dim">
              Choose the namespaces this Native user may access. An empty selection removes
              namespace access.
            </p>
            <div className="mt-5 rounded-xl border border-white/10 bg-black/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-text">Cluster namespaces</p>
                <div className="flex gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setNamespaceDialog((user) =>
                        user ? { ...user, allowedNamespaces: availableNamespaces } : user
                      )
                    }
                    className="text-primary hover:text-primary/80"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setNamespaceDialog((user) =>
                        user ? { ...user, allowedNamespaces: [] } : user
                      )
                    }
                    className="text-text-dim hover:text-text"
                  >
                    Clear
                  </button>
                </div>
              </div>
              {namespaceLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-text-dim">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading cluster namespaces…
                </div>
              ) : availableNamespaces.length ? (
                <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {availableNamespaces.map((namespace) => (
                    <label
                      key={namespace}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/8 px-3 py-2 text-sm text-text-dim transition hover:border-primary/40 hover:bg-white/4"
                    >
                      <input
                        type="checkbox"
                        checked={(namespaceDialog.allowedNamespaces || []).includes(namespace)}
                        onChange={(event) =>
                          setNamespaceDialog((user) =>
                            user
                              ? {
                                  ...user,
                                  allowedNamespaces: event.target.checked
                                    ? [...(user.allowedNamespaces || []), namespace]
                                    : (user.allowedNamespaces || []).filter(
                                        (item) => item !== namespace
                                      ),
                                }
                              : user
                          )
                        }
                      />
                      {namespace}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="py-7 text-center text-sm text-text-dim">
                  No cluster namespaces are available to select.
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setNamespaceDialog(null)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-text-dim transition hover:bg-white/5 hover:text-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={namespaceLoading}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save access
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function SystemOverview() {
  const [items, setItems] = useState<Array<{ title: string; text: string }>>([]);
  useEffect(() => {
    Promise.allSettled([
      apiClient.getAuthConfig(),
      apiClient.getProStatus(),
      apiClient.getKubiStatus(),
      apiClient.getSystemStats(),
      apiClient.getAuditLogs(),
    ]).then((results) => {
      const value = (index: number) =>
        results[index].status === 'fulfilled'
          ? (results[index] as PromiseFulfilledResult<any>).value
          : null;
      const auth = value(0);
      const pro = value(1);
      const kubi = value(2);
      const stats = value(3);
      const audit = value(4);
      setItems([
        {
          title: 'Authentication',
          text: auth?.provider
            ? `${auth.provider} is the active provider.`
            : 'Provider status unavailable.',
        },
        {
          title: 'kubiq Pro',
          text: pro?.active ? 'Active and available.' : 'No active Pro license.',
        },
        {
          title: 'kubi',
          text: kubi?.providerConfigured
            ? `Configured with ${kubi.provider}.`
            : 'Provider needs configuration.',
        },
        {
          title: 'System',
          text: stats ? 'Live system metrics are available.' : 'Metrics unavailable.',
        },
        {
          title: 'Recent administration',
          text: Array.isArray(audit)
            ? `${audit.length} retained audit records loaded.`
            : 'Audit access unavailable.',
        },
      ]);
    });
  }, []);
  return (
    <div>
      <h2 className="text-2xl font-bold">Administration overview</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article key={item.title} className="rounded-2xl border border-white/10 bg-black/10 p-5">
            <h3 className="font-semibold text-text">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-text-dim">{item.text}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function AuthenticationStatus() {
  const [config, setConfig] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    apiClient
      .getAuthConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
    apiClient
      .getKeycloakHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);
  const requestPreview = async (target: 'native' | 'keycloak') => {
    try {
      setPreview(await apiClient.previewAuthMigration(target));
      setMessage('Migration preview recorded in audit history.');
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'Migration preview is unavailable.');
    }
  };
  return (
    <div className="grid gap-6">
      <h2 className="text-2xl font-bold tracking-tight">Authentication</h2>
      <p className="max-w-2xl text-sm leading-6 text-text-dim">
        Exactly one provider is active for a deployment. Changing providers is
        deployment-controlled, never a browser-side toggle.
      </p>
      <article className="rounded-3xl border border-white/10 bg-black/10 p-6 shadow-inner shadow-black/10">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-dim">
          Active provider
        </p>
        <p className="mt-3 text-lg font-semibold text-text">
          {config?.provider || 'Not configured'}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => requestPreview('native')}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm transition hover:border-primary/40 hover:bg-white/4"
          >
            Preview Native
          </button>
          <button
            onClick={() => requestPreview('keycloak')}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm transition hover:border-primary/40 hover:bg-white/4"
          >
            Preview Keycloak
          </button>
        </div>
      </article>
      {preview && (
        <article className="rounded-3xl border border-primary/20 bg-primary/4 p-6 shadow-inner shadow-primary/5">
          <h3 className="font-semibold text-text">
            Migration: {preview.current || 'unconfigured'} → {preview.target}
          </h3>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-text-dim">
            {preview.requirements.map((item: string) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-text-dim">Rollback: {preview.rollback}</p>
        </article>
      )}
      {message && (
        <p
          role="status"
          className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-text-dim"
        >
          {message}
        </p>
      )}
      {health && (
        <article className="rounded-3xl border border-white/10 bg-black/10 p-6 shadow-inner shadow-black/10">
          <h3 className="font-semibold text-text">Keycloak Admin API</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-dim">
            {health.selected
              ? health.reachable
                ? 'Selected, configured, and reachable.'
                : health.configured
                  ? 'Configured but unreachable. No provisioning actions are attempted.'
                  : 'Selected but the server-only service account is not configured.'
              : 'Not selected for this deployment.'}
          </p>
        </article>
      )}
    </div>
  );
}

function SystemConfiguration() {
  const [mounts, setMounts] = useState<string[]>([]);
  const [ignored, setIgnored] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    Promise.all([apiClient.getMonitoredDisksConfig(), apiClient.getApmConfig()])
      .then(([disk, apm]) => {
        setMounts(disk?.mounts || []);
        setIgnored((apm?.ignoredRoutes || []).join('\n'));
      })
      .catch(() => setMessage('Configuration could not be loaded.'));
  }, []);
  const save = async () => {
    try {
      await Promise.all([
        apiClient.updateMonitoredDisks(mounts),
        apiClient.updateApmConfig({
          ignoredRoutes: ignored
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      ]);
      setMessage('System configuration saved and audited.');
    } catch {
      setMessage('Saving requires system.configure permission.');
    }
  };
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold">System configuration</h2>
      <p className="text-sm text-text-dim">
        Manage supported storage monitoring and APM route exclusions. Notification controls remain
        in Notifications.
      </p>
      <label className="block text-sm text-text-dim">
        Monitored mounts (comma-separated)
        <input
          value={mounts.join(', ')}
          onChange={(event) =>
            setMounts(
              event.target.value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
            )
          }
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-text"
        />
      </label>
      <label className="block text-sm text-text-dim">
        Ignored APM routes (one per line)
        <textarea
          value={ignored}
          onChange={(event) => setIgnored(event.target.value)}
          rows={6}
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-text"
        />
      </label>
      <button
        onClick={save}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white"
      >
        Save configuration
      </button>
      {message && <p className="text-sm text-text-dim">{message}</p>}
    </div>
  );
}
