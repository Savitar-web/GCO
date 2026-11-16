import {sessionStorage as durableSessionStorage} from './sessionStorage'
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = url && key ? createClient(url, key, {auth:{storage:durableSessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null
supabase?.auth.onAuthStateChange(event => {
  try {
  if (event === 'PASSWORD_RECOVERY') sessionStorage.setItem('gco:password-recovery', '1')
  if (event === 'SIGNED_OUT') sessionStorage.removeItem('gco:password-recovery')
  } catch { /* Storage restrictions must not break auth events. */ }
})

// Recover after browser/PWA suspension without signing out on connectivity errors.
if(typeof window!=='undefined'&&supabase){
 const resume=()=>{if(!document.hidden&&navigator.onLine){supabase.auth.startAutoRefresh();void supabase.auth.getSession().catch(()=>{})}}
 window.addEventListener('online',resume);window.addEventListener('pageshow',resume);document.addEventListener('visibilitychange',resume)
}
