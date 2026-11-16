export type AdvancedRiddle={id:string;q:string;options:[string,string,string,string];correct:0|1|2|3;kind:'filosofia'|'politica'|'economia';hint:string;advice:string;explain:string;difficulty:4|5}
type Topic=AdvancedRiddle['kind']
type Entry=[Topic,string,[string,string,string,string],string]
// Original scenarios. Philosophical questions specify the interpretation being tested;
// economic questions specify a model rather than pretending its assumptions are universal.
const ENTRIES:Entry[]=[
 ['filosofia','Se define omnipotencia como capacidad para realizar cualquier estado lógicamente posible. Alguien exige crear un triángulo euclídeo de exactamente cuatro lados. ¿Qué objeción respeta esa definición?',[
 'La petición combina propiedades incompatibles dentro de la definición geométrica fijada.',
 'La petición describe una figura posible cuya construcción exige potencia infinita.',
 'La petición exige descubrir una geometría empírica todavía desconocida para nosotros.',
 'La petición demuestra que ninguna capacidad admite una definición conceptualmente consistente.'
 ],'Bajo la definición estipulada, un triángulo tiene tres lados. Pedir que tenga exactamente cuatro manteniendo el mismo significado no describe una tarea difícil, sino condiciones incompatibles. Esto no resuelve por sí solo todas las teorías de la omnipotencia.'],
 ['filosofia','En la paradoja de la piedra, un agente omnipotente debe crear una piedra que él mismo no pueda levantar. ¿Qué debe aclararse antes de considerarla una refutación concluyente?',[
 'Si la tarea solicitada constituye un estado coherente bajo aquella definición.',
 'Si conocemos una piedra suficientemente pesada dentro del universo físico actual.',
 'Si levantar objetos requiere siempre más energía que producirlos desde cero.',
 'Si las personas pueden imaginar claramente piedras de un tamaño extraordinario.'
 ],'La paradoja depende de cómo se interpreten poder, posibilidad y permanencia de las capacidades. No basta con aumentar la masa: debe analizarse si las condiciones del desafío son conjuntamente coherentes.'],
 ['filosofia','El dilema del mal, tradicionalmente atribuido a Epicuro, confronta la existencia del sufrimiento con ciertos atributos divinos. ¿Cuál expresa el problema sin convertirlo en un teorema demostrado?',[
 'Pregunta cómo compatibilizar el mal con poder, conocimiento y bondad perfectos.',
 'Demuestra que cualquier sufrimiento excluye necesariamente toda posible concepción de divinidad.',
 'Prueba que la libertad humana justifica automáticamente cualquier sufrimiento del mundo.',
 'Establece que conocer sufrimientos equivale necesariamente a causarlos de manera deliberada.'
 ],'Es un problema filosófico, no un teorema matemático aceptado universalmente. Su fuerza depende de los atributos asumidos, del tipo de mal y de las respuestas teístas consideradas. La atribución histórica exacta a Epicuro es discutida.'],
 ['filosofia','Para derivar una contradicción estricta entre un ser perfectamente bueno y el sufrimiento, ¿qué premisa adicional necesita quien formula el argumento lógico?',[
 'Que impediría todo sufrimiento evitable sin permitir bienes o razones moralmente suficientes.',
 'Que cualquier experiencia dolorosa tiene exactamente la misma intensidad para cada individuo.',
 'Que todo agente capaz de ayudar conoce necesariamente todas las consecuencias posteriores.',
 'Que las personas comparten siempre idénticas preferencias cuando evalúan sus experiencias dolorosas.'
 ],'La incompatibilidad no sale sólo de enumerar bondad, poder y sufrimiento. Hace falta una premisa que excluya razones moralmente suficientes para permitirlo. Esa premisa es justamente una parte disputada del argumento.'],
 ['filosofia','Una defensa basada en el libre albedrío explica parte del daño que las personas se causan. ¿Qué dificultad queda por abordar por separado?',[
 'La existencia de sufrimientos naturales que no dependen de elecciones humanas.',
 'La existencia de decisiones humanas con consecuencias perjudiciales para otras personas.',
 'La existencia de diferencias individuales al interpretar sus propias responsabilidades morales.',
 'La existencia de normas sociales que limitan determinadas conductas entre personas.'
 ],'Terremotos, enfermedades y otros males naturales no quedan explicados directamente por atribuir a las personas libertad para causar daño. Esto identifica una cuestión pendiente, no una refutación automática de toda respuesta religiosa.'],
 ['filosofia','Saber infaliblemente que mañana alguien elegirá A no es, por definición, causar esa elección. ¿Qué distinción evita un salto lógico inmediato?',[
 'Distinguir certeza del conocimiento y necesidad causal de la acción conocida.',
 'Distinguir conocimiento futuro y ausencia completa de cualquier decisión del agente.',
 'Distinguir descripción del agente y demostración inmediata de que nada cambia.',
 'Distinguir recuerdo de acciones y certeza de que toda predicción falla.'
 ],'De que una proposición conocida sea verdadera no se sigue, sin otra premisa, que la acción sea causada o coaccionada por quien la conoce. La compatibilidad de presciencia y libertad requiere un análisis modal más preciso.'],
 ['filosofia','Un barco cambia todas sus tablas durante años. Otro se construye con las tablas retiradas. ¿Por qué el problema de identidad no se resuelve simplemente contando piezas?',[
 'Porque continuidad histórica y composición material proponen criterios diferentes de identidad.',
 'Porque cualquier objeto conserva necesariamente todas sus propiedades durante cada reparación realizada.',
 'Porque dos objetos con igual función tienen obligatoriamente la misma identidad numérica.',
 'Porque ninguna pieza material puede pertenecer sucesivamente a dos construcciones diferentes.'
 ],'El caso contrapone criterios de continuidad, materia, función e historia. Elegir uno necesita justificación; contar piezas presupone que la identidad depende sólo de la composición material.'],
 ['filosofia','Un experimento mental imagina una máquina que produce experiencias indistinguibles de una vida feliz. Rechazar conectarse por valorar logros reales cuestiona especialmente qué tesis?',[
 'Que el bienestar depende exclusivamente del carácter agradable de nuestras experiencias.',
 'Que las experiencias agradables pueden formar alguna parte de una vida valiosa.',
 'Que los logros reales requieren siempre el reconocimiento de las demás personas.',
 'Que cualquier experiencia simulada resulta necesariamente desagradable para quienes la viven.'
 ],'La objeción se dirige al hedonismo exclusivo: alguien podría valorar hacer y ser ciertas cosas además de sentirlas. No demuestra que el placer carezca de valor.'],
 ['filosofia','Una persona sabe todas las descripciones físicas del color pero nunca ha visto rojo. Al verlo, afirma aprender algo. ¿Qué tesis está directamente en discusión?',[
 'Si conocer todos los hechos físicos agota también todo conocimiento fenomenológico.',
 'Si describir colores físicamente resulta imposible para cualquier investigador de la percepción.',
 'Si toda persona que ve rojo posee conocimientos completos sobre física.',
 'Si experimentar colores demuestra que ningún fenómeno admite una explicación científica.'
 ],'El argumento del conocimiento pregunta si el conocimiento de la experiencia aporta algo no contenido en la descripción física completa. Existen respuestas según las cuales se adquiere una habilidad o un modo de presentación, y no un hecho no físico.'],
 ['filosofia','Una conclusión moral se presenta como deducida únicamente de cómo se comporta la mayoría. ¿Qué falta para que la inferencia sea válida?',[
 'Una premisa normativa que conecte ese comportamiento con lo que debe hacerse.',
 'Una encuesta adicional que mida exactamente la frecuencia de aquella conducta social.',
 'Una descripción histórica que identifique cuándo comenzó aquella práctica en la comunidad.',
 'Una clasificación psicológica que agrupe las motivaciones habituales de quienes la realizan.'
 ],'Las premisas descriptivas por sí solas no establecen una conclusión normativa. Hace falta una conexión normativa, que también debe poder discutirse.'],
 ['filosofia','Una teoría ética exige una regla que pueda universalizarse. Al evaluar una promesa falsa, ¿qué pregunta se ajusta mejor a ese procedimiento?',[
 'Si generalizar la máxima destruiría la práctica de prometer que presupone.',
 'Si esa promesa produce una ventaja privada inmediata para quien engaña.',
 'Si esa promesa recibió aprobación mayoritaria en una encuesta representativa reciente.',
 'Si esa promesa puede ocultarse durante suficiente tiempo a sus destinatarios.'
 ],'La prueba kantiana examina la máxima y su universalización, no sólo beneficios, aprobación o posibilidad de ocultamiento. La formulación precisa de la máxima importa.'],
 ['filosofia','Dos tratamientos salvan respectivamente cinco y una vidas con idénticos recursos y sin otros efectos. Bajo un criterio exclusivamente consecuencialista de vidas salvadas, ¿qué se sigue?',[
 'Se elige salvar cinco vidas porque ese criterio compara resultados agregados.',
 'Se elige salvar una vida porque el criterio prohíbe agregar resultados.',
 'Se elige al azar porque ese criterio nunca permite comparar cantidades.',
 'Se elige el tratamiento antiguo porque ese criterio privilegia antecedentes históricos.'
 ],'La conclusión depende del criterio expresamente estipulado. Otras teorías pueden introducir derechos, justicia o prioridades; no deben atribuirse al modelo supuestos que no figuran en el enunciado.'],
 ['filosofia','Un conjunto de reglas admite respuestas opuestas al cambiar el significado de «puede» entre posibilidad física y lógica. ¿Qué problema hay que resolver primero?',[
 'La ambigüedad modal que permite intercambiar sentidos durante el razonamiento presentado.',
 'La cantidad exacta de personas que respaldan cada conclusión del razonamiento.',
 'La antigüedad histórica de las palabras usadas para formular ambas respuestas.',
 'La dificultad emocional que experimentan quienes intentan imaginar los escenarios propuestos.'
 ],'Usar una palabra con sentidos distintos en pasos diferentes produce una equivocación. Hay que fijar la modalidad antes de evaluar la validez.'],
 ['filosofia','Un argumento afirma: «No se ha probado que esta entidad no exista; por tanto existe». ¿Qué evaluación es más precisa?',[
 'La ausencia de refutación no establece por sí sola aquella afirmación existencial.',
 'La ausencia de refutación demuestra por sí sola que aquella entidad no existe.',
 'La existencia depende directamente del número de personas que aceptan aquella afirmación.',
 'La existencia queda demostrada cuando la afirmación se expresa sin contradicciones internas.'
 ],'No haber demostrado la falsedad de una afirmación no equivale a demostrar su verdad. Una investigación puede suspender el juicio y buscar evidencia pertinente.'],
 ['filosofia','Un pensador acepta una afirmación porque puede imaginarla con viveza. ¿Qué conclusión está justificada sin añadir supuestos?',[
 'Que la imaginación vívida no garantiza posibilidad metafísica ni existencia efectiva.',
 'Que cualquier escena imaginable corresponde necesariamente a un estado físicamente realizable.',
 'Que toda escena imaginada resulta necesariamente imposible dentro de cualquier mundo.',
 'Que imaginar una escena demuestra haber comprendido todas sus condiciones implícitas.'
 ],'Concebir superficialmente una escena puede ocultar incompatibilidades. Imaginabilidad, posibilidad lógica, posibilidad física y existencia no son nociones intercambiables.'],
 ['filosofia','Un razonamiento usa «todos los ciudadanos tienen derechos» para concluir «el Estado como conjunto tiene los mismos derechos individuales». ¿Qué traslado requiere justificación?',[
 'El traslado de propiedades de cada miembro a propiedades del conjunto.',
 'El traslado de una afirmación universal hacia uno de sus miembros.',
 'El traslado de una premisa explícita a una expresión equivalente reformulada.',
 'El traslado de una definición estipulada a un ejemplo que la satisface.'
 ],'Una propiedad de las partes no tiene por qué ser una propiedad del conjunto. Puede incurrirse en una falacia de composición si no se justifica la transferencia.'],
 ['filosofia','Un agente quiere simultáneamente maximizar libertad individual y prohibir toda elección que pueda perjudicarlo a él mismo. ¿Qué tensión conceptual aparece?',[
 'La protección paternalista puede restringir precisamente algunas decisiones que considera libres.',
 'La libertad individual exige necesariamente prohibir cualquier norma que proteja derechos.',
 'La protección paternalista elimina necesariamente todo daño causado por decisiones colectivas.',
 'La libertad individual equivale necesariamente a ausencia de consecuencias por decidir.'
 ],'La tensión enfrenta autonomía y protección frente a daños propios. No toda limitación es idéntica y resolver el dilema requiere explicitar qué libertades y riesgos se priorizan.'],
 ['filosofia','Un sistema castiga a alguien sólo porque una predicción estima un delito futuro, sin conducta realizada. ¿Qué problema destaca una concepción de responsabilidad por actos?',[
 'Que la predicción no sustituye la conducta atribuible que fundamenta responsabilidad.',
 'Que una predicción correcta elimina necesariamente cualquier margen de elección posterior.',
 'Que toda predicción estadística carece necesariamente de cualquier utilidad social legítima.',
 'Que la responsabilidad depende únicamente del número de personas potencialmente perjudicadas.'
 ],'Una teoría de responsabilidad por actos exige distinguir riesgo, intención y conducta efectivamente realizada. La utilidad preventiva de información no autoriza automáticamente cualquier castigo.'],
 ['politica','Tres votantes ordenan A>B>C, B>C>A y C>A>B. Si se decide por parejas mediante mayoría simple, ¿qué ocurre?',[
 'A vence a B, B vence a C y C vence a A.',
 'A vence a B, A vence a C y C vence a B.',
 'B vence a A, B vence a C y A vence a C.',
 'C vence a A, C vence a B y A vence a B.'
 ],'Es un ciclo de Condorcet: las preferencias individuales son transitivas, pero la relación mayoritaria colectiva puede no serlo. El orden de votación puede afectar el resultado.'],
 ['politica','Una propuesta obtiene mayoría de votos emitidos con participación del 40 %. ¿Qué afirmación permite esa información sin otras premisas?',[
 'Ganó entre quienes votaron, sin acreditar apoyo mayoritario de todo el padrón.',
 'Ganó entre todo el padrón, pues abstenerse equivale necesariamente a respaldarla.',
 'Perdió entre quienes votaron, pues la abstención invalida cualquier mayoría emitida.',
 'Perdió entre todo el padrón, pues abstenerse equivale necesariamente a rechazarla.'
 ],'La base del porcentaje importa. Mayoría de votos emitidos y mayoría del padrón son afirmaciones distintas; la abstención no identifica por sí misma una preferencia.'],
 ['politica','Un gobierno financia una política y luego evalúa sus propios resultados sin publicar método ni datos. ¿Qué mejora permitiría discutir la evidencia con mayor rigor?',[
 'Publicar criterios verificables y permitir evaluación independiente de resultados y costes.',
 'Sustituir la medición de resultados por una campaña con testimonios favorables.',
 'Mantener secretos los indicadores para impedir que los críticos adapten objeciones.',
 'Elegir únicamente indicadores que mejoraron después de anunciar la política pública.'
 ],'La transparencia metodológica y la evaluación independiente reducen conflictos de interés y permiten replicación. No garantizan resultados buenos, pero mejoran su evaluación.'],
 ['politica','Una campaña propone restringir una libertad para evitar un daño concreto. ¿Qué examen compara medios y fines sin aceptar cualquier restricción?',[
 'Evaluar idoneidad, necesidad y proporcionalidad frente a alternativas menos restrictivas disponibles.',
 'Evaluar únicamente cuántas personas expresan temor ante el daño descrito públicamente.',
 'Evaluar únicamente si quienes proponen la restricción tienen buenas intenciones declaradas.',
 'Evaluar únicamente si alguna restricción parecida existió durante una emergencia anterior.'
 ],'El análisis de proporcionalidad pregunta si la medida sirve, si existe una alternativa igualmente eficaz menos restrictiva y si su carga se justifica. Temor o intención no sustituyen ese examen.'],
 ['politica','Una ley impide que quienes regulan una industria acepten regalos de sus empresas. ¿Qué riesgo institucional intenta reducir directamente?',[
 'La influencia interesada de regulados sobre decisiones tomadas por sus reguladores.',
 'La imposibilidad técnica de medir los costes reales de cumplir la regulación.',
 'La desaparición automática de cualquier desacuerdo entre consumidores y empresas reguladas.',
 'La necesidad de revisar periódicamente las normas aplicadas a nuevas tecnologías.'
 ],'Se busca reducir conflictos de interés y captura regulatoria. Una prohibición de regalos no elimina por sí sola todas las formas de influencia.'],
 ['politica','Un indicador de rendimiento se vuelve objetivo único y una institución mejora la cifra sin mejorar el servicio. ¿Qué interpretación resulta más adecuada?',[
 'El incentivo permitió optimizar la medida sin optimizar aquello que representaba.',
 'El aumento del indicador demuestra necesariamente una mejora equivalente del servicio.',
 'El indicador era inútil desde su creación y nunca contenía información relevante.',
 'El objetivo garantiza resultados adecuados siempre que las sanciones sean suficientemente altas.'
 ],'Una medida puede perder calidad como indicador cuando se transforma en objetivo susceptible de manipulación. Conviene combinar métricas, auditoría y evaluación del resultado real.'],
 ['politica','Un plan beneficia intensamente a un grupo pequeño y distribuye un coste pequeño entre millones. ¿Qué mecanismo puede favorecer su aprobación aunque el coste total sea mayor?',[
 'Beneficiarios concentrados pueden organizarse más fácilmente que quienes soportan costes dispersos.',
 'Los costes individuales pequeños implican necesariamente que el coste agregado también desaparece.',
 'Los grupos pequeños representan necesariamente los intereses de quienes no participan organizadamente.',
 'Los costes dispersos generan necesariamente mayor movilización que cualquier beneficio altamente concentrado.'
 ],'Los incentivos para informarse, organizarse y presionar difieren según la concentración de beneficios y costes. El resultado político no mide automáticamente el beneficio social neto.'],
 ['politica','Una medida popular viola una garantía constitucional. Dentro de un sistema con supremacía constitucional, ¿qué afirmación es compatible con ese diseño?',[
 'La popularidad no elimina por sí sola la posibilidad de control judicial.',
 'La mayoría convierte por sí sola cualquier disposición adoptada en constitucionalmente válida.',
 'La revisión judicial exige necesariamente demostrar que ninguna persona apoya aquella medida.',
 'La garantía constitucional desaparece automáticamente si la medida produce algún beneficio colectivo.'
 ],'Una democracia constitucional distingue decisión mayoritaria y límites constitucionales. Los procedimientos concretos de control dependen del orden jurídico; el caso presupone expresamente supremacía constitucional.'],
 ['economia','En un mercado competitivo de trabajo, se impone un salario mínimo por encima del equilibrio, sin cambios de productividad ni demanda. ¿Qué predice el modelo básico?',[
 'Menor empleo demandado y mayor oferta laboral al salario mínimo fijado.',
 'Mayor empleo demandado y menor oferta laboral al salario mínimo fijado.',
 'Igual empleo demandado y mayor oferta laboral con contratación total garantizada.',
 'Menor empleo demandado y menor oferta laboral con contratación total garantizada.'
 ],'Es la predicción del modelo competitivo bajo las condiciones estipuladas. No es una ley empírica universal: poder de mercado, cumplimiento, productividad y tamaño del aumento pueden cambiar el resultado.'],
 ['economia','Una empresa con poder de compra laboral paga por debajo del salario competitivo. Un mínimo moderado corrige parte de ese poder sin superar el nivel competitivo. ¿Qué posibilidad admite el modelo monopsonista?',[
 'Que suban salario y empleo respecto al equilibrio monopsonista previo existente.',
 'Que suba salario y necesariamente desaparezca toda contratación de trabajadores disponible.',
 'Que baje salario y necesariamente aumente cualquier beneficio recibido por trabajadores.',
 'Que el empleo quede idéntico independientemente del nivel mínimo legal elegido.'
 ],'En un monopsonio, un mínimo adecuadamente situado puede elevar empleo y salarios. El resultado depende de dónde se fija el mínimo y no permite concluir que cualquier aumento sea beneficioso.'],
 ['economia','Después de subir el salario mínimo, el empleo cae durante una recesión. ¿Qué falta para atribuir toda la caída a aquella subida?',[
 'Un contrafactual creíble que separe la medida de otros cambios económicos simultáneos.',
 'Una descripción más extensa de la fecha exacta del anuncio gubernamental publicado.',
 'Una lista de opiniones empresariales recogidas exclusivamente después de conocerse los despidos.',
 'Un gráfico que comience precisamente en el mes con mayor empleo observado.'
 ],'La sucesión temporal no identifica por sí sola causalidad. Se necesita estimar qué habría ocurrido sin el cambio y considerar shocks simultáneos, composición y tendencias previas.'],
 ['economia','Una moneda se aprecia frente a otra. Manteniendo constantes los precios en moneda extranjera, ¿qué efecto directo cabe esperar para un comprador doméstico?',[
 'Que los productos cotizados en la otra moneda cuesten menos localmente.',
 'Que los productos cotizados en la otra moneda cuesten más localmente.',
 'Que todos los precios domésticos disminuyan exactamente en la misma proporción.',
 'Que toda producción doméstica aumente inmediatamente en la misma proporción observada.'
 ],'La apreciación reduce el coste de comprar una cantidad dada de moneda extranjera. El efecto final en precios depende de contratos, márgenes, impuestos y transmisión del tipo de cambio.'],
 ['economia','Un país emite más dinero mientras producción y demanda de dinero permanecen constantes. En el modelo cuantitativo de largo plazo con velocidad constante, ¿qué cambia proporcionalmente?',[
 'El nivel general de precios, manteniéndose la producción real expresamente fijada.',
 'La producción real, manteniéndose el nivel general de precios expresamente fijado.',
 'La demanda real de dinero, manteniéndose todos los precios nominales constantes.',
 'El bienestar de cada hogar, manteniéndose idéntica la distribución de ingresos.'
 ],'En MV=PY, con V e Y constantes, un aumento de M requiere un aumento proporcional de P. Es un ejercicio condicionado: la velocidad y la producción pueden variar en la realidad.'],
 ['economia','La inflación baja del 10 % anual al 4 % anual, sin deflación. ¿Qué describe correctamente el nuevo escenario?',[
 'Los precios siguen creciendo, pero lo hacen a un ritmo anual menor.',
 'Los precios regresan necesariamente al nivel que tenían antes de aquella inflación.',
 'Los precios caen anualmente en la diferencia entre ambas tasas de inflación.',
 'Los salarios recuperan automáticamente todo el poder adquisitivo perdido durante años anteriores.'
 ],'Desinflación es reducción de la tasa positiva de inflación. No equivale a una caída del nivel de precios ni garantiza recuperación del salario real.'],
 ['economia','Un banco central sube su tasa de interés. ¿Por qué no puede deducirse únicamente de eso una apreciación segura de la moneda?',[
 'Porque también influyen expectativas, riesgo, inflación y decisiones de otros mercados financieros.',
 'Porque las tasas nunca influyen sobre las decisiones de ahorro o inversión.',
 'Porque toda subida de tasas reduce necesariamente la demanda de activos domésticos.',
 'Porque el valor externo de la moneda depende exclusivamente de sus billetes.'
 ],'Un mayor rendimiento puede atraer demanda de activos, pero importan tasas reales esperadas, riesgo, expectativas y condiciones externas. Un solo factor no determina con certeza el tipo de cambio.'],
 ['economia','Dos países tienen billetes con cifras nominales muy distintas. ¿Qué dato hace falta para comparar el poder adquisitivo de sus residentes?',[
 'Ingresos y precios de una cesta comparable, además del tipo de cambio.',
 'Sólo la cifra impresa en el billete de mayor denominación disponible.',
 'Sólo la cantidad de ceros que aparece en sus salarios nominales.',
 'Sólo el número total de unidades monetarias emitidas durante el año.'
 ],'Una denominación más grande no significa mayor riqueza. Hay que comparar ingresos reales, precios y, según el objetivo, paridad de poder adquisitivo y tipo de cambio.'],
 ['economia','Un impuesto sobre compradores desplaza la demanda y vendedores reducen el precio antes del impuesto. ¿Qué determina principalmente quién soporta económicamente la carga en el modelo competitivo?',[
 'Las elasticidades relativas de oferta y demanda alrededor del equilibrio relevante.',
 'La identidad legal de quien entrega el pago tributario a la autoridad.',
 'El orden alfabético de compradores y vendedores dentro del registro tributario.',
 'La denominación administrativa elegida para presentar públicamente el nuevo impuesto aprobado.'
 ],'La incidencia económica depende de cómo pueden ajustar cantidades compradores y vendedores. Quien tiene menor elasticidad suele soportar una fracción mayor; no basta identificar al obligado legal.'],
 ['economia','Un producto tiene costes externos de contaminación que no paga su productor. ¿Qué diferencia debe analizarse antes de afirmar que su precio refleja todos sus costes?',[
 'La diferencia entre costes privados contabilizados y costes sociales totales relevantes.',
 'La diferencia entre colores elegidos para el envase y colores de publicidad.',
 'La diferencia entre número de empresas registradas y número de marcas visibles.',
 'La diferencia entre precio anunciado y preferencia estética de cada comprador potencial.'
 ],'Una externalidad genera una separación entre coste privado y coste social. Eso justifica analizar instrumentos correctivos, no elegir automáticamente cualquier regulación sin comparar sus efectos.'],
]
const manual:AdvancedRiddle[]=ENTRIES.map(([kind,q,options,explain],i)=>({id:`pensamiento-${i+1}`,kind,q,options,correct:0,hint:'Identifica el supuesto del enunciado y separa lo que implica de lo que sólo permite.',advice:'Vuelve a revisar las condiciones antes de comparar las alternativas.',explain,difficulty:i%2?5:4}))
const numeric:AdvancedRiddle[]=[]
const pct=(n:number)=>(n>=0?'+':'−')+Math.abs(n).toFixed(2).replace('.',',')+' %'
const optionPcts=(answer:number,step:number):[string,string,string,string]=>[answer,answer+step,answer-step,answer+step*2].map(n=>`La variación calculada sería aproximadamente ${pct(n)}.`) as [string,string,string,string]
for(let i=0;i<12;i++){
 const wage=5+i,inflation=2+i/2,real=((1+wage/100)/(1+inflation/100)-1)*100
 const add=(q:string,options:[string,string,string,string],explain:string)=>numeric.push({id:`economia-aplicada-${numeric.length+1}`,kind:'economia',q,options,correct:0,hint:'Escribe la relación entre cantidades y comprueba cuál es la base de cada porcentaje.',advice:'Revisa la base de cálculo y las condiciones explícitas.',explain,difficulty:i<6?4:5})
 add(`Un salario nominal aumenta ${wage} % y la cesta de consumo aumenta ${inflation} %. Sin otros cambios, ¿cómo varía aproximadamente el salario real?`,optionPcts(real,1.5),`El salario real se obtiene dividiendo el salario nominal por el índice de precios: (1+${wage}/100)/(1+${inflation}/100)−1 = ${pct(real)}. Restar tasas sólo es una aproximación.`)
 const p=20+i*2,change=10+i,fall=(1/(1+change/100)-1)*100
 add(`El tipo de cambio pasa de ${p} a ${(p*(1+change/100)).toFixed(2)} unidades domésticas por dólar. ¿Cómo varía el valor de una unidad doméstica medido en dólares?`,optionPcts(fall,2),`La cotización inversa cambia de 1/${p} a 1/${(p*(1+change/100)).toFixed(2)}. La variación relativa es 1/(1+${change}/100)−1, aproximadamente ${pct(fall)}. Invertir una cotización cambia la base del porcentaje.`)
 const before=80+i*5,after=before+20
 add(`Una cesta pasa de ${before} a ${after} unidades monetarias. ¿Cómo varía el poder de compra de una cantidad fija de dinero respecto a esa cesta?`,optionPcts((before/after-1)*100,3),`La cantidad de cestas comprables pasa de dinero/${before} a dinero/${after}; su cambio relativo es ${before}/${after}−1. La subida de precios y la caída del poder adquisitivo usan bases diferentes.`)
 const participation=40+i*2,yes=52+i
 add(`Participa el ${participation} % del padrón y el ${yes} % de los votos emitidos apoya una propuesta. Sin votos nulos, ¿qué porcentaje del padrón la apoyó?`,optionPcts(participation*yes/100,4),`El porcentaje del padrón es ${participation}/100 × ${yes}/100 × 100 = ${(participation*yes/100).toFixed(2)} %. No debe confundirse la mayoría de participantes con la totalidad del padrón.`)
 const a=3+i/2,b=4+i/2,total=((1+a/100)*(1+b/100)-1)*100
 add(`Los precios aumentan ${a} % un año y ${b} % el siguiente. ¿Cuál es la inflación acumulada de ambos años?`,optionPcts(total,1.25),`Los factores de precios se multiplican: (1+${a}/100)(1+${b}/100)−1 = ${pct(total)}. Sumar tasas omite el efecto compuesto.`)
 const nominal=7+i/2,inf=3+i/4
 add(`Una inversión rinde ${nominal} % nominal y los precios suben ${inf} %. Ignorando impuestos y riesgo, ¿cuál es su rendimiento real exacto aproximado?`,optionPcts(((1+nominal/100)/(1+inf/100)-1)*100,1),`La ecuación de Fisher exacta da (1+${nominal}/100)/(1+${inf}/100)−1. El rendimiento nominal por sí solo no indica cuánto aumenta el poder de compra.`)
 const value=1000+i*100,foregone=60+i*4,explicit=30+i*2
 add(`Un proyecto ingresa ${value} unidades, gasta ${explicit} explícitas y obliga a renunciar a ${foregone} de otro uso. ¿Qué beneficio económico obtiene, contando ese coste de oportunidad?`,[value-explicit-foregone,value-explicit,value-foregone,value-explicit+foregone].map(n=>`El beneficio económico sería de ${n} unidades monetarias.`) as [string,string,string,string],`Beneficio económico = ingreso − costes explícitos − coste de oportunidad: ${value}−${explicit}−${foregone}=${value-explicit-foregone}. Renunciar a una alternativa tiene coste aunque no exista un pago contable.`)
 const money=8+i,output=2+i/3
 add(`La cantidad de dinero aumenta ${money} % y la producción real aumenta ${output.toFixed(2)} %. En MV=PY, con velocidad constante, ¿cómo varían aproximadamente los precios?`,optionPcts(((1+money/100)/(1+Number(output.toFixed(2))/100)-1)*100,2),`Con velocidad constante, el factor de precios es el factor monetario dividido por el factor de producción: (1+${money}/100)/(1+${output.toFixed(2)}/100). Restar tasas sólo aproxima el resultado.`)
 const wageRise=10+i,productivity=4+i/2
 add(`El coste salarial por trabajador crece ${wageRise} % y su producción aumenta ${productivity} %. Sin otros costes, ¿cómo varía el coste salarial por unidad producida?`,optionPcts(((1+wageRise/100)/(1+productivity/100)-1)*100,1.75),`El coste unitario divide coste por producción. Hay que dividir sus factores de crecimiento, no comparar únicamente el salario nominal.`)
 const employees=4+i/2,pay=6+i/3
 add(`Una plantilla aumenta ${employees} % y el salario medio aumenta ${pay.toFixed(2)} %. Manteniendo horas constantes, ¿cómo varía la masa salarial total?`,optionPcts(((1+employees/100)*(1+Number(pay.toFixed(2))/100)-1)*100,2.25),`La masa salarial multiplica personas por salario medio. Los factores de crecimiento se multiplican y producen un término compuesto.`)
 const price=4+i,quantity=8+i*2
 add(`En un ejercicio sin otros cambios, el precio sube ${price} % y la cantidad demandada baja ${quantity} %. Usando porcentajes respecto al valor inicial, ¿cuál es la elasticidad precio en valor absoluto?`,[quantity/price,price/quantity,quantity/price+.5,quantity/price+1].map(n=>`La elasticidad calculada sería aproximadamente ${n.toFixed(2).replace('.',',')}.`) as [string,string,string,string],`El valor absoluto de la elasticidad se calcula como variación porcentual de cantidad dividida por variación porcentual de precio: ${quantity}/${price}. El enunciado especifica la base; no pide elasticidad arco.`)
 const threshold=100+i*10,income=threshold+80,baseRate=10,upper=20+i
 const tax=threshold*baseRate/100+(income-threshold)*upper/100
 add(`Un impuesto hipotético cobra ${baseRate} % sobre las primeras ${threshold} unidades de ingreso y ${upper} % sólo sobre el exceso. Con ingreso ${income}, ¿cuánto se paga en total?`,[tax,income*upper/100,income*baseRate/100,tax+8].map(n=>`El impuesto total ascendería a ${n.toFixed(2).replace('.',',')} unidades.`) as [string,string,string,string],`Se aplica cada tipo a su tramo: ${threshold}×${baseRate}/100 + (${income}−${threshold})×${upper}/100 = ${tax.toFixed(2)}. El tipo marginal superior no grava todo el ingreso.`)
 const jobs=100+i*10,hours=40,drop=10+i
 add(`El número de trabajadores permanece en ${jobs}, pero sus horas semanales bajan de ${hours} a ${(hours*(1-drop/100)).toFixed(1)}. ¿Cómo cambia el total de horas trabajadas, manteniendo lo demás constante?`,optionPcts(-drop,5),`Horas totales = trabajadores × horas por trabajador. Si el primer factor no cambia, la caída del segundo reduce el total un ${drop} %. Contar sólo personas puede ocultar ajustes en horas.`)
}
export const ADVANCED_RIDDLES=[...manual,...numeric]
export function mixRiddle<T extends {options:string[];correct:number}>(item:T,seed:number):T{
 let state=seed>>>0;const entries=item.options.map((text,i)=>({text,i}));for(let i=entries.length-1;i>0;i--){state=(Math.imul(state,1664525)+1013904223)>>>0;const j=Math.floor(state/4294967296*(i+1));[entries[i],entries[j]]=[entries[j],entries[i]]}return {...item,options:entries.map(e=>e.text),correct:entries.findIndex(e=>e.i===item.correct)}
}
