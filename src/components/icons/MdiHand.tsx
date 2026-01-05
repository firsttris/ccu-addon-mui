import type { SVGProps } from 'react';

export function MdiHand(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
      <path fill="currentColor" d="M6 3c1.66 0 3 1.34 3 3v6h-2V7c0-.55-.45-1-1-1s-1 .45-1 1v8.5c0 .28.22.5.5.5s.5-.22.5-.5V10h2v5.5c0 1.93-1.57 3.5-3.5 3.5S2.5 17.43 2.5 15.5c0-2.99 2.01-5.84 4.75-6.32V6c0-1.66 1.34-3 3-3z"/>
    </svg>
  );
}