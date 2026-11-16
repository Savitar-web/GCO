# Audios de Lotería

Formato recomendado: Ogg Opus, extensión .opus, mono, 48 kHz, 32–48 kb/s. Una voz de 3 segundos ocupa aproximadamente 12–18 KB. Normaliza a unos −16 LUFS y evita silencios largos.

Coloca cada audio en public/audio/loteria/<baraja>/<voz>/<numero>-<nombre>.opus. Voces: femenina y masculina. Barajas: mexicana, mentes, naturaleza, mundo.

Ejemplo: public/audio/loteria/mexicana/femenina/001-el-gallo.opus

El archivo cartas-y-audios.csv contiene todos los nombres exactos. Ejecutar npm run build actualiza el manifiesto. Si falta un audio, se utiliza TTS en español. La disponibilidad de una voz TTS de cada género depende del dispositivo. Los audios propios permiten fijarla.
