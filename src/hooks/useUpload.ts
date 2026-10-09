import { useCallback, useEffect, useRef } from 'react';

// Uploads a file to the URL the server prepared for it. When the dialog
// that started it closes, the upload stops, and with it what would follow
// (the check, the installation): cancel means cancel.
export const useUpload = () => {
  const controller = useRef(new AbortController());
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => current.abort();
  }, []);
  return useCallback(async (url: string, file: File) => {
    const response = await fetch(url, { method: 'POST', body: file, signal: controller.current.signal });
    if (!response.ok) throw new Error(await response.text());
  }, []);
};
