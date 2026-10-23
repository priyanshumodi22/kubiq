import { useEffect, useRef, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { Loader2 } from 'lucide-react';
import { addSelection, removeSelection, type SelectionUpdate } from '../utils/selection';

export interface NamespaceScopeUser { id: string; username: string; allowedNamespaces?: string[] }

function updateNamespaceSelection(user: NamespaceScopeUser | null, namespace: string, update: SelectionUpdate<string>) {
  return user ? { ...user, allowedNamespaces: update(user.allowedNamespaces || [], namespace) } : user;
}

export function NamespaceScopeDialog({ namespaceDialog, setNamespaceDialog, availableNamespaces, namespaceLoading, saveNamespaces, onClose }: Readonly<{
  namespaceDialog: NamespaceScopeUser;
  setNamespaceDialog: Dispatch<SetStateAction<NamespaceScopeUser | null>>;
  availableNamespaces: string[];
  namespaceLoading: boolean;
  saveNamespaces: (event: FormEvent) => Promise<void>;
  onClose: () => void;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  return (
        <dialog ref={dialogRef} aria-modal="true" aria-labelledby="namespace-dialog-title" onCancel={event => { event.preventDefault(); onClose(); }} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-2xl border-0 bg-transparent p-0 text-inherit backdrop:bg-black/70 backdrop:backdrop-blur-sm">
          <form
            onSubmit={saveNamespaces}
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
              {namespaceLoading && (
                <div className="flex items-center gap-2 py-8 text-sm text-text-dim">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading cluster namespaces…
                </div>
              )}
              {!namespaceLoading && availableNamespaces.length > 0 && (
                <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {availableNamespaces.map((namespace) => (
                    <label
                      key={namespace}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/8 px-3 py-2 text-sm text-text-dim transition hover:border-primary/40 hover:bg-white/4"
                    >
                      <input
                        type="checkbox"
                        checked={(namespaceDialog.allowedNamespaces || []).includes(namespace)}
                        onChange={(event) => {
                          const update = event.target.checked ? addSelection : removeSelection;
                          setNamespaceDialog((user) =>
                            updateNamespaceSelection(user, namespace, update)
                          )
                        }}
                      />
                      {namespace}
                    </label>
                  ))}
                </div>
              )}
              {!namespaceLoading && availableNamespaces.length === 0 && (
                <p className="py-7 text-center text-sm text-text-dim">
                  No cluster namespaces are available to select.
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                ref={cancelRef}
                type="button"
                onClick={onClose}
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
        </dialog>
      );
}
