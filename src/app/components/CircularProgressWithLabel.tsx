import styled from '@emotion/styled';

const StyledBox = styled.div`
  position: relative;
  display: inline-flex;
`;

const InnerBox = styled.div`
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledCircularProgress = styled.div<{ value: number }>`
  position: relative;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 3px solid lightgrey;
  border-top-color: #3f51b5;
  transform: rotate(${({ value }) => value * 3.6}deg);
  transition: transform 0.3s linear;
`;

const Typography = styled.span`
  font-size: 12px;
`;

export const CircularProgressWithLabel = (
  props: { value: number }
) => {
  const { value } = props;
  return (
    <StyledBox>
      <StyledCircularProgress value={value} />
      <InnerBox>
        <Typography>{`${Math.round(value)}%`}</Typography>
      </InnerBox>
    </StyledBox>
  );
};