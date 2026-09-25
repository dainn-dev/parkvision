import React from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = usePlatform();

  if (toasts.length === 0) return null;

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
    error: <XCircle className="w-5 h-5 text-red-400 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
    info: <Info className="w-5 h-5 text-sky-400 shrink-0" />
  };

  const borders = {
    success: 'border-emerald-500/50 bg-emerald-950/90 text-emerald-100',
    error: 'border-red-500/50 bg-red-950/90 text-red-100',
    warning: 'border-amber-500/50 bg-amber-950/90 text-amber-100',
    info: 'border-sky-500/50 bg-sky-950/90 text-sky-100'
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto p-4 rounded-xl border shadow-2xl backdrop-blur-md flex items-start gap-3 transition-all duration-200 animate-in slide-in-from-bottom-2 ${borders[toast.type]}`}
        >
          {icons[toast.type]}
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold leading-tight">{toast.title}</h4>
            {toast.description && <p className="text-[11px] opacity-90 mt-1 leading-snug">{toast.description}</p>}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="p-1 opacity-70 hover:opacity-100 transition-opacity rounded hover:bg-black/20"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
