import { createPortal } from 'react-dom';

export interface K8sConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    variant?: 'primary' | 'danger' | 'warning';
}

export function K8sConfirmModal({ 
    isOpen, 
    onClose, 
    onConfirm, 
    title, 
    message, 
    confirmText = 'Confirm',
    variant = 'primary'
}: K8sConfirmModalProps) {
    if (!isOpen) return null;

    const variantStyles = {
        primary: 'bg-primary text-black hover:bg-primary-hover',
        danger: 'bg-red-500 text-white hover:bg-red-600',
        warning: 'bg-yellow-500 text-black hover:bg-yellow-600'
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
            <div className="relative w-full max-w-md bg-[#1a1a1a] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">{message}</p>
                </div>
                <div className="flex items-center justify-end gap-3 p-4 bg-black/20 border-t border-gray-800">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors">Cancel</button>
                    <button onClick={onConfirm} className={`px-5 py-2 text-sm font-bold rounded-xl transition-all ${variantStyles[variant]}`}>{confirmText}</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
