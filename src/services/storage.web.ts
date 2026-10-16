// IndexedDB avoids localStorage's small per-origin limit for camera data URLs.
let database: Promise<IDBDatabase> | undefined;
function open() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('primerka-local', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('Хранилище занято другой вкладкой.')); };
  });
  return database;
}
export const storage = {
  async getItem(key: string): Promise<string | null> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readonly');
      const request = tx.objectStore('state').get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },
  async setItem(key: string, value: string): Promise<void> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  },
};
