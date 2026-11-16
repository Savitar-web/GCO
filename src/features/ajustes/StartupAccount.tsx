import {useEffect,useState} from 'react'
import {supabase} from '@/core/cloud/supabase'
import {AccountPanel} from './AccountPanel'
export function StartupAccount(){
 const [open,setOpen]=useState(false)
 useEffect(()=>{let active=true;if(!supabase)return;void supabase.auth.getSession().then(({data,error})=>{if(active&&!error&&!data.session&&!localStorage.getItem('gco:account-sync-owner')){try{if(!localStorage.getItem('gco:account-introduction-v1'))setOpen(true)}catch{setOpen(true)}}}).catch(()=>{});return()=>{active=false}},[])
 if(!open)return null
 return <div className="startup-account" role="dialog" aria-modal="true" aria-label="Iniciar sesión"><div><AccountPanel/><button className="glass-button secondary" onClick={()=>{try{localStorage.setItem('gco:account-introduction-v1','1')}catch{/* Private storage can be unavailable. */}setOpen(false)}}>Continuar a mi perfil</button></div></div>
}
