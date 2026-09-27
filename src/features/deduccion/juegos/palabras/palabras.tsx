import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import {
  soundClick,
  soundFail,
  soundSuccess,
  soundStart,
  soundToggle,
  soundMatch,
} from '@/core/audio/uiSounds'
import {
  getGameProgress,
  recordLevelResult,
  getLevelBestTime,
  getUnlockedLevels,
  formatDuration,
} from '@/core/storage/progress'

/* =============================================================================
   GymCogOrigins — palabras.tsx
   Palabras ocultas · Anagramas · Ahorcado · Crucigrama real · Sopa · Constelación
   theme.css compatible · móvil + PC · botón ← Volver preservado
   ============================================================================= */

const GAME_CAT = 'deduccion' as const
const GAME_ID = 'palabras'
const TOTAL_LEVELS_PER_MODE = 80
const MIN_WORD_LEN = 2

type SubMode = 'anagrama' | 'oculto' | 'crucigrama' | 'sopa' | 'constelacion'
type Phase = 'hub' | 'setup' | 'play' | 'result'

/* ─── Texto ─────────────────────────────────────────────────────────────── */

function strip(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
}

function letterCounts(s: string): Record<string, number> {
  const c: Record<string, number> = {}
  for (const ch of strip(s)) c[ch] = (c[ch] || 0) + 1
  return c
}

function canFormCounts(
  need: Record<string, number>,
  avail: Record<string, number>,
): boolean {
  for (const k of Object.keys(need)) {
    if ((avail[k] || 0) < need[k]) return false
  }
  return true
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function shuffleStr(s: string, seed: number): string {
  const a = s.split('')
  let x = (seed || 1) >>> 0
  for (let i = a.length - 1; i > 0; i--) {
    x = (x * 1664525 + 1013904223) >>> 0
    const j = x % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.join('')
}

const ACUTE: Record<string, string> = {
  a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú',
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u',
  A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú',
  Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U',
}

const ALPHABET = 'abcdefghijklmnñopqrstuvwxyz'.split('')

/* ─── Diccionario ES ampliado ───────────────────────────────────────────── */

const DICT_RAW: string[] = [
  'a','al','el','la','lo','de','en','es','un','una','se','no','si','ya','me','te','le','mi','tu','su',
  'y','o','u','e','ni','mas','muy','tan','tal','cual','quien','que','como','cuando','donde','porque',
  'sol','mar','luz','paz','rey','fin','mes','dia','ola','ala','aro','rio','red','dar','ver','ser',
  'oso','osa','oro','hoy','hay','vez','voz','pie','tio','tia','ano','sal','los','las','oir','mas',
  'don','eco','che','tea','ira','une','ojo','ley','pan','sur','mil','uno','dos','tres','cien',
  'amor','roma','ramo','omar','mora','rosa','aros','soar','osar','raso','masa','amas','casa','saca',
  'mesa','ames','rama','hola','halo','pato','topo','tapa','neto','tono','noto','loro','mito','noche',
  'hecho','agua','luna','nube','flor','capa','pura','ruta','pares','pena','sera','loco','rojo','azul',
  'arte','trea','fase','plato','vaso','taza','tren','cabo','arco','odio','oido','digo','lima','frio',
  'foro','mago','java','vino','mina','punta','lord','caso','idea','error','clave','cifra','mapa',
  'nodo','ruta','regla','hora','suma','resta','calle','plaza','cine','ritmo','baile','hoja','gris',
  'perro','gato','miel','jugo','mano','boca','cara','pelo','dedo','norte','este','oeste','cerca',
  'lejos','antes','lago','piel','pluma','techo','suelo','sala','oreja','hijo','hija','goma','venta',
  'piano','lengua','cuenta','semana','alto','bajo','largo','corto','ancho','lento','claro','bueno',
  'malo','nuevo','viejo','joven','feliz','serio','saber','decir','contar','oir','ver','mirar','ir',
  'venir','salir','subir','bajar','comer','beber','vivir','morir','nacer','jugar','dar','tomar',
  'dejar','poner','sacar','abrir','hacer','crear','poder','querer','deber','tener','haber','estar',
  'armar','libro','abril','verde','deber','breve','mundo','mudo','nudo','tiempo','tempo','tierra',
  'retira','tira','reta','aire','eria','buen','campo','pacto','puerta','pauta','ventana','venta',
  'silla','pensar','color','cloro','blanco','banco','negro','frase','verbo','papel','barco','cobra',
  'coche','valor','volar','calma','clama','furia','datos','codigo','poder','pedro','clima','calor',
  'coral','nieve','viene','hielo','helio','amigo','padre','pared','madre','viaje','avion','novia',
  'camino','puente','torre','retro','museo','parque','salud','dolor','miedo','medio','alegria',
  'razon','prueba','pista','logica','verdad','patron','enigma','secreto','deducir','inferir',
  'premisa','falacia','metodo','sistema','archivo','lectura','cultura','idioma','escuela',
  'maestro','alumno','familia','trabajo','dinero','precio','sociedad','justicia','libertad',
  'energia','fuerza','numero','letra','palabra','sujeto','objeto','historia','ciencia','musica',
  'cancion','corazon','cerebro','planeta','estrella','bosque','arbol','jardin','ciudad','pueblo',
  'pagina','memoria','espacio','sombra','amarillo','naranja','morado','leche','queso','fruta',
  'carne','arroz','pasta','sopa','nariz','brazo','pierna','diente','arriba','abajo','dentro',
  'fuera','despues','cuatro','cinco','seis','siete','ocho','nueve','diez','pescado','hermano',
  'hermana','abuelo','abuela','clase','cuaderno','lapiz','oficina','compra','tienda','mercado',
  'teatro','instrumento','guitarra','grande','pequeno','estrecho','rapido','fuerte','debil',
  'oscuro','caliente','bonito','anciano','triste','alegre','tranquilo','nervioso','cansado',
  'descansado','conocer','entender','aprender','estudiar','recordar','olvidar','hablar',
  'preguntar','responder','escuchar','observar','buscar','encontrar','descubrir','llegar',
  'entrar','caminar','correr','dormir','despertar','crecer','trabajar','descansar','viajar',
  'visitar','recibir','cerrar','construir','destruir','cambiar','mejorar','arreglar',
  'necesitar','atencion','analisis','sintesis','concepto','categoria','variable','constante',
  'ecuacion','teorema','axioma','paradoja','hipotesis','evidencia','detective','misterio',
  'acertijo','silogismo','deduccion','inferencia','conclusion','argumento','proposicion',
  'cuantificador','negacion','conjuncion','disyuncion','implicacion','equivalencia',
  'razonamiento','induccion','abduccion','analogia','metafora','simbolo','significado',
  'contexto','semantica','sintaxis','gramatica','ortografia','fonetica','lexico','vocabulario',
  'diccionario','enciclopedia','biblioteca','universidad','colegio','instituto','profesor',
  'estudiante','examen','ejercicio','problema','solucion','resultado','proceso','algoritmo',
  'funcion','estructura','patron','secuencia','serie','conjunto','elemento','relacion',
  'orden','caos','equilibrio','sistema','red','grafo','vertice','arista','camino','ciclo',
  'arbol','raiz','hoja','nodo','rama','profundidad','altura','ancho','matriz','vector',
  'coordenada','eje','origen','distancia','angulo','perimetro','area','volumen','masa',
  'densidad','velocidad','aceleracion','fuerza','energia','potencia','trabajo','calor',
  'temperatura','presion','volumen','mol','atomo','molecula','elemento','compuesto',
  'reaccion','catalizador','oxigeno','hidrogeno','carbono','nitrogeno','hierro','oro',
  'plata','cobre','plomo','zinc','sodio','potasio','calcio','magnesio','fosforo','azufre',
  'planeta','estrella','galaxia','universo','cosmos','orbita','satelite','cometa','asteroide',
  'meteorito','eclipse','luna','sol','tierra','marte','venus','jupiter','saturno','neptuno',
  'urano','mercurio','pluton','atmosfera','oceano','continente','isla','montana','valle',
  'rio','lago','mar','desierto','selva','pradera','tundra','glaciar','volcan','terremoto',
  'huracan','tormenta','lluvia','nieve','granizo','viento','nube','cielo','horizonte',
  'amanecer','atardecer','mediodia','medianoche','semana','mes','ano','siglo','decada',
  'minuto','segundo','instante','momento','pasado','presente','futuro','eternidad',
  'memoria','recuerdo','olvido','sueno','pesadilla','imaginacion','creatividad','ingenio',
  'inteligencia','sabiduria','conocimiento','ignorancia','curiosidad','duda','certeza',
  'verdad','mentira','realidad','ficcion','historia','mito','leyenda','cuento','novela',
  'poesia','teatro','cine','musica','pintura','escultura','arquitectura','danza','canto',
  'instrumento','melodia','armonia','ritmo','compas','nota','acorde','escala','tono',
  'silencio','ruido','eco','resonancia','vibracion','onda','frecuencia','amplitud',
  'familia','padre','madre','hijo','hija','hermano','hermana','abuelo','abuela','tio',
  'tia','primo','prima','nieto','nieta','esposo','esposa','amigo','amiga','vecino',
  'companero','colega','jefe','empleado','cliente','paciente','medico','enfermero',
  'abogado','juez','policia','bombero','soldado','piloto','conductor','cocinero',
  'camarero','vendedor','comerciante','agricultor','pescador','minero','obrero',
  'ingeniero','arquitecto','disenador','programador','escritor','periodista','artista',
  'musico','actor','actriz','cantante','deportista','entrenador','arbitro',
  'ciudad','pueblo','aldea','barrio','calle','avenida','plaza','parque','jardin',
  'edificio','casa','piso','apartamento','habitacion','cocina','bano','salon','dormitorio',
  'puerta','ventana','techo','suelo','pared','escalera','ascensor','balcon','terraza',
  'garaje','sotano','atico','oficina','tienda','mercado','supermercado','farmacia',
  'hospital','clinica','escuela','universidad','biblioteca','museo','teatro','cine',
  'estadio','gimnasio','piscina','playa','montana','bosque','campo','granja','fabrica',
  'empresa','negocio','banco','correo','estacion','aeropuerto','puerto','carretera',
  'autopista','puente','tunel','semaforo','senal','mapa','brujula','ruta',
  'viaje','turismo','hotel','hostal','camping','maleta','pasaporte','billete','ticket',
  'comida','desayuno','almuerzo','cena','merienda','aperitivo','postre','bebida',
  'agua','leche','jugo','cafe','te','vino','cerveza','refresco','pan','queso','carne',
  'pescado','pollo','huevo','arroz','pasta','sopa','ensalada','fruta','verdura','legumbre',
  'aceite','sal','azucar','pimienta','especias','chocolate','helado','galleta','pastel',
  'cuerpo','cabeza','cara','ojo','nariz','boca','oreja','pelo','cuello','hombro',
  'brazo','codo','muneca','mano','dedo','pecho','espalda','cintura','cadera','pierna',
  'rodilla','tobillo','pie','talon','hueso','musculo','sangre','corazon','pulmon',
  'higado','rinon','estomago','intestino','cerebro','nervio','piel','diente',
  'lengua','garganta','voz','aliento','latido','pulso','respiracion','sudor','lagrima',
  'sentimiento','emocion','alegria','tristeza','miedo','ira','sorpresa','asco','amor',
  'odio','envidia','celos','orgullo','humildad','verguenza','culpa','esperanza','fe',
  'confianza','respeto','gratitud','perdon','paciencia','valor','coraje','cobardia',
  'generosidad','avaricia','honestidad','mentira','justicia','injusticia','libertad',
  'esclavitud','paz','guerra','conflicto','acuerdo','dialogo','debate','discusion',
  'argumento','prueba','evidencia','testimonio','juicio','veredicto','condena','absolucion',
  'ley','norma','regla','derecho','deber','obligacion','permiso','prohibicion','sancion',
  'multa','carcel','prision','libertad','condena','indulto','amnistia','constitucion',
  'democracia','dictadura','republica','monarquia','gobierno','estado','nacion','pais',
  'territorio','frontera','bandera','himno','escudo','capital','provincia','region',
  'departamento','municipio','alcalde','concejal','presidente','ministro','diputado',
  'senador','embajador','consul','soldado','general','almirante','capitan','sargento',
  'tecnologia','ciencia','investigacion','experimento','laboratorio','microscopio',
  'telescopio','ordenador','computadora','internet','red','servidor','programa',
  'aplicacion','software','hardware','pantalla','teclado','raton','impresora',
  'telefono','movil','smartphone','tableta','reloj','camara','radio','television',
  'satelite','antena','senal','wifi','bluetooth','cable','bateria','energia','electricidad',
  'corriente','voltaje','amperio','vatio','circuito','resistencia','condensador','transistor',
  'chip','procesador','memoria','disco','archivo','carpeta','documento','imagen','video',
  'audio','texto','codigo','algoritmo','funcion','variable','constante','bucle','condicion',
  'objeto','clase','metodo','propiedad','herencia','polimorfismo','encapsulacion','interfaz',
  'base','datos','tabla','consulta','indice','transaccion','seguridad','cifrado','clave',
  'password','usuario','cuenta','sesion','login','logout','registro','perfil','configuracion',
  'ajuste','preferencia','opcion','menu','boton','icono','ventana','dialogo','mensaje',
  'notificacion','alerta','error','advertencia','exito','progreso','carga','descarga',
  'actualizacion','version','instalacion','desinstalacion','copia','seguridad','respaldo',
  'restauracion','sincronizacion','nube','servidor','cliente','protocolo','http','https',
  'html','css','javascript','typescript','python','java','ruby','rust',
  'sql','json','xml','yaml','markdown','git','repositorio','commit','branch','merge',
  'pull','push','clone','fork','issue','review','deploy','pipeline','test',
  'unitario','integracion','regresion','cobertura','rendimiento','optimizacion','refactor',
  'documentacion','comentario','licencia','copyright','source','framework','libreria',
  'paquete','modulo','dependencia','versionado','semver','changelog','readme','license',
  'rata','atar','arta','tara','gola','algo','olga','lepi','iple','zul','zap','yer','nif',
  'sem','ida','alo','ora','rao','der','rad','rev','res','sos','roo','yoh','yah','zev','zov',
  'ipe','oit','ito','ait','ita','mara','saro','oras','asca','sema','olah','apto','opta',
  'nula','anul','parte','luza','sova','azat','rent','doio','stado','lorca','orif',
]

const DICT = [...new Set(DICT_RAW.map((w) => w.toLowerCase().trim()).filter(Boolean))]

function allWordsFromLetters(letters: string, minLen = MIN_WORD_LEN): string[] {
  const avail = letterCounts(letters)
  const found = new Set<string>()
  for (const w of DICT) {
    if (w.length < minLen) continue
    if (canFormCounts(letterCounts(w), avail)) found.add(w)
  }
  return [...found].sort((a, b) => b.length - a.length || a.localeCompare(b, 'es'))
}

const LETTER_SETS = [
  'SOL', 'MAR', 'LUZ', 'PAZ', 'REY', 'FIN', 'MES', 'DIA', 'OLA', 'ALA',
  'ARO', 'RIO', 'RED', 'DAR', 'VER', 'SER', 'OSO', 'ORO', 'HOY', 'HAY',
  'VEZ', 'VOZ', 'PIE', 'TIO', 'TIA', 'AMOR', 'ROSA', 'CASA', 'MESA', 'HOLA',
  'PATO', 'NETO', 'LIBRO', 'VERDE', 'MUNDO', 'NOCHE', 'AGUA', 'FUEGO', 'TIERRA', 'AIRE',
  'LUNA', 'NUBE', 'FLOR', 'CAMPO', 'PUERTA', 'VENTANA', 'SILLA', 'PENSAR', 'COLOR', 'BLANCO',
  'NEGRO', 'ROJO', 'AZUL', 'ARTE', 'FRASE', 'VERBO', 'PLATO', 'VASO', 'TAZA', 'PAPEL',
  'TREN', 'BARCO', 'COCHE', 'VALOR', 'ODIO', 'CALMA', 'FURIA', 'DATOS', 'CODIGO', 'LEY',
  'PODER', 'CLIMA', 'CALOR', 'FRIO', 'NIEVE', 'HIELO', 'AMIGO', 'PADRE', 'MADRE', 'VIAJE',
  'AVION', 'CAMINO', 'PUENTE', 'TORRE', 'MUSEO', 'PARQUE', 'SALUD', 'DOLOR', 'MIEDO', 'ALEGRE',
  'RAZON', 'PRUEBA', 'PISTA', 'CASO', 'IDEA', 'LOGICA', 'VERDAD', 'ERROR', 'CLAVE', 'CIFRA',
  'PATRON', 'ENIGMA', 'SECRETO', 'DEDUCIR', 'INFERIR', 'PREMISA', 'FALACIA', 'METODO', 'SISTEMA', 'ARCHIVO',
  'LECTURA', 'CULTURA', 'IDIOMA', 'ESCUELA', 'MAESTRO', 'ALUMNO', 'FAMILIA', 'TRABAJO', 'DINERO', 'PRECIO',
  'SOCIEDAD', 'JUSTICIA', 'LIBERTAD', 'ENERGIA', 'FUERZA', 'NUMERO', 'LETRA', 'PALABRA', 'SUJETO', 'OBJETO',
  'HISTORIA', 'CIENCIA', 'MUSICA', 'RITMO', 'CANCION', 'CORAZON', 'CEREBRO', 'PLANETA', 'ESTRELLA', 'BOSQUE',
  'ARBOL', 'HOJA', 'JARDIN', 'CIUDAD', 'PUEBLO', 'PAGINA', 'MEMORIA', 'ESPACIO', 'SOMBRA', 'AMARILLO',
  'NARANJA', 'MORADO', 'GRIS', 'PERRO', 'GATO', 'PAN', 'MIEL', 'LECHE', 'QUESO', 'FRUTA',
  'CARNE', 'ARROZ', 'PASTA', 'SOPA', 'JUGO', 'MANO', 'BOCA', 'NARIZ', 'CARA', 'PELO',
  'BRAZO', 'PIERNA', 'DEDO', 'DIENTE', 'NORTE', 'SUR', 'ESTE', 'OESTE', 'ARRIBA', 'ABAJO',
  'DENTRO', 'FUERA', 'CERCA', 'LEJOS', 'ANTES', 'DESPUES', 'LAGO', 'PIEL', 'RATA', 'PLUMA',
]

function levelLetters(lv: number, attempt: number): string {
  const base = LETTER_SETS[(lv - 1 + attempt) % LETTER_SETS.length]
  return shuffleStr(base, lv * 31 + attempt * 17)
}

/* ─── Ahorcado ──────────────────────────────────────────────────────────── */

type HangEntry = { w: string; hints: [string, string, string] }

const HANG: HangEntry[] = [
  { w: 'deduccion', hints: ['inferencia lógica', 'sacar conclusiones', 'razonamiento'] },
  { w: 'silogismo', hints: ['dos premisas', 'conclusión formal', 'Aristóteles'] },
  { w: 'acertijo', hints: ['enigma verbal', 'adivinanza', 'juego de ingenio'] },
  { w: 'misterio', hints: ['lo oculto', 'enigma', 'por resolver'] },
  { w: 'detective', hints: ['investiga casos', 'sigue pistas', 'resuelve'] },
  { w: 'evidencia', hints: ['prueba material', 'dato observable', 'indicio fuerte'] },
  { w: 'hipotesis', hints: ['supuesto provisional', 'a comprobar', 'teoría tentativa'] },
  { w: 'patron', hints: ['secuencia repetida', 'regla oculta', 'estructura'] },
  { w: 'falacia', hints: ['error de razonamiento', 'argumento engañoso', 'trampa lógica'] },
  { w: 'premisa', hints: ['afirmación de partida', 'base del silogismo', 'supuesto inicial'] },
  { w: 'inferir', hints: ['deducir', 'concluir por indicios', 'sacar consecuencia'] },
  { w: 'enigma', hints: ['acertijo difícil', 'secreto cifrado', 'misterio verbal'] },
  { w: 'logica', hints: ['ciencia del razonamiento', 'reglas formales', 'validez'] },
  { w: 'razon', hints: ['motivo', 'facultad de pensar', 'justificación'] },
  { w: 'prueba', hints: ['demostración', 'evidencia', 'ensayo'] },
  { w: 'pista', hints: ['indicio', 'clave parcial', 'señal'] },
  { w: 'secreto', hints: ['oculto', 'confidencial', 'no revelado'] },
  { w: 'codigo', hints: ['cifrado', 'sistema de signos', 'programa'] },
  { w: 'cifra', hints: ['número', 'símbolo secreto', 'cantidad'] },
  { w: 'clave', hints: ['llave', 'solución', 'password'] },
  { w: 'mapa', hints: ['plano', 'representación', 'trayecto'] },
  { w: 'grafo', hints: ['vértices y aristas', 'red', 'relaciones'] },
  { w: 'nodo', hints: ['punto de conexión', 'vértice', 'estación'] },
  { w: 'ruta', hints: ['camino', 'itinerario', 'trayecto'] },
  { w: 'regla', hints: ['norma', 'patrón', 'instrucción'] },
  { w: 'metodo', hints: ['procedimiento', 'técnica', 'sistema'] },
  { w: 'sistema', hints: ['conjunto ordenado', 'organización', 'estructura'] },
  { w: 'archivo', hints: ['documento', 'fichero', 'registro'] },
  { w: 'memoria', hints: ['recuerdo', 'almacenamiento', 'facultad cognitiva'] },
  { w: 'atencion', hints: ['concentración', 'enfoque', 'cuidado'] },
  { w: 'analisis', hints: ['descomposición', 'examen detallado', 'estudio'] },
  { w: 'sintesis', hints: ['unión de partes', 'resumen', 'composición'] },
  { w: 'concepto', hints: ['idea abstracta', 'noción', 'definición'] },
  { w: 'categoria', hints: ['clase', 'grupo', 'tipo'] },
  { w: 'variable', hints: ['que cambia', 'símbolo matemático', 'factor'] },
  { w: 'constante', hints: ['fijo', 'invariable', 'valor fijo'] },
  { w: 'ecuacion', hints: ['igualdad matemática', 'fórmula', 'relación'] },
  { w: 'teorema', hints: ['proposición demostrada', 'verdad formal', 'resultado'] },
  { w: 'axioma', hints: ['verdad admitida', 'principio básico', 'punto de partida'] },
  { w: 'paradoja', hints: ['contradicción aparente', 'enigma lógico', 'antinomia'] },
  { w: 'algoritmo', hints: ['secuencia de pasos', 'receta computacional', 'procedimiento finito'] },
  { w: 'funcion', hints: ['relación entrada-salida', 'bloque de código', 'papel o rol'] },
  { w: 'estructura', hints: ['organización interna', 'esqueleto', 'disposición'] },
  { w: 'secuencia', hints: ['serie ordenada', 'sucesión', 'orden temporal'] },
  { w: 'conjunto', hints: ['colección de elementos', 'grupo', 'colección matemática'] },
  { w: 'relacion', hints: ['vínculo', 'conexión', 'correspondencia'] },
  { w: 'equilibrio', hints: ['balance', 'estabilidad', 'punto medio'] },
  { w: 'coordenada', hints: ['posición en ejes', 'referencia espacial', 'par ordenado'] },
  { w: 'distancia', hints: ['separación', 'intervalo espacial', 'medida entre puntos'] },
  { w: 'perimetro', hints: ['contorno', 'suma de lados', 'borde de figura'] },
  { w: 'volumen', hints: ['espacio ocupado', 'capacidad', 'tres dimensiones'] },
  { w: 'densidad', hints: ['masa por volumen', 'compactación', 'concentración'] },
  { w: 'velocidad', hints: ['rapidez con dirección', 'cambio de posición', 'km por hora'] },
  { w: 'aceleracion', hints: ['cambio de velocidad', 'incremento de rapidez', 'm/s²'] },
  { w: 'temperatura', hints: ['grado de calor', 'medida térmica', 'Celsius o Kelvin'] },
  { w: 'presion', hints: ['fuerza por área', 'atmósfera', 'bar o pascal'] },
  { w: 'molecula', hints: ['grupo de átomos', 'unidad química', 'enlace covalente'] },
  { w: 'reaccion', hints: ['cambio químico', 'transformación', 'reactivos y productos'] },
  { w: 'oxigeno', hints: ['gas que respiramos', 'elemento O', 'necesario para combustión'] },
  { w: 'hidrogeno', hints: ['elemento más ligero', 'H', 'agua tiene dos'] },
  { w: 'carbono', hints: ['base de la vida orgánica', 'C', 'diamante y grafito'] },
  { w: 'galaxia', hints: ['conjunto de estrellas', 'Vía Láctea es una', 'sistema estelar'] },
  { w: 'universo', hints: ['todo lo existente', 'cosmos', 'espacio-tiempo'] },
  { w: 'satelite', hints: ['orbita un planeta', 'Luna es natural', 'artificial de comunicación'] },
  { w: 'atmosfera', hints: ['capa de gases', 'envuelve la Tierra', 'aire'] },
  { w: 'continente', hints: ['gran masa de tierra', 'Europa es una', 'parte emergida'] },
  { w: 'montana', hints: ['elevación del terreno', 'pico alto', 'cordillera'] },
  { w: 'desierto', hints: ['zona árida', 'poca lluvia', 'Sahara'] },
  { w: 'volcan', hints: ['emite lava', 'cráter', 'erupción'] },
  { w: 'terremoto', hints: ['temblor de tierra', 'sísmico', 'fallas tectónicas'] },
  { w: 'huracan', hints: ['tormenta tropical intensa', 'vientos fuertes', 'ojo central'] },
  { w: 'horizonte', hints: ['línea cielo-tierra', 'límite visual', 'amanecer'] },
  { w: 'imaginacion', hints: ['crear imágenes mentales', 'fantasía', 'creatividad'] },
  { w: 'inteligencia', hints: ['capacidad de razonar', 'CI', 'adaptación'] },
  { w: 'sabiduria', hints: ['conocimiento profundo', 'experiencia', 'juicio acertado'] },
  { w: 'curiosidad', hints: ['deseo de saber', 'interés', 'preguntas'] },
  { w: 'metafora', hints: ['figura retórica', 'comparación implícita', 'lenguaje figurado'] },
  { w: 'semantica', hints: ['significado', 'rama lingüística', 'sentido de palabras'] },
  { w: 'sintaxis', hints: ['orden de palabras', 'estructura gramatical', 'reglas de frase'] },
  { w: 'gramatica', hints: ['reglas del idioma', 'morfología y sintaxis', 'correcto hablar'] },
  { w: 'vocabulario', hints: ['conjunto de palabras', 'léxico', 'riqueza lingüística'] },
  { w: 'biblioteca', hints: ['lugar de libros', 'préstamo', 'lectura pública'] },
  { w: 'universidad', hints: ['educación superior', 'facultades', 'grado académico'] },
  { w: 'profesor', hints: ['enseña', 'docente', 'aula'] },
  { w: 'estudiante', hints: ['aprende', 'alumno', 'estudia'] },
  { w: 'solucion', hints: ['respuesta al problema', 'desenlace', 'remedio'] },
  { w: 'proceso', hints: ['secuencia de acciones', 'desarrollo', 'pasos'] },
  { w: 'optimizacion', hints: ['mejorar al máximo', 'eficiencia', 'mínimo coste'] },
  { w: 'documentacion', hints: ['textos de referencia', 'manuales', 'comentarios de código'] },
]

/* ─── Modos ─────────────────────────────────────────────────────────────── */

const MODES: {
  id: SubMode
  title: string
  emoji: string
  desc: string
}[] = [
  {
    id: 'anagrama',
    title: 'Anagramas',
    emoji: '🔀',
    desc: 'Forma TODAS las palabras válidas con las letras. Doble toque en vocal = tilde.',
  },
  {
    id: 'oculto',
    title: 'Palabra oculta',
    emoji: '👁️',
    desc: 'Ahorcado con pistas. Fallos limitados: piensa antes de pulsar.',
  },
  {
    id: 'crucigrama',
    title: 'Crucigrama',
    emoji: '▦',
    desc: 'Casillas vacías, numeración y pistas. Rellena como un crucigrama de verdad.',
  },
  {
    id: 'sopa',
    title: 'Sopa de letras',
    emoji: '🔤',
    desc: 'Palabras ocultas en la rejilla. Arrastra en línea recta y suelta para validar.',
  },
  {
    id: 'constelacion',
    title: 'Constelación',
    emoji: '✨',
    desc: 'Une estrellas sin soltar. Si formas una palabra válida, suma.',
  },
]

/* ─── Sopa ──────────────────────────────────────────────────────────────── */

type Cell = string

const SOPA_DIRS: [number, number][] = [
  [0, 1], [1, 0], [1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1], [-1, 1],
]

function placeWordInGrid(
  grid: Cell[][],
  word: string,
  r0: number,
  c0: number,
  dr: number,
  dc: number,
): boolean {
  const n = word.length
  const rows = grid.length
  const cols = grid[0].length
  for (let i = 0; i < n; i++) {
    const r = r0 + i * dr
    const c = c0 + i * dc
    if (r < 0 || c < 0 || r >= rows || c >= cols) return false
    const ch = grid[r][c]
    if (ch !== '' && ch !== word[i]) return false
  }
  for (let i = 0; i < n; i++) {
    grid[r0 + i * dr][c0 + i * dc] = word[i]
  }
  return true
}

function buildSopa(words: string[], size: number, seed: number): {
  grid: Cell[][]
  placed: string[]
} {
  const rng = mulberry32(seed)
  const grid: Cell[][] = Array.from({ length: size }, () => Array(size).fill(''))
  const sorted = [...words].sort((a, b) => b.length - a.length)
  const placed: string[] = []

  for (const w of sorted) {
    const ww = strip(w)
    if (ww.length > size) continue
    let ok = false
    for (let tries = 0; tries < 80 && !ok; tries++) {
      const [dr, dc] = SOPA_DIRS[Math.floor(rng() * SOPA_DIRS.length)]
      const r0 = Math.floor(rng() * size)
      const c0 = Math.floor(rng() * size)
      ok = placeWordInGrid(grid, ww, r0, c0, dr, dc)
    }
    if (ok) placed.push(w)
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === '') grid[r][c] = ALPHABET[Math.floor(rng() * 27)]
    }
  }
  return { grid, placed }
}

function linePath(
  r0: number,
  c0: number,
  r1: number,
  c1: number,
): { r: number; c: number }[] {
  const dr = Math.sign(r1 - r0)
  const dc = Math.sign(c1 - c0)
  const lenR = Math.abs(r1 - r0)
  const lenC = Math.abs(c1 - c0)
  const len = Math.max(lenR, lenC)
  if (len === 0) return [{ r: r0, c: c0 }]
  if (lenR !== 0 && lenC !== 0 && lenR !== lenC) return [{ r: r0, c: c0 }]
  const path: { r: number; c: number }[] = []
  for (let i = 0; i <= len; i++) path.push({ r: r0 + i * dr, c: c0 + i * dc })
  return path
}

const SopaCell = memo(function SopaCell({
  ch,
  r,
  c,
  selected,
  marked,
  onDown,
}: {
  ch: string
  r: number
  c: number
  selected: boolean
  marked: boolean
  onDown: (r: number, c: number, e: ReactPointerEvent) => void
}) {
  return (
    <button
      type="button"
      data-r={r}
      data-c={c}
      onPointerDown={(e) => onDown(r, c, e)}
      style={{
        aspectRatio: '1',
        borderRadius: 8,
        border: `1px solid ${
          selected || marked ? 'var(--gco-primary)' : 'var(--gco-glass-border)'
        }`,
        background: marked
          ? 'var(--gco-primary-dim)'
          : selected
            ? 'var(--gco-glass-bg-hover)'
            : 'var(--gco-glass-bg)',
        color: 'var(--gco-ink)',
        fontWeight: 700,
        fontSize: 'clamp(0.7rem, 2.8vw, 0.9rem)',
        textTransform: 'uppercase',
        touchAction: 'none',
        transform: selected ? 'scale(1.05)' : 'scale(1)',
        transition: 'transform 0.08s ease, background 0.12s ease, border-color 0.12s ease',
        WebkitTapHighlightColor: 'transparent',
        minWidth: 0,
        padding: 0,
      }}
    >
      {ch}
    </button>
  )
})

/* ─── Crucigrama profesional (rejilla VACÍA) ────────────────────────────── */

type XWordClue = {
  num: number
  dir: 'H' | 'V'
  row: number
  col: number
  answer: string
  clue: string
}

type XWordPuzzle = {
  size: number
  solution: string[][]
  clues: XWordClue[]
}

const XWORD_BANK: { answer: string; clue: string }[] = [
  { answer: 'sol', clue: 'Astro que ilumina el día' },
  { answer: 'mar', clue: 'Gran masa de agua salada' },
  { answer: 'luz', clue: 'Lo contrario de la oscuridad' },
  { answer: 'paz', clue: 'Ausencia de guerra o conflicto' },
  { answer: 'rey', clue: 'Monarca masculino' },
  { answer: 'fin', clue: 'Término o conclusión' },
  { answer: 'mes', clue: 'Doce en un año' },
  { answer: 'dia', clue: 'Veinticuatro horas' },
  { answer: 'ola', clue: 'Ondulación del mar' },
  { answer: 'ala', clue: 'Extremidad para volar' },
  { answer: 'aro', clue: 'Anillo o círculo' },
  { answer: 'rio', clue: 'Corriente de agua dulce' },
  { answer: 'red', clue: 'Malla o sistema de conexiones' },
  { answer: 'dar', clue: 'Entregar algo a alguien' },
  { answer: 'ver', clue: 'Percibir con los ojos' },
  { answer: 'ser', clue: 'Verbo de existencia' },
  { answer: 'oso', clue: 'Mamífero plantígrado' },
  { answer: 'oro', clue: 'Metal precioso amarillo' },
  { answer: 'hoy', clue: 'El día presente' },
  { answer: 'voz', clue: 'Sonido de la garganta' },
  { answer: 'pie', clue: 'Extremidad inferior' },
  { answer: 'amor', clue: 'Sentimiento de afecto profundo' },
  { answer: 'rosa', clue: 'Flor de tallo espinoso' },
  { answer: 'casa', clue: 'Vivienda familiar' },
  { answer: 'mesa', clue: 'Mueble con tablero horizontal' },
  { answer: 'hola', clue: 'Saludo informal' },
  { answer: 'pato', clue: 'Ave acuática' },
  { answer: 'libro', clue: 'Conjunto de hojas encuadernadas' },
  { answer: 'verde', clue: 'Color de la hierba' },
  { answer: 'mundo', clue: 'El planeta Tierra o la humanidad' },
  { answer: 'noche', clue: 'Parte oscura del día' },
  { answer: 'agua', clue: 'H₂O, líquido vital' },
  { answer: 'fuego', clue: 'Combustión con llamas' },
  { answer: 'tierra', clue: 'Planeta o suelo cultivable' },
  { answer: 'aire', clue: 'Mezcla de gases que respiramos' },
  { answer: 'luna', clue: 'Satélite natural de la Tierra' },
  { answer: 'nube', clue: 'Masa de vapor en el cielo' },
  { answer: 'flor', clue: 'Órgano reproductor colorido de la planta' },
  { answer: 'campo', clue: 'Terreno abierto o cultivable' },
  { answer: 'puerta', clue: 'Abertura para entrar o salir' },
  { answer: 'silla', clue: 'Asiento con respaldo' },
  { answer: 'pensar', clue: 'Ejercer la mente' },
  { answer: 'color', clue: 'Propiedad visual de la luz reflejada' },
  { answer: 'blanco', clue: 'Color de la nieve pura' },
  { answer: 'negro', clue: 'Ausencia aparente de color' },
  { answer: 'rojo', clue: 'Color de la sangre' },
  { answer: 'azul', clue: 'Color del cielo despejado' },
  { answer: 'arte', clue: 'Expresión creativa humana' },
  { answer: 'frase', clue: 'Grupo de palabras con sentido completo' },
  { answer: 'verbo', clue: 'Palabra que expresa acción o estado' },
  { answer: 'plato', clue: 'Utensilio redondo para servir comida' },
  { answer: 'papel', clue: 'Hoja para escribir o imprimir' },
  { answer: 'tren', clue: 'Transporte sobre raíles' },
  { answer: 'barco', clue: 'Embarcación para navegar' },
  { answer: 'coche', clue: 'Automóvil de uso particular' },
  { answer: 'valor', clue: 'Coraje o precio de algo' },
  { answer: 'calma', clue: 'Estado de tranquilidad' },
  { answer: 'furia', clue: 'Ira violenta' },
  { answer: 'datos', clue: 'Información en bruto' },
  { answer: 'codigo', clue: 'Sistema de signos o programa' },
  { answer: 'poder', clue: 'Capacidad o autoridad' },
  { answer: 'clima', clue: 'Condiciones atmosféricas habituales' },
  { answer: 'calor', clue: 'Temperatura elevada' },
  { answer: 'frio', clue: 'Temperatura baja' },
  { answer: 'nieve', clue: 'Precipitación en copos blancos' },
  { answer: 'hielo', clue: 'Agua en estado sólido' },
  { answer: 'amigo', clue: 'Persona con vínculo de afecto' },
  { answer: 'padre', clue: 'Progenitor masculino' },
  { answer: 'madre', clue: 'Progenitora' },
  { answer: 'viaje', clue: 'Desplazamiento a un lugar lejano' },
  { answer: 'avion', clue: 'Aeronave de alas fijas' },
  { answer: 'camino', clue: 'Vía o senda para transitar' },
  { answer: 'puente', clue: 'Construcción sobre un río o valle' },
  { answer: 'torre', clue: 'Edificio alto y estrecho' },
  { answer: 'museo', clue: 'Lugar donde se exponen obras' },
  { answer: 'parque', clue: 'Zona verde de uso público' },
  { answer: 'salud', clue: 'Estado físico y mental bueno' },
  { answer: 'dolor', clue: 'Sensación física desagradable' },
  { answer: 'miedo', clue: 'Sensación de temor' },
  { answer: 'razon', clue: 'Motivo o facultad de pensar' },
  { answer: 'prueba', clue: 'Evidencia o examen' },
  { answer: 'pista', clue: 'Indicio para resolver algo' },
  { answer: 'caso', clue: 'Asunto o expediente' },
  { answer: 'idea', clue: 'Representación mental' },
  { answer: 'logica', clue: 'Ciencia del razonamiento válido' },
  { answer: 'verdad', clue: 'Conformidad con los hechos' },
  { answer: 'error', clue: 'Equivocación o fallo' },
  { answer: 'clave', clue: 'Llave o solución esencial' },
  { answer: 'cifra', clue: 'Símbolo numérico' },
  { answer: 'patron', clue: 'Modelo que se repite' },
  { answer: 'enigma', clue: 'Misterio difícil de resolver' },
  { answer: 'secreto', clue: 'Algo que se oculta' },
  { answer: 'metodo', clue: 'Procedimiento ordenado' },
  { answer: 'sistema', clue: 'Conjunto de elementos relacionados' },
  { answer: 'archivo', clue: 'Documento guardado' },
  { answer: 'lectura', clue: 'Acción de leer' },
  { answer: 'cultura', clue: 'Conjunto de saberes de un pueblo' },
  { answer: 'idioma', clue: 'Lengua de una comunidad' },
  { answer: 'escuela', clue: 'Centro de enseñanza básica' },
  { answer: 'maestro', clue: 'Docente de primaria' },
  { answer: 'alumno', clue: 'Persona que recibe enseñanza' },
  { answer: 'familia', clue: 'Grupo de parientes' },
  { answer: 'trabajo', clue: 'Actividad laboral o esfuerzo' },
  { answer: 'dinero', clue: 'Medio de intercambio' },
  { answer: 'precio', clue: 'Valor monetario de algo' },
  { answer: 'numero', clue: 'Concepto de cantidad' },
  { answer: 'letra', clue: 'Signo del alfabeto' },
  { answer: 'palabra', clue: 'Unidad mínima con significado' },
  { answer: 'historia', clue: 'Relato de hechos pasados' },
  { answer: 'ciencia', clue: 'Conocimiento sistemático' },
  { answer: 'musica', clue: 'Arte de combinar sonidos' },
  { answer: 'ritmo', clue: 'Orden temporal de sonidos' },
  { answer: 'cancion', clue: 'Composición musical con letra' },
  { answer: 'corazon', clue: 'Órgano que bombea la sangre' },
  { answer: 'cerebro', clue: 'Órgano central del pensamiento' },
  { answer: 'planeta', clue: 'Cuerpo celeste que orbita una estrella' },
  { answer: 'estrella', clue: 'Astro que emite luz propia' },
  { answer: 'bosque', clue: 'Terreno poblado de árboles' },
  { answer: 'arbol', clue: 'Planta leñosa de tronco alto' },
  { answer: 'hoja', clue: 'Órgano plano y verde de la planta' },
  { answer: 'jardin', clue: 'Terreno con plantas ornamentales' },
  { answer: 'ciudad', clue: 'Núcleo urbano de gran tamaño' },
  { answer: 'pueblo', clue: 'Localidad de menor tamaño' },
  { answer: 'memoria', clue: 'Facultad de recordar' },
  { answer: 'espacio', clue: 'Extensión indefinida o el cosmos' },
  { answer: 'sombra', clue: 'Zona privada de luz directa' },
  { answer: 'perro', clue: 'Mamífero doméstico que ladra' },
  { answer: 'gato', clue: 'Felino doméstico' },
  { answer: 'pan', clue: 'Alimento básico de harina' },
  { answer: 'miel', clue: 'Sustancia dulce de las abejas' },
  { answer: 'leche', clue: 'Líquido blanco de mamíferos' },
  { answer: 'queso', clue: 'Derivado fermentado de la leche' },
  { answer: 'fruta', clue: 'Producto dulce de algunas plantas' },
  { answer: 'carne', clue: 'Tejido muscular comestible' },
  { answer: 'arroz', clue: 'Cereal de grano pequeño' },
  { answer: 'pasta', clue: 'Alimento de harina tipo spaghetti' },
  { answer: 'sopa', clue: 'Plato líquido caliente' },
  { answer: 'mano', clue: 'Extremidad con dedos' },
  { answer: 'boca', clue: 'Abertura para comer y hablar' },
  { answer: 'nariz', clue: 'Órgano del olfato' },
  { answer: 'cara', clue: 'Parte frontal de la cabeza' },
  { answer: 'pelo', clue: 'Filamento que cubre la piel' },
  { answer: 'brazo', clue: 'Extremidad superior' },
  { answer: 'pierna', clue: 'Extremidad inferior completa' },
  { answer: 'dedo', clue: 'Apéndice de la mano o el pie' },
  { answer: 'diente', clue: 'Pieza ósea de la boca' },
  { answer: 'norte', clue: 'Punto cardinal opuesto al sur' },
  { answer: 'sur', clue: 'Punto cardinal opuesto al norte' },
  { answer: 'este', clue: 'Punto cardinal donde sale el sol' },
  { answer: 'oeste', clue: 'Punto cardinal donde se pone el sol' },
  { answer: 'arriba', clue: 'En dirección hacia el cielo' },
  { answer: 'abajo', clue: 'En dirección hacia el suelo' },
  { answer: 'dentro', clue: 'En el interior' },
  { answer: 'fuera', clue: 'En el exterior' },
  { answer: 'cerca', clue: 'A poca distancia' },
  { answer: 'lejos', clue: 'A gran distancia' },
  { answer: 'antes', clue: 'Con anterioridad' },
  { answer: 'despues', clue: 'Con posterioridad' },
]

function canPlaceXWord(
  grid: string[][],
  word: string,
  r: number,
  c: number,
  dir: 'H' | 'V',
  requireCross: boolean,
): boolean {
  const n = word.length
  const size = grid.length
  const dr = dir === 'V' ? 1 : 0
  const dc = dir === 'H' ? 1 : 0

  for (let i = 0; i < n; i++) {
    const rr = r + i * dr
    const cc = c + i * dc
    if (rr < 0 || cc < 0 || rr >= size || cc >= size) return false
    const ch = grid[rr][cc]
    if (ch !== '#' && ch !== word[i]) return false
  }

  const br = r - dr
  const bc = c - dc
  if (br >= 0 && bc >= 0 && br < size && bc < size && grid[br][bc] !== '#') return false
  const ar = r + n * dr
  const ac = c + n * dc
  if (ar >= 0 && ac >= 0 && ar < size && ac < size && grid[ar][ac] !== '#') return false

  let crosses = 0
  for (let i = 0; i < n; i++) {
    const rr = r + i * dr
    const cc = c + i * dc
    if (grid[rr][cc] === word[i]) crosses++
  }
  if (requireCross && crosses < 1) return false
  return true
}

function commitXWord(
  grid: string[][],
  word: string,
  r: number,
  c: number,
  dir: 'H' | 'V',
) {
  const dr = dir === 'V' ? 1 : 0
  const dc = dir === 'H' ? 1 : 0
  for (let i = 0; i < word.length; i++) {
    grid[r + i * dr][c + i * dc] = word[i]
  }
}

function buildCrossword(level: number, attempt: number): XWordPuzzle {
  const rng = mulberry32(level * 131 + attempt * 19 + 7)
  const size = Math.min(13, 8 + Math.floor(level / 10))
  const grid: string[][] = Array.from({ length: size }, () => Array(size).fill('#'))

  const bank = shuffleInPlace([...XWORD_BANK], rng)
  const targetCount = Math.min(bank.length, 5 + Math.floor(level / 8))
  const placed: Omit<XWordClue, 'num'>[] = []

  const first = bank[0]
  const fr = Math.floor(size / 2)
  const fc = Math.max(0, Math.min(size - first.answer.length, Math.floor((size - first.answer.length) / 2)))
  if (canPlaceXWord(grid, first.answer, fr, fc, 'H', false)) {
    commitXWord(grid, first.answer, fr, fc, 'H')
    placed.push({
      dir: 'H',
      row: fr,
      col: fc,
      answer: first.answer,
      clue: first.clue,
    })
  }

  for (let i = 1; i < bank.length && placed.length < targetCount; i++) {
    const { answer, clue } = bank[i]
    let done = false
    for (let pi = 0; pi < answer.length && !done; pi++) {
      const ch = answer[pi]
      for (let r = 0; r < size && !done; r++) {
        for (let c = 0; c < size && !done; c++) {
          if (grid[r][c] !== ch) continue
          const c0 = c - pi
          if (c0 >= 0 && canPlaceXWord(grid, answer, r, c0, 'H', true)) {
            commitXWord(grid, answer, r, c0, 'H')
            placed.push({ dir: 'H', row: r, col: c0, answer, clue })
            done = true
            break
          }
          const r0 = r - pi
          if (r0 >= 0 && canPlaceXWord(grid, answer, r0, c, 'V', true)) {
            commitXWord(grid, answer, r0, c, 'V')
            placed.push({ dir: 'V', row: r0, col: c, answer, clue })
            done = true
          }
        }
      }
    }
  }

  const startNums = new Map<string, number>()
  let nextNum = 1
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === '#') continue
      const startH =
        (c === 0 || grid[r][c - 1] === '#') &&
        c + 1 < size &&
        grid[r][c + 1] !== '#'
      const startV =
        (r === 0 || grid[r - 1][c] === '#') &&
        r + 1 < size &&
        grid[r + 1][c] !== '#'
      if (startH || startV) {
        startNums.set(`${r},${c}`, nextNum++)
      }
    }
  }

  const clues: XWordClue[] = []
  for (const p of placed) {
    const n = startNums.get(`${p.row},${p.col}`)
    if (n != null) clues.push({ ...p, num: n })
  }
  clues.sort((a, b) => a.num - b.num || (a.dir === 'H' ? -1 : 1))

  return { size, solution: grid, clues }
}

/* ─── Estilos ───────────────────────────────────────────────────────────── */

const styles = {
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '0.3rem 0.75rem',
    borderRadius: 999,
    background: 'var(--gco-primary-dim)',
    color: 'var(--gco-primary)',
    fontSize: '0.8rem',
    fontWeight: 600,
  } as CSSProperties,
  muted: {
    fontSize: '0.85rem',
    color: 'var(--gco-ink-muted)',
    lineHeight: 1.45,
  } as CSSProperties,
  gridWrap: {
    display: 'grid',
    gap: 3,
    maxWidth: 420,
    margin: '0 auto 12px',
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  } as CSSProperties,
}

/* ─── Componente principal ──────────────────────────────────────────────── */

export function PalabrasGame() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('hub')
  const [sub, setSub] = useState<SubMode | null>(null)
  const [level, setLevel] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [useTimer, setUseTimer] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [isCorrect, setIsCorrect] = useState(false)
  const startRef = useRef(Date.now())
  const timerRef = useRef<number | null>(null)

  const [rawLetters, setRawLetters] = useState('')
  const [pool, setPool] = useState<string[]>([])
  const [slot, setSlot] = useState<(string | null)[]>([])
  const [targetWords, setTargetWords] = useState<string[]>([])
  const [foundWords, setFoundWords] = useState<string[]>([])

  const [secret, setSecret] = useState('')
  const [guessed, setGuessed] = useState<Set<string>>(new Set())
  const [fails, setFails] = useState(0)
  const [maxFails, setMaxFails] = useState(6)
  const [hintsLeft, setHintsLeft] = useState(3)
  const [hintText, setHintText] = useState<string[]>([])
  const hangHintsRef = useRef<string[]>([])

  const [grid, setGrid] = useState<Cell[][]>([])
  const [gridMarks, setGridMarks] = useState<boolean[][]>([])
  const [selection, setSelection] = useState<{ r: number; c: number }[]>([])
  const selectingRef = useRef(false)
  const selStartRef = useRef<{ r: number; c: number } | null>(null)
  const selectionRef = useRef<{ r: number; c: number }[]>([])
  const gridWrapRef = useRef<HTMLDivElement | null>(null)

  const [xword, setXword] = useState<XWordPuzzle | null>(null)
  const [xUser, setXUser] = useState<string[][]>([])
  const [xFocus, setXFocus] = useState<{ r: number; c: number } | null>(null)
  const [xDir, setXDir] = useState<'H' | 'V'>('H')
  const xInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  const [constelNodes, setConstelNodes] = useState<
    { id: number; ch: string; x: number; y: number }[]
  >([])
  const [path, setPath] = useState<number[]>([])
  const pathDragging = useRef(false)
  const pathRef = useRef<number[]>([])

  const [progressTick, setProgressTick] = useState(0)
  const progress = useMemo(() => getGameProgress(GAME_CAT, GAME_ID), [progressTick, phase, level])
  const unlockedRows = useMemo(
    () => getUnlockedLevels(GAME_CAT, GAME_ID),
    [progress.highestLevel, progressTick],
  )
  const maxSelectable = Math.max(
    1,
    Math.min(TOTAL_LEVELS_PER_MODE, Math.max(1, progress.highestLevel || 1)),
    ...unlockedRows.map((u) => u.level),
  )

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => () => clearTimer(), [clearTimer])

  const finishLevel = useCallback(
    (ok: boolean) => {
      clearTimer()
      setIsCorrect(ok)
      const elapsed = Date.now() - startRef.current
      if (sub) {
        try {
          recordLevelResult({
            categoryId: GAME_CAT,
            gameId: GAME_ID,
            level,
            success: ok,
            timeMs: elapsed,
          })
          setProgressTick((t) => t + 1)
        } catch {
          /* */
        }
      }
      if (ok) soundSuccess()
      else soundFail()
      setPhase('result')
    },
    [level, sub, clearTimer],
  )

  useEffect(() => {
    if (phase !== 'play' || !useTimer) return
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearTimer()
          finishLevel(false)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return clearTimer
  }, [phase, useTimer, finishLevel, clearTimer])

  const goBack = () => {
    soundClick()
    if (phase === 'hub') {
      navigate('/categoria/deduccion')
      return
    }
    if (phase === 'setup') {
      setPhase('hub')
      setSub(null)
      return
    }
    clearTimer()
    setPhase('setup')
  }

  const startLevel = useCallback(
    (lv: number, att: number, mode: SubMode) => {
      soundStart()
      setLevel(lv)
      setAttempt(att)
      setFoundWords([])
      setGuessed(new Set())
      setFails(0)
      setHintsLeft(3)
      setHintText([])
      setSelection([])
      selectionRef.current = []
      setPath([])
      pathRef.current = []
      selectingRef.current = false
      pathDragging.current = false
      setXFocus(null)
      setXDir('H')
      startRef.current = Date.now()

      const difficulty = Math.min(1 + Math.floor((lv - 1) / 10), 8)
      setTimeLeft(useTimer ? Math.max(50, 130 - difficulty * 8) : 0)

      if (mode === 'anagrama' || mode === 'constelacion') {
        const letters = levelLetters(lv, att)
        setRawLetters(letters)
        const L = letters.toUpperCase().split('')
        setPool(L.map((ch, i) => `${ch}${i}`))
        setSlot(Array(L.length).fill(null))
        const words = allWordsFromLetters(letters, MIN_WORD_LEN)
        setTargetWords(words.length ? words : [strip(letters).toLowerCase()])

        if (mode === 'constelacion') {
          const n = L.length
          setConstelNodes(
            L.map((ch, i) => {
              const angle = (i / n) * Math.PI * 2 - Math.PI / 2
              const radius = 30 + (i % 3) * 5
              return {
                id: i,
                ch,
                x: 50 + radius * Math.cos(angle),
                y: 50 + radius * Math.sin(angle),
              }
            }),
          )
        }
      }

      if (mode === 'oculto') {
        const entry = HANG[(lv - 1 + att) % HANG.length]
        setSecret(entry.w)
        hangHintsRef.current = [...entry.hints]
        setMaxFails(Math.max(4, 7 - Math.floor(difficulty / 2)))
      }

      if (mode === 'sopa') {
        const base = levelLetters(lv, att)
        let words = allWordsFromLetters(base, 3)
        if (words.length < 4) {
          words = DICT.filter((d) => d.length >= 3 && d.length <= 8).slice(0, 12)
        }
        const count = Math.min(words.length, Math.max(4, 4 + Math.floor(lv / 12)))
        const candidates = words.slice(0, count)
        const size = Math.min(12, 7 + Math.floor(lv / 14))
        const { grid: g, placed } = buildSopa(candidates, size, lv * 97 + att * 13)
        setTargetWords(placed.length ? placed : candidates.slice(0, 3))
        setGrid(g)
        setGridMarks(g.map((row) => row.map(() => false)))
      }

      if (mode === 'crucigrama') {
        const puzzle = buildCrossword(lv, att)
        setXword(puzzle)
        setXUser(
          puzzle.solution.map((row) =>
            row.map((ch) => (ch === '#' ? '#' : '')),
          ),
        )
        setTargetWords(puzzle.clues.map((c) => c.answer))
        outer: for (let r = 0; r < puzzle.size; r++) {
          for (let c = 0; c < puzzle.size; c++) {
            if (puzzle.solution[r][c] !== '#') {
              setXFocus({ r, c })
              break outer
            }
          }
        }
      }

      setPhase('play')
    },
    [useTimer],
  )

  const placeFromPool = (token: string) => {
    soundToggle(true)
    setPool((p) => p.filter((t) => t !== token))
    setSlot((s) => {
      const next = [...s]
      const idx = next.findIndex((x) => x == null)
      if (idx >= 0) next[idx] = token
      else next.push(token)
      return next
    })
  }

  const returnToPool = (i: number) => {
    const t = slot[i]
    if (!t) return
    soundToggle(false)
    setSlot((s) => {
      const next = [...s]
      next[i] = null
      return next
    })
    setPool((p) => [...p, t])
  }

  const toggleAcute = (token: string) => {
    const mapped = ACUTE[token[0]]
    if (!mapped) return
    soundClick()
    const next = mapped + token.slice(1)
    setPool((p) => p.map((t) => (t === token ? next : t)))
    setSlot((s) => s.map((t) => (t === token ? next : t)))
  }

  const shufflePool = () => {
    soundClick()
    setPool((p) => {
      const a = [...p]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a
    })
    if (sub === 'constelacion') {
      setConstelNodes((nodes) => {
        const shuffled = [...nodes]
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        return shuffled.map((n, i) => {
          const angle = (i / shuffled.length) * Math.PI * 2 - Math.PI / 2
          const radius = 30 + (i % 3) * 5
          return {
            ...n,
            x: 50 + radius * Math.cos(angle),
            y: 50 + radius * Math.sin(angle),
          }
        })
      })
    }
  }

  const tryCommitWord = () => {
    const word = slot
      .filter(Boolean)
      .map((t) => t![0])
      .join('')
      .toLowerCase()
    if (word.length < MIN_WORD_LEN) {
      soundFail()
      return
    }
    const norm = strip(word)
    const match = targetWords.find((t) => strip(t) === norm)
    if (!match || foundWords.some((f) => strip(f) === norm)) {
      soundFail()
      return
    }
    soundMatch()
    const nextFound = [...foundWords, match]
    setFoundWords(nextFound)
    const L = rawLetters.toUpperCase().split('')
    setPool(L.map((ch, i) => `${ch}${i}`))
    setSlot(Array(L.length).fill(null))
    if (nextFound.length >= targetWords.length) finishLevel(true)
  }

  const guessLetter = (ch: string) => {
    if (guessed.has(ch)) return
    soundClick()
    const next = new Set(guessed)
    next.add(ch)
    setGuessed(next)
    const secretStrip = strip(secret)
    if (!secretStrip.includes(ch)) {
      const nf = fails + 1
      setFails(nf)
      soundFail()
      if (nf >= maxFails) finishLevel(false)
    } else {
      soundMatch()
      if (secretStrip.split('').every((c) => next.has(c))) finishLevel(true)
    }
  }

  const useHint = () => {
    if (hintsLeft <= 0) return
    soundClick()
    setHintsLeft((h) => h - 1)
    const remaining = hangHintsRef.current.filter((h) => !hintText.includes(h))
    if (remaining.length) {
      setHintText((t) => [...t, remaining[0]])
    } else {
      const secretStrip = strip(secret)
      for (const c of secretStrip) {
        if (!guessed.has(c)) {
          guessLetter(c)
          break
        }
      }
    }
  }

  const sopaPointerDown = useCallback((r: number, c: number, e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* */
    }
    selectingRef.current = true
    selStartRef.current = { r, c }
    selectionRef.current = [{ r, c }]
    setSelection([{ r, c }])
  }, [])

  const sopaUpdateFromPoint = useCallback((clientX: number, clientY: number) => {
    if (!selectingRef.current || !selStartRef.current) return
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    const btn = el?.closest?.('button[data-r]') as HTMLElement | null
    if (!btn) return
    const r = Number(btn.dataset.r)
    const c = Number(btn.dataset.c)
    if (Number.isNaN(r) || Number.isNaN(c)) return
    const path = linePath(selStartRef.current.r, selStartRef.current.c, r, c)
    const prev = selectionRef.current
    if (
      prev.length === path.length &&
      prev.every((p, i) => p.r === path[i].r && p.c === path[i].c)
    ) {
      return
    }
    selectionRef.current = path
    setSelection(path)
  }, [])

  const commitSopaSelection = useCallback(() => {
    if (!selectingRef.current) return
    selectingRef.current = false
    const path = selectionRef.current
    selectionRef.current = []
    setSelection([])
    if (path.length < 2) return
    const word = path.map((p) => grid[p.r]?.[p.c] || '').join('').toLowerCase()
    const norm = strip(word)
    const match = targetWords.find((t) => strip(t) === norm)
    if (!match || foundWords.some((f) => strip(f) === norm)) {
      soundFail()
      return
    }
    soundMatch()
    setGridMarks((marks) => {
      const next = marks.map((row) => [...row])
      for (const p of path) {
        if (next[p.r]) next[p.r][p.c] = true
      }
      return next
    })
    const nextFound = [...foundWords, match]
    setFoundWords(nextFound)
    if (nextFound.length >= targetWords.length) finishLevel(true)
  }, [grid, targetWords, foundWords, finishLevel])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (selectingRef.current) sopaUpdateFromPoint(e.clientX, e.clientY)
    }
    const onUp = () => {
      if (selectingRef.current) commitSopaSelection()
      if (pathDragging.current) commitConstel()
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  })

  const onConstelPointer = (id: number, isDown: boolean) => {
    if (isDown) {
      pathDragging.current = true
      pathRef.current = [id]
      setPath([id])
      return
    }
    if (!pathDragging.current) return
    if (pathRef.current.includes(id)) return
    pathRef.current = [...pathRef.current, id]
    setPath(pathRef.current)
  }

  const commitConstel = () => {
    pathDragging.current = false
    const p = pathRef.current
    pathRef.current = []
    setPath([])
    if (p.length < 2) return
    const word = p
      .map((id) => constelNodes.find((n) => n.id === id)?.ch || '')
      .join('')
      .toLowerCase()
    const norm = strip(word)
    const match = targetWords.find((t) => strip(t) === norm)
    if (!match || foundWords.some((f) => strip(f) === norm)) {
      soundFail()
      return
    }
    soundMatch()
    const nextFound = [...foundWords, match]
    setFoundWords(nextFound)
    if (nextFound.length >= targetWords.length) finishLevel(true)
  }

  const xCellKey = (r: number, c: number) => `${r},${c}`

  const moveXFocus = (r: number, c: number, dir: 'H' | 'V', delta: number) => {
    if (!xword) return
    const dr = dir === 'V' ? delta : 0
    const dc = dir === 'H' ? delta : 0
    let nr = r + dr
    let nc = c + dc
    while (
      nr >= 0 &&
      nc >= 0 &&
      nr < xword.size &&
      nc < xword.size &&
      xword.solution[nr][nc] === '#'
    ) {
      nr += dr
      nc += dc
    }
    if (
      nr >= 0 &&
      nc >= 0 &&
      nr < xword.size &&
      nc < xword.size &&
      xword.solution[nr][nc] !== '#'
    ) {
      setXFocus({ r: nr, c: nc })
      requestAnimationFrame(() => {
        xInputRefs.current.get(xCellKey(nr, nc))?.focus()
      })
    }
  }

  const checkXComplete = useCallback(
    (user: string[][]) => {
      if (!xword) return false
      for (let i = 0; i < xword.size; i++) {
        for (let j = 0; j < xword.size; j++) {
          if (xword.solution[i][j] === '#') continue
          if (strip(user[i][j] || '') !== strip(xword.solution[i][j])) return false
        }
      }
      return true
    },
    [xword],
  )

  const onXInput = (r: number, c: number, val: string) => {
    if (!xword) return
    const ch = strip(val).slice(-1)
    setXUser((prev) => {
      const next = prev.map((row) => [...row])
      next[r][c] = ch
      if (ch && checkXComplete(next)) {
        queueMicrotask(() => finishLevel(true))
      }
      return next
    })
    if (ch) {
      soundToggle(true)
      moveXFocus(r, c, xDir, 1)
    }
  }

  const onXKeyDown = (r: number, c: number, e: ReactKeyboardEvent) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      setXUser((prev) => {
        const next = prev.map((row) => [...row])
        if (next[r][c]) next[r][c] = ''
        else moveXFocus(r, c, xDir, -1)
        return next
      })
      return
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setXDir('H')
      moveXFocus(r, c, 'H', 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setXDir('H')
      moveXFocus(r, c, 'H', -1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setXDir('V')
      moveXFocus(r, c, 'V', 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setXDir('V')
      moveXFocus(r, c, 'V', -1)
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      setXDir((d) => (d === 'H' ? 'V' : 'H'))
    }
  }

  const xStartNum = useMemo(() => {
    if (!xword) return new Map<string, number>()
    const m = new Map<string, number>()
    for (const cl of xword.clues) {
      const k = xCellKey(cl.row, cl.col)
      if (!m.has(k)) m.set(k, cl.num)
    }
    return m
  }, [xword])

  const checkXWordManual = () => {
    if (!xword) return
    if (checkXComplete(xUser)) {
      finishLevel(true)
    } else {
      soundFail()
    }
  }

  /* ═══ RENDER ═══ */

  const renderHub = () => (
    <motion.div
      key="hub"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
    >
      <header style={{ marginBottom: '1.35rem' }}>
        <h1
          style={{
            fontSize: 'clamp(1.55rem, 5vw, 2.05rem)',
            marginBottom: 8,
            fontWeight: 700,
          }}
        >
          🔤 Palabras ocultas
        </h1>
        <p style={styles.muted}>
          Cinco modos de razonamiento verbal. Anagramas con todas las combinaciones,
          crucigrama vacío real, sopa jugable en táctil y teclado.
        </p>
        {progress.highestLevel > 0 && (
          <p
            style={{
              marginTop: 10,
              fontSize: '0.78rem',
              color: 'var(--gco-primary)',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            }}
          >
            Mejor nivel global · {progress.highestLevel}
          </p>
        )}
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        {MODES.map((m, i) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.055, duration: 0.3 }}
          >
            <GlassCard
              onClick={() => {
                soundClick()
                setSub(m.id)
                setPhase('setup')
              }}
            >
              <div
                style={{
                  padding: '1.15rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                <span style={{ fontSize: '1.75rem', lineHeight: 1 }}>{m.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '1.05rem', marginBottom: 4, fontWeight: 600 }}>
                    {m.title}
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)', lineHeight: 1.4 }}>
                    {m.desc}
                  </p>
                </div>
                <span style={{ color: 'var(--gco-ink-faint)', fontSize: '1.25rem' }}>→</span>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )

  const renderSetup = () => {
    if (!sub) return null
    const m = MODES.find((x) => x.id === sub)!
    const best = getLevelBestTime(GAME_CAT, GAME_ID, level)
    return (
      <motion.div
        key="setup"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28 }}
      >
        <div style={{ marginBottom: '1.15rem' }}>
          <span style={{ ...styles.badge, marginBottom: 10 }}>
            {m.emoji} {m.title}
          </span>
          <h2 style={{ fontSize: 'clamp(1.3rem, 4vw, 1.65rem)', marginBottom: 6 }}>
            Nivel {level}
          </h2>
          <p style={styles.muted}>
            Desbloqueados hasta nivel {maxSelectable} / {TOTAL_LEVELS_PER_MODE}
            {best != null && best > 0 ? ` · Mejor ${formatDuration(best)}` : ''}
          </p>
        </div>

        <GlassCard>
          <div style={{ padding: '1.2rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
                gap: 12,
              }}
            >
              <span style={{ fontSize: '0.92rem' }}>Temporizador</span>
              <button
                type="button"
                className={`glass-button ${useTimer ? 'primary' : 'secondary'}`}
                style={{ padding: '0.4rem 0.9rem', fontSize: '0.82rem' }}
                onClick={() => {
                  setUseTimer((v) => {
                    const n = !v
                    soundToggle(n)
                    return n
                  })
                }}
              >
                {useTimer ? 'ON' : 'OFF'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <button
                type="button"
                className="glass-button secondary"
                disabled={level <= 1}
                onClick={() => {
                  soundClick()
                  setLevel((l) => Math.max(1, l - 1))
                }}
              >
                − Nivel
              </button>
              <button
                type="button"
                className="glass-button secondary"
                disabled={level >= maxSelectable}
                onClick={() => {
                  soundClick()
                  setLevel((l) => Math.min(maxSelectable, l + 1))
                }}
              >
                + Nivel
              </button>
            </div>

            <GlassButton
              onClick={() => {
                setAttempt(0)
                startLevel(level, 0, sub)
              }}
            >
              Jugar nivel {level}
            </GlassButton>
          </div>
        </GlassCard>
      </motion.div>
    )
  }

  const renderPlay = () => {
    if (!sub) return null
    const m = MODES.find((x) => x.id === sub)!

    return (
      <motion.div
        key="play"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.5rem 0.85rem',
            marginBottom: '0.95rem',
          }}
        >
          <span style={styles.badge}>
            {m.emoji} {m.title}
          </span>
          <p style={{ ...styles.muted, margin: 0, fontSize: '0.84rem' }}>
            {sub === 'oculto' && 'Adivina la palabra'}
            {sub === 'crucigrama' && `${xword?.clues.length ?? 0} pistas · casillas vacías`}
            {sub !== 'oculto' && sub !== 'crucigrama' && (
              <>
                {foundWords.length}/{targetWords.length} palabras
                {foundWords.length > 0 && foundWords.length <= 10 && (
                  <span style={{ color: 'var(--gco-primary)' }}>
                    {' '}
                    · {foundWords.join(', ')}
                  </span>
                )}
              </>
            )}
          </p>
        </div>

        {sub === 'anagrama' && (
          <GlassCard>
            <div style={{ padding: '1.2rem' }}>
              <p style={{ ...styles.muted, marginBottom: 10 }}>
                Forma <strong style={{ color: 'var(--gco-ink)' }}>todas</strong> las palabras
                posibles ({targetWords.length}). Doble toque en vocal = tilde.
              </p>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 4,
                  marginBottom: 14,
                  maxHeight: 88,
                  overflowY: 'auto',
                }}
              >
                {targetWords.map((w) => {
                  const done = foundWords.some((f) => strip(f) === strip(w))
                  return (
                    <span
                      key={w}
                      style={{
                        fontSize: '0.72rem',
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: done ? 'var(--gco-primary-dim)' : 'var(--gco-glass-bg)',
                        color: done ? 'var(--gco-primary)' : 'var(--gco-ink-muted)',
                        textDecoration: done ? 'line-through' : 'none',
                        border: '1px solid var(--gco-glass-border)',
                      }}
                    >
                      {done ? w : '·'.repeat(Math.min(w.length, 10))}
                    </span>
                  )
                })}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  minHeight: 48,
                  marginBottom: 12,
                }}
              >
                {slot.map((t, i) => (
                  <motion.button
                    key={i}
                    type="button"
                    onClick={() => returnToPool(i)}
                    whileTap={{ scale: 0.92 }}
                    style={{
                      width: 42,
                      height: 46,
                      borderRadius: 10,
                      border: '1px solid var(--gco-glass-border)',
                      background: t ? 'var(--gco-primary-dim)' : 'var(--gco-input-bg)',
                      color: 'var(--gco-ink)',
                      fontWeight: 700,
                      fontSize: '1.15rem',
                    }}
                  >
                    {t ? t[0] : '·'}
                  </motion.button>
                ))}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                {pool.map((t) => (
                  <motion.button
                    key={t}
                    type="button"
                    className="glass-button secondary"
                    style={{ minWidth: 42, padding: '0.5rem 0.65rem', fontWeight: 700 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => placeFromPool(t)}
                    onDoubleClick={() => toggleAcute(t)}
                  >
                    {t[0]}
                  </motion.button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <GlassButton onClick={tryCommitWord}>Validar</GlassButton>
                <button type="button" className="glass-button secondary" onClick={shufflePool}>
                  Barajar
                </button>
                <button
                  type="button"
                  className="glass-button secondary"
                  onClick={() => {
                    soundClick()
                    const L = rawLetters.toUpperCase().split('')
                    setPool(L.map((ch, i) => `${ch}${i}`))
                    setSlot(Array(L.length).fill(null))
                  }}
                >
                  Reiniciar
                </button>
              </div>
            </div>
          </GlassCard>
        )}

        {sub === 'oculto' && (
          <GlassCard>
            <div style={{ padding: '1.2rem', textAlign: 'center' }}>
              <p
                style={{
                  fontSize: 'clamp(1.4rem, 5.5vw, 1.85rem)',
                  letterSpacing: '0.2em',
                  marginBottom: 14,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                }}
              >
                {strip(secret)
                  .split('')
                  .map((c) => (guessed.has(c) ? c.toUpperCase() : '_'))
                  .join(' ')}
              </p>
              <p style={{ ...styles.muted, marginBottom: 10 }}>
                Fallos {fails}/{maxFails} · Pistas {hintsLeft}/3
              </p>
              {hintText.length > 0 && (
                <p style={{ fontSize: '0.88rem', color: 'var(--gco-primary)', marginBottom: 12 }}>
                  {hintText.join(' · ')}
                </p>
              )}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 5,
                  justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                {ALPHABET.map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    disabled={guessed.has(ch)}
                    className="glass-button secondary"
                    style={{
                      minWidth: 36,
                      padding: '0.42rem',
                      opacity: guessed.has(ch) ? 0.32 : 1,
                      fontWeight: 600,
                    }}
                    onClick={() => guessLetter(ch)}
                  >
                    {ch}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="glass-button secondary"
                disabled={hintsLeft <= 0}
                onClick={useHint}
              >
                Pista ({hintsLeft})
              </button>
            </div>
          </GlassCard>
        )}

        {sub === 'sopa' && (
          <GlassCard>
            <div style={{ padding: '1rem' }}>
              <p style={{ ...styles.muted, marginBottom: 10 }}>
                Arrastra en línea recta (horizontal, vertical o diagonal). Suelta para validar.
              </p>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 4,
                  marginBottom: 12,
                  justifyContent: 'center',
                }}
              >
                {targetWords.map((w) => {
                  const done = foundWords.some((f) => strip(f) === strip(w))
                  return (
                    <span
                      key={w}
                      style={{
                        fontSize: '0.75rem',
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: done ? 'var(--gco-primary-dim)' : 'var(--gco-glass-bg)',
                        color: done ? 'var(--gco-primary)' : 'var(--gco-ink-muted)',
                        textDecoration: done ? 'line-through' : 'none',
                        border: '1px solid var(--gco-glass-border)',
                        fontWeight: 600,
                      }}
                    >
                      {w}
                    </span>
                  )
                })}
              </div>
              <div
                ref={gridWrapRef}
                style={{
                  ...styles.gridWrap,
                  gridTemplateColumns: `repeat(${grid[0]?.length || 8}, minmax(28px, 1fr))`,
                }}
              >
                {grid.map((row, r) =>
                  row.map((ch, c) => (
                    <SopaCell
                      key={`${r}-${c}`}
                      ch={ch}
                      r={r}
                      c={c}
                      selected={selection.some((p) => p.r === r && p.c === c)}
                      marked={!!gridMarks[r]?.[c]}
                      onDown={sopaPointerDown}
                    />
                  )),
                )}
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)', textAlign: 'center' }}>
                Suelta el dedo o el ratón para validar el trazo
              </p>
            </div>
          </GlassCard>
        )}

        {sub === 'crucigrama' && xword && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <GlassCard>
              <div style={{ padding: '0.9rem' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${xword.size}, minmax(26px, 1fr))`,
                    gap: 2,
                    maxWidth: Math.min(440, xword.size * 36),
                    margin: '0 auto',
                  }}
                >
                  {xword.solution.map((row, r) =>
                    row.map((sol, c) => {
                      if (sol === '#') {
                        return (
                          <div
                            key={`${r}-${c}`}
                            style={{
                              aspectRatio: '1',
                              borderRadius: 3,
                              background: 'var(--gco-ink)',
                              opacity: 0.5,
                            }}
                          />
                        )
                      }
                      const num = xStartNum.get(xCellKey(r, c))
                      const focused = xFocus?.r === r && xFocus?.c === c
                      const val = xUser[r]?.[c] || ''
                      return (
                        <div
                          key={`${r}-${c}`}
                          style={{
                            position: 'relative',
                            aspectRatio: '1',
                            borderRadius: 4,
                            border: `1.5px solid ${
                              focused ? 'var(--gco-primary)' : 'var(--gco-glass-border)'
                            }`,
                            background: focused
                              ? 'var(--gco-primary-dim)'
                              : 'var(--gco-bg-elevated)',
                            boxShadow: focused
                              ? '0 0 0 1px var(--gco-primary-dim)'
                              : 'none',
                          }}
                        >
                          {num != null && (
                            <span
                              style={{
                                position: 'absolute',
                                top: 1,
                                left: 2,
                                fontSize: 8,
                                fontWeight: 700,
                                color: 'var(--gco-ink-muted)',
                                lineHeight: 1,
                                pointerEvents: 'none',
                                zIndex: 1,
                              }}
                            >
                              {num}
                            </span>
                          )}
                          <input
                            ref={(el) => {
                              if (el) xInputRefs.current.set(xCellKey(r, c), el)
                              else xInputRefs.current.delete(xCellKey(r, c))
                            }}
                            value={val}
                            maxLength={1}
                            inputMode="text"
                            autoCapitalize="characters"
                            autoCorrect="off"
                            spellCheck={false}
                            onFocus={() => setXFocus({ r, c })}
                            onChange={(e) => onXInput(r, c, e.target.value)}
                            onKeyDown={(e) => onXKeyDown(r, c, e)}
                            onClick={() => {
                              if (xFocus?.r === r && xFocus?.c === c) {
                                setXDir((d) => (d === 'H' ? 'V' : 'H'))
                              }
                            }}
                            style={{
                              width: '100%',
                              height: '100%',
                              border: 'none',
                              background: 'transparent',
                              textAlign: 'center',
                              fontWeight: 700,
                              fontSize: 'clamp(0.7rem, 3.2vw, 1rem)',
                              color: 'var(--gco-ink)',
                              textTransform: 'uppercase',
                              caretColor: 'var(--gco-primary)',
                              padding: 0,
                              outline: 'none',
                            }}
                            aria-label={`Fila ${r + 1} columna ${c + 1}${num ? ` número ${num}` : ''}`}
                          />
                        </div>
                      )
                    }),
                  )}
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    justifyContent: 'center',
                    marginTop: 12,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: 'var(--gco-ink-muted)' }}>
                    {xDir === 'H' ? '→ Horizontal' : '↓ Vertical'} · espacio cambia dirección
                  </span>
                  <button
                    type="button"
                    className="glass-button secondary"
                    style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem' }}
                    onClick={checkXWordManual}
                  >
                    Comprobar
                  </button>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <div style={{ padding: '1.05rem' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '1.1rem',
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--gco-ink-muted)',
                        marginBottom: 8,
                      }}
                    >
                      Horizontales
                    </p>
                    {xword.clues
                      .filter((c) => c.dir === 'H')
                      .map((c) => (
                        <button
                          key={`H${c.num}-${c.answer}`}
                          type="button"
                          onClick={() => {
                            soundClick()
                            setXDir('H')
                            setXFocus({ r: c.row, c: c.col })
                            requestAnimationFrame(() => {
                              xInputRefs.current.get(xCellKey(c.row, c.col))?.focus()
                            })
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            background: 'transparent',
                            border: 'none',
                            padding: '5px 0',
                            cursor: 'pointer',
                            color: 'var(--gco-ink)',
                            fontSize: '0.82rem',
                            lineHeight: 1.4,
                          }}
                        >
                          <strong style={{ color: 'var(--gco-primary)' }}>{c.num}.</strong>{' '}
                          {c.clue}
                        </button>
                      ))}
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--gco-ink-muted)',
                        marginBottom: 8,
                      }}
                    >
                      Verticales
                    </p>
                    {xword.clues
                      .filter((c) => c.dir === 'V')
                      .map((c) => (
                        <button
                          key={`V${c.num}-${c.answer}`}
                          type="button"
                          onClick={() => {
                            soundClick()
                            setXDir('V')
                            setXFocus({ r: c.row, c: c.col })
                            requestAnimationFrame(() => {
                              xInputRefs.current.get(xCellKey(c.row, c.col))?.focus()
                            })
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            background: 'transparent',
                            border: 'none',
                            padding: '5px 0',
                            cursor: 'pointer',
                            color: 'var(--gco-ink)',
                            fontSize: '0.82rem',
                            lineHeight: 1.4,
                          }}
                        >
                          <strong style={{ color: 'var(--gco-primary)' }}>{c.num}.</strong>{' '}
                          {c.clue}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        )}

        {sub === 'constelacion' && (
          <GlassCard>
            <div style={{ padding: '1rem' }}>
              <p style={{ ...styles.muted, marginBottom: 10 }}>
                Une estrellas sin soltar. Si la secuencia es una palabra válida, suma.
              </p>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: 320,
                  aspectRatio: '1',
                  margin: '0 auto 12px',
                  borderRadius: '50%',
                  background:
                    'radial-gradient(circle at 28% 28%, var(--gco-primary-dim), transparent 55%), radial-gradient(circle at 72% 62%, var(--gco-orb-2, rgba(139,124,246,0.12)), transparent 50%), var(--gco-bg-elevated)',
                  border: '1px solid var(--gco-glass-border)',
                  overflow: 'hidden',
                  touchAction: 'none',
                }}
              >
                <svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 100 100"
                  style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                >
                  {path.length > 1 &&
                    path.slice(1).map((id, i) => {
                      const a = constelNodes.find((n) => n.id === path[i])
                      const b = constelNodes.find((n) => n.id === id)
                      if (!a || !b) return null
                      return (
                        <line
                          key={`${path[i]}-${id}`}
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          stroke="var(--gco-primary)"
                          strokeWidth="0.75"
                          strokeLinecap="round"
                        />
                      )
                    })}
                </svg>
                {constelNodes.map((n) => {
                  const on = path.includes(n.id)
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault()
                        try {
                          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
                        } catch {
                          /* */
                        }
                        onConstelPointer(n.id, true)
                      }}
                      onPointerEnter={() => {
                        if (pathDragging.current) onConstelPointer(n.id, false)
                      }}
                      style={{
                        position: 'absolute',
                        left: `${n.x}%`,
                        top: `${n.y}%`,
                        transform: 'translate(-50%, -50%)',
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        border: `1.5px solid ${on ? 'var(--gco-primary)' : 'var(--gco-glass-border)'}`,
                        background: on ? 'var(--gco-primary)' : 'var(--gco-glass-bg)',
                        color: on ? 'var(--gco-button-text)' : 'var(--gco-ink)',
                        fontWeight: 700,
                        fontSize: '0.92rem',
                        boxShadow: on ? '0 0 14px var(--gco-primary-dim)' : 'none',
                        cursor: 'pointer',
                        touchAction: 'none',
                        zIndex: 2,
                      }}
                    >
                      {n.ch}
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="glass-button secondary"
                  onClick={() => {
                    setPath([])
                    pathRef.current = []
                  }}
                >
                  Borrar trazo
                </button>
                <button type="button" className="glass-button secondary" onClick={shufflePool}>
                  Barajar cielo
                </button>
              </div>
            </div>
          </GlassCard>
        )}
      </motion.div>
    )
  }

  const renderResult = () => (
    <motion.div
      key="res"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
    >
      <GlassCard>
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <p
            style={{
              fontWeight: 700,
              fontSize: '1.3rem',
              color: isCorrect ? 'var(--gco-primary)' : 'var(--gco-secondary)',
              marginBottom: 6,
            }}
          >
            {isCorrect ? '✨ Nivel superado' : 'No superado'}
          </p>
          <p style={{ color: 'var(--gco-ink-muted)', margin: '8px 0 18px' }}>
            {formatDuration(Date.now() - startRef.current)}
            {sub !== 'oculto' && sub !== 'crucigrama' && (
              <>
                {' '}
                · {foundWords.length}/{targetWords.length}
              </>
            )}
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {isCorrect ? (
              <GlassButton
                onClick={() => {
                  if (!sub) return
                  setAttempt(0)
                  startLevel(Math.min(level + 1, TOTAL_LEVELS_PER_MODE), 0, sub)
                }}
              >
                Siguiente nivel
              </GlassButton>
            ) : (
              <GlassButton
                onClick={() => {
                  if (!sub) return
                  const nextAtt = attempt + 1
                  setAttempt(nextAtt)
                  startLevel(level, nextAtt, sub)
                }}
              >
                Otro intento
              </GlassButton>
            )}
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => {
                soundClick()
                setPhase('setup')
              }}
            >
              Menú del modo
            </button>
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => {
                soundClick()
                setPhase('hub')
                setSub(null)
              }}
            >
              Cambiar modo
            </button>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  )

  return (
    <div className="app-shell">
      <header
        style={{
          marginBottom: '1.15rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <button
          className="glass-button secondary"
          onClick={goBack}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
          aria-label={phase === 'hub' ? 'Volver a Deducción' : 'Volver'}
        >
          {phase === 'hub' ? '← Volver' : phase === 'setup' ? '← Modos' : '← Menú'}
        </button>
        <div
          style={{
            display: 'flex',
            gap: '0.65rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          {phase === 'play' && useTimer && (
            <span
              style={{
                fontSize: '0.95rem',
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                color: timeLeft <= 15 ? 'var(--gco-secondary)' : 'var(--gco-ink-muted)',
                fontWeight: timeLeft <= 15 ? 700 : 400,
              }}
            >
              ⏱ {timeLeft}s
            </span>
          )}
          {(phase === 'play' || phase === 'result' || phase === 'setup') && sub && (
            <span style={{ fontSize: '1.05rem', fontWeight: 600 }}>Nv. {level}</span>
          )}
        </div>
      </header>

      <AnimatePresence mode="wait">
        {phase === 'hub' && renderHub()}
        {phase === 'setup' && renderSetup()}
        {phase === 'play' && renderPlay()}
        {phase === 'result' && renderResult()}
      </AnimatePresence>
    </div>
  )
}

export default PalabrasGame