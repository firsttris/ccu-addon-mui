// What the start page (/) opens, kept per device: the view shown last
// (a room or a favorite list) or the favorites.

export type StartPage = 'last' | 'favorites';
export interface LastView {
  kind: 'room' | 'favorite';
  id: string;
}

const START_PAGE_KEY = 'start-page';
const LAST_VIEW_KEY = 'last-view';

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the default start page
  }
};

export const getStartPage = (): StartPage => (read(START_PAGE_KEY) === 'favorites' ? 'favorites' : 'last');
export const setStartPage = (page: StartPage) => write(START_PAGE_KEY, page);

export const getLastView = (): LastView | null => {
  try {
    const view = JSON.parse(read(LAST_VIEW_KEY) ?? 'null');
    return view && (view.kind === 'room' || view.kind === 'favorite') && typeof view.id === 'string' ? view : null;
  } catch {
    return null;
  }
};
export const rememberView = (view: LastView) => write(LAST_VIEW_KEY, JSON.stringify(view));
