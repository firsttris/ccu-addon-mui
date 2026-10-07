import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

// The title of the current page, shown in the header, and whether its
// tiles can be arranged: the header then offers "Arrange"
const PageTitleContext = createContext<{
  title: string;
  setTitle: (title: string) => void;
  arrange: (() => void) | null;
  setArrange: (arrange: (() => void) | null) => void;
}>({
  title: '',
  setTitle: () => {},
  arrange: null,
  setArrange: () => {},
});

export const PageTitleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [title, setTitle] = useState('');
  const [arrange, setArrangeState] = useState<(() => void) | null>(null);
  const setArrange = useRef((next: (() => void) | null) => setArrangeState(() => next)).current;
  return (
    <PageTitleContext.Provider value={{ title, setTitle, arrange, setArrange }}>{children}</PageTitleContext.Provider>
  );
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

export const usePageArrangeValue = () => useContext(PageTitleContext).arrange;

// Offers "Arrange" in the header while the calling page is shown and
// enabled, starting arranging with start
export const usePageArrange = (enabled: boolean, start: () => void) => {
  const { setArrange } = useContext(PageTitleContext);
  const latest = useRef(start);
  latest.current = start;
  useEffect(() => {
    if (!enabled) return;
    setArrange(() => latest.current());
    return () => setArrange(null);
  }, [enabled, setArrange]);
};
