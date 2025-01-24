import styled from '@emotion/styled';

const Display = styled.div({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  textAlign: 'center',
  color: '#333',
});

const Temperature = styled.div({
  fontSize: '60px',
  fontWeight: 'bold',
  display: 'flex'
});

const Unit = styled.sup({
  fontSize: '18px',
  marginTop: '8px'
});

interface CurrentTemperatureProps {
  currentTemperature: number;
}

export const CurrentTemperature: React.FC<CurrentTemperatureProps> = ({
  currentTemperature,
}) => (
  <Display>
    <Temperature>
      {currentTemperature}
      <Unit>°C</Unit>
    </Temperature>
  </Display>
);