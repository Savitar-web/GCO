import { useState } from 'react'

export function AppTerms() {
  const [open, setOpen] = useState(false)
  return <>
    <button className="glass-button secondary" type="button" onClick={() => setOpen(true)}>Términos, privacidad y licencias</button>
    {open && <div className="terms-overlay" role="dialog" aria-modal="true" aria-label="Términos y privacidad" onClick={() => setOpen(false)}>
      <article className="gco-surface terms-body" onClick={event => event.stopPropagation()}>
        <button type="button" className="glass-button secondary" onClick={() => setOpen(false)}>Cerrar</button>
        <h2>GymCogOrigins · Términos y privacidad</h2>
        <p>Versión del 14 de noviembre de 2026. GCO ofrece ejercicios cognitivos, juegos individuales y multijugador, estadísticas, rutinas, lectura de documentos y reproducción multimedia. El resultado de un ejercicio es orientativo.</p>
        <h3>Cuenta y progreso</h3>
        <p>Al iniciar sesión, GCO guarda el perfil, nombre, edad, foto, marco, preferencias incluidas en el respaldo y registros de juego en Supabase. La cuenta permite recuperarlos y combinar los avances realizados en distintos dispositivos. Los resultados sin conexión se guardan localmente y se sincronizan al recuperar la conexión. La sesión se mantiene hasta cerrar sesión, perder su validez o borrar los datos de la aplicación.</p>
        <h3>Privacidad y acceso</h3>
        <p>Las políticas de acceso restringen el respaldo a su propietario. Las credenciales administrativas del servicio permiten acceso técnico a los datos del servidor. El respaldo actual no utiliza cifrado de extremo a extremo. Por ello, GCO no puede prometer que un administrador de infraestructura carezca de acceso técnico. Protege el acceso a tu dispositivo y a tu cuenta.</p>
        <h3>Libros y música</h3>
        <p>Los libros, documentos originales, canciones y vídeos importados se almacenan en el dispositivo. La sincronización de cuenta no sube estos archivos. La reproducción de servicios externos solicita contenido a esos servicios. Importa y comparte sólo archivos para los que tengas autorización. Los formatos, fuentes y funciones de lectura dependen del documento y de la compatibilidad del dispositivo. Los PDF compuestos sólo por imágenes necesitan reconocimiento de texto para leerse en voz alta.</p>
        <h3>Partidas y chat</h3>
        <p>Una partida en línea comparte el nombre, avatar, victorias y jugadas con sus participantes. «Pensando» indica que el rival tiene el turno y todavía no ha movido. El chat privado transmite mensajes e imágenes WebP durante la partida, sin guardarlos como historial de la cuenta. Al finalizar se descartan en la aplicación. Los participantes pueden hacer capturas de lo recibido. La infraestructura puede mantener registros técnicos conforme a sus políticas.</p>
        <h3>Funciones sin conexión y recursos</h3>
        <p>GCO prepara automáticamente los recursos de la aplicación y las dos IA de ajedrez para su uso sin conexión. La primera preparación requiere conexión y espacio suficiente. Los instaladores incluyen estos recursos. Android puede pedir autorización para notificaciones, imagen en imagen o ajustes de ventana flotante. Algunas funciones dependen del sistema operativo.</p>
        <h3>Ajedrez y licencias</h3>
        <p>IA Verónica y Conde utilizan las variantes completa y compacta de Stockfish.js 19, basado en Stockfish y distribuido bajo GPLv3. La fuerza se regula de 1 a 100. Un fallo de inicialización puede activar el cálculo de respaldo de GCO. La licencia y el código fuente del motor están incluidos en la aplicación.</p>
        <p><a href="/chess/stockfish-19.0.1/Copying.txt" target="_blank" rel="noreferrer">Licencia GPLv3</a> · <a href="/chess/stockfish-19.0.1/source.tar.gz" download>Código fuente del motor</a></p>
        <h3>Control de datos</h3>
        <p>Puedes exportar tus datos desde Ajustes y cerrar sesión. Desinstalar la aplicación o borrar los datos del navegador puede eliminar los archivos locales. Una copia de la cuenta sólo recupera los datos incluidos en su sincronización. La eliminación de datos de cuenta debe gestionarse con el responsable del servicio hasta disponer de una función específica.</p>
      </article>
    </div>}
  </>
}
