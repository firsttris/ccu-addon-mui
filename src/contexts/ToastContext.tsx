import type React from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type ToastKind = 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextType {
  showToast: (message: string, kind?: ToastKind) => void;
}

const TOAST_DURATION_MS = 5000;

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'error') => {
      const id = nextIdRef.current++;
      setToasts((prev) => [
        // The same message (e.g. several failed clicks) is only shown once
        ...prev.filter((toast) => toast.message !== message),
        { id, message, kind },
      ]);
      setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed left-1/2 bottom-4 -translate-x-1/2 z-[2000] flex flex-col gap-2 w-[min(420px,calc(100vw_-_32px))]">
        {toasts.map((toast) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: clicking only dismisses early; a toast goes away by itself
          <div
            key={toast.id}
            role="alert"
            onClick={() => dismiss(toast.id)}
            className={`flex animate-in cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md duration-300 fade-in-0 slide-in-from-bottom-4 ${
              toast.kind === 'error'
                ? 'border-red-500/30 bg-red-600/95 text-white'
                : 'border-border bg-popover/95 text-popover-foreground'
            }`}
          >
            <span className={`size-2 shrink-0 rounded-full ${toast.kind === 'error' ? 'bg-white' : 'bg-green-500'}`} />
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
