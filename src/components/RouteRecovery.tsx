import {Component,useEffect,type ReactNode,type ErrorInfo} from 'react'
import {Link,useLocation} from 'react-router-dom'
class Recovery extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false}
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error:Error,info:ErrorInfo){console.error('[GCO pantalla]',error,info.componentStack)}
 render(){return this.state.failed?<main className="gco-hub" role="alert"><h1>No se pudo abrir esta pantalla</h1><p>Tu perfil y tus archivos siguen guardados.</p><div className="gco-actions"><button className="glass-button" onClick={()=>this.setState({failed:false})}>Volver a intentar</button><Link className="glass-button secondary" to="/games">Ir a juegos</Link></div></main>:this.props.children}
}
export function RouteRecovery({children}:{children:ReactNode}){const location=useLocation();useEffect(()=>{let raf=0;const update=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>document.documentElement.style.setProperty('--game-vh',((window.visualViewport?.height||window.innerHeight)/100)+'px'))};update();window.addEventListener('resize',update);window.visualViewport?.addEventListener('resize',update);return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',update);window.visualViewport?.removeEventListener('resize',update)}},[]);return <Recovery key={location.key}>{children}</Recovery>}
