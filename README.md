# Mi Dieta

App web (PWA) para seguir la dieta semanal y sacar la lista de la compra.
Sin servidor: todo se guarda en el propio dispositivo.

## Publicarla en GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `mi-dieta`). Puede ser privado
   si tu plan lo permite; si es público, ten en cuenta que el código se ve, aunque
   **tus datos nunca salen del móvil**.
2. Sube el contenido de esta carpeta a la raíz del repositorio.

   ```bash
   git init
   git add .
   git commit -m "Primera versión"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/mi-dieta.git
   git push -u origin main
   ```

3. En el repositorio: **Settings → Pages → Build and deployment**.
   En *Source* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`. Guarda.
4. Al minuto tendrás la URL `https://TU_USUARIO.github.io/mi-dieta/`.

## Instalarla en el iPhone

1. Abre esa URL **en Safari** (no vale Chrome: sólo Safari puede añadir a la pantalla
   de inicio en iOS).
2. Botón de compartir → **Añadir a pantalla de inicio**.
3. Ábrela desde el icono. Así va a pantalla completa, sin barra del navegador, y
   funciona sin cobertura.

## Actualizar la app

Sube los cambios con `git push` y sube el número de `CACHE` en `sw.js`
(por ejemplo `midieta-v2`). La próxima vez que abras la app se actualiza sola.

## Dónde se guardan los datos

En el `localStorage` del navegador, bajo la clave `midieta.v1`. Eso significa:

- Los datos viven en **ese** iPhone. Desde el iPad empiezas de cero.
- Si borras la app de la pantalla de inicio o borras los datos de Safari, se van.
- Por eso hay **Ajustes → Guardar copia de seguridad**: genera un `.json` que puedes
  dejar en Archivos o iCloud Drive, y **Restaurar copia** para volver a cargarlo.

Si algún día quieres sincronización entre dispositivos y usuario/contraseña, la vía
es añadir Supabase (Postgres + login) llamándolo desde el JavaScript; la app seguiría
alojada igual en GitHub Pages.

## Estructura

```
index.html              Estructura y barra de pestañas
styles.css              Estilo iOS (listas agrupadas, blur, modo oscuro)
app.js                  Lógica: semanas, arrastrar y soltar, compra, ajustes
data.js                 Las 9 dietas, secciones del súper y normas del plan
manifest.webmanifest    Metadatos de la PWA
sw.js                   Service worker (funciona sin conexión)
icon-*.png              Iconos de la app
```

## Cómo están montadas las dietas

`data.js` contiene 9 bloques (la Dieta 6 va partida en semana 7 y semana 8, porque
tienen platos distintos) y una `SECUENCIA` que dice qué dieta toca en cada una de
las 10 semanas del plan. Al abrir la app por primera vez eliges con un slider en qué
semana estás y a partir de ahí avanza sola cada lunes.

Un plato puede llevar `dia` (0 = lunes … 6 = domingo) para quedar fijado a ese día;
sale con un candado y no se puede arrastrar. El resto se reparten de lunes a sábado
y el día que queda libre es el día libre de la semana.

Para añadir una dieta nueva: **Ajustes → Pegar dieta (JSON)**, o edítala a mano
desde **Ajustes → Mis dietas**.
