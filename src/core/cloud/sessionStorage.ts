/** Mirror the SDK session in IndexedDB so a full preference store cannot lose login. */
const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('gco-auth-session', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('sessions')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
async function persisted(key: string, value?: string | null): Promise<string | null> {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('sessions', value === undefined ? 'readonly' : 'readwrite')
      const store = transaction.objectStore('sessions')
      const request = value === undefined ? store.get(key) : value === null ? store.delete(key) : store.put(value, key)
      let result: string | null = null
      request.onsuccess = () => { if (value === undefined && typeof request.result === 'string') result = request.result }
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally { db.close() }
}
export const sessionStorage = {
  async getItem(key: string) {
    try {
      const value = localStorage.getItem(key)
      if (value !== null) {
        void persisted(key, value).catch(() => {})
        return value
      }
    } catch { /* IndexedDB remains available in some restricted webviews. */ }
    try { return await persisted(key) } catch { return null }
  },
  async setItem(key: string, value: string) {
    let saved = false
    try { localStorage.setItem(key, value); saved = true } catch { /* Try the second store. */ }
    try { await persisted(key, value); saved = true } catch { /* Report only if both stores fail. */ }
    if (!saved) throw new Error('No hay espacio para conservar la sesión en este dispositivo.')
  },
  async removeItem(key: string) {
    try { localStorage.removeItem(key) } catch { /* Continue with the second store. */ }
    await persisted(key, null).catch(() => {})
  },
}
