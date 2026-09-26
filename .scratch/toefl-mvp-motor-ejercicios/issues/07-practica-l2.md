# 07: Práctica L2 con audio e incidencias

**What to build:** Un alumno comprueba el sonido, escucha una conversación original y responde en orden a sus preguntas bajo un reloj por ítem, con recuperación de fallos de audio y transcripción solo en revisión.

**Blocked by:** 03 Práctica R3 de extremo a extremo.

**Status:** completed

- [ ] Los recursos publicados se almacenan como blobs versionados con metadatos, hash y derechos; la entrega de audio queda aislada de las claves.
- [ ] Inicio de reproducción, fin de audio y plazo de respuesta se distinguen con etiquetas y registros separados.
- [ ] Avance manual sin respuesta se bloquea; un plazo vencido omite la pregunta y avanza según las reglas.
- [ ] Recargar preserva respuestas y plazos sin conceder tiempo adicional.
- [ ] El fallo de audio crea una incidencia recuperable sin marcar automáticamente las preguntas como errores.
