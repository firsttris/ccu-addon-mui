declare module '*.tcl' {
  const content: string;
  export default content;
}

import '@emotion/react';

declare module '@emotion/react' {
  export interface Theme {
    mode: 'light' | 'dark';
    colors: {
      background: string;
      surface: string;
      text: string;
      textSecondary: string;
      border: string;
      primary: string;
      hover: string;
    };
  }
}
