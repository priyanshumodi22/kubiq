import { LogOut, User, ChevronDown, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useState, useRef, useEffect } from 'react';

export default function Header() {
  const { isAuthenticated, user, roles, logout, authEnabled } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const userDisplayName =
    user?.name ||
    `${user?.firstName || ''} ${user?.lastName || ''}`.trim() ||
    user?.username ||
    user?.email ||
    'User';

  // Filter roles to only show kubiq-specific roles
  const kubiqRoles = roles.filter((role) => role.toLowerCase().startsWith('kubiq'));
  const userRole = kubiqRoles.length > 0 ? kubiqRoles.join(', ') : 'No Role Assigned';

  return (
    <header className="bg-gradient-to-r from-bg via-bg-surface to-bg border-b border-gray-800/50 relative">
      {/* Background container with overflow hidden */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Subtle animated background effect */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.03),transparent_50%)]"></div>
        <div className="absolute -top-20 -left-10 w-60 h-60 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute top-0 right-20 w-80 h-80 bg-primary/3 rounded-full blur-3xl"></div>
      </div>

      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4 relative z-10">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-12 sm:h-12 bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl shadow-lg shadow-primary/10">
              <img
                src={`${
                  import.meta.env.BASE_URL.endsWith('/')
                    ? import.meta.env.BASE_URL
                    : import.meta.env.BASE_URL + '/'
                }logo/kubiq_logo.png`}
                alt="Kubiq Logo"
                className="w-8 h-8 sm:w-10 sm:h-10 object-contain"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-text">kubiq</h1>
              <p className="text-xs text-text-dim hidden sm:block">Service Health Dashboard</p>
            </div>
          </div>

          {authEnabled && isAuthenticated && (
            <div className="relative flex-shrink-0" ref={dropdownRef}>
              {/* User Profile Button */}
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1.5 sm:gap-3 px-2 sm:px-4 py-2 bg-bg-surface hover:bg-gray-800 rounded-lg transition-colors group"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                </div>
                <div className="text-left hidden md:block">
                  <div className="text-sm font-medium text-text truncate max-w-[120px] lg:max-w-none">
                    {userDisplayName}
                  </div>
                  <div className="text-xs text-text-dim truncate max-w-[120px] lg:max-w-none">
                    {userRole}
                  </div>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-text-dim transition-transform ${
                    dropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 sm:w-64 bg-bg-surface border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                  {/* User Info Section */}
                  <div className="p-3 border-b border-gray-700 bg-bg-surface">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text truncate">
                          {user?.email || user?.username}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Role Section */}
                  <div className="p-3 border-b border-gray-700">
                    <div className="flex items-start gap-2">
                      <Shield className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-text-dim mb-1.5">Role(s)</div>
                        <div className="flex flex-wrap gap-1">
                          {kubiqRoles.length > 0 ? (
                            kubiqRoles.map((role) => (
                              <span
                                key={role}
                                className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded"
                              >
                                {role}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-text-dim">No roles assigned</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Logout Button */}
                  <div className="p-1.5">
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
