import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = url && key ? createClient(url, key) : null
supabase?.auth.onAuthStateChange(event => {
  if (event === 'PASSWORD_RECOVERY') sessionStorage.setItem('gco:password-recovery', '1')
  if (event === 'SIGNED_OUT') sessionStorage.removeItem('gco:password-recovery')
})
