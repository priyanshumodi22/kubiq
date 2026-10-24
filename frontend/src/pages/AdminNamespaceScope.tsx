import { Check, Pencil, X } from 'lucide-react';
import type { UserData } from './AdminUsers';

interface NamespaceScopeProps {
  user: UserData;
  editingNsUserId: string | null;
  selectedNsList: string[];
  customNsInput: string;
  clusterNamespaces: string[];
  toggleNamespaceSelect: (name: string) => void;
  setCustomNsInput: (value: string) => void;
  handleAddCustomNs: () => void;
  setEditingNsUserId: (id: string | null) => void;
  handleSaveNs: (id: string) => void;
  handleStartEditNs: (user: UserData) => void;
}

export function AdminNamespaceScope({ user, editingNsUserId, selectedNsList, customNsInput, clusterNamespaces, toggleNamespaceSelect, setCustomNsInput, handleAddCustomNs, setEditingNsUserId, handleSaveNs, handleStartEditNs }: Readonly<NamespaceScopeProps>) {
  if (user.role === 'kubiq-admin') return (<span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono font-bold rounded-full">
      * (All Cluster Namespaces)
  </span>);
  if (editingNsUserId === user.id) return (<div className="flex flex-col gap-2 bg-black/60 p-3 rounded-xl border border-primary/40 text-left min-w-[280px] max-w-sm shadow-2xl">
      <div className="text-xs font-semibold text-text flex items-center justify-between">
          <span>Cluster Namespaces (from API):</span>
          <span className="text-[10px] text-text-dim font-mono">{selectedNsList.length} selected</span>
      </div>

      {/* Live K8s Cluster Namespaces Pills */}
      <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-1 bg-black/30 rounded-lg border border-gray-800">
          {clusterNamespaces.length > 0 ? (
              clusterNamespaces.map(ns => {
                  const isSelected = selectedNsList.includes(ns.toLowerCase());
                  return (
                      <button
                          key={ns}
                          type="button"
                          onClick={() => toggleNamespaceSelect(ns)}
                          className={`px-2 py-0.5 rounded-full text-xs font-mono transition-all flex items-center gap-1 cursor-pointer ${isSelected
                              ? 'bg-primary/20 text-primary border border-primary/50 font-bold'
                              : 'bg-gray-800/80 text-gray-400 border border-gray-700/60 hover:border-gray-500'
                              }`}
                      >
                          <span>{ns}</span>
                          {isSelected ? <Check className="w-3 h-3 text-primary" /> : <span className="text-[10px] opacity-60">+</span>}
                      </button>
                  );
              })
          ) : (
              <div className="text-[11px] text-gray-500 p-1">No live cluster namespaces detected or K8s offline.</div>
          )}
      </div>

      {/* Custom Namespace Add Input */}
      <div className="flex items-center gap-1.5 mt-1">
          <input
              type="text"
              value={customNsInput}
              onChange={(e) => setCustomNsInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomNs(); } }}
              placeholder="Custom namespace..."
              className="bg-black/40 border border-gray-700 rounded-lg text-xs text-white px-2 py-1 focus:outline-none font-mono grow"
          />
          <button
              type="button"
              onClick={handleAddCustomNs}
              className="px-2 py-1 bg-gray-800 text-xs text-gray-300 hover:text-white rounded-lg border border-gray-700"
          >
              Add
          </button>
      </div>

      {/* Selected pills list */}
      {selectedNsList.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
              <span className="text-[10px] text-gray-400 w-full font-semibold">Active Scope:</span>
              {selectedNsList.map(ns => (
                  <span key={ns} className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full text-[11px] font-mono flex items-center gap-1">
                      {ns}
                      <button type="button" aria-label={`Remove ${ns} namespace`} onClick={() => toggleNamespaceSelect(ns)} className="hover:text-red-400 focus-visible:outline focus-visible:outline-primary"><X className="w-3 h-3" /></button>
                  </span>
              ))}
          </div>
      )}

      {/* Save / Cancel buttons */}
      <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-gray-800">
          <button
              type="button"
              onClick={() => setEditingNsUserId(null)}
              className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 rounded-lg transition-colors"
          >
              Cancel
          </button>
          <button
              type="button"
              onClick={() => handleSaveNs(user.id)}
              className="px-3 py-1 bg-primary text-black font-semibold text-xs rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1"
          >
              <Check className="w-3.5 h-3.5" /> Save
          </button>
      </div>
  </div>);
  return (<button
      onClick={() => handleStartEditNs(user)}
      className="group flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-full text-xs font-mono font-bold transition-all cursor-pointer"
      title="Click to edit allowed namespaces from live cluster API"
  >
      <span>
          {(user.allowedNamespaces && user.allowedNamespaces.length > 0)
              ? user.allowedNamespaces.join(', ')
              : 'All Namespaces (Unrestricted)'}
      </span>
      <Pencil className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
  </button>);
}
