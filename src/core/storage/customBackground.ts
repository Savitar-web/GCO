const DB_NAME = 'gco-media'
const STORE = 'files'
const BG_KEY = 'custom-bg'
const AUDIO_KEY = 'custom-audio'
const PREFS_KEY = 'gco:bg-prefs'

export interface BgPrefs {
  enabled: boolean
  audioEnabled: boolean
  /** 0–1 */
  volume: number
}

export function getBgPrefs(): BgPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as BgPrefs
      return {
        enabled: p.enabled ?? true,
        audioEnabled: p.audioEnabled ?? true,
        volume: typeof p.volume === 'number' ? p.volume : 0.12,
      }
    }
  } catch {
    /* ignore */
  }
  return { enabled: true, audioEnabled: true, volume: 0.12 }
}

export function saveBgPrefs(prefs: BgPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function putFile(key: string, file: File) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(
      { blob: file, type: file.type, name: file.name, savedAt: Date.now() },
      key
    )
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getFile(key: string) {
  const db = await openDb()
  return new Promise<{ blob: Blob; type: string; name?: string } | null>(
    (resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => {
        const val = req.result as
          | { blob: Blob; type: string; name?: string }
          | undefined
        resolve(val ?? null)
      }
      req.onerror = () => reject(req.error)
    }
  )
}

async function deleteFile(key: string) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const saveBackgroundFile = (file: File) => putFile(BG_KEY, file)
export const loadBackgroundFile = () => getFile(BG_KEY)
export const clearBackgroundFile = () => deleteFile(BG_KEY)

export const saveAudioFile = (file: File) => putFile(AUDIO_KEY, file)
export const loadAudioFile = () => getFile(AUDIO_KEY)
export const clearAudioFile = () => deleteFile(AUDIO_KEY)