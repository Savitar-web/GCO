import { useEffect } from 'react'
import { supabase } from './supabase'
import { accountSnapshot, combineAccountSnapshots, snapshotSignatures } from './accountSnapshot'

const ownerKey = 'gco:account-sync-owner'
const signaturesKey = 'gco:account-sync-signatures'
let syncNow: (() => Promise<void>) | undefined
export const flushAccountSync = () => syncNow?.() ?? Promise.resolve()

export function AccountSync() {
  useEffect(() => {
    const client = supabase
    if (!client) return
    let userId: string | null = null
    let generation = 0
    let baseline: ReturnType<typeof accountSnapshot> | null = null
    let job: Promise<void> | undefined

    const sync = async () => {
      const id = userId
      const run = generation
      if (!id || !navigator.onLine) return
      const query = client.from('account_progress')
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await query.select('revision,snapshot').eq('user_id', id).maybeSingle()
        if (error) throw error
        if (run !== generation) return
        const owner = localStorage.getItem(ownerKey)
        // A browser already associated with another account must not upload its data here.
        if (owner && owner !== id) return
        const before = accountSnapshot(localStorage)
        const remote = (data?.snapshot ?? {}) as typeof before
        let signatures: Record<string, string> | undefined
        try {
          if (owner === id && !baseline) signatures = JSON.parse(localStorage.getItem(signaturesKey) ?? 'null') ?? undefined
        } catch { /* An old or invalid marker falls back to a merge. */ }
        const next = combineAccountSnapshots(before, remote, baseline, signatures)
        if (!data || Object.keys(next).some(key => next[key] !== remote[key])) {
          const result = data
            ? await query.update({ snapshot: next, revision: data.revision + 1 }).eq('user_id', id).eq('revision', data.revision).select('revision')
            : await query.insert({ user_id: id, snapshot: next }).select('revision')
          if (result.error && result.error.code !== '23505') throw result.error
          if (!result.data?.length) continue
        }
        if (run !== generation) return
        localStorage.setItem(ownerKey, id)
        let restored = false
        let profileRestored = false
        for (const [key, value] of Object.entries(next)) {
          if (localStorage.getItem(key) !== (before[key] ?? null) || before[key] === value) continue
          localStorage.setItem(key, value)
          restored = true
          if (key === 'gco:profile') profileRestored = true
        }
        localStorage.setItem(signaturesKey, JSON.stringify(snapshotSignatures(next)))
        baseline = next
        if (profileRestored) window.dispatchEvent(new Event('gco:account-profile-restored'))
        if (restored) {
          window.dispatchEvent(new Event('gco:account-restored'))
          window.dispatchEvent(new Event('gco:progress'))
          window.dispatchEvent(new Event('storage'))
        }
        return
      }
    }
    const run = () => {
      if (!job) job = sync().catch(error => console.warn('No se pudo sincronizar la cuenta', error.message))
        .finally(() => { job = undefined })
      return job
    }
    syncNow = run
    const schedule = () => { void run() }
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const next = session?.user && !session.user.is_anonymous ? session.user.id : null
      if (next === userId) return
      userId = next
      generation++
      baseline = null
      window.setTimeout(() => {
        if (job) void job.then(schedule)
        else schedule()
      }, 0)
    })
    const timer = window.setInterval(schedule, 12000)
    const resume = () => { if (!document.hidden) schedule() }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', schedule)
    window.addEventListener('gco:progress', schedule)
    window.addEventListener('gco:profile-updated', schedule)
    return () => {
      generation++
      userId = null
      data.subscription.unsubscribe()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('online', schedule)
      window.removeEventListener('gco:progress', schedule)
      window.removeEventListener('gco:profile-updated', schedule)
      if (syncNow === run) syncNow = undefined
    }
  }, [])
  return null
}
