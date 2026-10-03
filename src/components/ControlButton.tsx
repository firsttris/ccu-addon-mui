import { ButtonHTMLAttributes } from 'react';

// Round button with an icon, e.g. up/stop/down of a blind
export const ControlButton = ({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    className={`bg-transparent border-2 border-solid border-border rounded-full w-14 h-14 flex items-center justify-center cursor-pointer text-text transition-all duration-200 ease-[ease] hover:bg-hover hover:border-[#03A9F4] active:scale-95 [&_svg]:w-6 [&_svg]:h-6 ${className}`}
    {...props}
  />
);
