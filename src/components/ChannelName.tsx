import styled from "@emotion/styled";

export const Name = styled.div`
  white-space: nowrap; /* Ensure text does not wrap to the next line */
  overflow: hidden; /* Hide overflow text */
  text-overflow: ellipsis; /* Show ellipsis (...) for overflow text */
  font-size: 13px;
  margin-bottom: 5px;
`;

export const ChannelName = ({ name, maxWidth }: { name: string, maxWidth: string }) => {
    return (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '5px', maxWidth }}>
            <Name>{name}</Name>
        </div>

    );
}