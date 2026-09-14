import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const GAME_CAT = 'deduccion' as const
const GAME_ID = 'palabras'
const TOTAL_LEVELS_PER_MODE = 80

type SubMode = 'anagrama' | 'oculto' | 'crucigrama' | 'sopa' | 'constelacion'

/* ─────────────────────────────────────────────────────────────
   Diccionario ES (minúsculas, con tildes). Ampliado para que
   anagrama / constelación muestren TODAS las formaciones válidas.
   ───────────────────────────────────────────────────────────── */
const DICT = [
  'a','al','el','la','lo','de','en','es','un','una','se','no','si','ya','me','te','le','mi','tu','su',
  'sol','los','las','sal','ola','ala','aro','mar','rio','oir','luz','dia','red','dar','ver','ser',
  'mas','oso','osa','oro','hoy','hay','vez','voz','paz','pie','tio','tia','mes','ano',
  'amor','roma','ramo','omar','mora','rosa','aros','soar','osar','raso','masa','amas','casa','saca',
  'mesa','ames','rama','armar','hola','halo','pato','topo','tapa','neto','tono','noto','libro','abril',
  'loro','rol','bol','verde','deber','breve','mundo','mudo','nudo','don','tiempo','tempo','mite','tipo',
  'mito','noche','hecho','eco','che','agua','fuego','feo','tierra','retira','tira','reta','ria','tea',
  'ira','aire','eria','luna','nube','buen','une','flor','campo','pacto','capa','puerta','pauta','pura',
  'ruta','ventana','venta','nave','silla','pensar','pares','pena','sera','color','cloro','loco','blanco',
  'banco','clan','negro','rojo','ojo','azul','arte','trea','frase','fase','verbo','plato','talo',
  'vaso','taza','papel','pale','tren','barco','cobra','cabo','arco','coche','valor','volar','odio','oido',
  'calma','clama','furia','datos','codigo','digo','ley','poder','pedro','clima','lima','calor','coral',
  'frio','foro','nieve','viene','hielo','helio','amigo','mago','padre','pared','madre','viaje','java',
  'avion','novia','vino','camino','mina','puente','punta','torre','retro','museo','parque','salud','dolor',
  'lord','miedo','medio','alegria','razon','prueba','pista','caso','idea','logica','verdad','error','clave',
  'cifra','patron','enigma','secreto','deducir','inferir','premisa','falacia','metodo','sistema','archivo',
  'lectura','cultura','idioma','escuela','maestro','alumno','familia','trabajo','dinero','precio','sociedad',
  'justicia','libertad','energia','fuerza','numero','letra','palabra','sujeto','objeto','historia','ciencia',
  'musica','ritmo','cancion','corazon','cerebro','planeta','estrella','bosque','arbol','hoja','jardin',
  'ciudad','pueblo','casa','puerta','mesa','silla','libro','pagina','pensar','memoria','espacio','sombra',
  'amarillo','naranja','morado','gris','perro','gato','pan','miel','leche','queso','fruta','carne','arroz',
  'pasta','sopa','jugo','mano','pie','ojo','boca','nariz','cara','pelo','brazo','pierna','dedo','diente',
  'norte','sur','este','oeste','arriba','abajo','dentro','fuera','cerca','lejos','antes','despues',
  'uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','cien','mil',
  'ser','estar','haber','tener','hacer','poder','decir','ir','ver','dar','saber','querer','llegar','pasar',
  'deber','poner','parecer','quedar','creer','hablar','llevar','dejar','seguir','encontrar','llamar','venir',
  'pensar','salir','volver','tomar','conocer','vivir','sentir','tratar','mirar','contar','empezar','esperar',
  'buscar','existir','entrar','trabajar','escribir','perder','producir','ocurrir','entender','pedir','recibir',
  'recordar','terminar','permitir','aparecer','conseguir','comenzar','servir','sacar','necesitar','mantener',
  'resultar','leer','caer','cambiar','presentar','crear','abrir','considerar','oir','acabar','convertir',
  'ganar','formar','traer','partir','morir','aceptar','realizar','suponer','comprender','lograr','explicar',
  'preguntar','tocar','reconocer','estudiar','alcanzar','nacer','dirigir','correr','utilizar','pagar','ayudar',
  'gustar','jugar','escuchar','cumplir','ofrecer','descubrir','levantar','intentar','usar','valer',
  'rata','arte','reta','tera','atre','atre','atre',
  'sol','sal','los','ola','las','aso','als','soa',
  'mar','ram','arm','rama','amar','arma','rama',
  'luz','zul',
  'rio','oir','iro',
  'paz','zap',
  'rey','yer',
  'fin','nif',
  'mes','sem','ems',
  'dia','aid','ida',
  'ola','alo','loa',
  'ala','aal',
  'aro','ora','rao','oar',
  'red','der','erd',
  'dar','rad','ard',
  'ver','rev','erv',
  'ser','res','ers',
  'oso','sos',
  'oro','roo',
  'hoy','yoh',
  'hay','yah','ahy',
  'vez','zev',
  'voz','zov',
  'pie','ipe','epi',
  'tio','oit','ito',
  'tia','ait','ita',
  'amor','roma','ramo','omar','mora','ramo','arma','maro',
  'rosa','aros','soar','osar','raso','saro','oras','asor',
  'casa','saca','asca','acas','saca',
  'mesa','ames','sema','esma','mase',
  'hola','halo','olah','loah','ahol',
  'pato','topo','tapa','apto','opta','pota',
  'neto','tono','noto','ento','onte','toen',
  'libro','abril','bilro','orlib',
  'verde','deber','breve','reved','edrev',
  'mundo','mudo','nudo','domun',
  'noche','hecho','eco','che','ohen','henco',
  'agua','gaau','ugaa',
  'fuego','feo','gufoe',
  'tierra','retira','tira','reta','ria','tea','ira','aire','eria',
  'luna','nula','anul','ulan',
  'nube','buen','une','benu','nebu',
  'flor','rolf','lofr',
  'campo','pacto','capa','mopac',
  'puerta','pauta','pura','ruta','parte','tapuer',
  'ventana','venta','nave','avnet','tenav',
  'silla','allis','llasi',
  'pensar','pares','pena','sera','raspe','asper',
  'color','cloro','loco','orcol','roloc',
  'blanco','banco','clan','blaco','canblo',
  'negro','rojo','ojo','genor','orneg',
  'azul','luza','zula',
  'arte','trea','reta','tera','atre',
  'frase','sera','fase','rafes','sefra',
  'verbo','breve','overb',
  'plato','talo','opal','taplo',
  'vaso','sova','avos',
  'taza','azat','zata',
  'papel','pale','appel','lepap',
  'tren','rent','nert',
  'barco','cobra','cabo','arco','obrac','racbo',
  'coche','hecho','ochec',
  'valor','volar','orlav','larvo',
  'odio','oido','doio',
  'calma','clama','amcla','malac',
  'furia','rafiu','uiraf',
  'datos','stado','tosad',
  'codigo','digo','codig','ogidoc',
  'ley','yel',
  'poder','pedro','doper','redop',
  'clima','lima','amilc','malic',
  'calor','coral','lorca','racol',
  'frio','foro','orif','rofio',
  'nieve','viene','evien','nevie',
  'hielo','helio','oleih','lieho',
  'amigo','mago','ogima','gamoa',
  'padre','pared','edrap','derap',
  'madre','edram','derma',
  'viaje','java','eajiv','vajie',
  'avion','novia','vino','noiva','ovina',
  'camino','mina','nocim','imcan',
  'puente','punta','etneup','nteup',
  'torre','retro','errot','rreto',
  'museo','esumo','osueme',
  'parque','salud','dolor','lord','miedo','medio',
  'alegria','razon','prueba','pista','caso','idea',
  'logica','verdad','error','clave','cifra','patron',
  'enigma','secreto','deducir','inferir','premisa','falacia',
  'metodo','sistema','archivo','lectura','cultura','idioma',
  'escuela','maestro','alumno','familia','trabajo','dinero',
  'precio','sociedad','justicia','libertad','energia','fuerza',
  'numero','letra','palabra','sujeto','objeto','historia',
  'ciencia','musica','ritmo','cancion','corazon','cerebro',
  'planeta','estrella','bosque','arbol','hoja','jardin',
  'ciudad','pueblo','casa','puerta','mesa','silla',
  'libro','pagina','pensar','memoria','espacio','sombra',
  'amarillo','naranja','morado','gris','perro','gato',
  'pan','miel','leche','queso','fruta','carne','arroz',
  'pasta','sopa','jugo','mano','pie','ojo','boca',
  'nariz','cara','pelo','brazo','pierna','dedo','diente',
  'norte','sur','este','oeste','arriba','abajo','dentro',
  'fuera','cerca','lejos','antes','despues',
  'rata','atar','arta','tara',
  'lago','gola','algo','olga',
  'piel','lepi','iple',
  'nube','buen','une',
  'sol','los','ola','sal','las',
  'mar','ram','arm',
  'luz','zul',
  'rio','oir',
  'paz','zap',
  'rey','yer',
  'fin','nif',
  'mes','sem',
  'dia','ida',
  'ola','alo',
  'ala','aal',
  'aro','ora','rao',
  'red','der',
  'dar','rad',
  'ver','rev',
  'ser','res',
  'oso','sos',
  'oro','roo',
  'hoy','yoh',
  'hay','yah',
  'vez','zev',
  'voz','zov',
  'pie','ipe',
  'tio','oit','ito',
  'tia','ait','ita',
  'rama','amar','arma','mara',
  'rosa','aros','soar','osar','raso',
  'casa','saca','asca',
  'mesa','ames','sema',
  'hola','halo','olah',
  'pato','topo','tapa','apto','opta',
  'neto','tono','noto',
  'libro','abril',
  'verde','deber','breve',
  'mundo','mudo','nudo',
  'noche','hecho','eco',
  'agua',
  'fuego','feo',
  'tierra','retira','tira','reta','ria','tea','ira','aire',
  'luna','nula','anul',
  'nube','buen','une',
  'flor',
  'campo','pacto','capa',
  'puerta','pauta','pura','ruta','parte',
  'ventana','venta','nave',
  'silla',
  'pensar','pares','pena','sera',
  'color','cloro','loco',
  'blanco','banco','clan',
  'negro','rojo','ojo',
  'azul',
  'arte','trea','reta','tera',
  'frase','sera','fase',
  'verbo','breve',
  'plato','talo',
  'vaso',
  'taza',
  'papel','pale',
  'tren',
  'barco','cobra','cabo','arco',
  'coche','hecho',
  'valor','volar',
  'odio','oido',
  'calma','clama',
  'furia',
  'datos',
  'codigo','digo',
  'ley',
  'poder','pedro',
  'clima','lima',
  'calor','coral',
  'frio','foro',
  'nieve','viene',
  'hielo','helio',
  'amigo','mago',
  'padre','pared',
  'madre',
  'viaje','java',
  'avion','novia','vino',
  'camino','mina',
  'puente','punta',
  'torre','retro',
  'museo',
  'parque',
  'salud',
  'dolor','lord',
  'miedo','medio',
  'alegria',
  'razon',
  'prueba',
  'pista',
  'caso',
  'idea',
  'logica',
  'verdad',
  'error',
  'clave',
  'cifra',
  'patron',
  'enigma',
  'secreto',
  'deducir',
  'inferir',
  'premisa',
  'falacia',
  'metodo',
  'sistema',
  'archivo',
  'lectura',
  'cultura',
  'idioma',
  'escuela',
  'maestro',
  'alumno',
  'familia',
  'trabajo',
  'dinero',
  'precio',
  'sociedad',
  'justicia',
  'libertad',
  'energia',
  'fuerza',
  'numero',
  'letra',
  'palabra',
  'sujeto',
  'objeto',
  'historia',
  'ciencia',
  'musica',
  'ritmo',
  'cancion',
  'corazon',
  'cerebro',
  'planeta',
  'estrella',
  'bosque',
  'arbol',
  'hoja',
  'jardin',
  'ciudad',
  'pueblo',
  'pagina',
  'memoria',
  'espacio',
  'sombra',
  'amarillo',
  'naranja',
  'morado',
  'gris',
  'perro',
  'gato',
  'pan',
  'miel',
  'leche',
  'queso',
  'fruta',
  'carne',
  'arroz',
  'pasta',
  'sopa',
  'jugo',
  'mano',
  'boca',
  'nariz',
  'cara',
  'pelo',
  'brazo',
  'pierna',
  'dedo',
  'diente',
  'norte',
  'sur',
  'este',
  'oeste',
  'arriba',
  'abajo',
  'dentro',
  'fuera',
  'cerca',
  'lejos',
  'antes',
  'despues',
  'uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','cien','mil',
  'lago','piel','rata','gato','perro','mesa','silla','libro','papel','pluma',
  'nube','sol','luna','estrella','planeta','tierra','fuego','agua','aire',
  'flor','hoja','arbol','bosque','jardin','campo','rio','mar','ola',
  'casa','puerta','ventana','techo','suelo','pared','cuarto','sala',
  'comida','fruta','pan','leche','queso','carne','pescado','arroz','pasta',
  'mano','pie','ojo','boca','nariz','oreja','cara','pelo','brazo','pierna',
  'amigo','padre','madre','hermano','hermana','hijo','hija','abuelo','abuela',
  'escuela','maestro','alumno','clase','libro','cuaderno','lapiz','goma',
  'trabajo','oficina','dinero','precio','compra','venta','tienda','mercado',
  'ciudad','pueblo','calle','plaza','parque','museo','teatro','cine',
  'musica','cancion','ritmo','baile','instrumento','guitarra','piano',
  'historia','ciencia','arte','cultura','idioma','lengua','palabra','letra',
  'numero','cuenta','suma','resta','multiplicar','dividir',
  'tiempo','hora','minuto','segundo','dia','noche','semana','mes','ano',
  'norte','sur','este','oeste','arriba','abajo','izquierda','derecha',
  'grande','pequeño','alto','bajo','largo','corto','ancho','estrecho',
  'rapido','lento','fuerte','debil','claro','oscuro','caliente','frio',
  'bueno','malo','bonito','feo','nuevo','viejo','joven','anciano',
  'feliz','triste','alegre','serio','tranquilo','nervioso','cansado','descansado',
  'pensar','saber','conocer','entender','aprender','estudiar','recordar','olvidar',
  'hablar','decir','contar','preguntar','responder','escuchar','oir',
  'ver','mirar','observar','buscar','encontrar','descubrir',
  'ir','venir','llegar','salir','entrar','subir','bajar','caminar','correr',
  'comer','beber','dormir','despertar','vivir','morir','nacer','crecer',
  'trabajar','jugar','descansar','viajar','visitar','conocer',
  'dar','recibir','tomar','dejar','poner','sacar','abrir','cerrar',
  'hacer','crear','construir','destruir','cambiar','mejorar','arreglar',
  'poder','querer','deber','necesitar','tener','haber','ser','estar',
]

const ACUTE: Record<string, string> = {
  a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú',
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u',
  A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú',
  Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U',
}

function strip(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
}

function canForm(word: string, letters: string): boolean {
  const avail = strip(letters).split('').sort()
  const need = strip(word).split('').sort()
  if (need.length > avail.length) return false
  let i = 0
  let j = 0
  while (i < need.length && j < avail.length) {
    if (need[i] === avail[j]) {
      i++
      j++
    } else if (need[i] > avail[j]) j++
    else return false
  }
  return i === need.length
}

/** Todas las palabras del diccionario formables con el multiset de letras */
function allWordsFromLetters(letters: string): string[] {
  const found = new Set<string>()
  for (const raw of DICT) {
    if (raw.length < 2) continue
    if (canForm(raw, letters)) found.add(raw.toLowerCase())
  }
  return [...found].sort((a, b) => b.length - a.length || a.localeCompare(b, 'es'))
}

/** Sets de letras por nivel — muchos más, progresión clara */
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

function levelLetters(lv: number, attempt: number) {
  const base = LETTER_SETS[(lv - 1 + attempt) % LETTER_SETS.length]
  return shuffleStr(base, lv * 31 + attempt * 17)
}

/* ─── Ahorcado / palabra oculta ─── */
const HANG = [
  { w: 'deduccion', hints: ['inferencia lógica', 'sacar conclusiones', 'razonamiento'] },
  { w: 'silogismo', hints: ['dos premisas', 'conclusión formal', 'Aristóteles'] },
  { w: 'acertijo', hints: ['enigma verbal', 'adivinanza', 'juego de ingenio'] },
  { w: 'misterio', hints: ['lo oculto', 'enigma', 'por resolver'] },
  { w: 'detective', hints: ['investiga casos', 'sigue pistas', 'resuelve'] },
  { w: 'evidencia', hints: ['prueba material', 'dato observable', 'indicio fuerte'] },
  { w: 'hipotesis', hints: ['supuesto provisional', 'a comprobar', 'conjetura'] },
  { w: 'analisis', hints: ['descomponer', 'examinar partes', 'estudio detallado'] },
  { w: 'patron', hints: ['regularidad', 'secuencia', 'forma repetida'] },
  { w: 'inferir', hints: ['deducir', 'concluir', 'partir de datos'] },
  { w: 'paradoja', hints: ['contradicción aparente', 'Zenón', 'lógica límite'] },
  { w: 'premisa', hints: ['base del argumento', 'supuesto dado', 'punto de partida'] },
  { w: 'falacia', hints: ['error argumental', 'engaño formal', 'razonamiento inválido'] },
  { w: 'algoritmo', hints: ['pasos finitos', 'método de cálculo', 'procedimiento'] },
  { w: 'memoria', hints: ['retener información', 'recuerdo', 'capacidad mental'] },
  { w: 'atencion', hints: ['foco consciente', 'concentración', 'cuidado'] },
  { w: 'razonar', hints: ['pensar con lógica', 'argumentar', 'encadenar ideas'] },
  { w: 'concepto', hints: ['idea abstracta', 'noción', 'término mental'] },
  { w: 'verdad', hints: ['lo que es el caso', 'correspondencia', 'validez'] },
  { w: 'enigma', hints: ['misterio cifrado', 'puzzle', 'secreto'] },
  { w: 'logica', hints: ['ciencia del razonamiento', 'reglas formales', 'validez'] },
  { w: 'argumento', hints: ['conjunto de premisas', 'defensa de una idea', 'discurso'] },
  { w: 'conclusion', hints: ['resultado del razonamiento', 'punto final', 'inferencia'] },
  { w: 'observar', hints: ['mirar con atención', 'recoger datos', 'percibir'] },
  { w: 'indicio', hints: ['señal débil', 'pista pequeña', 'rastro'] },
  { w: 'prueba', hints: ['demostración', 'evidencia fuerte', 'verificación'] },
  { w: 'teoria', hints: ['explicación sistemática', 'modelo abstracto', 'marco'] },
  { w: 'metodo', hints: ['camino ordenado', 'procedimiento', 'técnica'] },
  { w: 'sistema', hints: ['conjunto organizado', 'estructura', 'red'] },
  { w: 'proceso', hints: ['secuencia de pasos', 'evolución', 'flujo'] },
  { w: 'resultado', hints: ['efecto final', 'consecuencia', 'producto'] },
  { w: 'causa', hints: ['origen de un efecto', 'motivo', 'razón'] },
  { w: 'efecto', hints: ['consecuencia', 'resultado', 'impacto'] },
  { w: 'relacion', hints: ['vínculo entre cosas', 'conexión', 'enlace'] },
  { w: 'estructura', hints: ['organización interna', 'esqueleto', 'forma'] },
  { w: 'funcion', hints: ['papel que cumple', 'tarea', 'propósito'] },
  { w: 'variable', hints: ['elemento que cambia', 'factor', 'magnitud'] },
  { w: 'constante', hints: ['valor fijo', 'invariable', 'estable'] },
  { w: 'principio', hints: ['regla fundamental', 'inicio', 'base'] },
  { w: 'regla', hints: ['norma', 'pauta', 'criterio'] },
  { w: 'excepcion', hints: ['caso especial', 'fuera de la norma', 'anomalía'] },
  { w: 'general', hints: ['aplica a muchos', 'amplio', 'universal'] },
  { w: 'particular', hints: ['caso concreto', 'específico', 'individual'] },
  { w: 'abstracto', hints: ['sin forma concreta', 'idea pura', 'conceptual'] },
  { w: 'concreto', hints: ['tangible', 'específico', 'real'] },
  { w: 'objetivo', hints: ['imparcial', 'meta', 'fin'] },
  { w: 'subjetivo', hints: ['personal', 'opinión', 'punto de vista'] },
  { w: 'certeza', hints: ['seguridad total', 'sin duda', 'convicción'] },
  { w: 'duda', hints: ['incertidumbre', 'sospecha', 'vacilación'] },
  { w: 'creencia', hints: ['aceptación sin prueba total', 'fe', 'opinión'] },
  { w: 'conocimiento', hints: ['saber justificado', 'información', 'saber'] },
  { w: 'ignorancia', hints: ['falta de saber', 'desconocimiento', 'oscuridad'] },
  { w: 'sabiduria', hints: ['conocimiento profundo', 'prudencia', 'juicio'] },
  { w: 'inteligencia', hints: ['capacidad de entender', 'agudeza', 'ingenio'] },
  { w: 'creatividad', hints: ['inventar lo nuevo', 'originalidad', 'imaginación'] },
  { w: 'imaginacion', hints: ['crear imágenes mentales', 'fantasía', 'visión'] },
  { w: 'intuicion', hints: ['saber sin razonar', 'corazonada', 'instinto'] },
  { w: 'reflexion', hints: ['pensar con calma', 'meditación', 'análisis'] },
  { w: 'decision', hints: ['elección entre opciones', 'resolución', 'veredicto'] },
  { w: 'accion', hints: ['hacer algo', 'conducta', 'acto'] },
  { w: 'resultado', hints: ['efecto de la acción', 'consecuencia', 'producto'] },
  { w: 'exito', hints: ['lograr el objetivo', 'triunfo', 'victoria'] },
  { w: 'fracaso', hints: ['no lograr el objetivo', 'derrota', 'error'] },
  { w: 'aprendizaje', hints: ['adquirir saber', 'estudio', 'experiencia'] },
  { w: 'experiencia', hints: ['vivir algo', 'práctica', 'vivencia'] },
  { w: 'habilidad', hints: ['capacidad práctica', 'destreza', 'talento'] },
  { w: 'competencia', hints: ['dominio de una tarea', 'capacidad', 'aptitud'] },
  { w: 'motivacion', hints: ['impulso a actuar', 'motivo', 'interés'] },
  { w: 'emocion', hints: ['sentimiento intenso', 'afecto', 'pasión'] },
  { w: 'sentimiento', hints: ['estado afectivo', 'emoción', 'ánimo'] },
  { w: 'percepcion', hints: ['captar por los sentidos', 'impresión', 'visión'] },
  { w: 'atencion', hints: ['foco de la mente', 'concentración', 'cuidado'] },
  { w: 'concentracion', hints: ['atención sostenida', 'enfoque', 'foco'] },
  { w: 'distraccion', hints: ['pérdida de foco', 'interrupción', 'desvío'] },
  { w: 'memoria', hints: ['retener y recuperar', 'recuerdo', 'almacén'] },
  { w: 'olvido', hints: ['pérdida de recuerdo', 'amnesia', 'borrado'] },
  { w: 'recuerdo', hints: ['imagen del pasado', 'memoria', 'reminiscencia'] },
  { w: 'futuro', hints: ['lo que vendrá', 'porvenir', 'mañana'] },
  { w: 'pasado', hints: ['lo que ya ocurrió', 'historia', 'ayer'] },
  { w: 'presente', hints: ['el momento actual', 'ahora', 'hoy'] },
]

type Dir = { dr: number; dc: number }
const DIRS: Dir[] = [
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 0, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: -1, dc: 1 },
  { dr: -1, dc: -1 },
]

/**
 * Coloca TODAS las palabras objetivo en la rejilla (sopa de letras).
 */
function placeAllWords(words: string[], size: number, seed: number): string[][] | null {
  const grid: (string | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  )
  const sorted = [...words].map(strip).filter((w) => w.length >= 2).sort((a, b) => b.length - a.length)

  const tryPlace = (word: string, row: number, col: number, dir: Dir): boolean => {
    const cells: { r: number; c: number }[] = []
    for (let i = 0; i < word.length; i++) {
      const r = row + dir.dr * i
      const c = col + dir.dc * i
      if (r < 0 || c < 0 || r >= size || c >= size) return false
      const cur = grid[r][c]
      if (cur !== null && cur !== word[i]) return false
      cells.push({ r, c })
    }
    for (let i = 0; i < word.length; i++) {
      grid[cells[i].r][cells[i].c] = word[i]
    }
    return true
  }

  let rng = seed >>> 0
  const next = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0
    return rng
  }

  for (const word of sorted) {
    let placed = false
    const maxTries = size * size * DIRS.length * 4
    for (let t = 0; t < maxTries && !placed; t++) {
      const dir = DIRS[next() % DIRS.length]
      const row = next() % size
      const col = next() % size
      if (tryPlace(word, row, col, dir)) placed = true
    }
    if (!placed) {
      for (let row = 0; row < size && !placed; row++) {
        for (let col = 0; col <= size - word.length; col++) {
          if (tryPlace(word, row, col, DIRS[0])) {
            placed = true
            break
          }
        }
      }
    }
    if (!placed) return null
  }

  const alpha = 'abcdefghijklmnñopqrstuvwxyz'
  const out: string[][] = grid.map((row, r) =>
    row.map((ch, c) => {
      if (ch) return ch
      return alpha[(r * 11 + c * 7 + seed) % alpha.length]
    }),
  )
  return out
}

/**
 * Crucigrama: celdas '#' bloqueadas; letras solo donde hay palabras.
 * Mejora: coloca palabras cruzándose de verdad.
 */
function buildCrosswordStructure(
  words: string[],
  size: number,
  seed: number,
): { grid: string[][]; slots: { word: string; cells: { r: number; c: number }[] }[] } {
  const grid: string[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => '#'),
  )
  const slots: { word: string; cells: { r: number; c: number }[] }[] = []
  const sorted = [...words]
    .map((w) => ({ raw: w, key: strip(w) }))
    .filter((w) => w.key.length >= 3)
    .sort((a, b) => b.key.length - a.key.length)

  let rng = seed >>> 0
  const next = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0
    return rng
  }

  const canPut = (key: string, row: number, col: number, horiz: boolean) => {
    const cells: { r: number; c: number }[] = []
    for (let i = 0; i < key.length; i++) {
      const r = horiz ? row : row + i
      const c = horiz ? col + i : col
      if (r < 0 || c < 0 || r >= size || c >= size) return null
      const cur = grid[r][c]
      if (cur !== '#' && cur !== key[i]) return null
      cells.push({ r, c })
    }
    // Evitar adyacencias raras: al menos un cruce si ya hay letras
    return cells
  }

  // Primera palabra centrada horizontal
  if (sorted.length > 0) {
    const first = sorted[0]
    const row = Math.floor(size / 2)
    const col = Math.max(0, Math.floor((size - first.key.length) / 2))
    const cells = canPut(first.key, row, col, true)
    if (cells) {
      for (let i = 0; i < first.key.length; i++) {
        grid[cells[i].r][cells[i].c] = first.key[i]
      }
      slots.push({ word: first.raw, cells })
    }
  }

  for (let wi = 1; wi < sorted.length; wi++) {
    const { raw, key } = sorted[wi]
    let placed = false
    // Intentar cruzar con letras existentes
    for (let t = 0; t < 120 && !placed; t++) {
      const horiz = next() % 2 === 0
      const row = next() % size
      const col = next() % size
      const cells = canPut(key, row, col, horiz)
      if (!cells) continue
      // Preferir posiciones que cruzan
      let crosses = 0
      for (const cell of cells) {
        if (grid[cell.r][cell.c] !== '#') crosses++
      }
      if (slots.length > 0 && crosses === 0 && t < 80) continue
      for (let i = 0; i < key.length; i++) {
        grid[cells[i].r][cells[i].c] = key[i]
      }
      slots.push({ word: raw, cells })
      placed = true
    }
    if (!placed) {
      // Forzar en fila libre
      for (let row = 0; row < size && !placed; row++) {
        for (let col = 0; col <= size - key.length; col++) {
          const cells = canPut(key, row, col, true)
          if (cells) {
            for (let i = 0; i < key.length; i++) {
              grid[cells[i].r][cells[i].c] = key[i]
            }
            slots.push({ word: raw, cells })
            placed = true
            break
          }
        }
      }
    }
  }
  return { grid, slots }
}

const MODE_META: Record<
  SubMode,
  { title: string; emoji: string; color: string; desc: string; tip: string }
> = {
  anagrama: {
    title: 'Anagrama',
    emoji: '🔀',
    color: 'var(--gco-primary)',
    desc: 'Forma todas las palabras posibles con las letras dadas.',
    tip: 'Toca letras para armar. Doble toque en vocal = tilde. Valida cada palabra.',
  },
  oculto: {
    title: 'Palabra oculta',
    emoji: '🙈',
    color: 'var(--gco-secondary)',
    desc: 'Adivina la palabra letra a letra. Usa pistas con cuidado.',
    tip: 'Elige letras. Fallos limitados. Las pistas revelan el significado.',
  },
  crucigrama: {
    title: 'Crucigrama',
    emoji: '🧩',
    color: 'var(--gco-accent)',
    desc: 'Arrastra sobre las casillas para formar palabras cruzadas.',
    tip: 'Traza en línea continua. Las correctas quedan marcadas.',
  },
  sopa: {
    title: 'Sopa de letras',
    emoji: '🍜',
    color: '#7EC8FF',
    desc: 'Encuentra todas las palabras escondidas en la rejilla.',
    tip: 'Arrastra sin soltar en cualquier dirección. Suelta para validar.',
  },
  constelacion: {
    title: 'Constelación',
    emoji: '✨',
    color: '#FF8EC8',
    desc: 'Une estrellas para formar todas las palabras posibles.',
    tip: 'Arrastra de estrella a estrella. Baraja el cielo si lo necesitas.',
  },
}

export function PalabrasGame() {
  const navigate = useNavigate()
  const [progressTick, setProgressTick] = useState(0)
  const progress = useMemo(() => getGameProgress(GAME_CAT, GAME_ID), [progressTick])
  const unlockedRows = useMemo(
    () => getUnlockedLevels(GAME_CAT, GAME_ID),
    [progress.highestLevel, progressTick],
  )

  const [sub, setSub] = useState<SubMode | null>(null)
  const [level, setLevel] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<'hub' | 'setup' | 'play' | 'result'>('hub')
  const [showLevelPicker, setShowLevelPicker] = useState(false)
  const [useTimer, setUseTimer] = useState(true)
  const [timeLeft, setTimeLeft] = useState(90)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const timerRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const levelRef = useRef(level)
  levelRef.current = level

  const [rawLetters, setRawLetters] = useState('')
  const [targetWords, setTargetWords] = useState<string[]>([])
  const [foundWords, setFoundWords] = useState<string[]>([])

  // anagrama
  const [pool, setPool] = useState<string[]>([])
  const [slot, setSlot] = useState<(string | null)[]>([])

  // oculto
  const [secret, setSecret] = useState('')
  const [guessed, setGuessed] = useState<Set<string>>(new Set())
  const [fails, setFails] = useState(0)
  const [hintsLeft, setHintsLeft] = useState(3)
  const [hintText, setHintText] = useState<string[]>([])
  const maxFails = 7

  // grids
  const [grid, setGrid] = useState<string[][]>([])
  const [gridMarks, setGridMarks] = useState<boolean[][]>([])
  const [cwSlots, setCwSlots] = useState<{ word: string; cells: { r: number; c: number }[] }[]>([])
  const [selection, setSelection] = useState<{ r: number; c: number }[]>([])
  const selectingRef = useRef(false)

  // constelación
  const [constelNodes, setConstelNodes] = useState<{ id: number; ch: string; x: number; y: number }[]>([])
  const [path, setPath] = useState<number[]>([])
  const pathDragging = useRef(false)

  const bestForLevel = sub ? getLevelBestTime(GAME_CAT, GAME_ID, level) : null

  const clearTimers = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const finishFail = useCallback(() => {
    clearTimers()
    setIsCorrect(false)
    setPhase('result')
    soundFail()
    recordLevelResult({
      categoryId: GAME_CAT,
      gameId: GAME_ID,
      level: levelRef.current,
      success: false,
      timeMs: Date.now() - startRef.current,
    })
    setProgressTick((t) => t + 1)
  }, [])

  const finishSuccess = useCallback(() => {
    clearTimers()
    setIsCorrect(true)
    setPhase('result')
    soundSuccess()
    recordLevelResult({
      categoryId: GAME_CAT,
      gameId: GAME_ID,
      level: levelRef.current,
      success: true,
      timeMs: Date.now() - startRef.current,
    })
    setProgressTick((t) => t + 1)
  }, [])

  const startTimer = (secs: number) => {
    clearTimers()
    setTimeLeft(secs)
    startRef.current = Date.now()
    if (!useTimer) return
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          finishFail()
          return 0
        }
        return t - 1
      })
    }, 1000)
  }

  const buildTargets = (letters: string, mode: SubMode) => {
    const words = allWordsFromLetters(letters).filter((w) => strip(w).length >= 2)
    if (mode === 'anagrama' || mode === 'constelacion') {
      // Mostrar TODAS las combinaciones válidas (cap razonable para jugabilidad)
      if (words.length <= 20) return words
      const long = words.filter((w) => strip(w).length >= 4)
      const mid = words.filter((w) => strip(w).length === 3)
      const short = words.filter((w) => strip(w).length === 2)
      return [...long, ...mid.slice(0, 8), ...short.slice(0, 4)].slice(0, 18)
    }
    if (mode === 'sopa' || mode === 'crucigrama') {
      // 4–8 palabras según nivel
      const want = Math.min(8, Math.max(3, 3 + Math.floor((level - 1) / 12)))
      const long = words.filter((w) => strip(w).length >= 4)
      const rest = words.filter((w) => strip(w).length >= 3 && strip(w).length < 4)
      const pick = [...long, ...rest].slice(0, want)
      return pick.length >= 2 ? pick : words.slice(0, Math.max(2, want))
    }
    return words.slice(0, 1)
  }

  const rebuildGridForMode = (mode: SubMode, letters: string, words: string[], lv: number, att: number) => {
    setSelection([])
    setPath([])
    if (mode === 'sopa') {
      const longest = Math.max(...words.map((w) => strip(w).length), 4)
      const size = Math.min(12, Math.max(6, longest + 2))
      let g = placeAllWords(words, size, lv * 97 + att)
      if (!g) g = placeAllWords(words, size + 2, lv * 97 + att + 1)
      if (!g) {
        g =
          placeAllWords(words, 14, lv) ||
          Array.from({ length: 8 }, () =>
            Array.from({ length: 8 }, (_, c) => letters[c % letters.length]?.toLowerCase() || 'a'),
          )
      }
      setGrid(g)
      setGridMarks(g.map((row) => row.map(() => false)))
      setCwSlots([])
    } else if (mode === 'crucigrama') {
      const size = Math.min(11, Math.max(7, 6 + Math.floor(lv / 20)))
      const { grid: g, slots } = buildCrosswordStructure(words, size, lv * 53 + att)
      setGrid(g)
      setGridMarks(g.map((row) => row.map(() => false)))
      setCwSlots(slots)
    } else if (mode === 'constelacion') {
      const chars = strip(letters).toUpperCase().split('')
      const n = chars.length
      const nodes = chars.map((ch, i) => {
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2
        const radius = 34
        return {
          id: i,
          ch,
          x: 50 + radius * Math.cos(angle),
          y: 50 + radius * Math.sin(angle),
        }
      })
      setConstelNodes(nodes)
      setPath([])
    }
  }

  const startLevel = useCallback(
    (lv: number, att = 0, mode: SubMode) => {
      clearTimers()
      const letters = levelLetters(lv, att)
      const words =
        mode === 'oculto'
          ? [HANG[(lv - 1 + att) % HANG.length].w]
          : buildTargets(letters, mode)

      setRawLetters(letters)
      setTargetWords(words)
      setFoundWords([])
      setLevel(lv)
      setAttempt(att)
      setPhase('play')
      setShowLevelPicker(false)
      setIsCorrect(null)
      setSelection([])
      setPath([])

      const L = letters.toUpperCase().split('')
      const tokens = L.map((ch, i) => `${ch}${i}`)
      const shuffled = [...tokens]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = (lv * 13 + att * 7 + i) % (i + 1)
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      setPool(shuffled)
      setSlot(Array(L.length).fill(null))

      const hang = HANG[(lv - 1 + att) % HANG.length]
      setSecret(hang.w)
      setGuessed(new Set())
      setFails(0)
      setHintsLeft(3)
      setHintText([])

      rebuildGridForMode(mode, letters, words, lv, att)
      soundStart()
      const baseSecs = mode === 'oculto' ? 120 : mode === 'crucigrama' || mode === 'sopa' ? 100 : 90
      startTimer(Math.max(50, baseSecs - Math.floor(lv / 5)))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [useTimer],
  )

  useEffect(() => () => clearTimers(), [])

  const addFound = (word: string) => {
    if (foundWords.includes(word)) return
    soundMatch()
    const next = [...foundWords, word]
    setFoundWords(next)
    if (next.length >= targetWords.length && targetWords.length > 0) {
      finishSuccess()
    }
  }

  const toggleAcute = (token: string) => {
    const ch = token[0]
    if (!'aeiouáéíóúAEIOUÁÉÍÓÚ'.includes(ch)) return
    soundClick()
    setPool((p) =>
      p.map((t) => {
        if (t !== token) return t
        const c = t[0]
        const next = ACUTE[c] ?? ACUTE[c.toLowerCase()] ?? c
        const out = c === c.toUpperCase() ? next.toUpperCase() : next
        return out + t.slice(1)
      }),
    )
  }

  const placeFromPool = (token: string) => {
    soundClick()
    const empty = slot.findIndex((s) => s === null)
    if (empty < 0) return
    setSlot((s) => {
      const n = [...s]
      n[empty] = token
      return n
    })
    setPool((p) => p.filter((t) => t !== token))
  }

  const returnToPool = (idx: number) => {
    const t = slot[idx]
    if (!t) return
    soundClick()
    setSlot((s) => {
      const n = [...s]
      n[idx] = null
      return n
    })
    setPool((p) => [...p, t])
  }

  const tryCommitWord = () => {
    const word = slot
      .filter(Boolean)
      .map((t) => t![0])
      .join('')
      .toLowerCase()
    const key = strip(word)
    const match = targetWords.find((w) => strip(w) === key)
    if (match && !foundWords.includes(match)) {
      setPool((p) => [...p, ...(slot.filter(Boolean) as string[])])
      setSlot(Array(rawLetters.length).fill(null))
      addFound(match)
    } else {
      soundFail()
    }
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
    setConstelNodes((nodes) => {
      if (nodes.length === 0) return nodes
      const angles = nodes.map((_, i) => (i / nodes.length) * Math.PI * 2 - Math.PI / 2)
      for (let i = angles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[angles[i], angles[j]] = [angles[j], angles[i]]
      }
      return nodes.map((n, i) => ({
        ...n,
        x: 50 + 34 * Math.cos(angles[i]),
        y: 50 + 34 * Math.sin(angles[i]),
      }))
    })
  }

  const guessLetter = (ch: string) => {
    if (guessed.has(ch) || isCorrect !== null) return
    soundClick()
    const g = new Set(guessed)
    g.add(ch)
    setGuessed(g)
    if (!strip(secret).includes(ch)) {
      const nf = fails + 1
      setFails(nf)
      if (nf >= maxFails) finishFail()
    } else if (strip(secret).split('').every((c) => g.has(c))) {
      finishSuccess()
    }
  }

  const useHint = () => {
    if (hintsLeft <= 0) return
    const item = HANG[(level - 1 + attempt) % HANG.length]
    const nextHint = item.hints[3 - hintsLeft]
    if (!nextHint) return
    soundClick()
    setHintsLeft((h) => h - 1)
    setHintText((t) => [...t, nextHint])
  }

  const onCellDown = (r: number, c: number) => {
    if (grid[r]?.[c] === '#') return
    selectingRef.current = true
    soundClick()
    setSelection([{ r, c }])
  }

  const onCellEnter = (r: number, c: number) => {
    if (!selectingRef.current) return
    if (grid[r]?.[c] === '#') return
    setSelection((sel) => {
      if (sel.some((p) => p.r === r && p.c === c)) return sel
      const last = sel[sel.length - 1]
      if (!last) return [{ r, c }]
      const dr = Math.abs(last.r - r)
      const dc = Math.abs(last.c - c)
      if (dr <= 1 && dc <= 1 && dr + dc > 0) return [...sel, { r, c }]
      return sel
    })
  }

  const commitSelection = () => {
    selectingRef.current = false
    if (selection.length < 2) {
      setSelection([])
      return
    }
    const word = selection.map((p) => grid[p.r][p.c]).join('')
    const rev = word.split('').reverse().join('')
    const hit = targetWords.find((w) => strip(w) === strip(word) || strip(w) === strip(rev))
    if (hit && !foundWords.includes(hit)) {
      setGridMarks((prev) => {
        const n = prev.map((row) => [...row])
        for (const p of selection) {
          if (n[p.r]) n[p.r][p.c] = true
        }
        return n
      })
      if (sub === 'crucigrama') {
        const slotMatch = cwSlots.find((s) => strip(s.word) === strip(hit))
        if (slotMatch) {
          setGridMarks((prev) => {
            const n = prev.map((row) => [...row])
            for (const p of slotMatch.cells) {
              if (n[p.r]) n[p.r][p.c] = true
            }
            return n
          })
        }
      }
      setSelection([])
      addFound(hit)
    } else {
      soundFail()
      setSelection([])
    }
  }

  useEffect(() => {
    const up = () => {
      if (selectingRef.current) commitSelection()
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('mouseup', up)
    window.addEventListener('touchend', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('touchend', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, targetWords, foundWords, sub, cwSlots])

  const onConstelPointer = (id: number, isDown: boolean) => {
    if (isDown) {
      pathDragging.current = true
      soundClick()
      setPath([id])
      return
    }
    if (!pathDragging.current) return
    setPath((p) => {
      if (p.includes(id)) return p
      return [...p, id]
    })
  }

  const commitConstel = () => {
    pathDragging.current = false
    if (path.length < 2) {
      setPath([])
      return
    }
    const word = path
      .map((id) => constelNodes.find((n) => n.id === id)!.ch)
      .join('')
      .toLowerCase()
    const rev = word.split('').reverse().join('')
    const hit = targetWords.find((w) => strip(w) === strip(word) || strip(w) === strip(rev))
    if (hit && !foundWords.includes(hit)) {
      setPath([])
      addFound(hit)
    } else {
      soundFail()
      setPath([])
    }
  }

  useEffect(() => {
    const up = () => {
      if (pathDragging.current) commitConstel()
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('touchend', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('touchend', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, constelNodes, targetWords, foundWords])

  const alphabet = 'abcdefghijklmnñopqrstuvwxyz'.split('')

  const defaultLevel = Math.min(Math.max(1, progress.highestLevel || 1), TOTAL_LEVELS_PER_MODE)
  const maxSelectable = Math.max(1, defaultLevel, ...unlockedRows.map((u) => u.level))

  const goBack = () => {
    soundClick()
    clearTimers()
    if (phase === 'hub') {
      navigate('/categoria/deduccion')
    } else if (phase === 'setup') {
      setPhase('hub')
      setSub(null)
      setShowLevelPicker(false)
    } else if (phase === 'play' || phase === 'result') {
      setPhase('setup')
      setShowLevelPicker(false)
      clearTimers()
    }
  }

  /* ───────────── HUB: menú de modos (tarjetas visuales) ───────────── */
  const renderHub = () => (
    <motion.div
      key="hub"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28 }}
    >
      <header style={{ marginBottom: '1.35rem' }}>
        <h1
          style={{
            fontSize: 'clamp(1.55rem, 5vw, 2rem)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span style={{ fontSize: '1.5em' }}>🔤</span> Palabras ocultas
        </h1>
        <p style={{ color: 'var(--gco-ink-muted)', marginTop: '0.4rem', fontSize: '0.92rem', lineHeight: 1.45 }}>
          Elige un modo. Cada uno tiene sus propios niveles y reglas.
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
          gap: '0.85rem',
        }}
      >
        {(Object.keys(MODE_META) as SubMode[]).map((id, i) => {
          const m = MODE_META[id]
          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.05, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <GlassCard
                onClick={() => {
                  soundClick()
                  setSub(id)
                  setLevel(Math.min(defaultLevel, TOTAL_LEVELS_PER_MODE))
                  setPhase('setup')
                }}
              >
                <div
                  style={{
                    padding: '1.2rem 1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.55rem',
                    minHeight: 128,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* acento de color */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 3,
                      background: `linear-gradient(90deg, ${m.color}, transparent)`,
                      opacity: 0.9,
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span
                      style={{
                        fontSize: '1.85rem',
                        width: 48,
                        height: 48,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 14,
                        background: 'var(--gco-fill-quaternary)',
                        border: '1px solid var(--gco-glass-border)',
                      }}
                    >
                      {m.emoji}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontSize: '1.08rem', marginBottom: 2 }}>{m.title}</h3>
                      <p
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--gco-ink-muted)',
                          lineHeight: 1.35,
                        }}
                      >
                        {m.desc}
                      </p>
                    </div>
                    <span style={{ color: 'var(--gco-ink-faint)', fontSize: '1.2rem' }}>→</span>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )

  /* ───────────── SETUP del modo elegido ───────────── */
  const renderSetup = () => {
    if (!sub) return null
    const m = MODE_META[sub]
    return (
      <motion.div
        key="setup"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
      >
        <GlassCard>
          <div style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ textAlign: 'center' }}>
              <span
                style={{
                  fontSize: '2.4rem',
                  display: 'inline-block',
                  marginBottom: 6,
                  filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))',
                }}
              >
                {m.emoji}
              </span>
              <h2 style={{ marginBottom: 6 }}>{m.title}</h2>
              <p style={{ color: 'var(--gco-ink-muted)', fontSize: '0.9rem', lineHeight: 1.45 }}>
                {m.desc}
              </p>
              {bestForLevel != null && bestForLevel > 0 && (
                <p style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--gco-primary)' }}>
                  🏆 Mejor · <span className="mono">{formatDuration(bestForLevel)}</span>
                </p>
              )}
            </div>

            <div
              style={{
                background: 'var(--gco-fill-quaternary)',
                border: '1px solid var(--gco-glass-border)',
                borderRadius: 14,
                padding: '0.85rem 1rem',
              }}
            >
              <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)', lineHeight: 1.4 }}>
                💡 {m.tip}
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--gco-fill-quaternary)',
                border: '1px solid var(--gco-glass-border)',
                borderRadius: 14,
                padding: '0.8rem 1rem',
              }}
            >
              <div>
                <p style={{ fontWeight: 600 }}>Contrarreloj</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)' }}>Activo por defecto</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={useTimer}
                onClick={() => {
                  const n = !useTimer
                  soundToggle(n)
                  setUseTimer(n)
                }}
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  background: useTimer ? 'var(--gco-primary)' : 'rgba(255,255,255,0.12)',
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: useTimer ? 24 : 3,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 0.2s',
                  }}
                />
              </button>
            </div>

            <AnimatePresence>
              {showLevelPicker && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div
                    className="glass-card"
                    style={{ padding: '0.85rem 1rem', marginBottom: 4 }}
                  >
                    <p style={{ fontSize: '0.82rem', color: 'var(--gco-ink-muted)', marginBottom: '0.5rem' }}>
                      Elige nivel · marca a superar
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button
                        type="button"
                        className={`glass-button ${level === defaultLevel ? '' : 'secondary'}`}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem' }}
                        onClick={() => {
                          soundClick()
                          setLevel(defaultLevel)
                          setShowLevelPicker(false)
                        }}
                      >
                        Nv. {defaultLevel}
                        <span className="mono" style={{ display: 'block', fontSize: '0.65rem', opacity: 0.85 }}>
                          actual
                        </span>
                      </button>
                      {unlockedRows.map((u) => (
                        <button
                          key={u.level}
                          type="button"
                          className={`glass-button ${level === u.level ? '' : 'secondary'}`}
                          style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem', minWidth: 64 }}
                          onClick={() => {
                            soundClick()
                            setLevel(u.level)
                            setShowLevelPicker(false)
                          }}
                        >
                          Nv. {u.level}
                          <span className="mono" style={{ display: 'block', fontSize: '0.65rem', opacity: 0.85 }}>
                            {u.bestTimeMs != null ? formatDuration(u.bestTimeMs) : '—'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="glass-button secondary"
                style={{ flex: '0 0 auto', padding: '0.55rem 0.9rem' }}
                onClick={() => {
                  soundClick()
                  setShowLevelPicker((v) => !v)
                }}
              >
                Nivel {level} ▾
              </button>
              <GlassButton
                onClick={() => {
                  setAttempt(0)
                  startLevel(Math.min(level, maxSelectable), 0, sub)
                }}
                style={{ flex: 1, minHeight: 48 }}
              >
                Jugar · Nv. {Math.min(level, maxSelectable)}
              </GlassButton>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    )
  }

  /* ───────────── PLAY ───────────── */
  const renderPlay = () => {
    if (!sub) return null
    const m = MODE_META[sub]
    return (
      <motion.div key="play" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 10,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0.35rem 0.75rem',
              borderRadius: 999,
              background: 'var(--gco-primary-dim)',
              color: 'var(--gco-primary)',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            {m.emoji} {m.title}
          </span>
          <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', margin: 0 }}>
            {sub === 'oculto' ? (
              <>Adivina la palabra</>
            ) : (
              <>
                {foundWords.length}/{targetWords.length} palabras
                {foundWords.length > 0 && (
                  <span style={{ color: 'var(--gco-primary)' }}> · {foundWords.join(', ')}</span>
                )}
              </>
            )}
          </p>
        </div>

        {sub === 'anagrama' && (
          <GlassCard>
            <div style={{ padding: '1.15rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginBottom: 12, lineHeight: 1.45 }}>
                Forma <strong>todas</strong> las palabras posibles. Doble toque en vocal = tilde.
              </p>
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
                      width: 40,
                      height: 44,
                      borderRadius: 10,
                      border: '1px solid var(--gco-glass-border)',
                      background: t ? 'var(--gco-primary-dim)' : 'var(--gco-input-bg)',
                      color: 'var(--gco-ink)',
                      fontWeight: 700,
                      fontSize: '1.1rem',
                    }}
                  >
                    {t ? t[0] : '·'}
                  </motion.button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12 }}>
                {pool.map((t) => (
                  <motion.button
                    key={t}
                    type="button"
                    className="glass-button secondary"
                    style={{ minWidth: 40, padding: '0.45rem 0.6rem', fontWeight: 700 }}
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
            <div style={{ padding: '1.15rem', textAlign: 'center' }}>
              <p
                className="mono"
                style={{ fontSize: '1.6rem', letterSpacing: '0.2em', marginBottom: 12, fontWeight: 700 }}
              >
                {strip(secret)
                  .split('')
                  .map((c) => (guessed.has(c) ? c : '_'))
                  .join(' ')}
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginBottom: 10 }}>
                Fallos {fails}/{maxFails} · Pistas {hintsLeft}/3
              </p>
              {hintText.length > 0 && (
                <p style={{ fontSize: '0.85rem', color: 'var(--gco-primary)', marginBottom: 10 }}>
                  {hintText.join(' · ')}
                </p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginBottom: 12 }}>
                {alphabet.map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    disabled={guessed.has(ch)}
                    className="glass-button secondary"
                    style={{
                      minWidth: 34,
                      padding: '0.4rem',
                      opacity: guessed.has(ch) ? 0.35 : 1,
                      fontWeight: 600,
                    }}
                    onClick={() => guessLetter(ch)}
                  >
                    {ch}
                  </button>
                ))}
              </div>
              <button type="button" className="glass-button secondary" disabled={hintsLeft <= 0} onClick={useHint}>
                Pista ({hintsLeft})
              </button>
            </div>
          </GlassCard>
        )}

        {(sub === 'sopa' || sub === 'crucigrama') && (
          <GlassCard>
            <div style={{ padding: '1rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginBottom: 8, lineHeight: 1.4 }}>
                {sub === 'crucigrama'
                  ? 'Arrastra en línea continua sobre las casillas activas. Las correctas quedan marcadas.'
                  : 'Todas las palabras están en la rejilla. Arrastra sin soltar; suelta para validar.'}
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${grid[0]?.length || 8}, minmax(26px, 1fr))`,
                  gap: 3,
                  maxWidth: 400,
                  margin: '0 auto 12px',
                  touchAction: 'none',
                  userSelect: 'none',
                }}
                onPointerLeave={() => {
                  if (selectingRef.current) commitSelection()
                }}
              >
                {grid.map((row, r) =>
                  row.map((ch, c) => {
                    if (ch === '#') {
                      return (
                        <div
                          key={`${r}-${c}`}
                          style={{
                            aspectRatio: '1',
                            borderRadius: 4,
                            background: 'var(--gco-ink)',
                            opacity: 0.35,
                          }}
                        />
                      )
                    }
                    const on = selection.some((p) => p.r === r && p.c === c)
                    const marked = gridMarks[r]?.[c]
                    return (
                      <button
                        key={`${r}-${c}`}
                        type="button"
                        onPointerDown={(e) => {
                          e.preventDefault()
                          onCellDown(r, c)
                        }}
                        onPointerEnter={() => onCellEnter(r, c)}
                        style={{
                          aspectRatio: '1',
                          borderRadius: 8,
                          border: `1px solid ${
                            on ? 'var(--gco-primary)' : marked ? 'var(--gco-primary)' : 'var(--gco-glass-border)'
                          }`,
                          background: marked
                            ? 'var(--gco-primary-dim)'
                            : on
                              ? 'var(--gco-glass-bg-hover)'
                              : 'var(--gco-glass-bg)',
                          color: 'var(--gco-ink)',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          textTransform: 'uppercase',
                          touchAction: 'none',
                          transition: 'background 0.15s, border-color 0.15s, transform 0.1s',
                          transform: on ? 'scale(1.06)' : 'scale(1)',
                        }}
                      >
                        {ch}
                      </button>
                    )
                  }),
                )}
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--gco-ink-muted)', textAlign: 'center' }}>
                Suelta el dedo o el ratón para validar el trazo
              </p>
            </div>
          </GlassCard>
        )}

        {sub === 'constelacion' && (
          <GlassCard>
            <div style={{ padding: '1rem' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--gco-ink-muted)', marginBottom: 8, lineHeight: 1.4 }}>
                Une estrellas sin soltar. Si la palabra es válida, suma y se limpia el trazo.
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
                    'radial-gradient(circle at 30% 30%, var(--gco-primary-dim), transparent 55%), radial-gradient(circle at 70% 60%, var(--gco-orb-2), transparent 50%), var(--gco-bg-elevated)',
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
                      const a = constelNodes.find((n) => n.id === path[i])!
                      const b = constelNodes.find((n) => n.id === id)!
                      return (
                        <line
                          key={`${path[i]}-${id}`}
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          stroke="var(--gco-primary)"
                          strokeWidth="0.7"
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
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        border: `1.5px solid ${on ? 'var(--gco-primary)' : 'var(--gco-glass-border)'}`,
                        background: on ? 'var(--gco-primary)' : 'var(--gco-glass-bg)',
                        color: on ? 'var(--gco-button-text)' : 'var(--gco-ink)',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        boxShadow: on ? '0 0 12px var(--gco-primary-dim)' : 'none',
                        cursor: 'pointer',
                        touchAction: 'none',
                        zIndex: 2,
                        transition: 'background 0.15s, box-shadow 0.15s, transform 0.1s',
                      }}
                    >
                      {n.ch}
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="glass-button secondary" onClick={() => setPath([])}>
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

  /* ───────────── RESULT ───────────── */
  const renderResult = () => (
    <motion.div key="res" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
      <GlassCard>
        <div style={{ padding: '1.4rem', textAlign: 'center' }}>
          <p
            style={{
              fontWeight: 700,
              fontSize: '1.25rem',
              color: isCorrect ? 'var(--gco-primary)' : 'var(--gco-secondary)',
              marginBottom: 4,
            }}
          >
            {isCorrect ? '✨ Nivel superado' : 'No superado'}
          </p>
          <p style={{ color: 'var(--gco-ink-muted)', margin: '8px 0 16px' }}>
            {formatDuration(Date.now() - startRef.current)}
            {sub !== 'oculto' && (
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
      {/* Header fijo: volver siempre arriba izquierda */}
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
              className="mono"
              style={{
                fontSize: '0.95rem',
                color: timeLeft <= 15 ? 'var(--gco-secondary)' : 'var(--gco-ink-muted)',
                fontWeight: timeLeft <= 15 ? 700 : 400,
              }}
            >
              ⏱ {timeLeft}s
            </span>
          )}
          {(phase === 'play' || phase === 'result' || phase === 'setup') && sub && (
            <span className="level-number" style={{ fontSize: '1.05rem' }}>
              Nv. {level}
            </span>
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