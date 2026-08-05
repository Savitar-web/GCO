export type AvatarFrame = 'none' | 'metal' | 'neon' | 'matte' | 'glass'

export interface UserProfile {
  name: string
  age: number
  createdAt: string
  avatarDataUrl: string | null
  /** Marco del avatar */
  avatarFrame?: AvatarFrame
  favoriteGameId?: string | null
  favoriteBookId?: string | null
  favoriteTrackId?: string | null
}

const PROFILE_KEY = 'gco:profile'

export function getProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as UserProfile
    return {
      ...data,
      avatarDataUrl: data.avatarDataUrl ?? null,
      avatarFrame: data.avatarFrame ?? 'none',
      favoriteGameId: data.favoriteGameId ?? null,
      favoriteBookId: data.favoriteBookId ?? null,
      favoriteTrackId: data.favoriteTrackId ?? null,
    }
  } catch {
    return null
  }
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

export function updateProfile(
  partial: Partial<UserProfile>
): UserProfile | null {
  const current = getProfile()
  if (!current) return null
  const next = { ...current, ...partial }
  saveProfile(next)
  return next
}

export function clearProfile(): void {
  localStorage.removeItem(PROFILE_KEY)
}
