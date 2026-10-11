# REALDRIVE — Prototipo 01

Prototipo de REALDRIVE: escena 3D, RD Sport Coupe y RD Rally 4x4 procedurales, chasis dinámico Rapier, suspensión por raycast, fuerzas de neumáticos simplificadas, circuito, colisiones y sonido sintetizado. Sigue siendo una simulación experimental, no equivalente a BeamNG.drive.

## Requisitos
- Node.js 20 o posterior recomendado
- Navegador moderno con WebGL
- Conexión a Internet durante la instalación de dependencias npm

## Instalar y ejecutar en Windows
1. Descomprimir el proyecto.
2. Abrir la carpeta `realdrive` en VS Code o Cursor.
3. Abrir Terminal > Nueva terminal.
4. Ejecutar:

```bash
npm install
npm run dev
```

5. Abrir la URL que muestra Vite, normalmente `http://localhost:5173`.

## Controles
- W / flecha arriba: acelerar
- S / flecha abajo: frenar
- A / flecha izquierda: girar a la izquierda
- D / flecha derecha: girar a la derecha
- Espacio: freno de estacionamiento
- C: cambiar entre cámara trasera, conductor y órbita
- R: recuperar vehículo
- 1 / 2: seleccionar coupé / Rally 4x4
- Escape: pausar/reanudar simulación
- T: todavía no implementado; los daños y la reparación quedan pendientes

## Alcance actual
- Entorno de pruebas provisional, no es aún el circuito final de 3–5 km.
- Terreno exterior al pad con elevación procedural determinista, malla coloreada y collider trimesh Rapier; el pad y el óvalo conservan su altura plana para no alterar el apoyo ya calibrado.
- Óvalo de pruebas con minimapa generado desde su trazado, línea de salida, tres checkpoints y cronómetro básico de vueltas.
- Los checkpoints requieren cruzar las puertas en orden y en el sentido del circuito. El óvalo tiene barreras laterales y el recinto incluye barreras y conos con colliders Rapier; ahora el chasis dinámico recibe los contactos.
- RD Sport Coupe y RD Rally 4x4 procedurales, seleccionables desde el HUD o con 1/2. El Coupé usa RWD y el Rally distribuye par entre sus cuatro ruedas con perfiles separados; aún no hay diferencial central modelado.
- Los bordes del óvalo usan fardos visuales deformables: el primer impacto los aplasta, frena el vehículo y desactiva su collider para dejar paso. Es una respuesta arcade, no deformación/material blando simulado.
- Rapier simula un chasis dinámico, raycasts de suspensión, carga normal y fuerzas longitudinales/laterales limitadas por adherencia. No incluye todavía transferencia de peso avanzada, curva Pacejka, ABS ni daño mecánico.
- Audio Web Audio habilitado tras interacción: el Coupé usa un timbre agudo y armónico; el Rally tiene pulso grave y silbido turbo. Se añaden viento por velocidad, tono de cambio e impactos de distinta intensidad.
- El chillido de neumáticos es una síntesis aproximada a partir de dirección, velocidad y freno de mano; no procede aún de una medida física de slip.
- La cámara del conductor se coloca dentro del parabrisas; chase y órbita conservan el seguimiento exterior.
- Los modelos visuales son procedurales y no equivalen todavía a un modelo CAD/GLB de alta fidelidad.
- Prueba de humo: con Vite en marcha, abrir `/tests/physics-smoke.html` para comprobar aceleración, dirección, cuatro ruedas apoyadas y frenado.
- Daño progresivo, deformación estructural, físicas vehiculares completas y circuito definitivo permanecen pendientes.

## Compilar
```bash
npm run build
```
