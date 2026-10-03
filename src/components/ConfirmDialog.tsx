import styled from '@emotion/styled';
import { ReactNode, useEffect, useRef } from 'react';
import { m } from '../paraglide/messages';

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.5);
`;

const Panel = styled.div`
  width: min(480px, 100%);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  box-sizing: border-box;
  padding: 20px;
  border-radius: 8px;
  color: ${(props) => props.theme.colors.text};
  background: ${(props) => props.theme.colors.surface};
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
`;

const Title = styled.h2`
  margin: 0 0 12px;
  font-size: 18px;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
`;

export const DialogButton = styled.button<{ primary?: boolean }>`
  font: inherit;
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid ${(props) => props.theme.colors.border};
  color: ${({ primary, theme }) => (primary ? '#fff' : theme.colors.text)};
  background: ${({ primary, theme }) => (primary ? '#1976d2' : theme.colors.background)};

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// A modal question; Escape or a click outside cancels.
export const ConfirmDialog = ({ title, children, confirmLabel, busy, onConfirm, onCancel }: ConfirmDialogProps) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <Backdrop onClick={onCancel}>
      <Panel role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <Title>{title}</Title>
        {children}
        <Actions>
          <DialogButton ref={cancelRef} type="button" onClick={onCancel}>
            {m.CANCEL()}
          </DialogButton>
          <DialogButton type="button" primary disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </DialogButton>
        </Actions>
      </Panel>
    </Backdrop>
  );
};
