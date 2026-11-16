# Lectura

La ruta `/categoria/lectura` carga una biblioteca JSON independiente del paquete inicial de JavaScript. Los documentos están en `public/reading/texts`; `index.json` contiene metadatos, idioma, longitud, tipos de pregunta y referencia APA. La PWA los incluye en su caché de instalación.

Hay tres clases explícitas: cita literal de una edición histórica, adaptación identificada y texto didáctico original. Las fuentes históricas no se presentan como consenso científico actual. Los documentos originales en inglés están etiquetados como tales. Se conserva la ortografía de los cuentos españoles de 1883.

La serie histórica contiene diez ventanas documentales por obra/figura, conservando el orden de sus párrafos; no se inventan anécdotas biográficas. Se excluyen portadas, publicidad y material editorial ajeno a la selección. Las preguntas semánticas están redactadas; la recuperación automática de pasajes se identifica como evidencia o recuperación literal, no como inferencia.

Para reconstruir el corpus: `node scripts/build-reading-all.mjs`. Descarga las ediciones a una caché ignorada por Git y Vercel; no cambia datos del usuario. Las fuentes tienen URL y localizador; `public/reading/sources.json` conserva los hashes SHA-256 de las ediciones documentales usadas.

Los entrenamientos usan `recordLevelResult` y el catálogo común para Recorrido, favoritos y credencial. Las sesiones, ajustes, reanudación y léxico se guardan con claves `gco:reading-*-v1` y entran en la instantánea de cuenta. Libros y canciones siguen fuera de esa instantánea. El historial detallado conserva 500 sesiones y los acumulados se guardan por separado.

Recomendación pedagógica: medir siempre comprensión junto a velocidad; aumentar extensión y dificultad gradualmente, con recuperación sin consultar, relectura con propósito y repaso de vocabulario. La práctica por bloques no promete memoria fotográfica ni mejoras garantizadas. Referencia: Institute of Education Sciences, guía de intervención lectora, módulo de fluidez: https://ies.ed.gov/ncee/rel/reading-intervention-grades-6-8/pdf/Mod2_Instructional_Guide.pdf.

Validación: `node --test tests/reading-module.test.mjs tests/reading-profile.test.mjs` y `npm run build`.
