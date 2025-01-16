const LOCAL_STORAGE_KEY = 'ccu-addon-mui_DeviceId';

export const useUniqueDeviceID = () => {
    // Check if a unique ID already exists in localStorage
    let uniqueId = localStorage.getItem(LOCAL_STORAGE_KEY);

    if (!uniqueId) {
        // Generate a new unique ID
        uniqueId = 'id-' + Math.random().toString(36).substring(2, 16);
        // Store the unique ID in localStorage
        localStorage.setItem(LOCAL_STORAGE_KEY, uniqueId);
    }
    return uniqueId;
}