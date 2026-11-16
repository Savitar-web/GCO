# Conocimiento

`/categoria/conocimiento` contiene doce modos y dieciséis disciplinas. El contenido se carga desde `public/knowledge/bank.json`, fuera del paquete inicial. El catálogo ligero permite integrar los juegos con favoritos, rutinas, Recorrido y credencial.

El banco contiene 192 preguntas conceptuales, 32 casos, 25 afirmaciones, 5 cronologías, 6 secuencias de procesos y 6 conjuntos de clasificación. El laboratorio dispone de 14 modelos numéricos parametrizados: porcentajes, Bayes, electricidad, energía, caudales, bombeo, equilibrio operativo, capital de trabajo, salario real, divisas hipotéticas, transferencia de datos, dilución, pH y escalas cartográficas. Los datos regenerados se resuelven por fórmulas; no se fabrican acontecimientos históricos.

Cada elemento referencia una fuente con autor, fecha o s. f., título, URL y fecha de consulta. Las explicaciones son redacción original. Las tesis filosóficas identifican escuela y autor; las cuestiones constitucionales indican México y el artículo. La primacía de una computadora declara el criterio utilizado. Los planetas conocidos desde la Antigüedad no reciben una fecha de descubrimiento inventada.

Los niveles 1–100 priorizan la proximidad a la dificultad de los conceptos y ajustan ciertos parámetros de cálculo. No representan cien bancos documentales diferentes. Las combinaciones sin material específico se indican antes de iniciar y no generan preguntas ficticias.

Recrear contenido: `node scripts/build-knowledge-all.mjs`. Pruebas: `node --test tests/knowledge-module.test.mjs tests/reading-profile.test.mjs`. Compilar: `npm run build`.

Las sesiones registran resultados una sola vez mediante `recordLevelResult`. El tiempo sólo avanza en actividad visible; se conserva una sesión pendiente, incluidos pasos, respuestas, pares y orden. Se pausa al ocultar la app. El examen oculta las soluciones hasta terminar y marca como no respondido lo pendiente al vencer el tiempo. La calibración de confianza se presenta separada de la exactitud.

Los errores se programan a diez minutos; los aciertos extienden el intervalo hasta treinta días. Se conservan acumulados completos, 200 resúmenes y los detalles de las doce sesiones más recientes para controlar el espacio local. Los datos usan `gco:knowledge-stats-v1` y `gco:knowledge-resume-v1`, admitidos en la instantánea existente de cuenta. No se incluyen libros ni canciones.

Las páginas usan variables de los temas generales, áreas seguras con `env(safe-area-inset-*)`, controles accesibles por teclado y disposición adaptable. Lectura también se agrupa por colección y conserva identificadores y estadísticas originales.
