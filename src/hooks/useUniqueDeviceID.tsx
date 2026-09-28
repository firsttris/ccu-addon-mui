import { useState } from 'react';

const LOCAL_STORAGE_KEY = 'ccu-addon-mui_DeviceId';

const getOrCreateDeviceID = () => {
  // Check if a unique ID already exists in localStorage
  let uniqueId = localStorage.getItem(LOCAL_STORAGE_KEY);

  if (!uniqueId) {
    // Generate a new unique ID
    uniqueId = 'id-' + Math.random().toString(36).substring(2, 16);
    // Store the unique ID in localStorage
    localStorage.setItem(LOCAL_STORAGE_KEY, uniqueId);
  }
  return uniqueId;
};

export const useUniqueDeviceID = () => {
  // Read localStorage only once, not on every render
  const [uniqueId] = useState(getOrCreateDeviceID);
  return uniqueId;
};
