export interface BackupPayload {
  version: 1
  profile: string | null
  progress: string | null
  exportedAt: string
}

export function exportData(): void {
  const payload: BackupPayload = {
    version: 1,
    profile: localStorage.getItem('gco:profile'),
    progress: localStorage.getItem('gco:progress'),
    exportedAt: new Date().toISOString(),
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `gco-backup-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importData(file: File): Promise<void> {
  const text = await file.text()
  const data = JSON.parse(text) as BackupPayload

  if (data.profile) {
    localStorage.setItem('gco:profile', data.profile)
  }
  if (data.progress) {
    localStorage.setItem('gco:progress', data.progress)
  }
}