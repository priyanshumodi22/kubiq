import { Edit2, Laptop, Smartphone, Trash2 } from 'lucide-react';

export interface ProfilePasskey {
  id: string;
  name: string;
  deviceType: string;
  createdAt: number;
}

interface ProfilePasskeysProps {
  loading: boolean;
  passkeys: ProfilePasskey[];
  isNative: boolean;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function ProfilePasskeys({ loading, passkeys, isNative, onRename, onDelete }: Readonly<ProfilePasskeysProps>) {
  if (loading) return <div className="col-span-2 text-center py-12 text-text-dim">Loading devices...</div>;
  if (passkeys.length === 0) return (
    <div className="col-span-2 text-center py-8 border border-dashed border-white/10 rounded-xl text-text-dim">
      No passkeys configured. Add one to login faster!
    </div>
  );
  return passkeys.map(pk => (
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
        {isNative && <>
          <button
            onClick={() => onRename(pk.id, pk.name)}
            aria-label={`Rename passkey ${pk.name}`}
            className="p-2 text-text-dim hover:text-white hover:bg-white/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 mr-1"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(pk.id)}
            aria-label={`Remove passkey ${pk.name}`}
            className="p-2 text-text-dim hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>}
      </div>
    </div>
  ));
}
