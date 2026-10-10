import type React from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

// Arranging the tiles of the current page, from the header: "Arrange"
// starts it, and while arranging the header shows its buttons in that place
export interface PageArrange {
  editing: boolean;
  // Saving the arrangement
  busy: boolean;
  start: () => void;
  done: () => void;
  cancel: () => void;
  // Back to the automatic arrangement, once tiles are moved or saved
  reset?: () => void;
}

// The title of the current page, shown in the header, and whether its
// tiles can be arranged
const PageTitleContext = createContext<{
  title: string;
  setTitle: (title: string) => void;
  arrange: PageArrange | null;
  setArrange: (arrange: PageArrange | null) => void;
}>({
  title: '',
  setTitle: () => {},
  arrange: null,
  setArrange: () => {},
});

export const PageTitleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [title, setTitle] = useState('');
  const [arrange, setArrange] = useState<PageArrange | null>(null);
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

// Offers arranging in the header while the calling page is shown; null
// when its tiles can't be arranged. The handlers may change on every
// render: the header calls the latest.
export const usePageArrange = (arrange: PageArrange | null) => {
  const { setArrange } = useContext(PageTitleContext);
  const latest = useRef(arrange);
  latest.current = arrange;
  const enabled = arrange !== null;
  const editing = arrange?.editing ?? false;
  const busy = arrange?.busy ?? false;
  const canReset = arrange?.reset !== undefined;
  useEffect(() => {
    if (!enabled) return;
    setArrange({
      editing,
      busy,
      start: () => latest.current?.start(),
      done: () => latest.current?.done(),
      cancel: () => latest.current?.cancel(),
      reset: canReset ? () => latest.current?.reset?.() : undefined,
    });
    return () => setArrange(null);
  }, [enabled, editing, busy, canReset, setArrange]);
};
