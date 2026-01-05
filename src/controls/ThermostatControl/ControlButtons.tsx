import styled from '@emotion/styled';
import { MdiMinus } from '../../components/icons/MdiMinus';
import { MdiPlus } from '../../components/icons/MdiPlus';
import { ControlButton } from '../../components/ControlButton';
import { useTranslations } from '../../i18n/utils';

interface ControlButtonsProps {
  onDecrease: () => void;
  onIncrease: () => void;
}

const Controls = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: -12px;
  width: 100%;
`;

export const ControlButtons: React.FC<ControlButtonsProps> = ({ onDecrease, onIncrease }) => {
  const t = useTranslations();

  return (
    <Controls>
      <ControlButton onClick={onDecrease} title={t('DECREASE_TEMPERATURE')}>
        <MdiMinus />
      </ControlButton>

      <ControlButton onClick={onIncrease} title={t('INCREASE_TEMPERATURE')}>
        <MdiPlus />
      </ControlButton>
    </Controls>
  );
};