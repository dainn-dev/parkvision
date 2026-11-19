import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { usePlatform } from '../../context/PlatformContext';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = usePlatform();
  const reduceMotion = useReducedMotion();

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-success shrink-0" />,
    error: <XCircle className="w-5 h-5 text-destructive shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-warning shrink-0" />,
    info: <Info className="w-5 h-5 text-primary shrink-0" />
  };

  const borders = {
    success: 'border-success/50 bg-success/10 text-success',
    error: 'border-destructive/50 bg-destructive/10 text-destructive',
    warning: 'border-warning/50 bg-warning/10 text-warning',
    info: 'border-primary/50 bg-primary/10 text-primary'
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 12, scale: reduceMotion ? 1 : 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className={`pointer-events-auto p-4 rounded-xl border backdrop-blur-md flex items-start gap-3 transition-all duration-200 ease-out ${borders[toast.type]}`}
          >
          {icons[toast.type]}
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-medium leading-tight">{toast.title}</h4>
            {toast.description && <p className="text-[11px] opacity-90 mt-1 leading-snug">{toast.description}</p>}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="p-1 opacity-70 hover:opacity-100 transition-opacity rounded hover:bg-black/20"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
