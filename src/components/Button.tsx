import { ButtonHTMLAttributes } from 'react';

// Round button for a single action, e.g. lock and unlock
export const Button = ({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    className={`w-[50px] h-[50px] rounded-full border border-solid border-border bg-primary cursor-pointer flex items-center justify-center text-text text-[25px] transition-all duration-200 ease-[ease] hover:bg-hover hover:shadow-[0_2px_4px_rgba(0,0,0,0.2)] ${className}`}
    {...props}
  />
);
