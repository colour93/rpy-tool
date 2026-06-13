const DB_NAME = 'rpy-tool-workspace'
const DB_VERSION = 1

type StoreName = 'workspace' | 'thumbnails'

let dbPromise: Promise<IDBDatabase> | undefined

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('workspace')) {
          db.createObjectStore('workspace')
        }
        if (!db.objectStoreNames.contains('thumbnails')) {
          db.createObjectStore('thumbnails')
        }
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  return dbPromise
}

export async function idbGet<T>(storeName: StoreName, key: IDBValidKey) {
  const db = await openDb()
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const request = tx.objectStore(storeName).get(key)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result as T | undefined)
  })
}

export async function idbSet<T>(
  storeName: StoreName,
  key: IDBValidKey,
  value: T,
) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => resolve()
    tx.objectStore(storeName).put(value, key)
  })
}

export async function idbDelete(storeName: StoreName, key: IDBValidKey) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => resolve()
    tx.objectStore(storeName).delete(key)
  })
}
