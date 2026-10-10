// Web Push in the browser: subscribing this device with the service worker
// the PWA registers, using the server's VAPID key.

export type PushSupport = 'ok' | 'unsupported' | 'insecure' | 'denied';

export const pushSupport = (): PushSupport => {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    // Push needs HTTPS (or localhost)
    return typeof window !== 'undefined' && !window.isSecureContext ? 'insecure' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
};

const keyBytes = (base64url: string) => {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

const registration = async () => {
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ?? navigator.serviceWorker.ready;
};

export const currentSubscription = async () => {
  if (pushSupport() !== 'ok') return null;
  return (await registration()).pushManager.getSubscription();
};

export const subscribe = async (publicKey: string) => {
  if ((await Notification.requestPermission()) !== 'granted') {
    throw new Error('permission denied');
  }
  const reg = await registration();
  return (
    (await reg.pushManager.getSubscription()) ??
    reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
  );
};
