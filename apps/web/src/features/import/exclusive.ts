// A readwrite IndexedDB transaction is released automatically when its tab closes.
async function indexedDbLock<T>(work: () => Promise<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("loud-books-job-lock-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("lock");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("lock", "readwrite");
      const store = tx.objectStore("lock");
      let keepAlive = true;
      let result: T;
      let workError: unknown;
      let failed = false;
      const pulse = () => {
        if (!keepAlive) return;
        const request = store.get("job");
        request.onsuccess = pulse;
      };
      const first = store.get("job");
      first.onsuccess = () => {
        pulse();
        void Promise.resolve().then(work).then(value => { result = value; keepAlive = false; }, error => { failed = true; workError = error; keepAlive = false; });
      };
      tx.oncomplete = () => failed ? reject(workError) : resolve(result);
      tx.onabort = () => reject(tx.error ?? workError ?? new Error("Import lock aborted"));
      tx.onerror = () => { keepAlive = false; };
    });
  } finally { db.close(); }
}
export function exclusive<T>(work: () => Promise<T>): Promise<T> {
  if (navigator.locks) return navigator.locks.request("loud-books-large-job", work);
  return indexedDbLock(work);
}
