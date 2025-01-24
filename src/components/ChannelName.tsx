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


const NameMultiLine = styled.div`
  white-space: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  width: 100%;
  font-size: 13px;
  height: 35px;
`;