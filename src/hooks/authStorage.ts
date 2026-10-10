const TOKEN_STORAGE_KEY = 'ccu-addon-mui_AuthToken';

// Short-lived token for changing settings (administrators)
export const ADMIN_TOKEN_STORAGE_KEY = 'ccu-addon-mui_AdminToken';

export const readToken = (key = TOKEN_STORAGE_KEY) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

// Logged out on purpose in this tab: the login page, not the automatic
// login (as the WebUI's logout.htm with NoAutoLogin); a new tab logs in
// automatically again
const LOGGED_OUT_KEY = 'mui-logged-out';

export const loggedOut = () => {
  try {
    return sessionStorage.getItem(LOGGED_OUT_KEY) === '1';
  } catch {
    return false;
  }
};

export const setLoggedOut = (value: boolean) => {
  try {
    if (value) sessionStorage.setItem(LOGGED_OUT_KEY, '1');
    else sessionStorage.removeItem(LOGGED_OUT_KEY);
  } catch {
    // Storage not available: logging out works, the automatic login returns
  }
};

export const writeToken = (token: string | null, key = TOKEN_STORAGE_KEY) => {
  try {
    if (token) {
      localStorage.setItem(key, token);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Without storage the user has to log in again after a reload
  }
};
