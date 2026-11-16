export const MATH_GAMES=[
{id:'mate-aritmetica',title:'Cálculo mental',area:'Fundamentos',symbol:'±',description:'Operaciones, prioridad y números con signo.'},
{id:'mate-fracciones',title:'Taller de fracciones',area:'Fundamentos',symbol:'½',description:'Suma, producto, cocientes y equivalencias exactas.'},
{id:'mate-porcentajes',title:'Porcentajes en contexto',area:'Fundamentos',symbol:'%',description:'Cambios sucesivos, bases y crecimiento compuesto.'},
{id:'mate-potencias',title:'Potencias y logaritmos',area:'Álgebra',symbol:'aⁿ',description:'Exponentes, raíces y logaritmos con dominio explícito.'},
{id:'mate-ecuaciones',title:'Despeja la incógnita',area:'Álgebra',symbol:'x',description:'Ecuaciones lineales, fraccionarias y cuadráticas.'},
{id:'mate-sistemas',title:'Sistemas conectados',area:'Álgebra',symbol:'{x,y}',description:'Dos y tres incógnitas: comprueba todas las ecuaciones.'},
{id:'mate-polinomios',title:'Arquitecto algebraico',area:'Álgebra',symbol:'(a+b)²',description:'Factoriza y reconoce estructuras polinómicas.'},
{id:'mate-funciones',title:'Laboratorio de funciones',area:'Álgebra',symbol:'f(x)',description:'Evalúa, compón y analiza funciones y sus pendientes.'},
{id:'mate-geometria',title:'Geometría visual',area:'Espacio y cambio',symbol:'△',description:'Figuras, áreas y escalas con diagramas.'},
{id:'mate-trigonometria',title:'Círculo trigonométrico',area:'Espacio y cambio',symbol:'sin θ',description:'Ángulos notables, cuadrantes y ley de cosenos.'},
{id:'mate-derivadas',title:'Detective de derivadas',area:'Cálculo',symbol:'d/dx',description:'Potencias, producto, cadena y funciones trigonométricas.'},
{id:'mate-integrales',title:'Acumula y comprende',area:'Cálculo',symbol:'∫',description:'Primitivas y acumulación definida; distingue área y signo.'},
{id:'mate-probabilidad',title:'Azar y evidencia',area:'Datos',symbol:'P(A|B)',description:'Azar, extracciones sin reemplazo y probabilidad condicionada.'},
{id:'mate-matrices',title:'Matriz maestra',area:'Álgebra',symbol:'[A]',description:'Determinantes, productos, inversas y valores propios.'},
{id:'mate-sucesiones',title:'El siguiente término',area:'Fundamentos',symbol:'aₙ',description:'Patrones definidos, progresiones y sumas de series.'},
{id:'mate-24',title:'Objetivo 24',area:'Ingenio',symbol:'24',description:'Usa las cuatro cifras exactamente una vez para llegar a 24.'},
{id:'mate-sudoku',title:'Sudoku',area:'Ingenio',symbol:'▦',description:'Tableros únicos, notas, pistas explicadas y partidas guardadas.'},
] as const
export type MathGameId=typeof MATH_GAMES[number]['id']
export const MATH_AREAS=[...new Set(MATH_GAMES.map(g=>g.area))]
