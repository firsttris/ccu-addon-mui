import { useState } from 'react';

const LOCAL_STORAGE_KEY = 'ccu-addon-mui_DeviceId';

// The id of this browser, kept in localStorage. Without storage (blocked
// site data) a new one for every page load.
const getOrCreateDeviceID = () => {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // Storage blocked: a new id below
  }
  const uniqueId = `id-${Math.random().toString(36).substring(2, 16)}`;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, uniqueId);
  } catch {
    // Kept for this page load only
  }
  return uniqueId;
};

export const useUniqueDeviceID = () => {
  // Read localStorage only once, not on every render
  const [uniqueId] = useState(getOrCreateDeviceID);
  return uniqueId;
};
