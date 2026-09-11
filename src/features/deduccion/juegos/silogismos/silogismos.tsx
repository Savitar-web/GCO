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
const TIMER_BASE = 80

type Item = {
  id: string
  premises: string[]
  question: string
  options: string[]
  /** Índice de la respuesta correcta ANTES de barajar */
  correct: number
  /** Orientación conceptual sin revelar la respuesta */
  hint: string
}

/** Fisher–Yates con semilla determinista por nivel+intento (reproducible y sin sesgo) */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed >>> 0
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Baraja opciones y devuelve el nuevo índice de la respuesta correcta */
function shuffleOptions(item: Item, seed: number): Item {
  const indexed = item.options.map((text, i) => ({ text, original: i }))
  const shuffled = seededShuffle(indexed, seed)
  const newCorrect = shuffled.findIndex((x) => x.original === item.correct)
  return {
    ...item,
    options: shuffled.map((x) => x.text),
    correct: newCorrect,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BANCO EXTENSO DE SILOGISMOS (únicos, sin duplicados triviales)
// ─────────────────────────────────────────────────────────────────────────────

const BANK: Item[] = [
  // ─── Silogismos categóricos clásicos (figura 1) ───────────────────────────
  {
    id: 'c01',
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
    hint: 'Modo Barbara (figura 1). Transitividad de la inclusión universal: si todo A está en B y todo B en C, entonces todo A está en C.',
  },
  {
    id: 'c02',
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
    hint: 'Modo Celarent. La exclusión total de A respecto de B se transmite a todo lo que está contenido en A.',
  },
  {
    id: 'c03',
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
    hint: 'Modo Darii. Universal afirmativa + particular afirmativa. La particularidad se transmite a través del término medio.',
  },
  {
    id: 'c04',
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
    hint: 'Modo Ferio. Universal negativa + particular afirmativa → particular negativa.',
  },
  {
    id: 'c05',
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
    hint: 'Error de conversión / afirmar el consecuente. “Todos los médicos son licenciados” no implica el recíproco.',
  },
  {
    id: 'c06',
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
    hint: 'Dos particulares afirmativas no garantizan solapamiento entre extremos. Visualiza tres círculos de Venn.',
  },
  {
    id: 'c07',
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
    hint: 'De la exclusión de los peces respecto de los que vuelan y la existencia de animales que vuelan se obtiene una particular negativa.',
  },
  {
    id: 'c08',
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
    hint: 'Cesare / Camestres. El término medio B excluye completamente a C de A.',
  },
  {
    id: 'c09',
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
    hint: 'Baroco. Los A que quedan fuera de B también quedan fuera de todo lo contenido en B.',
  },
  {
    id: 'c10',
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
    hint: 'La posición del término medio importa. “Algunos B no son C” no informa necesariamente sobre la parte de B que es A.',
  },

  // ─── Lógica proposicional: reglas y falacias ──────────────────────────────
  {
    id: 'p01',
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
    hint: 'Eliminación del condicional (modus ponens). Si el antecedente es verdadero, el consecuente también lo es.',
  },
  {
    id: 'p02',
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
    hint: 'Modus tollens: negación del consecuente → negación del antecedente. Es la contrapositiva en acción.',
  },
  {
    id: 'p03',
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
    hint: 'Negar el antecedente no permite concluir nada sobre el consecuente. Q puede ser verdadero o falso independientemente.',
  },
  {
    id: 'p04',
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
    hint: 'Afirmar el consecuente es falacia formal. Q puede ser verdadero por razones distintas de P.',
  },
  {
    id: 'p05',
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
    hint: 'Silogismo hipotético (transitividad del condicional).',
  },
  {
    id: 'p06',
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
    hint: 'Silogismo disyuntivo: de una disyunción y la negación de un disyunto se obtiene el otro.',
  },
  {
    id: 'p07',
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
    hint: 'Negación de conjunción ≡ disyunción de negaciones.',
  },
  {
    id: 'p08',
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
    hint: 'Negación de disyunción ≡ conjunción de negaciones (“ni P ni Q”).',
  },
  {
    id: 'p09',
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
    hint: 'P → Q ≡ ¬Q → ¬P. La contrapositiva es equivalente al condicional original.',
  },
  {
    id: 'p10',
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
    hint: 'El bicondicional es la conjunción de ambos condicionales.',
  },
  {
    id: 'p11',
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
    hint: 'Aplicación sucesiva de modus ponens.',
  },
  {
    id: 'p12',
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
    hint: '¬P ∨ Q ≡ P → Q. Con P se obtiene Q.',
  },
  {
    id: 'p13',
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
    hint: 'Tanto si P como si ¬P, se obtiene Q. Por tanto Q es verdadero en cualquier caso.',
  },
  {
    id: 'p14',
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
    hint: 'De P se obtiene P ∨ Q (adición) y luego modus ponens.',
  },
  {
    id: 'p15',
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
    hint: 'Modus tollens sobre una conjunción como antecedente. Se niega la conjunción completa.',
  },
  {
    id: 'p16',
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
    hint: 'Prueba por casos / dilema constructivo simple.',
  },
  {
    id: 'p17',
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
    hint: 'P y R no pueden ser verdaderos a la vez: P implica ¬R.',
  },
  {
    id: 'p18',
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
    hint: 'La negación de un condicional es la afirmación del antecedente junto con la negación del consecuente.',
  },
  {
    id: 'p19',
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
    hint: 'Cadena de condicionales + modus tollens: ¬R ⇒ ¬Q ⇒ ¬P.',
  },
  {
    id: 'p20',
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
    hint: 'El bicondicional permite sustituir: si Q es falso, P también lo es.',
  },
  {
    id: 'p21',
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
    hint: 'En lógica clásica toda proposición es verdadera o falsa; no hay tercera posibilidad.',
  },
  {
    id: 'p22',
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
    hint: 'Ninguna proposición puede ser verdadera y falsa al mismo tiempo.',
  },
  {
    id: 'p23',
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
    hint: '¬(Q ∨ R) ≡ ¬Q ∧ ¬R. De ¬Q y P → Q se obtiene ¬P.',
  },
  {
    id: 'p24',
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
    hint: 'La conjunción se distribuye sobre la disyunción.',
  },

  // ─── Cuantificadores y lógica de predicados ───────────────────────────────
  {
    id: 'q01',
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
    hint: '∀-eliminación: si vale para todo elemento del dominio, vale para cualquier constante particular.',
  },
  {
    id: 'q02',
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
    hint: 'Existe al menos un P; todo P es Q; por tanto existe al menos un Q.',
  },
  {
    id: 'q03',
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
    hint: 'Instanciar el universal con a y aplicar modus tollens.',
  },
  {
    id: 'q04',
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
    hint: 'La conjunción se puede “repartir” hacia afuera del existencial, pero no al revés.',
  },
  {
    id: 'q05',
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
    hint: 'La disyunción de universales implica el universal de la disyunción (el recíproco es falso).',
  },
  {
    id: 'q06',
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
    hint: 'Puede que unos elementos sean P y otros Q, sin que todo sea P ni todo sea Q.',
  },
  {
    id: 'q07',
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
    hint: '“No todos son P” ≡ “existe al menos uno que no es P”.',
  },
  {
    id: 'q08',
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
    hint: '“No existe ningún P” ≡ “todo elemento no es P”.',
  },
  {
    id: 'q09',
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
    hint: 'El orden de los cuantificadores importa decisivamente. “Existe un x que se relaciona con todos” es más fuerte.',
  },
  {
    id: 'q10',
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
    hint: 'Hay al menos un no-Q; por el condicional universal ese individuo tampoco puede ser P.',
  },
  {
    id: 'q11',
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
    hint: 'La premisa afirma simetría de R. Instanciar y aplicar modus ponens.',
  },
  {
    id: 'q12',
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
    hint: 'Transitividad del condicional bajo el cuantificador universal.',
  },
  {
    id: 'q13',
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
    hint: 'Versión cuantificada del tercero excluido: para cada individuo, o bien es P o bien no lo es.',
  },

  // ─── Lenguaje natural y casos aplicados ───────────────────────────────────
  {
    id: 'n01',
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
    hint: 'Darii en lenguaje natural. La particular se transmite a través de “gatos”.',
  },
  {
    id: 'n02',
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
    hint: 'Celarent. Todo lagarto queda fuera de la clase de los mamíferos.',
  },
  {
    id: 'n03',
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
    hint: 'Modus tollens en lenguaje cotidiano.',
  },
  {
    id: 'n04',
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
    hint: 'Puedes aprobar por otras razones. El condicional no es “si y solo si”.',
  },
  {
    id: 'n05',
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
    id: 'n06',
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
    hint: 'Darii. Particular + universal afirmativa a través del término medio “lógicos”.',
  },
  {
    id: 'n07',
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
    id: 'n08',
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
    hint: '“Culpable” niega “inocente”; por tanto se niega el antecedente.',
  },
  {
    id: 'n09',
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
    hint: 'Mejorar el razonamiento puede tener muchas causas distintas de estudiar lógica.',
  },
  {
    id: 'n10',
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
    hint: 'El humo puede tener otras causas. Afirmar el consecuente no recupera el antecedente.',
  },
  {
    id: 'n11',
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
    hint: 'Modus tollens puro.',
  },
  {
    id: 'n12',
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
    hint: 'Si todos los del curso aprobaron y Luis no, entonces Luis no pertenece a ese conjunto.',
  },
  {
    id: 'n13',
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
    hint: 'La ausencia de celebración niega el antecedente.',
  },
  {
    id: 'n14',
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
    hint: 'Modus tollens aplicado a un enunciado metalógico.',
  },
  {
    id: 'n15',
    premises: ['Todos los mamíferos son animales.', 'Algunos perros no son mansos.'],
    question: '¿Se sigue que algunos animales no son mansos?',
    options: [
      'No necesariamente (falta conexión con “mansos”)',
      'Sí, siempre',
      'Nunca',
      'Solo si todos los perros son mamíferos',
      'Equivale a todos',
      'Perros = animales',
      'Sí por Darii',
      'Depende del tamaño del dominio',
    ],
    correct: 0,
    hint: 'Falta una premisa que conecte “perros” con “mamíferos/animales” respecto de “mansos”.',
  },

  // ─── Más silogismos categóricos y variantes ───────────────────────────────
  {
    id: 'c11',
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
    hint: 'Los A que son C también son B; por tanto hay solapamiento entre B y C.',
  },
  {
    id: 'c12',
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
    hint: 'Los C fuera de B también están fuera de A.',
  },
  {
    id: 'c13',
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
    hint: 'Los C que están en B no pueden estar en A.',
  },
  {
    id: 'c14',
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
    hint: 'Los A que están en B quedan fuera de C.',
  },
  {
    id: 'c15',
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
    hint: 'Dos universales negativas no producen conclusión válida; A y C pueden solaparse fuera de B.',
  },
  {
    id: 'c16',
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
    hint: 'Dos particulares negativas no garantizan relación necesaria entre A y C.',
  },
  {
    id: 'c17',
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
    hint: 'En lógica moderna la universal no implica existencia; si A puede estar vacío, “algunos B son C” no se sigue.',
  },
  {
    id: 'c18',
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
    hint: 'Cadena de inclusiones: la particularidad se transmite hasta D.',
  },
  {
    id: 'c19',
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
    hint: 'Silogismo disyuntivo a nivel de proposiciones universales.',
  },
  {
    id: 'c20',
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
    hint: 'A está dentro de B y fuera de C; otras partes de B pueden solaparse con C sin contradicción.',
  },
  {
    id: 'c21',
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
    hint: 'A y C están ambos dentro de B y se solapan; B contiene al menos su intersección.',
  },
  {
    id: 'c22',
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
    hint: 'A puede solaparse con B en una zona y con C en otra, sin que B y C se toquen.',
  },
  {
    id: 'c23',
    premises: ['Ningún A es B.', 'Todos los B son C.'],
    question: '¿Se sigue que ningún A es C?',
    options: [
      'No necesariamente',
      'Sí, siempre',
      'Nunca',
      'Solo si A está vacío',
      'Equivale a todos los A son C',
      'B y C son idénticos',
      'Sí por Celarent',
      'Depende del dominio',
    ],
    correct: 0,
    hint: 'A está fuera de B, pero puede solaparse con la parte de C que no es B.',
  },
  {
    id: 'c24',
    premises: ['Todos los A son B.', 'Ningún B es C.', 'Algunos D son C.'],
    question: 'Se sigue:',
    options: [
      'Algunos D no son A',
      'Ningún D es A',
      'Todos los D son A',
      'Algunos D son A',
      'Nada se sigue',
      'Todos los A son D',
      'C está vacío',
      'A = D',
    ],
    correct: 0,
    hint: 'A está dentro de B y B es disjunto de C; los D que están en C no pueden ser A.',
  },
  {
    id: 'c25',
    premises: ['Algunos A no son B.', 'Todos los B son C.', 'Todos los C son D.'],
    question: '¿Se sigue que algunos A no son D?',
    options: [
      'No necesariamente',
      'Sí, siempre',
      'Nunca',
      'Solo si el dominio es finito',
      'Equivale a todos',
      'A y D son disjuntos',
      'B está vacío',
      'Sí por Baroco',
    ],
    correct: 0,
    hint: 'Los A fuera de B pueden estar aún dentro de C o D por otras vías; no hay conexión forzada.',
  },

  // ─── Más proposicionales y mixtos ──────────────────────────────────────────
  {
    id: 'p25',
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
    hint: 'La conjunción de ambos condicionales es el bicondicional.',
  },
  {
    id: 'p26',
    premises: ['P → Q', '¬P'],
    question: '¿Qué se puede afirmar sobre Q?',
    options: [
      'Nada conclusivo (falacia de negar el antecedente)',
      'Q es falso',
      'Q es verdadero',
      'Q es equivalente a P',
      'Nada se sigue en absoluto',
      'Solo que Q implica P',
      'Q y P son contradictorios',
      'Q debe ser idéntico a ¬P',
    ],
    correct: 0,
    hint: 'Negar el antecedente no determina el valor de verdad del consecuente.',
  },
  {
    id: 'p27',
    premises: ['(P ∨ Q) ∧ ¬P'],
    question: 'Se sigue:',
    options: [
      'Q',
      '¬Q',
      'P',
      'P ∧ Q',
      'Nada se sigue',
      '¬(P ∨ Q)',
      'Solo P',
      'Q → P',
    ],
    correct: 0,
    hint: 'De la conjunción se obtiene la disyunción y ¬P; luego silogismo disyuntivo.',
  },
  {
    id: 'p28',
    premises: ['P → (Q ∧ R)', 'P'],
    question: 'Se sigue:',
    options: [
      'Q ∧ R',
      'Solo Q',
      'Solo R',
      '¬Q ∨ ¬R',
      'Nada se sigue',
      '¬P',
      'Q → R',
      'R → Q',
    ],
    correct: 0,
    hint: 'Modus ponens produce la conjunción completa.',
  },
  {
    id: 'p29',
    premises: ['¬(P ∨ Q)', 'R → P'],
    question: 'Se sigue:',
    options: [
      '¬R',
      'R',
      'Q',
      'P ∧ R',
      'Nada se sigue',
      'Solo ¬P',
      'R → Q',
      'P ∨ R',
    ],
    correct: 0,
    hint: '¬(P ∨ Q) ⇒ ¬P. Con R → P se obtiene ¬R por modus tollens.',
  },
  {
    id: 'p30',
    premises: ['P ↔ Q', 'Q ↔ R'],
    question: 'Se sigue:',
    options: [
      'P ↔ R',
      'Solo P → R',
      'Solo R → P',
      'P ∨ R',
      'Nada se sigue',
      '¬P ∧ ¬R',
      'P ∧ ¬R',
      'Solo ¬P',
    ],
    correct: 0,
    hint: 'La equivalencia es transitiva.',
  },
  {
    id: 'p31',
    premises: ['P → Q', 'Q → ¬P'],
    question: 'Se sigue:',
    options: [
      '¬P',
      'P',
      'Q',
      'P ∧ Q',
      'Nada se sigue',
      'Solo ¬Q',
      'Q → P',
      'P ∨ Q',
    ],
    correct: 0,
    hint: 'Si P entonces Q y Q implica ¬P; por tanto P implica ¬P, lo que solo es posible si ¬P.',
  },
  {
    id: 'p32',
    premises: ['(P → Q) ∧ (R → S)', 'P ∨ R'],
    question: 'Se sigue:',
    options: [
      'Q ∨ S',
      'Q ∧ S',
      '¬Q ∨ ¬S',
      'P ∧ R',
      'Nada se sigue',
      'Solo Q',
      'Solo S',
      'Q → S',
    ],
    correct: 0,
    hint: 'Dilema constructivo: cada disyunto del antecedente implica su consecuente.',
  },
  {
    id: 'p33',
    premises: ['¬P → Q', '¬Q'],
    question: 'Se sigue:',
    options: [
      'P',
      '¬P',
      'Q',
      'P ∧ Q',
      'Nada se sigue',
      'Solo ¬P',
      'Q → P',
      'P ∨ ¬Q',
    ],
    correct: 0,
    hint: 'Modus tollens sobre ¬P → Q produce ¬(¬P), es decir P.',
  },
  {
    id: 'p34',
    premises: ['P ∧ Q', 'P → R'],
    question: 'Se sigue:',
    options: [
      'R',
      '¬R',
      'Solo Q',
      '¬P',
      'Nada se sigue',
      'Q → R',
      'R → P',
      '¬Q',
    ],
    correct: 0,
    hint: 'De la conjunción se obtiene P; luego modus ponens.',
  },
  {
    id: 'p35',
    premises: ['¬(P ∧ Q)', 'P'],
    question: 'Se sigue:',
    options: [
      '¬Q',
      'Q',
      '¬P',
      'P ∧ Q',
      'Nada se sigue',
      'Solo P',
      'Q → P',
      'P ∨ Q',
    ],
    correct: 0,
    hint: '¬(P ∧ Q) ≡ ¬P ∨ ¬Q. Con P se obtiene ¬Q por silogismo disyuntivo.',
  },

  // ─── Más cuantificadores y predicados ─────────────────────────────────────
  {
    id: 'q14',
    premises: ['∀x (P(x) → Q(x))', '∃x P(x)'],
    question: 'Se sigue:',
    options: [
      '∃x Q(x)',
      '∀x Q(x)',
      '¬∃x Q(x)',
      'Nada se sigue',
      '∀x P(x)',
      'Solo Q(a)',
      'P está vacío',
      '¬Pa',
    ],
    correct: 0,
    hint: 'Existe un P; todo P es Q; por tanto existe un Q.',
  },
  {
    id: 'q15',
    premises: ['∃x ¬P(x)', '∀x (Q(x) → P(x))'],
    question: 'Se sigue:',
    options: [
      '∃x ¬Q(x)',
      '∀x ¬Q(x)',
      '∃x Q(x)',
      '∀x Q(x)',
      'Nada se sigue',
      'Solo ¬Q(a)',
      'P y Q son equivalentes',
      'El dominio es vacío',
    ],
    correct: 0,
    hint: 'Hay un no-P; todo Q es P; por tanto ese individuo no puede ser Q.',
  },
  {
    id: 'q16',
    premises: ['∀x ∀y R(x,y)'],
    question: 'Se sigue:',
    options: [
      '∀x R(x,x)',
      '∃x ¬R(x,x)',
      'Solo R(a,b)',
      'Nada sobre reflexividad',
      'Nada se sigue',
      'R es simétrica',
      'R es transitiva',
      'El dominio es vacío',
    ],
    correct: 0,
    hint: 'Si R vale para todo par, en particular vale cuando ambos argumentos son el mismo.',
  },
  {
    id: 'q17',
    premises: ['∃x ∀y R(x,y)'],
    question: 'Se sigue:',
    options: [
      '∀y ∃x R(x,y)',
      '∃y ∀x R(x,y)',
      '∀x ∃y R(x,y)',
      'Nada se sigue',
      'Solo R(a,a)',
      'R es simétrica',
      'El dominio es unitario',
      'Son equivalentes',
    ],
    correct: 0,
    hint: 'Si hay un x que se relaciona con todos los y, entonces para cada y existe al menos ese x.',
  },
  {
    id: 'q18',
    premises: ['∀x (P(x) ↔ Q(x))', 'Pa'],
    question: 'Se sigue:',
    options: [
      'Qa',
      '¬Qa',
      '∀x Q(x)',
      '∃x ¬Q(x)',
      'Nada se sigue',
      'Solo ¬Pa',
      'P y Q son disjuntos',
      'El dominio es vacío',
    ],
    correct: 0,
    hint: 'El bicondicional universal permite sustituir Pa por Qa.',
  },
  {
    id: 'q19',
    premises: ['¬∃x (P(x) ∧ Q(x))'],
    question: 'Equivalente:',
    options: [
      '∀x (P(x) → ¬Q(x))',
      '∃x (P(x) → ¬Q(x))',
      '∀x (P(x) ∧ ¬Q(x))',
      '∃x ¬P(x)',
      'Nada se sigue',
      'Solo ¬P(a)',
      'P y Q se solapan',
      'El dominio es vacío',
    ],
    correct: 0,
    hint: '“No hay nada que sea a la vez P y Q” ≡ “todo P no es Q”.',
  },
  {
    id: 'q20',
    premises: ['∀x ∃y R(x,y)', '∀x ∀y (R(x,y) → S(x))'],
    question: 'Se sigue:',
    options: [
      '∀x S(x)',
      '∃x S(x)',
      '∀x ¬S(x)',
      'Nada se sigue',
      'Solo S(a)',
      'R es transitiva',
      'El dominio es vacío',
      'S implica R',
    ],
    correct: 0,
    hint: 'Para cada x existe un y tal que R(x,y); y todo lo que está en R implica S(x). Por tanto todo x es S.',
  },

  // ─── Casos de consistencia, vaciedad e importación ────────────────────────
  {
    id: 'x01',
    premises: ['Todos los A son B.', 'Ningún A es B.'],
    question: '¿Qué se sigue sobre A?',
    options: [
      'A está vacío (no hay ningún A)',
      'A es infinito',
      'Algunos A son B',
      'Todos los B son A',
      'Nada se sigue',
      'B está vacío',
      'A = B',
      'Solo en dominios finitos',
    ],
    correct: 0,
    hint: 'Una universal afirmativa y una universal negativa sobre los mismos términos solo son compatibles si el sujeto no tiene instancias.',
  },
  {
    id: 'x02',
    premises: ['Algunos A son B.', 'Ningún A es B.'],
    question: '¿Es consistente este par de premisas?',
    options: [
      'No, es contradictorio',
      'Sí, si el dominio es infinito',
      'Sí, si A está vacío',
      'Solo en lógica no clásica',
      'Nada se puede decir',
      'Obliga a que B = A',
      'Fuerza que no hay B',
      'Implica el tercero excluido',
    ],
    correct: 0,
    hint: 'Una particular afirmativa y una universal negativa sobre los mismos términos se contradicen directamente.',
  },
  {
    id: 'x03',
    premises: ['Todos los unicornios tienen cuerno.', 'Ningún unicornio tiene cuerno.'],
    question: '¿Qué se sigue?',
    options: [
      'No existen unicornios',
      'Algunos unicornios tienen cuerno',
      'Todos los que tienen cuerno son unicornios',
      'Nada se sigue',
      'Los unicornios son mamíferos',
      'Solo en mitos',
      'Hay unicornios sin cuerno',
      'El cuerno es opcional',
    ],
    correct: 0,
    hint: 'Las dos universales contrapuestas solo pueden ser ambas verdaderas si el sujeto no tiene miembros.',
  },
  {
    id: 'x04',
    premises: ['Si llueve, el suelo se moja.', 'Si el suelo se moja, hay humedad.', 'No hay humedad.'],
    question: 'Se sigue:',
    options: [
      'No llueve',
      'Llueve',
      'El suelo se moja',
      'Nada se sigue',
      'Llueve y no hay humedad',
      'Solo que puede llover',
      'Siempre hay humedad',
      'Humedad implica lluvia',
    ],
    correct: 0,
    hint: 'Cadena de condicionales + modus tollens final.',
  },
  {
    id: 'x05',
    premises: ['Todos los A son B o algunos A son C.', 'Ningún A es B.', 'Ningún A es C.'],
    question: '¿Es consistente?',
    options: [
      'No, es contradictorio',
      'Sí, si A está vacío',
      'Sí, siempre',
      'Solo en dominios infinitos',
      'Nada se puede decir',
      'Obliga a que B = C',
      'Fuerza que A = B',
      'Implica el tercero excluido',
    ],
    correct: 0,
    hint: 'La disyunción exige que al menos uno de los disyuntos sea verdadero; ambos han sido negados.',
  },

  // ─── Más lenguaje natural variado ─────────────────────────────────────────
  {
    id: 'n16',
    premises: ['Ningún metal es gas a temperatura ambiente.', 'Algunos elementos son metales.'],
    question: 'Conclusión válida:',
    options: [
      'Algunos elementos no son gas a temperatura ambiente',
      'Ningún elemento es gas',
      'Todos los elementos son metales',
      'Algunos gases son metales',
      'Nada se sigue',
      'Todos los metales son elementos',
      'Gases = metales',
      'Solo los metales son elementos',
    ],
    correct: 0,
    hint: 'Ferio aplicado a categorías científicas.',
  },
  {
    id: 'n17',
    premises: ['Si el test es positivo, entonces hay infección.', 'El test es negativo.'],
    question: '¿Se sigue que no hay infección?',
    options: [
      'No necesariamente (negar el antecedente)',
      'Sí, necesariamente',
      'Es imposible',
      'Solo si el test es fiable al 100 %',
      'Siempre',
      'Nunca',
      'Solo en este laboratorio',
      'Depende del tipo de test',
    ],
    correct: 0,
    hint: 'Un test negativo no equivale a la negación del consecuente; puede haber falsos negativos.',
  },
  {
    id: 'n18',
    premises: ['Todos los planetas del sistema solar orbitan el Sol.', 'La Tierra es un planeta del sistema solar.'],
    question: 'Se sigue:',
    options: [
      'La Tierra orbita el Sol',
      'Algunos planetas no orbitan el Sol',
      'El Sol orbita la Tierra',
      'Nada se sigue',
      'Solo los planetas orbitan',
      'La Tierra no es planeta',
      'Orbitar implica ser planeta',
      'El sistema solar está vacío',
    ],
    correct: 0,
    hint: 'Instanciación + modus ponens (o Barbara con singular).',
  },
  {
    id: 'n19',
    premises: ['Ningún número primo mayor que 2 es par.', 'Algunos números pares son mayores que 2.'],
    question: 'Se sigue:',
    options: [
      'Algunos números mayores que 2 no son primos',
      'Ningún número mayor que 2 es primo',
      'Todos los pares son primos',
      'Algunos primos son pares',
      'Nada se sigue',
      'Solo el 2 es primo',
      'Pares = primos',
      'No hay números mayores que 2',
    ],
    correct: 0,
    hint: 'Los pares mayores que 2 no pueden ser primos; por tanto algunos mayores que 2 no son primos.',
  },
  {
    id: 'n20',
    premises: ['Si un argumento es válido y tiene premisas verdaderas, entonces la conclusión es verdadera.', 'La conclusión es falsa.'],
    question: 'Se sigue:',
    options: [
      'O el argumento no es válido, o alguna premisa es falsa (o ambas)',
      'El argumento es válido',
      'Las premisas son verdaderas',
      'Nada se sigue',
      'El argumento es válido y las premisas verdaderas',
      'Solo que la conclusión puede ser falsa',
      'Siempre es inválido',
      'Verdad implica validez',
    ],
    correct: 0,
    hint: 'Negación del consecuente de una conjunción: se niega al menos uno de los conjuntos.',
  },
  {
    id: 'n21',
    premises: ['Todos los triángulos equiláteros son equiángulos.', 'Algunos triángulos no son equiángulos.'],
    question: 'Se sigue:',
    options: [
      'Algunos triángulos no son equiláteros',
      'Ningún triángulo es equilátero',
      'Todos los triángulos son equiláteros',
      'Algunos equiláteros no son equiángulos',
      'Nada se sigue',
      'Equiláteros = equiángulos',
      'Solo los equiángulos son triángulos',
      'No hay triángulos',
    ],
    correct: 0,
    hint: 'Baroco / Festino: los triángulos fuera de “equiángulos” también están fuera de “equiláteros”.',
  },
  {
    id: 'n22',
    premises: ['Si la batería está cargada, el dispositivo enciende.', 'El dispositivo no enciende.', 'La batería está cargada o el cable está defectuoso.'],
    question: 'Se sigue:',
    options: [
      'El cable está defectuoso',
      'La batería está cargada',
      'El dispositivo enciende',
      'Nada se sigue',
      'La batería y el cable están bien',
      'Solo que puede no encender',
      'Siempre enciende',
      'Encender implica batería',
    ],
    correct: 0,
    hint: 'Modus tollens da ¬(batería cargada); luego silogismo disyuntivo sobre la tercera premisa.',
  },
  {
    id: 'n23',
    premises: ['Ningún pez es mamífero.', 'Todas las ballenas son mamíferos.', 'Algunos animales acuáticos son ballenas.'],
    question: 'Se sigue:',
    options: [
      'Algunos animales acuáticos no son peces',
      'Ningún animal acuático es pez',
      'Todas las ballenas son peces',
      'Algunos peces son ballenas',
      'Nada se sigue',
      'Ballenas = peces',
      'Solo las ballenas son acuáticas',
      'No hay peces',
    ],
    correct: 0,
    hint: 'Cadena: ballenas ⊂ mamíferos y mamíferos ∩ peces = ∅ ⇒ ballenas ∩ peces = ∅; luego la particular se transmite.',
  },
  {
    id: 'n24',
    premises: ['Si el programa compila, entonces no hay errores de sintaxis.', 'Hay errores de sintaxis.'],
    question: 'Se sigue:',
    options: [
      'El programa no compila (modus tollens)',
      'El programa compila',
      'No hay errores',
      'Nada se sigue',
      'Compila y tiene errores',
      'Solo que puede no compilar',
      'Siempre compila',
      'Errores implican compilación',
    ],
    correct: 0,
    hint: 'Negación del consecuente fuerza la negación del antecedente.',
  },
  {
    id: 'n25',
    premises: ['Todos los que aprueban el examen conocen la materia.', 'Algunos estudiantes no conocen la materia.'],
    question: 'Se sigue:',
    options: [
      'Algunos estudiantes no aprueban el examen',
      'Ningún estudiante aprueba',
      'Todos los estudiantes aprueban',
      'Algunos que conocen la materia no aprueban',
      'Nada se sigue',
      'Conocer = aprobar',
      'Solo los que aprueban son estudiantes',
      'No hay examen',
    ],
    correct: 0,
    hint: 'Los que no conocen la materia no pueden estar entre los que aprueban.',
  },

  // ─── Niveles adicionales de refuerzo (variantes profundas) ────────────────
  {
    id: 'r01',
    premises: ['P → Q', 'R → Q', '¬Q'],
    question: 'Se sigue:',
    options: [
      '¬P ∧ ¬R',
      'P ∨ R',
      'Solo ¬P',
      'Solo ¬R',
      'Nada se sigue',
      'Q',
      'P ∧ R',
      '¬Q → P',
    ],
    correct: 0,
    hint: 'Modus tollens sobre cada condicional produce ambas negaciones.',
  },
  {
    id: 'r02',
    premises: ['∀x (P(x) ∨ Q(x))', '¬Pa'],
    question: 'Se sigue:',
    options: [
      'Qa',
      '¬Qa',
      '∀x Q(x)',
      '∃x ¬Q(x)',
      'Nada se sigue',
      'Solo ¬Qa',
      'P y Q son equivalentes',
      'El dominio es vacío',
    ],
    correct: 0,
    hint: 'Instanciar el universal y aplicar silogismo disyuntivo.',
  },
  {
    id: 'r03',
    premises: ['Todos los A son B.', 'Todos los B son C.', 'Algunos C no son D.', 'Todos los A son D.'],
    question: '¿Es consistente?',
    options: [
      'Sí, es posible (los C que no son D pueden no ser A)',
      'No, es contradictorio',
      'Solo si A está vacío',
      'Solo en dominios infinitos',
      'Nada se puede decir',
      'Obliga a que C = D',
      'Fuerza que A = C',
      'Implica que D está vacío',
    ],
    correct: 0,
    hint: 'A ⊂ B ⊂ C y A ⊂ D; los C fuera de D simplemente no pueden ser A, sin contradicción.',
  },
  {
    id: 'r04',
    premises: ['Si P entonces Q o R.', '¬Q', '¬R'],
    question: 'Se sigue:',
    options: [
      '¬P',
      'P',
      'Q ∨ R',
      'P ∧ ¬Q',
      'Nada se sigue',
      'Solo ¬Q',
      'R → P',
      'P ∨ Q',
    ],
    correct: 0,
    hint: '¬Q ∧ ¬R ≡ ¬(Q ∨ R). Luego modus tollens sobre el condicional.',
  },
  {
    id: 'r05',
    premises: ['Algunos A son B.', 'Todos los B son C.', 'Ningún C es D.', 'Algunos D son E.'],
    question: 'Se sigue:',
    options: [
      'Algunos A no son D',
      'Ningún A es D',
      'Algunos A son E',
      'Todos los A son E',
      'Nada se sigue',
      'Algunos E son A',
      'B está vacío',
      'A = E',
    ],
    correct: 0,
    hint: 'Los A que están en B están en C y por tanto fuera de D; se obtiene particular negativa respecto de D.',
  },
  {
    id: 'r06',
    premises: ['P ∨ Q ∨ R', '¬P', '¬Q'],
    question: 'Se sigue:',
    options: [
      'R',
      '¬R',
      'P ∧ Q',
      'Nada se sigue',
      'Solo ¬P',
      'Q → R',
      'R → P',
      'P ∨ Q',
    ],
    correct: 0,
    hint: 'Silogismo disyuntivo iterado sobre una disyunción ternaria.',
  },
  {
    id: 'r07',
    premises: ['∀x (P(x) → ∃y R(x,y))', '∀x ¬∃y R(x,y)'],
    question: 'Se sigue:',
    options: [
      '∀x ¬P(x)',
      '∃x P(x)',
      '∀x P(x)',
      'Nada se sigue',
      'Solo ¬P(a)',
      'R es vacía',
      'El dominio es unitario',
      'P y R son equivalentes',
    ],
    correct: 0,
    hint: 'El segundo universal niega el consecuente del primero para todo x; por tanto se niega el antecedente para todo x.',
  },
  {
    id: 'r08',
    premises: ['Si el testigo es creíble, entonces su declaración es verdadera.', 'Si su declaración es verdadera, entonces el acusado es inocente.', 'El acusado es culpable.'],
    question: 'Se sigue:',
    options: [
      'El testigo no es creíble',
      'El testigo es creíble',
      'La declaración es verdadera',
      'Nada se sigue',
      'El testigo es creíble y el acusado culpable',
      'Solo que puede ser culpable',
      'Siempre es creíble',
      'Inocencia implica credibilidad',
    ],
    correct: 0,
    hint: 'Cadena + modus tollens: culpable niega inocente, que niega declaración verdadera, que niega credibilidad.',
  },
  {
    id: 'r09',
    premises: ['Ningún A es B.', 'Todos los C son B.', 'Algunos D son C.', 'Todos los D son E.'],
    question: 'Se sigue:',
    options: [
      'Algunos E no son A',
      'Ningún E es A',
      'Todos los E son A',
      'Algunos E son A',
      'Nada se sigue',
      'Todos los A son E',
      'B está vacío',
      'A = E',
    ],
    correct: 0,
    hint: 'Los D que son C están en B y por tanto fuera de A; como esos D son E, algunos E no son A.',
  },
  {
    id: 'r10',
    premises: ['P → Q', 'Q → R', 'R → S', '¬S'],
    question: 'Se sigue:',
    options: [
      '¬P',
      'P',
      'Q ∧ R',
      'Nada se sigue',
      'Solo ¬R',
      'S → P',
      'P ∨ S',
      '¬Q → S',
    ],
    correct: 0,
    hint: 'Cadena larga de condicionales + modus tollens final.',
  },
  {
    id: 'r11',
    premises: ['∃x (P(x) ∧ ∀y (Q(y) → R(x,y)))', '∀x ¬∃y R(x,y)'],
    question: 'Se sigue:',
    options: [
      '∃x (P(x) ∧ ¬∃y Q(y)) o, más débilmente, hay tensión; en todo caso ¬∃x P(x) no se sigue directamente sin más',
      '∀x P(x)',
      '∃x Q(x)',
      'Nada útil se sigue con certeza sin premisas adicionales',
      'Solo ¬P(a)',
      'R es total',
      'El dominio es vacío',
      'P implica Q',
    ],
    correct: 3,
    hint: 'La segunda premisa niega cualquier R; la primera exige un x que sea P y se relacione vía R con todos los Q. Si hay algún Q, hay contradicción local; sin información sobre la existencia de Q no se fuerza ¬∃x P(x).',
  },
  {
    id: 'r12',
    premises: ['Todos los A son B o todos los C son D.', 'Algunos A no son B.', 'Algunos C no son D.'],
    question: '¿Es consistente?',
    options: [
      'No, es contradictorio',
      'Sí, siempre',
      'Solo si el dominio es vacío',
      'Solo en dominios infinitos',
      'Nada se puede decir',
      'Obliga a que A = C',
      'Fuerza que B = D',
      'Implica el tercero excluido',
    ],
    correct: 0,
    hint: 'La disyunción de universales queda refutada por las dos particulares negativas.',
  },
  {
    id: 'r13',
    premises: ['P ↔ (Q ∧ R)', '¬Q'],
    question: 'Se sigue:',
    options: [
      '¬P',
      'P',
      'R',
      'P ∧ R',
      'Nada se sigue',
      'Solo ¬R',
      'Q → P',
      'P ∨ Q',
    ],
    correct: 0,
    hint: 'Si Q es falso, Q ∧ R es falso; por el bicondicional P también es falso.',
  },
  {
    id: 'r14',
    premises: ['∀x (P(x) → Q(x))', '∀x (R(x) → ¬Q(x))', '∃x (P(x) ∧ R(x))'],
    question: '¿Es consistente?',
    options: [
      'No, es contradictorio',
      'Sí, es posible',
      'Solo si el dominio es vacío',
      'Solo en dominios infinitos',
      'Nada se puede decir',
      'Obliga a que P = R',
      'Fuerza que Q es vacío',
      'Implica el tercero excluido',
    ],
    correct: 0,
    hint: 'Un individuo que sea a la vez P y R debería ser Q y ¬Q.',
  },
  {
    id: 'r15',
    premises: ['Si A, entonces B.', 'Si B, entonces C.', 'Si C, entonces D.', 'Si D, entonces E.', 'No E.'],
    question: 'Se sigue:',
    options: [
      'No A',
      'A',
      'B ∧ C ∧ D',
      'Nada se sigue',
      'Solo no D',
      'E implica A',
      'A o E',
      'No B implica E',
    ],
    correct: 0,
    hint: 'Cadena de cinco condicionales + modus tollens.',
  },

  // ─── Últimos ítems de alta variedad ───────────────────────────────────────
  {
    id: 'z01',
    premises: ['Ningún A es B.', 'Todos los B son C.', 'Algunos C son D.', 'Ningún D es E.'],
    question: '¿Se sigue que ningún A es E?',
    options: [
      'No necesariamente',
      'Sí, siempre',
      'Nunca',
      'Solo si A está vacío',
      'Equivale a todos los A son E',
      'B y D son idénticos',
      'Sí por Celarent',
      'Depende del dominio',
    ],
    correct: 0,
    hint: 'A está fuera de B, pero C y D pueden solaparse fuera de B; A podría aún relacionarse con E por otras vías.',
  },
  {
    id: 'z02',
    premises: ['P → Q', '¬P → R', '¬Q', '¬R'],
    question: '¿Es consistente?',
    options: [
      'No, es contradictorio',
      'Sí, es posible',
      'Solo si P es verdadero',
      'Solo en lógica no clásica',
      'Nada se puede decir',
      'Obliga a que Q = R',
      'Fuerza que P es indeterminado',
      'Implica el tercero excluido',
    ],
    correct: 0,
    hint: 'De ¬Q se obtiene ¬P; de ¬P se obtiene R; pero ¬R contradice R.',
  },
  {
    id: 'z03',
    premises: ['Todos los A son B.', 'Algunos B son C.', 'Ningún C es A.'],
    question: '¿Es consistente?',
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
    hint: 'A ⊂ B; la parte de B que es C puede ser disjunta de A.',
  },
  {
    id: 'z04',
    premises: ['∃x P(x)', '∀x (P(x) → Q(x))', '∀x (Q(x) → R(x))', '¬∃x R(x)'],
    question: '¿Es consistente?',
    options: [
      'No, es contradictorio',
      'Sí, es posible',
      'Solo si el dominio es vacío',
      'Solo en dominios infinitos',
      'Nada se puede decir',
      'Obliga a que P = R',
      'Fuerza que Q es vacío',
      'Implica el tercero excluido',
    ],
    correct: 0,
    hint: 'Existe un P; ese P es Q y por tanto R; pero se niega la existencia de R.',
  },
  {
    id: 'z05',
    premises: ['Si el teorema es verdadero, entonces la prueba es correcta.', 'La prueba no es correcta.'],
    question: 'Se sigue:',
    options: [
      'El teorema no es verdadero (o al menos no se sigue de esa prueba)',
      'El teorema es verdadero',
      'La prueba es correcta',
      'Nada se sigue',
      'El teorema es verdadero y la prueba incorrecta',
      'Solo que puede ser falso',
      'Siempre es verdadero',
      'Prueba implica teorema',
    ],
    correct: 0,
    hint: 'Modus tollens: la incorrección de la prueba niega el antecedente tal como está formulado.',
  },
  {
    id: 'z06',
    premises: ['Todos los A son B.', 'Todos los C son D.', 'Algunos A son C.'],
    question: 'Se sigue:',
    options: [
      'Algunos B son D',
      'Todos los B son D',
      'Ningún B es D',
      'Algunos B no son D',
      'Nada se sigue',
      'Todos los D son B',
      'A está vacío',
      'B = D',
    ],
    correct: 0,
    hint: 'Los A que son C están en B y en D; por tanto hay solapamiento entre B y D.',
  },
  {
    id: 'z07',
    premises: ['P ∨ Q', 'P → ¬R', 'Q → ¬R'],
    question: 'Se sigue:',
    options: [
      '¬R',
      'R',
      'P ∧ Q',
      'Nada se sigue',
      'Solo ¬P',
      'R → P',
      'P ∨ R',
      '¬Q → R',
    ],
    correct: 0,
    hint: 'Cualquiera de los disyuntos implica ¬R; por tanto ¬R.',
  },
  {
    id: 'z08',
    premises: ['∀x (P(x) ∨ Q(x))', '∀x ¬P(x)'],
    question: 'Se sigue:',
    options: [
      '∀x Q(x)',
      '∃x Q(x)',
      '∀x ¬Q(x)',
      'Nada se sigue',
      'Solo Q(a)',
      'P y Q son equivalentes',
      'El dominio es vacío',
      '¬∃x Q(x)',
    ],
    correct: 0,
    hint: 'Para todo x, o P o Q; y ningún x es P; por tanto todo x es Q.',
  },
  {
    id: 'z09',
    premises: ['Ningún A es B.', 'Algunos B son C.', 'Todos los C son D.'],
    question: 'Se sigue:',
    options: [
      'Algunos D no son A',
      'Ningún D es A',
      'Todos los D son A',
      'Algunos D son A',
      'Nada se sigue',
      'Todos los A son D',
      'B está vacío',
      'A = D',
    ],
    correct: 0,
    hint: 'Los B que son C (y por tanto D) no pueden ser A; se obtiene particular negativa.',
  },
  {
    id: 'z10',
    premises: ['Si estudias con método, entonces comprendes.', 'Si comprendes, entonces resuelves los problemas.', 'No resolviste los problemas.'],
    question: 'Se sigue:',
    options: [
      'No estudiaste con método (o al menos no se sigue que lo hicieras)',
      'Estudiaste con método',
      'Comprendiste',
      'Nada se sigue',
      'Estudiaste y no resolviste',
      'Solo que puedes no resolver',
      'Siempre resuelves',
      'Resolver implica método',
    ],
    correct: 0,
    hint: 'Cadena de dos condicionales + modus tollens.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
const TOTAL_LEVELS = BANK.length

/** Selección determinista y sin repetición de ítems entre niveles distintos.
 *  Para reintentos del mismo nivel se usa un offset que cicla por el banco
 *  de forma que no repita el mismo enunciado hasta agotar el ciclo. */
function pickItem(level: number, attempt: number): Item {
  const baseIdx = (level - 1) % BANK.length
  // Desplazamiento por intento: saltos de números primos relativos al tamaño
  // para maximizar distancia entre reintentos del mismo nivel.
  const offset = (attempt * 7 + attempt * attempt) % BANK.length
  const idx = (baseIdx + offset) % BANK.length
  const raw = BANK[idx]
  // Semilla distinta por nivel e intento → barajado diferente cada vez
  const seed = level * 10007 + attempt * 9973 + idx * 13
  return shuffleOptions(raw, seed)
}

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
      const it = pickItem(lv, att)
      setItem(it)
      setIsCorrect(null)
      setShowHint(false)
      setLevel(lv)
      setAttempt(att)
      setPhase('play')
      setShowLevelPicker(false)
      setTimeLeft(Math.max(35, TIMER_BASE - Math.floor(lv / 12)))
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