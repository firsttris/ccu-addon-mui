export const ChannelName = ({
  name,
  maxWidth,
  icon,
}: {
  name: string;
  maxWidth: string;
  icon?: React.ReactNode;
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '5px',
        maxWidth,
      }}
    >
      {icon && (
        <div className="flex items-center mr-[6px] mb-1 text-text-secondary shrink-0 [&_svg]:w-[18px] [&_svg]:h-[18px]">
          {icon}
        </div>
      )}
      <div className="whitespace-nowrap overflow-hidden text-ellipsis text-[13px] mb-[5px]">{name}</div>
    </div>
  );
};
