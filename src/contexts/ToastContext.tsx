import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import styled from '@emotion/styled';

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

const ToastContainer = styled.div`
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(420px, calc(100vw - 32px));
`;

const ToastItem = styled('div', {
  shouldForwardProp: (prop) => prop !== 'kind',
})<{ kind: ToastKind }>`
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 15px;
  color: #fff;
  background: ${({ kind }) => (kind === 'error' ? '#c62828' : '#424242')};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  cursor: pointer;
`;

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
      <ToastContainer>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} kind={toast.kind} role="alert" onClick={() => dismiss(toast.id)}>
            {toast.message}
          </ToastItem>
        ))}
      </ToastContainer>
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
