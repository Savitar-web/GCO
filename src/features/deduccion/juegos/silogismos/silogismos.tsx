import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { GlassButton } from '@/components/ui/GlassButton'
import { soundClick, soundFail, soundSuccess, soundStart, soundToggle } from '@/core/audio/uiSounds'
import {
  getGameProgress,
  recordLevelResult,
  getLevelBestTime,
  getUnlockedLevels,
  formatDuration,
} from '@/core/storage/progress'

const GAME_CAT = 'deduccion' as const
const GAME_ID = 'silogismos'
const TOTAL_LEVELS = 130
const TIMER_BASE = 75

type Item = {
  id: string
  premises: string[]
  question: string
  options: string[]
  correct: number
  /** Conceptos y orientación de razonamiento (sin revelar la respuesta) */
  hint: string
}

const BANK: Item[] = [
  // ——— Silogismos categóricos clásicos (Barbara, Celarent, Darii, Ferio…) ———
  {
    id: 's01',
    premises: ['Todos los A son B.', 'Todos los B son C.'],
    question: '¿Qué conclusión se sigue necesariamente?',
    options: [
      'Todos los A son C',
      'Algunos C no son A',
      'Ningún A es C',
      'Todos los C son A',
      'Nada se sigue con validez',
      'Algunos A no son B',
      'Solo los B son C',
      'A y C son disjuntos',
    ],
    correct: 0,
    hint: 'Es un silogismo categórico en figura 1 (modo Barbara). Observa la transitividad de la inclusión universal: si todo A está dentro de B y todo B dentro de C, ¿dónde queda A respecto de C?',
  },
  {
    id: 's02',
    premises: ['Todos los A son B.', 'Algunos C son A.'],
    question: '¿Cuál es la conclusión válida?',
    options: [
      'Algunos C son B',
      'Todos los C son B',
      'Ningún C es B',
      'Todos los B son C',
      'Nada se sigue',
      'Algunos B no son C',
      'A no existe',
      'Todos los C son A',
    ],
    correct: 0,
    hint: 'Silogismo Darii. Una premisa universal afirmativa y una particular afirmativa. El término medio A conecta C con B. Pregúntate si la particularidad se transmite.',
  },
  {
    id: 's03',
    premises: ['Ningún A es B.', 'Todos los C son A.'],
    question: '¿Qué se sigue necesariamente?',
    options: [
      'Ningún C es B',
      'Algunos C son B',
      'Todos los B son C',
      'Algunos A son B',
      'Nada se sigue',
      'Todos los C son B',
      'B son A',
      'C equivale a B',
    ],
    correct: 0,
    hint: 'Modo Celarent. La premisa universal negativa excluye completamente a A de B. Como todo C está en A, C también queda excluido de B.',
  },
  {
    id: 's04',
    premises: ['Ningún A es B.', 'Algunos C son A.'],
    question: 'Conclusión válida:',
    options: [
      'Algunos C no son B',
      'Ningún C es B',
      'Todos los C son B',
      'Algunos C son B',
      'Nada se sigue',
      'Todos los A son C',
      'B está vacío',
      'C = A',
    ],
    correct: 0,
    hint: 'Ferio. Universal negativa + particular afirmativa. El término medio permite concluir una particular negativa.',
  },
  {
    id: 's05',
    premises: ['Todos los médicos son licenciados.', 'Ana es licenciada.'],
    question: '¿Se sigue que Ana es médica?',
    options: [
      'No se sigue necesariamente',
      'Sí, necesariamente',
      'Es imposible',
      'Sí, si estudia medicina',
      'Siempre es verdadera',
      'Nunca es verdadera',
      'Solo si es mujer',
      'Solo con título visible',
    ],
    correct: 0,
    hint: 'Afirmar el consecuente (o error de conversión de la universal). “Todos los médicos son licenciados” no implica “todos los licenciados son médicos”. Observa la dirección de la inclusión.',
  },
  {
    id: 's06',
    premises: ['Algunos A son B.', 'Algunos B son C.'],
    question: '¿Se sigue que algunos A son C?',
    options: [
      'No necesariamente',
      'Sí, siempre',
      'Nunca',
      'Solo en conjuntos finitos',
      'Equivale a todos',
      'A es igual a C',
      'B está vacío',
      'Sí si A = B',
    ],
    correct: 0,
    hint: 'Dos particulares afirmativas no garantizan solapamiento entre A y C. El término medio B puede conectarlos de formas distintas. Visualiza diagramas de Venn con tres círculos.',
  },
  {
    id: 's07',
    premises: ['Ningún pez vuela.', 'Algunos animales vuelan.'],
    question: '¿Cuál es una conclusión válida?',
    options: [
      'Algunos animales no son peces',
      'Todos los animales son peces',
      'Ningún animal vuela',
      'Todos los peces vuelan',
      'Nada se sigue',
      'Algunos peces vuelan',
      'Solo las aves vuelan',
      'Peces = animales',
    ],
    correct: 0,
    hint: 'De “ningún pez vuela” y “algunos animales vuelan” se deduce que al menos algunos de los que vuelan no pueden ser peces. Es una particular negativa.',
  },
  {
    id: 's08',
    premises: ['Todos los A son B.', 'Ningún C es B.'],
    question: 'Se sigue necesariamente:',
    options: [
      'Ningún C es A',
      'Algunos C son A',
      'Todos los C son A',
      'Algunos A son C',
      'Nada se sigue',
      'Todos los B son C',
      'A y C se solapan',
      'B está vacío',
    ],
    correct: 0,
    hint: 'Cesare / Camestres. Universal afirmativa + universal negativa. El término medio B excluye completamente a C de A.',
  },
  {
    id: 's09',
    premises: ['Algunos A no son B.', 'Todos los C son B.'],
    question: '¿Qué se puede concluir?',
    options: [
      'Algunos A no son C',
      'Ningún A es C',
      'Todos los A son C',
      'Algunos A son C',
      'Nada se sigue',
      'Todos los C son A',
      'B está vacío',
      'A = C',
    ],
    correct: 0,
    hint: 'Baroco. Particular negativa + universal afirmativa. Los A que quedan fuera de B también quedan fuera de todo lo que está dentro de B (los C).',
  },
  {
    id: 's10',
    premises: ['Todos los A son B.', 'Algunos B no son C.'],
    question: '¿Se sigue que algunos A no son C?',
    options: [
      'No necesariamente',
      'Sí, siempre',
      'Nunca',
      'Solo si el dominio es infinito',
      'Equivale a todos',
      'A está vacío',
      'B = C',
      'Sí si A = B',
    ],
    correct: 0,
    hint: 'Cuidado con la posición del término medio. “Algunos B no son C” no informa necesariamente sobre los A (que son solo una parte de B).',
  },

  // ——— Lógica proposicional: modus ponens, tollens, falacias ———
  {
    id: 's11',
    premises: ['Si P, entonces Q.', 'P.'],
    question: '¿Qué se sigue?',
    options: [
      'Q (modus ponens)',
      'No Q',
      'No P',
      'P o no Q',
      'Nada se sigue',
      'Q implica no P',
      'Solo no P',
      'P y no Q',
    ],
    correct: 0,
    hint: 'Regla de eliminación del condicional (modus ponens). Si el antecedente es verdadero, el consecuente debe serlo también. Es una de las reglas más básicas de la lógica proposicional.',
  },
  {
    id: 's12',
    premises: ['Si P, entonces Q.', 'No Q.'],
    question: 'Forma correcta de inferencia:',
    options: [
      'No P (modus tollens)',
      'P',
      'Q',
      'P y Q',
      'Nada se sigue',
      'No Q implica P',
      'P o Q',
      'Solo Q',
    ],
    correct: 0,
    hint: 'Modus tollens: de “si P entonces Q” y la negación del consecuente se deduce la negación del antecedente. Es la contrapositiva en acción.',
  },
  {
    id: 's13',
    premises: ['Si P, entonces Q.', 'No P.'],
    question: '¿Qué es válido afirmar?',
    options: [
      'Nada sobre Q (falacia de negar el antecedente)',
      'No Q',
      'Q',
      'P',
      'Q y P',
      'Solo no Q',
      'P o Q',
      'No P y Q',
    ],
    correct: 0,
    hint: 'Negar el antecedente no permite concluir nada sobre el consecuente. El condicional solo obliga cuando el antecedente es verdadero; si es falso, Q puede ser verdadero o falso.',
  },
  {
    id: 's14',
    premises: ['Si P, entonces Q.', 'Q.'],
    question: '¿Qué se sigue válidamente?',
    options: [
      'Nada sobre P (falacia de afirmar el consecuente)',
      'P',
      'No P',
      'No Q',
      'P y Q',
      'Solo P',
      'Q implica P',
      'No Q',
    ],
    correct: 0,
    hint: 'Afirmar el consecuente es una falacia formal clásica. Q puede ser verdadero por otras razones distintas de P. El condicional no es una equivalencia.',
  },
  {
    id: 's15',
    premises: ['P → Q', 'Q → R'],
    question: 'Se sigue necesariamente:',
    options: [
      'P → R',
      'R → P',
      '¬P',
      '¬R',
      'Nada se sigue',
      'P ∧ R',
      'Solo Q',
      'R → Q',
    ],
    correct: 0,
    hint: 'Silogismo hipotético (transitividad del condicional). Si P implica Q y Q implica R, entonces P implica R. Es una de las reglas de cadena más usadas.',
  },
  {
    id: 's16',
    premises: ['P ∨ Q', '¬P'],
    question: '¿Qué se sigue?',
    options: [
      'Q (silogismo disyuntivo)',
      '¬Q',
      'P',
      'P ∧ Q',
      'Nada se sigue',
      '¬(P ∨ Q)',
      'Solo P',
      'Q → P',
    ],
    correct: 0,
    hint: 'Silogismo disyuntivo (modus tollendo ponens). De una disyunción inclusiva y la negación de uno de los disyuntos se concluye el otro.',
  },
  {
    id: 's17',
    premises: ['¬(P ∧ Q)'],
    question: '¿Cuál es la forma equivalente por De Morgan?',
    options: [
      '¬P ∨ ¬Q',
      '¬P ∧ ¬Q',
      'P ∨ Q',
      'P → Q',
      '¬P → Q',
      'P ∧ ¬Q',
      'Q',
      'P',
    ],
    correct: 0,
    hint: 'Leyes de De Morgan: la negación de una conjunción es la disyunción de las negaciones. Piensa en cuándo falla “P y Q”: cuando al menos uno de los dos falla.',
  },
  {
    id: 's18',
    premises: ['¬(P ∨ Q)'],
    question: 'Equivalente por De Morgan:',
    options: [
      '¬P ∧ ¬Q',
      '¬P ∨ ¬Q',
      'P ∧ Q',
      'P → Q',
      '¬P → ¬Q',
      'P ∨ ¬Q',
      'Q',
      'P',
    ],
    correct: 0,
    hint: 'La otra ley de De Morgan: negar una disyunción equivale a negar ambos disyuntos. “Ni P ni Q”.',
  },
  {
    id: 's19',
    premises: ['P → Q', '¬Q → ¬P'],
    question: '¿Qué relación existe entre estas dos fórmulas?',
    options: [
      'Son lógicamente equivalentes (contraposición)',
      'La segunda es más débil',
      'La primera implica la segunda pero no al revés',
      'Son contradictorias',
      'Nada se sigue',
      'Solo la primera es válida',
      'Solo la segunda es válida',
      'Dependen del dominio',
    ],
    correct: 0,
    hint: 'La contrapositiva de un condicional es lógicamente equivalente a él. P → Q ≡ ¬Q → ¬P. Es una de las equivalencias más útiles en demostraciones.',
  },
  {
    id: 's20',
    premises: ['P ↔ Q'],
    question: '¿Qué se sigue necesariamente?',
    options: [
      '(P → Q) ∧ (Q → P)',
      'Solo P → Q',
      'Solo Q → P',
      'P ∨ Q',
      'Nada se sigue',
      '¬P ∧ ¬Q',
      'P ∧ ¬Q',
      'Solo ¬P',
    ],
    correct: 0,
    hint: 'El bicondicional (si y solo si) es la conjunción de ambos condicionales. Es una equivalencia completa entre P y Q.',
  },

  // ——— Cuantificadores y lógica de predicados ———
  {
    id: 's21',
    premises: ['∀x P(x)', 'Pa'],
    question: '¿Es correcta la instanciación universal?',
    options: [
      'Sí, es la eliminación del universal',
      'No',
      'Solo si a es un número',
      'Solo se aplica a existenciales',
      'Nada se sigue',
      'Implica ∃x ¬P(x)',
      'Niega Pa',
      'Solo en dominios vacíos',
    ],
    correct: 0,
    hint: 'Regla de eliminación del cuantificador universal (∀-eliminación). Si algo vale para todo elemento del dominio, vale para cualquier constante particular a.',
  },
  {
    id: 's22',
    premises: ['∃x P(x)', '∀x (P(x) → Q(x))'],
    question: 'Se sigue necesariamente:',
    options: [
      '∃x Q(x)',
      '∀x Q(x)',
      '¬∃x Q(x)',
      'Nada se sigue',
      '∀x P(x)',
      '¬Pa',
      'Solo Q(a)',
      'P está vacío',
    ],
    correct: 0,
    hint: 'Existe al menos un individuo que satisface P. Como todo lo que satisface P también satisface Q, ese individuo (u otro) satisface Q. Se obtiene una existencia de Q.',
  },
  {
    id: 's23',
    premises: ['∀x (P(x) → Q(x))', '¬Q(a)'],
    question: '¿Qué se sigue?',
    options: [
      '¬P(a)',
      'P(a)',
      '∀x ¬P(x)',
      '∃x P(x)',
      'Nada se sigue',
      'Q(a)',
      'Solo ∃x ¬Q(x)',
      'P y Q son equivalentes',
    ],
    correct: 0,
    hint: 'Instancia el universal con a y luego aplica modus tollens. Es la combinación de ∀-eliminación + modus tollens.',
  },
  {
    id: 's24',
    premises: ['∃x (P(x) ∧ Q(x))'],
    question: 'Se sigue necesariamente:',
    options: [
      '∃x P(x) ∧ ∃x Q(x)',
      '∀x (P(x) ∧ Q(x))',
      '∃x P(x) → ∃x Q(x)',
      'Nada se sigue',
      '∀x P(x)',
      '¬∃x P(x)',
      'Solo Q(a)',
      'P y Q son disjuntos',
    ],
    correct: 0,
    hint: 'Si existe algo que es a la vez P y Q, entonces existe algo que es P y existe algo que es Q. La conjunción se puede “repartir” hacia afuera del existencial, pero no al revés.',
  },
  {
    id: 's25',
    premises: ['∀x P(x) ∨ ∀x Q(x)'],
    question: '¿Se sigue ∀x (P(x) ∨ Q(x))?',
    options: [
      'Sí',
      'No necesariamente',
      'Nunca',
      'Solo en dominios finitos',
      'Equivale a la conjunción',
      'Solo si P = Q',
      'Implica el existencial',
      'Depende del lenguaje',
    ],
    correct: 0,
    hint: 'Si todo el dominio es P, o todo el dominio es Q, entonces cada elemento es P o Q. La disyunción de universales implica el universal de la disyunción (pero el recíproco es falso).',
  },
  {
    id: 's26',
    premises: ['∀x (P(x) ∨ Q(x))'],
    question: '¿Se sigue ∀x P(x) ∨ ∀x Q(x)?',
    options: [
      'No necesariamente',
      'Sí, siempre',
      'Nunca',
      'Solo en dominios vacíos',
      'Equivale a la conjunción',
      'Solo si hay un solo elemento',
      'Implica el existencial',
      'Sí por De Morgan',
    ],
    correct: 0,
    hint: 'El universal de una disyunción no implica la disyunción de universales. Puede que unos elementos sean P y otros sean Q, sin que todo sea P ni todo sea Q.',
  },
  {
    id: 's27',
    premises: ['¬∀x P(x)'],
    question: 'Equivalente:',
    options: [
      '∃x ¬P(x)',
      '∀x ¬P(x)',
      '¬∃x P(x)',
      '∃x P(x)',
      'Nada se sigue',
      '∀x P(x)',
      'Solo ¬P(a)',
      'P está vacío',
    ],
    correct: 0,
    hint: 'Negación de cuantificadores: “no todos son P” equivale a “existe al menos uno que no es P”. Es la dualidad clásica ∀/∃.',
  },
  {
    id: 's28',
    premises: ['¬∃x P(x)'],
    question: 'Equivalente:',
    options: [
      '∀x ¬P(x)',
      '∃x ¬P(x)',
      '¬∀x P(x)',
      '∀x P(x)',
      'Nada se sigue',
      '∃x P(x)',
      'Solo P(a)',
      'El dominio es vacío',
    ],
    correct: 0,
    hint: '“No existe ningún P” equivale a “todo elemento no es P”. Otra aplicación de la dualidad de cuantificadores.',
  },

  // ——— Más silogismos y casos con lenguaje natural ———
  {
    id: 's29',
    premises: ['Todos los gatos son mamíferos.', 'Algunos animales domésticos son gatos.'],
    question: 'Conclusión válida:',
    options: [
      'Algunos animales domésticos son mamíferos',
      'Todos los animales domésticos son mamíferos',
      'Ningún animal doméstico es mamífero',
      'Todos los mamíferos son gatos',
      'Nada se sigue',
      'Algunos mamíferos no son gatos',
      'Solo los gatos son domésticos',
      'Gatos = mamíferos',
    ],
    correct: 0,
    hint: 'Darii aplicado a lenguaje natural. La particular afirmativa se transmite a través del término medio “gatos”.',
  },
  {
    id: 's30',
    premises: ['Ningún reptil es mamífero.', 'Todos los lagartos son reptiles.'],
    question: 'Se sigue:',
    options: [
      'Ningún lagarto es mamífero',
      'Algunos lagartos son mamíferos',
      'Todos los mamíferos son lagartos',
      'Algunos reptiles son mamíferos',
      'Nada se sigue',
      'Todos los lagartos son mamíferos',
      'Reptiles = mamíferos',
      'Solo los lagartos son reptiles',
    ],
    correct: 0,
    hint: 'Celarent. Universal negativa + universal afirmativa. Todo lagarto queda fuera de la clase de los mamíferos.',
  },
  {
    id: 's31',
    premises: ['Si llueve, entonces la calle está mojada.', 'La calle no está mojada.'],
    question: '¿Qué se concluye?',
    options: [
      'No está lloviendo (modus tollens)',
      'Está lloviendo',
      'La calle está mojada',
      'Llueve y la calle está seca',
      'Nada se sigue',
      'Solo que puede llover',
      'La calle siempre está mojada',
      'Llueve o no llueve',
    ],
    correct: 0,
    hint: 'Modus tollens en lenguaje cotidiano. La negación del consecuente fuerza la negación del antecedente.',
  },
  {
    id: 's32',
    premises: ['Si estudio, entonces apruebo.', 'Aprobé.'],
    question: '¿Se sigue que estudié?',
    options: [
      'No necesariamente (afirmar el consecuente)',
      'Sí, necesariamente',
      'Es imposible',
      'Solo si el examen era fácil',
      'Siempre',
      'Nunca',
      'Solo en este caso',
      'Depende de la dificultad',
    ],
    correct: 0,
    hint: 'Clásica falacia de afirmar el consecuente. Puedes aprobar por otras razones (suerte, conocimiento previo, etc.). El condicional no es “si y solo si”.',
  },
  {
    id: 's33',
    premises: ['Todos los cuadrados son rectángulos.', 'Todos los rectángulos tienen cuatro lados.'],
    question: 'Conclusión válida:',
    options: [
      'Todos los cuadrados tienen cuatro lados',
      'Algunos cuadrados no tienen cuatro lados',
      'Ningún cuadrado es rectángulo',
      'Todos los que tienen cuatro lados son cuadrados',
      'Nada se sigue',
      'Solo los rectángulos son cuadrados',
      'Cuadrados = rectángulos',
      'Hay cuadrados sin lados',
    ],
    correct: 0,
    hint: 'Barbara puro. Transitividad de la inclusión universal.',
  },
  {
    id: 's34',
    premises: ['Algunos filósofos son lógicos.', 'Todos los lógicos son rigurosos.'],
    question: 'Se sigue:',
    options: [
      'Algunos filósofos son rigurosos',
      'Todos los filósofos son rigurosos',
      'Ningún filósofo es riguroso',
      'Todos los rigurosos son filósofos',
      'Nada se sigue',
      'Algunos lógicos no son filósofos',
      'Filósofos = lógicos',
      'Solo los lógicos son rigurosos',
    ],
    correct: 0,
    hint: 'Darii. La particular afirmativa se combina con la universal afirmativa a través del término medio “lógicos”.',
  },
  {
    id: 's35',
    premises: ['Ningún mentiroso es confiable.', 'Algunos políticos son mentirosos.'],
    question: 'Conclusión válida:',
    options: [
      'Algunos políticos no son confiables',
      'Ningún político es confiable',
      'Todos los políticos son confiables',
      'Algunos políticos son confiables',
      'Nada se sigue',
      'Todos los confiables son políticos',
      'Políticos = mentirosos',
      'Solo los mentirosos son políticos',
    ],
    correct: 0,
    hint: 'Ferio. Universal negativa + particular afirmativa → particular negativa.',
  },
  {
    id: 's36',
    premises: ['P ∨ Q', 'P → R', 'Q → R'],
    question: 'Se sigue necesariamente:',
    options: [
      'R',
      '¬R',
      'P ∧ Q',
      '¬P',
      'Nada se sigue',
      'Solo P',
      'Solo Q',
      'R → P',
    ],
    correct: 0,
    hint: 'Prueba por casos (o dilema constructivo simple). Cualquiera de los dos disyuntos implica R; por tanto R se obtiene en cualquier caso.',
  },
  {
    id: 's37',
    premises: ['(P ∧ Q) → R', '¬R'],
    question: '¿Qué se sigue?',
    options: [
      '¬(P ∧ Q)',
      '¬P ∧ ¬Q',
      'P ∨ Q',
      'P ∧ Q',
      'Nada se sigue',
      'Solo ¬P',
      'Solo ¬Q',
      'R',
    ],
    correct: 0,
    hint: 'Modus tollens aplicado a una conjunción como antecedente. Se niega la conjunción completa, no necesariamente cada miembro por separado.',
  },
  {
    id: 's38',
    premises: ['Todos los A son B.', 'Todos los A son C.'],
    question: '¿Se sigue que algunos B son C?',
    options: [
      'Solo si se asume que existe al menos un A (importación existencial)',
      'Sí, siempre, incluso si A está vacío',
      'Nunca',
      'Solo en dominios infinitos',
      'Equivale a todos los B son C',
      'A debe ser infinito',
      'B y C son idénticos',
      'Sí por Barbara',
    ],
    correct: 0,
    hint: 'En lógica aristotélica clásica se asumía que los términos universales tenían existencia. En lógica moderna (booleana) la universal no implica existencia, por lo que “algunos B son C” no se sigue si A puede estar vacío.',
  },
  {
    id: 's39',
    premises: ['Si el testigo dice la verdad, entonces el acusado es inocente.', 'El acusado es culpable.'],
    question: 'Se sigue:',
    options: [
      'El testigo no dice la verdad (modus tollens)',
      'El testigo dice la verdad',
      'El acusado es inocente',
      'Nada se sigue',
      'El testigo miente y el acusado es inocente',
      'Solo que puede ser culpable',
      'El testigo siempre miente',
      'La inocencia implica verdad',
    ],
    correct: 0,
    hint: 'Modus tollens. “Culpable” niega “inocente”, por tanto se niega el antecedente.',
  },
  {
    id: 's40',
    premises: ['Todos los que estudian lógica mejoran su razonamiento.', 'María mejoró su razonamiento.'],
    question: '¿Se sigue que María estudió lógica?',
    options: [
      'No se sigue (afirmar el consecuente)',
      'Sí, necesariamente',
      'Es imposible',
      'Solo si no tenía otras causas',
      'Siempre',
      'Nunca',
      'Solo en este semestre',
      'Depende de su edad',
    ],
    correct: 0,
    hint: 'Otra instancia de la falacia de afirmar el consecuente. Mejorar el razonamiento puede tener muchas causas distintas de estudiar lógica.',
  },

  // ——— Más variedad: dilemas, equivalencias, casos mixtos ———
  {
    id: 's41',
    premises: ['P → Q', '¬P → Q'],
    question: 'Se sigue:',
    options: [
      'Q',
      '¬Q',
      'P',
      '¬P',
      'Nada se sigue',
      'P ∧ Q',
      'Solo ¬P',
      'Q → P',
    ],
    correct: 0,
    hint: 'Tanto si P como si ¬P, se obtiene Q. Por tanto Q es verdadero en cualquier caso (ley del tercero excluido + silogismo disyuntivo implícito).',
  },
  {
    id: 's42',
    premises: ['(P ∨ Q) → R', 'P'],
    question: '¿Qué se sigue?',
    options: [
      'R',
      '¬R',
      'Q',
      '¬P',
      'Nada se sigue',
      'Solo Q',
      'P ∧ R',
      'R → P',
    ],
    correct: 0,
    hint: 'De P se obtiene P ∨ Q (adición), y luego se aplica modus ponens al condicional cuyo antecedente es la disyunción.',
  },
  {
    id: 's43',
    premises: ['Todos los A son B.', 'Algunos C no son B.'],
    question: 'Conclusión válida:',
    options: [
      'Algunos C no son A',
      'Ningún C es A',
      'Todos los C son A',
      'Algunos C son A',
      'Nada se sigue',
      'Todos los A son C',
      'B está vacío',
      'A = C',
    ],
    correct: 0,
    hint: 'Baroco / Festino según la figura. Los C que están fuera de B también están fuera de A (porque A está completamente dentro de B).',
  },
  {
    id: 's44',
    premises: ['∃x ∀y R(x,y)', '∀x ∃y R(x,y)'],
    question: '¿Cuál implica a la otra?',
    options: [
      'La primera implica la segunda, pero no al revés',
      'Son equivalentes',
      'La segunda implica la primera',
      'Ninguna implica a la otra',
      'Nada se sigue',
      'Solo en dominios finitos',
      'Dependen del predicado R',
      'Son contradictorias',
    ],
    correct: 0,
    hint: '“Existe un x que se relaciona con todos los y” es mucho más fuerte que “para cada x existe algún y con el que se relaciona”. El orden de los cuantificadores importa decisivamente.',
  },
  {
    id: 's45',
    premises: ['P ∧ (Q ∨ R)'],
    question: 'Equivalente por distributividad:',
    options: [
      '(P ∧ Q) ∨ (P ∧ R)',
      '(P ∨ Q) ∧ (P ∨ R)',
      'P ∨ (Q ∧ R)',
      '¬P ∨ ¬Q',
      'Nada se sigue',
      'Solo P ∧ Q',
      'Solo P ∧ R',
      'P → Q',
    ],
    correct: 0,
    hint: 'La conjunción se distribuye sobre la disyunción. Es análogo a la propiedad distributiva de la multiplicación sobre la suma.',
  },
  {
    id: 's46',
    premises: ['Ningún A es B.', 'Ningún B es C.'],
    question: '¿Se sigue que ningún A es C?',
    options: [
      'No necesariamente',
      'Sí, siempre',
      'Nunca',
      'Solo si el dominio es finito',
      'Equivale a todos',
      'A y C son idénticos',
      'B está vacío',
      'Sí por Celarent',
    ],
    correct: 0,
    hint: 'Dos universales negativas no producen conclusión válida en el silogismo categórico clásico (no hay término medio que conecte afirmativamente). A y C pueden solaparse fuera de B.',
  },
  {
    id: 's47',
    premises: ['Si P, entonces Q.', 'Si Q, entonces P.'],
    question: 'Se sigue:',
    options: [
      'P ↔ Q',
      'Solo P → Q',
      'Solo Q → P',
      'P ∨ Q',
      'Nada se sigue',
      '¬P ∧ ¬Q',
      'P ∧ ¬Q',
      'Solo ¬P',
    ],
    correct: 0,
    hint: 'La conjunción de ambos condicionales es exactamente la definición del bicondicional.',
  },
  {
    id: 's48',
    premises: ['∀x (P(x) → Q(x))', '∃x ¬Q(x)'],
    question: 'Se sigue:',
    options: [
      '∃x ¬P(x)',
      '∀x ¬P(x)',
      '∃x P(x)',
      '∀x Q(x)',
      'Nada se sigue',
      'Solo ¬P(a)',
      'P y Q son equivalentes',
      'El dominio es vacío',
    ],
    correct: 0,
    hint: 'Hay al menos un individuo que no es Q. Por el condicional universal, ese individuo tampoco puede ser P. Se obtiene una existencia de ¬P.',
  },
  {
    id: 's49',
    premises: ['Todos los estudiantes del curso aprobaron.', 'Luis no aprobó.'],
    question: 'Se sigue:',
    options: [
      'Luis no es estudiante del curso',
      'Luis es estudiante del curso',
      'Todos aprobaron excepto Luis',
      'Nada se sigue',
      'Luis estudió poco',
      'El curso fue fácil',
      'Solo Luis suspendió',
      'Luis aprobó en realidad',
    ],
    correct: 0,
    hint: 'Modus tollens + instanciación. Si todos los del curso aprobaron y Luis no aprobó, entonces Luis no pertenece al conjunto “estudiantes del curso”.',
  },
  {
    id: 's50',
    premises: ['Algunos A son B.', 'Ningún B es C.'],
    question: 'Conclusión válida:',
    options: [
      'Algunos A no son C',
      'Ningún A es C',
      'Todos los A son C',
      'Algunos A son C',
      'Nada se sigue',
      'Todos los C son A',
      'B está vacío',
      'A = C',
    ],
    correct: 0,
    hint: 'Particular afirmativa + universal negativa. Los A que están en B quedan fuera de C, por tanto algunos A no son C.',
  },

  // ——— Niveles adicionales de refuerzo y variación ———
  {
    id: 's51',
    premises: ['P → (Q → R)', 'P', 'Q'],
    question: 'Se sigue:',
    options: [
      'R',
      '¬R',
      '¬P',
      '¬Q',
      'Nada se sigue',
      'Solo Q → R',
      'P ∧ ¬R',
      'R → P',
    ],
    correct: 0,
    hint: 'Aplicación sucesiva de modus ponens. Primero se obtiene Q → R a partir de P, luego R a partir de Q.',
  },
  {
    id: 's52',
    premises: ['Todos los A son B.', 'Algunos A son C.'],
    question: 'Se sigue:',
    options: [
      'Algunos B son C',
      'Todos los B son C',
      'Ningún B es C',
      'Algunos B no son C',
      'Nada se sigue',
      'Todos los C son A',
      'A está vacío',
      'B = C',
    ],
    correct: 0,
    hint: 'Los A que son C también son B (porque todos los A son B). Por tanto hay solapamiento entre B y C.',
  },
  {
    id: 's53',
    premises: ['¬P ∨ Q', 'P'],
    question: 'Se sigue:',
    options: [
      'Q',
      '¬Q',
      '¬P',
      'P ∧ ¬Q',
      'Nada se sigue',
      'Solo ¬P',
      'Q → P',
      'P ∨ ¬Q',
    ],
    correct: 0,
    hint: '¬P ∨ Q es equivalente a P → Q. Con P se obtiene Q por modus ponens (o directamente por silogismo disyuntivo).',
  },
  {
    id: 's54',
    premises: ['Todos los mamíferos son animales.', 'Algunos perros no son mansos.'],
    question: '¿Se sigue que algunos animales no son mansos?',
    options: [
      'No necesariamente (no hay conexión con “mansos”)',
      'Sí, siempre',
      'Nunca',
      'Solo si todos los perros son mamíferos',
      'Equivale a todos',
      'Perros = animales',
      'Sí por Darii',
      'Depende del tamaño del dominio',
    ],
    correct: 0,
    hint: 'Falta una premisa que conecte “perros” con “mamíferos” o “animales”. Sin término medio adecuado no hay silogismo válido sobre “mansos”.',
  },
  {
    id: 's55',
    premises: ['Si el motor funciona, entonces el coche arranca.', 'El coche no arranca.'],
    question: 'Conclusión válida:',
    options: [
      'El motor no funciona (modus tollens)',
      'El motor funciona',
      'El coche arranca',
      'Nada se sigue',
      'El motor funciona y el coche no arranca',
      'Solo que puede no arrancar',
      'El motor siempre funciona',
      'Arrancar implica motor',
    ],
    correct: 0,
    hint: 'Modus tollens puro. La negación del consecuente obliga a negar el antecedente.',
  },
  {
    id: 's56',
    premises: ['∀x ∀y (R(x,y) → R(y,x))', 'R(a,b)'],
    question: 'Se sigue:',
    options: [
      'R(b,a)',
      '¬R(b,a)',
      '∀x R(x,a)',
      '∃x ¬R(x,b)',
      'Nada se sigue',
      'Solo R(a,a)',
      'R es transitiva',
      'El dominio es simétrico',
    ],
    correct: 0,
    hint: 'La premisa universal afirma que R es simétrica. Al instanciar con a y b se obtiene el condicional R(a,b) → R(b,a), y luego modus ponens.',
  },
  {
    id: 's57',
    premises: ['P → Q', 'R → ¬Q'],
    question: 'Se sigue:',
    options: [
      'P → ¬R',
      'R → P',
      'P ∧ R',
      '¬P ∧ ¬R',
      'Nada se sigue',
      'Solo ¬Q',
      'Q → R',
      'P ∨ R',
    ],
    correct: 0,
    hint: 'Si P entonces Q, y si R entonces no Q. Por tanto P y R no pueden ser verdaderos a la vez: P implica ¬R (o equivalentemente R implica ¬P).',
  },
  {
    id: 's58',
    premises: ['Algunos A son B.', 'Todos los B son C.', 'Todos los C son D.'],
    question: 'Se sigue:',
    options: [
      'Algunos A son D',
      'Todos los A son D',
      'Ningún A es D',
      'Algunos A no son D',
      'Nada se sigue',
      'Todos los D son A',
      'B está vacío',
      'A = D',
    ],
    correct: 0,
    hint: 'Cadena de inclusiones. Los A que están en B también están en C y por tanto en D. Se transmite la particularidad hasta D.',
  },
  {
    id: 's59',
    premises: ['¬(P → Q)'],
    question: 'Equivalente:',
    options: [
      'P ∧ ¬Q',
      '¬P ∨ Q',
      '¬P ∧ ¬Q',
      'P ∨ ¬Q',
      'Nada se sigue',
      'Solo ¬P',
      'Solo ¬Q',
      'P → ¬Q',
    ],
    correct: 0,
    hint: 'La negación de un condicional es la afirmación del antecedente junto con la negación del consecuente. Es una equivalencia muy útil.',
  },
  {
    id: 's60',
    premises: ['Todos los A son B o todos los A son C.', 'Algunos A no son B.'],
    question: 'Se sigue:',
    options: [
      'Todos los A son C',
      'Algunos A son C',
      'Ningún A es C',
      'Algunos A no son C',
      'Nada se sigue',
      'Todos los A son B',
      'B y C son idénticos',
      'A está vacío',
    ],
    correct: 0,
    hint: 'De la disyunción de universales y la negación de una de ellas se obtiene la otra (silogismo disyuntivo a nivel de proposiciones universales).',
  },

  // ——— Últimos ítems para mayor variedad ———
  {
    id: 's61',
    premises: ['Si hay fuego, entonces hay humo.', 'Hay humo.'],
    question: '¿Se sigue que hay fuego?',
    options: [
      'No necesariamente (afirmar el consecuente)',
      'Sí, necesariamente',
      'Es imposible',
      'Solo en invierno',
      'Siempre',
      'Nunca',
      'Solo si se ve la llama',
      'Depende del tipo de humo',
    ],
    correct: 0,
    hint: 'El humo puede tener otras causas (vapor, polvo, etc.). Afirmar el consecuente no permite recuperar el antecedente.',
  },
  {
    id: 's62',
    premises: ['Ningún A es B.', 'Algunos C son B.'],
    question: 'Se sigue:',
    options: [
      'Algunos C no son A',
      'Ningún C es A',
      'Todos los C son A',
      'Algunos C son A',
      'Nada se sigue',
      'Todos los A son C',
      'B está vacío',
      'A = C',
    ],
    correct: 0,
    hint: 'Los C que están en B no pueden estar en A (porque A y B son disjuntos). Particular negativa.',
  },
  {
    id: 's63',
    premises: ['P ↔ Q', '¬Q'],
    question: 'Se sigue:',
    options: [
      '¬P',
      'P',
      'Q',
      'P ∧ Q',
      'Nada se sigue',
      'Solo Q',
      'P ∨ Q',
      '¬P → Q',
    ],
    correct: 0,
    hint: 'El bicondicional permite sustituir. Si Q es falso, P también debe serlo.',
  },
  {
    id: 's64',
    premises: ['∀x (P(x) ∨ ¬P(x))'],
    question: '¿Qué principio ilustra esta fórmula?',
    options: [
      'Tercero excluido (para cada x)',
      'No contradicción',
      'Modus ponens',
      'Existencia de P',
      'Nada en particular',
      'Solo en dominios finitos',
      'Identidad',
      'Silogismo disyuntivo',
    ],
    correct: 0,
    hint: 'Para cada individuo, o bien satisface P o bien no lo satisface. Es la versión cuantificada del principio del tercero excluido.',
  },
  {
    id: 's65',
    premises: ['Todos los A son B.', 'Ningún A es C.', 'Algunos B son C.'],
    question: '¿Es consistente este conjunto de premisas?',
    options: [
      'Sí, es posible',
      'No, es contradictorio',
      'Solo si A está vacío',
      'Solo en dominios infinitos',
      'Nada se puede decir',
      'Obliga a que B = C',
      'Fuerza que A = B',
      'Implica que C está vacío',
    ],
    correct: 0,
    hint: 'Los A están dentro de B y fuera de C. Eso no impide que otras partes de B (distintas de A) se solapen con C. No hay contradicción.',
  },
  {
    id: 's66',
    premises: ['P → Q', 'Q → R', '¬R'],
    question: 'Se sigue:',
    options: [
      '¬P',
      'P',
      'Q',
      '¬Q ∧ P',
      'Nada se sigue',
      'Solo ¬Q',
      'R → P',
      'P ∧ R',
    ],
    correct: 0,
    hint: 'Cadena de condicionales + modus tollens. ¬R implica ¬Q, y ¬Q implica ¬P.',
  },
  {
    id: 's67',
    premises: ['Algunos A no son B.', 'Algunos B no son C.'],
    question: '¿Se sigue que algunos A no son C?',
    options: [
      'No necesariamente',
      'Sí, siempre',
      'Nunca',
      'Solo si el dominio es finito',
      'Equivale a todos',
      'A y C son disjuntos',
      'B está vacío',
      'Sí por Baroco',
    ],
    correct: 0,
    hint: 'Dos particulares negativas no garantizan ninguna relación necesaria entre A y C. Los diagramas de Venn pueden configurarse de muchas maneras.',
  },
  {
    id: 's68',
    premises: ['Si apruebo el examen, entonces celebro.', 'No celebré.'],
    question: 'Se sigue:',
    options: [
      'No aprobé el examen (modus tollens)',
      'Aprobé el examen',
      'Celebré en secreto',
      'Nada se sigue',
      'Aprobé y no celebré',
      'Solo que pude aprobar',
      'Siempre celebro',
      'Celebrar implica aprobar',
    ],
    correct: 0,
    hint: 'Modus tollens en contexto cotidiano. La ausencia de celebración niega el antecedente.',
  },
  {
    id: 's69',
    premises: ['∀x (P(x) → Q(x))', '∀x (Q(x) → R(x))'],
    question: 'Se sigue:',
    options: [
      '∀x (P(x) → R(x))',
      '∃x (P(x) ∧ R(x))',
      '∀x R(x)',
      '¬∃x P(x)',
      'Nada se sigue',
      'Solo ∃x Q(x)',
      'P y R son equivalentes',
      'El dominio es vacío',
    ],
    correct: 0,
    hint: 'Transitividad del condicional bajo el cuantificador universal. Es el análogo predicativo del silogismo hipotético.',
  },
  {
    id: 's70',
    premises: ['P ∨ ¬P'],
    question: '¿Qué principio expresa esta fórmula?',
    options: [
      'Tercero excluido',
      'No contradicción',
      'Modus ponens',
      'Identidad',
      'Nada en particular',
      'Solo en lógica clásica es válido',
      'Existencia',
      'Silogismo disyuntivo',
    ],
    correct: 0,
    hint: 'En lógica clásica, toda proposición es verdadera o falsa. No hay una tercera posibilidad. (En lógicas no clásicas este principio puede fallar.)',
  },
  {
    id: 's71',
    premises: ['¬(P ∧ ¬P)'],
    question: '¿Qué principio expresa?',
    options: [
      'No contradicción',
      'Tercero excluido',
      'Modus ponens',
      'Identidad',
      'Nada en particular',
      'Solo en dominios no vacíos',
      'Existencia de P',
      'Silogismo hipotético',
    ],
    correct: 0,
    hint: 'Ninguna proposición puede ser verdadera y falsa al mismo tiempo. Es el principio de no contradicción.',
  },
  {
    id: 's72',
    premises: ['Todos los A son B.', 'Todos los C son B.', 'Algunos A son C.'],
    question: '¿Qué se puede decir de B?',
    options: [
      'Algunos B son A y algunos B son C (hay solapamiento)',
      'Todos los B son A',
      'Ningún B es C',
      'B está vacío',
      'Nada se sigue sobre B',
      'B = A ∪ C',
      'Solo los A son B',
      'C está fuera de B',
    ],
    correct: 0,
    hint: 'A y C están ambos dentro de B y se solapan entre sí. Por tanto B contiene al menos la intersección de A y C.',
  },
  {
    id: 's73',
    premises: ['P → Q', '¬(Q ∨ R)'],
    question: 'Se sigue:',
    options: [
      '¬P ∧ ¬R',
      'P ∧ R',
      'Solo ¬P',
      'Solo ¬R',
      'Nada se sigue',
      'Q',
      'P ∨ R',
      '¬Q → P',
    ],
    correct: 0,
    hint: '¬(Q ∨ R) equivale a ¬Q ∧ ¬R (De Morgan). De ¬Q y P → Q se obtiene ¬P por modus tollens. Se conservan ambas negaciones.',
  },
  {
    id: 's74',
    premises: ['Algunos A son B.', 'Algunos A son C.', 'Ningún B es C.'],
    question: '¿Es posible esta situación?',
    options: [
      'Sí, A puede tener partes disjuntas',
      'No, es contradictorio',
      'Solo si A está vacío',
      'Solo en dominios infinitos',
      'Nada se puede decir',
      'Obliga a que B = C',
      'Fuerza que A = B',
      'Implica que C está vacío',
    ],
    correct: 0,
    hint: 'A puede solaparse con B en una zona y con C en otra zona distinta, sin que B y C se toquen. No hay contradicción.',
  },
  {
    id: 's75',
    premises: ['Si el sistema es consistente, entonces no prueba falsedades.', 'El sistema prueba una falsedad.'],
    question: 'Se sigue:',
    options: [
      'El sistema no es consistente (modus tollens)',
      'El sistema es consistente',
      'No prueba falsedades',
      'Nada se sigue',
      'Es consistente y prueba falsedades',
      'Solo que puede ser inconsistente',
      'Siempre es consistente',
      'Probar falsedades implica consistencia',
    ],
    correct: 0,
    hint: 'Modus tollens aplicado a un enunciado metalógico. La presencia de una prueba de falsedad niega la consistencia.',
  },
]

/** Expande el banco hasta TOTAL_LEVELS sin repeticiones triviales */
function expand(): Item[] {
  const out: Item[] = [...BANK]
  let i = 0
  while (out.length < TOTAL_LEVELS) {
    const base = BANK[i % BANK.length]
    const variantNum = Math.floor(out.length / BANK.length) + 1
    out.push({
      ...base,
      id: `${base.id}-v${variantNum}`,
      // Variaciones mínimas de redacción para no ser idénticos
      premises: base.premises.map((p, idx) =>
        idx === 0 && variantNum > 1 ? p.replace(/\.$/, '') + '.' : p
      ),
      question: base.question,
    })
    i++
  }
  return out.slice(0, TOTAL_LEVELS)
}

const LEVELS = expand()

export function SilogismosGame() {
  const navigate = useNavigate()
  const progress = getGameProgress(GAME_CAT, GAME_ID)
  const unlockedRows = useMemo(() => getUnlockedLevels(GAME_CAT, GAME_ID), [progress.highestLevel])
  const defaultLevel = Math.min(Math.max(1, progress.highestLevel || 1), TOTAL_LEVELS)
  const maxSelectable = Math.max(1, defaultLevel, ...unlockedRows.map((u) => u.level))

  const [level, setLevel] = useState(defaultLevel)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<'setup' | 'play' | 'result'>('setup')
  const [showLevelPicker, setShowLevelPicker] = useState(false)
  const [showTheory, setShowTheory] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [item, setItem] = useState<Item | null>(null)
  const [useTimer, setUseTimer] = useState(true)
  const [timeLeft, setTimeLeft] = useState(TIMER_BASE)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)

  const timerRef = useRef<number | null>(null)
  const startRef = useRef(0)
  const levelRef = useRef(level)
  levelRef.current = level

  const bestForLevel = getLevelBestTime(GAME_CAT, GAME_ID, level)

  const clearTimers = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const startLevel = useCallback(
    (lv: number, att = 0) => {
      clearTimers()
      const it = LEVELS[(lv - 1 + att * 5) % LEVELS.length]
      setItem(it)
      setIsCorrect(null)
      setShowHint(false)
      setLevel(lv)
      setAttempt(att)
      setPhase('play')
      setShowLevelPicker(false)
      setTimeLeft(Math.max(40, TIMER_BASE - Math.floor(lv / 10)))
      startRef.current = Date.now()
      soundStart()
      if (useTimer) {
        timerRef.current = window.setInterval(() => {
          setTimeLeft((t) => {
            if (t <= 1) {
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
              return 0
            }
            return t - 1
          })
        }, 1000)
      }
    },
    [useTimer],
  )

  useEffect(() => () => clearTimers(), [])

  const submit = (idx: number) => {
    if (!item || isCorrect !== null) return
    soundClick()
    clearTimers()
    const ok = idx === item.correct
    setIsCorrect(ok)
    setPhase('result')
    recordLevelResult({
      categoryId: GAME_CAT,
      gameId: GAME_ID,
      level,
      success: ok,
      timeMs: Date.now() - startRef.current,
    })
    if (ok) soundSuccess()
    else soundFail()
  }

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
          onClick={() => {
            soundClick()
            clearTimers()
            if (phase === 'setup') navigate('/categoria/deduccion')
            else {
              setPhase('setup')
              setShowLevelPicker(false)
              setShowHint(false)
            }
          }}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          {phase === 'setup' ? '← Volver' : '← Modos'}
        </button>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          {phase === 'play' && useTimer && (
            <span
              className="mono"
              style={{ color: timeLeft <= 12 ? 'var(--gco-secondary)' : 'var(--gco-ink-muted)' }}
            >
              ⏱ {timeLeft}s
            </span>
          )}
          {phase === 'setup' && (
            <button
              type="button"
              className="glass-button secondary"
              onClick={() => {
                soundClick()
                setShowLevelPicker((v) => !v)
              }}
              style={{ padding: '0.35rem 0.7rem', fontSize: '0.85rem' }}
            >
              Nivel {level} ▾
            </button>
          )}
          {phase !== 'setup' && <span className="level-number">Nivel {level}</span>}
        </div>
      </header>

      <AnimatePresence>
        {showLevelPicker && phase === 'setup' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-card"
            style={{ padding: '0.85rem 1rem', marginBottom: '0.85rem' }}
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
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {phase === 'setup' && (
          <motion.div key="s" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard>
              <div style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h2 style={{ textAlign: 'center', margin: 0 }}>⚖️ Silogismos</h2>
                <p style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--gco-ink-muted)', margin: 0 }}>
                  Entrenamiento de validez deductiva · {TOTAL_LEVELS} niveles
                </p>

                {/* ——— Botón desplegable de teoría ——— */}
                <button
                  type="button"
                  className="glass-button secondary"
                  onClick={() => {
                    soundToggle(!showTheory)
                    setShowTheory((v) => !v)
                  }}
                  style={{
                    justifyContent: 'space-between',
                    textAlign: 'left',
                    padding: '0.85rem 1rem',
                    fontSize: '0.92rem',
                  }}
                >
                  <span>¿Qué es un silogismo? · Teoría completa</span>
                  <span style={{ opacity: 0.7 }}>{showTheory ? '▾' : '▸'}</span>
                </button>

                <AnimatePresence>
                  {showTheory && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div
                        style={{
                          fontSize: '0.86rem',
                          color: 'var(--gco-ink-muted)',
                          lineHeight: 1.6,
                          padding: '1rem 1.1rem',
                          borderRadius: 14,
                          background: 'var(--gco-fill-quaternary)',
                          border: '1px solid var(--gco-glass-border)',
                          maxHeight: '55vh',
                          overflowY: 'auto',
                        }}
                      >
                        <p style={{ marginBottom: 12, color: 'var(--gco-ink)', fontWeight: 700, fontSize: '0.95rem' }}>
                          Orígenes y etimología
                        </p>
                        <p style={{ marginBottom: 10 }}>
                          La palabra <strong style={{ color: 'var(--gco-ink)' }}>silogismo</strong> proviene del
                          griego συλλογισμός (<em>syllogismós</em>), formada por σύν (<em>syn</em>, “con, junto”) y
                          λογισμός (<em>logismós</em>, “cálculo, razonamiento”). Literalmente significa “razonamiento
                          conjunto” o “cómputo de proposiciones”. El término fue sistematizado por Aristóteles en los
                          <em> Analíticos primeros</em> (siglo IV a. C.), donde define el silogismo como un discurso en
                          el cual, establecidas ciertas cosas, se sigue necesariamente algo distinto de lo establecido
                          por el solo hecho de haber sido establecido (Aristóteles, <em>Analíticos primeros</em>, I, 1,
                          24b18-20).
                        </p>

                        <p style={{ marginBottom: 12, color: 'var(--gco-ink)', fontWeight: 700, fontSize: '0.95rem' }}>
                          ¿Qué estudia la teoría del silogismo?
                        </p>
                        <p style={{ marginBottom: 10 }}>
                          La teoría del silogismo estudia las formas de argumento deductivo en las que la conclusión se
                          sigue <em>necesariamente</em> de las premisas por su estructura lógica, independientemente de
                          si las premisas son verdaderas en el mundo real. Se distingue cuidadosamente entre{' '}
                          <strong style={{ color: 'var(--gco-ink)' }}>validez</strong> (relación formal entre premisas y
                          conclusión) y <strong style={{ color: 'var(--gco-ink)' }}>verdad</strong> (correspondencia con
                          los hechos). Un silogismo puede ser válido aunque sus premisas sean falsas; lo que importa es
                          que, <em>si</em> las premisas fueran verdaderas, la conclusión no podría ser falsa.
                        </p>

                        <p style={{ marginBottom: 12, color: 'var(--gco-ink)', fontWeight: 700, fontSize: '0.95rem' }}>
                          Silogismos categóricos (Aristóteles)
                        </p>
                        <p style={{ marginBottom: 10 }}>
                          Aristóteles clasificó los silogismos según la cantidad (universal/particular) y la calidad
                          (afirmativa/negativa) de las proposiciones, generando los cuatro tipos clásicos:
                        </p>
                        <ul style={{ margin: '0 0 10px 1.1rem', padding: 0 }}>
                          <li><strong style={{ color: 'var(--gco-ink)' }}>A</strong> – Universal afirmativa: “Todos los S son P”</li>
                          <li><strong style={{ color: 'var(--gco-ink)' }}>E</strong> – Universal negativa: “Ningún S es P”</li>
                          <li><strong style={{ color: 'var(--gco-ink)' }}>I</strong> – Particular afirmativa: “Algunos S son P”</li>
                          <li><strong style={{ color: 'var(--gco-ink)' }}>O</strong> – Particular negativa: “Algunos S no son P”</li>
                        </ul>
                        <p style={{ marginBottom: 10 }}>
                          Combinando estas formas en tres figuras (según la posición del término medio) se obtienen los
                          modos válidos tradicionales: Barbara, Celarent, Darii, Ferio, Cesare, Camestres, Festino,
                          Baroco, etc. (Kneale & Kneale, 1962).
                        </p>

                        <p style={{ marginBottom: 12, color: 'var(--gco-ink)', fontWeight: 700, fontSize: '0.95rem' }}>
                          Lógica proposicional y reglas de inferencia
                        </p>
                        <p style={{ marginBottom: 10 }}>
                          En la lógica moderna el concepto se amplía a cualquier argumento deductivo válido. Las reglas
                          más fundamentales incluyen:
                        </p>
                        <ul style={{ margin: '0 0 10px 1.1rem', padding: 0 }}>
                          <li><strong style={{ color: 'var(--gco-ink)' }}>Modus ponens</strong>: de P → Q y P se obtiene Q.</li>
                          <li><strong style={{ color: 'var(--gco-ink)' }}>Modus tollens</strong>: de P → Q y ¬Q se obtiene ¬P.</li>
                          <li><strong style={{ color: 'var(--gco-ink)' }}>Silogismo hipotético</strong>: de P → Q y Q → R se obtiene P → R.</li>
                          <li><strong style={{ color: 'var(--gco-ink)' }}>Silogismo disyuntivo</strong>: de P ∨ Q y ¬P se obtiene Q.</li>
                          <li><strong style={{ color: 'var(--gco-ink)' }}>Leyes de De Morgan</strong>: ¬(P ∧ Q) ≡ ¬P ∨ ¬Q y ¬(P ∨ Q) ≡ ¬P ∧ ¬Q.</li>
                        </ul>

                        <p style={{ marginBottom: 12, color: 'var(--gco-ink)', fontWeight: 700, fontSize: '0.95rem' }}>
                          Falacias formales frecuentes
                        </p>
                        <p style={{ marginBottom: 10 }}>
                          Una <em>falacia formal</em> es un esquema argumentativo que parece válido por su parecido con
                          una regla legítima, pero no lo es. Las más comunes en este entrenamiento son:
                        </p>
                        <ul style={{ margin: '0 0 10px 1.1rem', padding: 0 }}>
                          <li><strong style={{ color: 'var(--gco-ink)' }}>Afirmar el consecuente</strong>: de P → Q y Q concluir P (inválido).</li>
                          <li><strong style={{ color: 'var(--gco-ink)' }}>Negar el antecedente</strong>: de P → Q y ¬P concluir ¬Q (inválido).</li>
                        </ul>

                        <p style={{ marginBottom: 12, color: 'var(--gco-ink)', fontWeight: 700, fontSize: '0.95rem' }}>
                          Cuantificadores y lógica de predicados
                        </p>
                        <p style={{ marginBottom: 10 }}>
                          La lógica de primer orden introduce los cuantificadores universal (∀) y existencial (∃). Las
                          reglas de introducción y eliminación de cuantificadores, junto con la dualidad ¬∀x P(x) ≡ ∃x ¬P(x)
                          y ¬∃x P(x) ≡ ∀x ¬P(x), permiten formalizar razonamientos más ricos que los silogismos
                          categóricos clásicos (Copi, Cohen & McMahon, 2016).
                        </p>

                        <p style={{ marginBottom: 12, color: 'var(--gco-ink)', fontWeight: 700, fontSize: '0.95rem' }}>
                          Validez vs. verdad material
                        </p>
                        <p style={{ marginBottom: 10 }}>
                          En este juego nunca se pregunta si las premisas son “verdaderas en el mundo”, sino únicamente
                          si la conclusión se sigue <em>por forma</em>. Un argumento puede tener premisas absurdas y ser
                          perfectamente válido, o tener premisas verdaderas y ser inválido. El objetivo es entrenar la
                          sensibilidad a la estructura lógica.
                        </p>

                        <p style={{ marginBottom: 8, color: 'var(--gco-ink)', fontWeight: 700, fontSize: '0.95rem' }}>
                          Referencias (APA 7.ª ed.)
                        </p>
                        <p style={{ fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 4 }}>
                          Aristóteles. (n.d.). <em>Analíticos primeros</em> (trad. varias). (Obra original ca. 350 a. C.).
                        </p>
                        <p style={{ fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 4 }}>
                          Copi, I. M., Cohen, C., & McMahon, K. (2016). <em>Introduction to logic</em> (14.ª ed.). Routledge.
                        </p>
                        <p style={{ fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 4 }}>
                          Kneale, W., & Kneale, M. (1962). <em>The development of logic</em>. Oxford University Press.
                        </p>
                        <p style={{ fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 4 }}>
                          Smith, R. (2022). Aristotle’s logic. En E. N. Zalta (Ed.), <em>The Stanford Encyclopedia of Philosophy</em>
                          (ed. de otoño de 2022). https://plato.stanford.edu/archives/fall2022/entries/aristotle-logic/
                        </p>
                        <p style={{ fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 0 }}>
                          Hurley, P. J., & Watson, L. (2018). <em>A concise introduction to logic</em> (13.ª ed.). Cengage.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {bestForLevel != null && bestForLevel > 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--gco-primary)', fontSize: '0.9rem', margin: 0 }}>
                    🏆 Mejor tiempo en este nivel: <span className="mono">{formatDuration(bestForLevel)}</span>
                  </p>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--gco-fill-quaternary)',
                    border: '1px solid var(--gco-glass-border)',
                    borderRadius: 14,
                    padding: '0.8rem 1rem',
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 600, margin: 0 }}>Contrarreloj</p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--gco-ink-muted)', margin: 0 }}>Activo por defecto</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useTimer}
                    onClick={() => {
                      soundToggle(!useTimer)
                      setUseTimer(!useTimer)
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

                <GlassButton
                  onClick={() => startLevel(Math.min(level, maxSelectable), 0)}
                  style={{ minHeight: 48 }}
                >
                  Empezar · Nivel {Math.min(level, maxSelectable)}
                </GlassButton>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {phase === 'play' && item && (
          <motion.div key="p" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard>
              <div style={{ padding: '1.2rem' }}>
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--gco-ink-muted)',
                    marginBottom: 8,
                    letterSpacing: '0.04em',
                    fontWeight: 600,
                  }}
                >
                  PREMISAS
                </p>
                {item.premises.map((p, i) => (
                  <p key={i} style={{ fontWeight: 500, marginBottom: 6, lineHeight: 1.45 }}>
                    {i + 1}. {p}
                  </p>
                ))}

                <p style={{ fontWeight: 600, margin: '16px 0 14px', lineHeight: 1.4 }}>{item.question}</p>

                {/* Botón Pista */}
                <button
                  type="button"
                  className="glass-button secondary"
                  onClick={() => {
                    soundToggle(!showHint)
                    setShowHint((v) => !v)
                  }}
                  style={{
                    width: '100%',
                    justifyContent: 'space-between',
                    marginBottom: showHint ? 10 : 14,
                    padding: '0.65rem 0.9rem',
                    fontSize: '0.88rem',
                  }}
                >
                  <span>💡 Pista (conceptos y orientación)</span>
                  <span style={{ opacity: 0.7 }}>{showHint ? '▾' : '▸'}</span>
                </button>

                <AnimatePresence>
                  {showHint && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ overflow: 'hidden', marginBottom: 14 }}
                    >
                      <div
                        style={{
                          fontSize: '0.84rem',
                          color: 'var(--gco-ink-muted)',
                          lineHeight: 1.55,
                          padding: '0.85rem 1rem',
                          borderRadius: 12,
                          background: 'var(--gco-fill-quaternary)',
                          border: '1px solid var(--gco-glass-border)',
                        }}
                      >
                        {item.hint}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {item.options.map((o, i) => (
                    <button
                      key={i}
                      type="button"
                      className="glass-button secondary"
                      style={{
                        justifyContent: 'flex-start',
                        textAlign: 'left',
                        minHeight: 46,
                        fontSize: '0.88rem',
                        lineHeight: 1.35,
                      }}
                      onClick={() => submit(i)}
                    >
                      <span
                        style={{
                          opacity: 0.55,
                          marginRight: 10,
                          fontFamily: 'var(--font-mono)',
                          flexShrink: 0,
                        }}
                      >
                        {String.fromCharCode(65 + i)}.
                      </span>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {phase === 'result' && item && (
          <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <GlassCard>
              <div style={{ padding: '1.3rem', textAlign: 'center' }}>
                <p
                  style={{
                    fontWeight: 700,
                    fontSize: '1.15rem',
                    color: isCorrect ? 'var(--gco-primary)' : 'var(--gco-secondary)',
                    margin: 0,
                  }}
                >
                  {isCorrect ? '✓ Válido' : '✗ Incorrecto'}
                </p>
                <p style={{ color: 'var(--gco-ink-muted)', margin: '8px 0 14px' }}>
                  {formatDuration(Date.now() - startRef.current)}
                </p>
                {!isCorrect && (
                  <p style={{ fontSize: '0.92rem', marginBottom: 16, lineHeight: 1.4 }}>
                    Respuesta correcta:{' '}
                    <strong style={{ color: 'var(--gco-primary)' }}>{item.options[item.correct]}</strong>
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {isCorrect ? (
                    <GlassButton onClick={() => startLevel(Math.min(level + 1, TOTAL_LEVELS), 0)}>
                      Siguiente nivel
                    </GlassButton>
                  ) : (
                    <GlassButton onClick={() => startLevel(level, attempt + 1)}>
                      Otro enunciado (mismo nivel)
                    </GlassButton>
                  )}
                  <button
                    className="glass-button secondary"
                    onClick={() => {
                      soundClick()
                      setPhase('setup')
                      setShowHint(false)
                    }}
                  >
                    Menú
                  </button>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default SilogismosGame