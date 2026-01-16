
import { AlertTriangle, Trash2, Info } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
  isLoading = false
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const styles = {
    danger: {
      icon: <Trash2 className="w-5 h-5 text-red-500" />,
      button: "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20",
      gradient: "from-red-500/20 to-transparent"
    },
    warning: {
      icon: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
      button: "bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/20",
      gradient: "from-yellow-500/20 to-transparent"
    },
    info: {
      icon: <Info className="w-5 h-5 text-blue-500" />,
      button: "bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20",
      gradient: "from-blue-500/20 to-transparent"
    }
  };

  const style = styles[type];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl scale-100 animate-in zoom-in-95 duration-200 overflow-hidden relative">
        
        {/* Subtle Gradient Glow at top */}
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${style.gradient}`} />
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-24 h-24 bg-gradient-to-br ${style.gradient} blur-3xl opacity-20`} />

        {/* Content */}
        <div className="p-6 text-center">
            <div className={`mx-auto w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4 ${type === 'danger' ? 'text-red-500' : type === 'warning' ? 'text-yellow-500' : 'text-blue-500'}`}>
                {style.icon}
            </div>
            
            <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              {message}
            </p>

            {/* Actions */}
            <div className="flex gap-3">
                <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-transparent border border-white/10 hover:bg-white/5 text-gray-300 rounded-xl font-medium transition-all duration-200"
                disabled={isLoading}
                >
                {cancelText}
                </button>
                <button
                type="button"
                onClick={onConfirm}
                className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 ${style.button}`}
                disabled={isLoading}
                >
                {isLoading ? (
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : confirmText}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}
