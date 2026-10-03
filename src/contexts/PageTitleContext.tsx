import React, { createContext, useContext, useEffect, useState } from 'react';

// The title of the current page, shown in the header
const PageTitleContext = createContext<{ title: string; setTitle: (title: string) => void }>({
  title: '',
  setTitle: () => {},
});

export const PageTitleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [title, setTitle] = useState('');
  return <PageTitleContext.Provider value={{ title, setTitle }}>{children}</PageTitleContext.Provider>;
};

export const usePageTitleValue = () => useContext(PageTitleContext).title;

// Sets the header title while the calling page is shown
export const usePageTitle = (title: string) => {
  const { setTitle } = useContext(PageTitleContext);
  useEffect(() => {
    setTitle(title);
    document.title = title ? `${title} · MUI` : 'MUI';
  }, [title, setTitle]);
};
