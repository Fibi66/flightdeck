import { create } from 'zustand';
import { useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastState {
  toasts: Toast[];
  add: (type: Toast['type'], message: string) => void;
  remove: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add: (type, message) => {
    const id = `toast-${Date.now()}`;
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

const ICONS = {
  success: CheckCircle,
  error: AlertTriangle,
  info: Info,
};

const COLORS = {
  success: 'border-green-500/30 bg-green-900/20 text-green-300',
  error: 'border-red-500/30 bg-red-900/20 text-red-300',
  info: 'border-blue-500/30 bg-blue-900/20 text-blue-300',
};

export function ToastContainer() {
  const { toasts, remove } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg animate-slide-in ${COLORS[toast.type]}`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="text-sm flex-1">{toast.message}</span>
            <button onClick={() => remove(toast.id)} className="shrink-0 opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
