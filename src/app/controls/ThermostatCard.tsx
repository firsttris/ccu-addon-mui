import React, { useState } from 'react';
import styled from '@emotion/styled';

// Define types for the component's props if needed
type ThermostatProps = {
  initialTemperature?: number;
  mode?: 'Heating' | 'Cooling';
};

// Styled components for our UI elements
const Card = styled.div`
  width: 250px;

  background: #f5f5f5;
  border-radius: 15px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
`;

const Title = styled.div`
  font-size: 18px;
  font-weight: bold;
`;

const Mode = styled.div`
  margin-top: 5px;
  color: orange;
  font-size: 16px;
`;

const Temperature = styled.div`
  font-size: 48px;
  margin: 20px 0;
`;

const Dial = styled.div<{ temperature: number }>`
  width: 70%;
  height: 0;
  padding-bottom: 70%;
  margin: 20px auto;
  position: relative;
  border-radius: 50%;
  background: #f0f0f0; 

  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: conic-gradient(
      orange ${props => props.temperature * 3.6}deg,
      #d3d3d3 ${props => props.temperature * 3.6}deg
    );
    -webkit-mask: 
      radial-gradient(farthest-side, transparent calc(100% - 10px), black calc(100% - 10px));
    mask: 
      radial-gradient(farthest-side, transparent calc(100% - 10px), black calc(100% - 10px));
  }

  &::after {
    content: '${props => props.temperature}°C';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 24px;
    font-weight: bold;
    color: #333;
  }
`;

const Button = styled.button`
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 1px solid #ccc;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;

  &:hover {
    background: #f0f0f0;
  }
`;

const Controls = styled.div`
  display: flex;
  justify-content: space-around;
  margin-top: 20px;
`;

// Main component
const BetterThermostatUI: React.FC<ThermostatProps> = ({ initialTemperature = 25.5, mode = 'Heating' }) => {
  const [temperature, setTemperature] = useState(initialTemperature);

  const decreaseTemperature = () => setTemperature(prev => prev - 0.5);
  const increaseTemperature = () => setTemperature(prev => prev + 0.5);

  return (
    <Card>
      <Title>HeatPump</Title>
      <Mode>{mode}</Mode>

      <Dial temperature={temperature} />

      <Controls>
        <Button onClick={decreaseTemperature}>-</Button>
        <Button onClick={increaseTemperature}>+</Button>
      </Controls>
    </Card>
  );
};

export default BetterThermostatUI;