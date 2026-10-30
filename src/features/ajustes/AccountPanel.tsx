import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Cloud, LogIn, LogOut, ShieldCheck } from 'lucide-react'
import { supabase } from '@/core/cloud/supabase'
import { getProfile } from '@/core/storage/userProfile'

export function AccountPanel() {
  const [user, setUser] = useState<User | null>(null)
  const [mode, setMode] = useState<'login' | 'register' | 'reset' | 'password' | 'help'>(() => sessionStorage.getItem('gco:password-recovery') === '1' ? 'password' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState(getProfile()?.name || '')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null)
      if (event === 'PASSWORD_RECOVERY') setMode('password')
    })
    return () => data.subscription.unsubscribe()
  }, [])
  async function submit() {
    if (!supabase || lock.current) return
    lock.current = true
    setBusy(true)
    setMessage('')
    try {
      const redirectTo = `${location.origin}/ajustes/perfil`
      const response = mode === 'register'
        ? await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo, data: { display_name: username.trim() } } })
        : mode === 'reset'
          ? await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
          : mode === 'password'
            ? await supabase.auth.updateUser({ password })
            : await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (response.error) throw response.error
      setPassword('')
      setMessage(mode === 'register' ? 'Cuenta creada. Revisa tu correo para confirmar el acceso.' : mode === 'reset' ? 'Si la cuenta existe, recibirás un enlace de recuperación. Revisa también spam.' : mode === 'password' ? 'Contraseña actualizada.' : 'Sesión iniciada. Tu biblioteca y perfil local siguen disponibles.')
      if (mode === 'password') { sessionStorage.removeItem('gco:password-recovery'); setMode('login') }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'No se pudo completar. Inténtalo nuevamente.'
      setMessage(/email.*(not authorized|invalid)|email_address_not_authorized/i.test(detail) ? 'El correo gratuito de Supabase solo admite direcciones del equipo del proyecto. El administrador debe configurar un proveedor de correo para habilitar registros y recuperación externos.' : detail)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return <section className="gco-surface account-panel" aria-labelledby="account-title">
    <div className="gco-section-heading"><Cloud /><div><span className="gco-eyebrow">Tu cuenta · GCO ONE</span><h2 id="account-title">Conecta y juega</h2></div></div>
    <p>Tu perfil, libros y música locales se conservan al iniciar o cerrar sesión. La cuenta permite jugar en línea; los archivos permanecen en este dispositivo.</p>
    {!supabase && <p role="status">La conexión de cuentas todavía no está configurada.</p>}
    {user && mode !== 'password' ? <>
      <p><ShieldCheck size={18} /> {user.user_metadata.display_name || 'Jugador'} · {user.is_anonymous ? 'Invitado en línea' : user.email}</p>
      {user.is_anonymous && <p>Esta sesión invitada permite jugar sin correo. No se puede recuperar si cierras sesión o borras los datos del navegador.</p>}
      <div className="gco-actions"><button className="glass-button secondary" disabled={busy} onClick={async () => {
        if (user.is_anonymous && !window.confirm('La sesión invitada no se podrá recuperar. Tus archivos y perfil local se conservarán. ¿Cerrar sesión?')) return
        setBusy(true)
        const result = await supabase!.auth.signOut({ scope: 'local' })
        setMessage(result.error?.message || 'Sesión cerrada. Tus datos locales siguen intactos.')
        setBusy(false)
      }}><LogOut size={18} /> Cerrar sesión</button><button className="glass-button secondary" onClick={() => { setEmail(user.email || ''); setMode('reset'); void supabase!.auth.resetPasswordForEmail(user.email!, { redirectTo: `${location.origin}/ajustes/perfil` }).then(({ error }) => setMessage(error?.message || 'Revisa tu correo para cambiar la contraseña.')) }}>Recuperar contraseña</button></div>
    </> : <>
      <div className="gco-actions" role="group" aria-label="Acceso a cuenta">
        <button className="glass-button secondary" onClick={() => { setMode('login'); setMessage('') }}>Iniciar sesión</button>
        <button className="glass-button secondary" onClick={() => { setMode('register'); setMessage('') }}>Crear cuenta</button>
      </div>
      {mode === 'help' ? <div className="gco-callout"><h3>Recuperar tu acceso</h3><p>¿Olvidaste tu usuario? Puedes entrar con tu correo; el nombre se muestra al iniciar sesión.</p><p>¿Olvidaste tu correo? Revisa el gestor de contraseñas y busca mensajes de GCO en tus buzones. El nombre del perfil local no demuestra la propiedad de una cuenta y no permite revelar su correo.</p><button className="glass-button secondary" onClick={() => setMode('login')}>Volver al acceso</button></div> : <form className="gco-form" onSubmit={event => { event.preventDefault(); void submit() }}>
        {mode === 'register' && <label>Nombre de jugador<input className="glass-input" required maxLength={40} autoComplete="nickname" value={username} onChange={event => setUsername(event.target.value)} /></label>}
        {mode !== 'password' && <label>Correo electrónico<input className="glass-input" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>}
        {mode !== 'reset' && <label>Contraseña<input className="glass-input" type="password" required minLength={8} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} /></label>}
        <button className="glass-button" disabled={!supabase || busy}><LogIn size={18} /> {busy ? 'Procesando…' : mode === 'register' ? 'Crear cuenta' : mode === 'reset' ? 'Enviar enlace' : mode === 'password' ? 'Guardar contraseña' : 'Iniciar sesión'}</button>
      </form>}
      <div className="gco-actions"><button className="gco-text-button" onClick={() => setMode('reset')}>Olvidé mi contraseña</button><button className="gco-text-button" onClick={() => setMode('help')}>Olvidé mi usuario o correo</button></div>
      <button className="glass-button secondary" disabled={!supabase || busy} onClick={async () => {
        if (lock.current) return
        lock.current = true; setBusy(true)
        try { const { error } = await supabase!.auth.signInAnonymously({ options: { data: { display_name: getProfile()?.name || 'Invitado' } } }); if (error) throw error; setMessage('Sesión invitada iniciada. Ya puedes crear o unirte a una sala.') }
        catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo iniciar la sesión invitada.') }
        finally { lock.current = false; setBusy(false) }
      }}>Jugar como invitado en línea</button>
      <p style={{ fontSize: '.8rem' }}>El acceso invitado no necesita correo. Registro y recuperación por correo dependen de los destinatarios admitidos por el servicio de envío actual.</p>
    </>}
    {message && <p className="gco-callout" role="status">{message}</p>}
  </section>
}
