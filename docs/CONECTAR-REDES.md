# Conectar Instagram y TikTok al panel

Guía paso a paso. **Todo esto lo tienes que hacer tú**: son tus cuentas y hay
que aceptar términos legales e iniciar sesión, cosa que yo no puedo (ni debo) hacer.

Cuando termines cada bloque, pega los datos en `panel/datos/credenciales.json`
(copia `credenciales.ejemplo.json` y renómbralo) y usa el botón **"Probar conexión"**
del panel para comprobar al instante si funciona.

---

## Bloque 1 — Preparar la cuenta de Instagram (10 min)

1. Abre Instagram → **Ajustes** → **Tipo de cuenta y herramientas**.
2. Asegúrate de que es una **cuenta profesional** (Business o Creator).
   La documentación de Meta habla de "cuentas profesionales" para publicar por API.
   Si te da problemas más adelante, **Business** es la opción más segura y
   documentada de las dos.
3. Vincula la cuenta a una **página de Facebook**. Si no tienes:
   crea una en facebook.com/pages/create (puede ser básica, no hace falta usarla).

> ⚠️ Sin página de Facebook vinculada, el camino B (Facebook Login) no funciona.

---

## Bloque 2 — Crear la app en Meta (20 min)

1. Entra en **developers.facebook.com** con tu cuenta de Facebook.
2. Si es tu primera vez: **Empezar** → verifica la cuenta (te pide teléfono).
3. **Mis apps** → **Crear app**.
4. Caso de uso: elige **"Otro"** → tipo **"Negocio"** (Business).
5. Ponle nombre (ej. `Panel Politecnic`) y créala.
6. Apunta el **App ID** y el **App Secret** (Configuración → Básica).
7. En el panel izquierdo: **Añadir producto** → busca **Instagram** → **Configurar**.

---

## Bloque 3 — Permisos y token de desarrollo (20 min)

En **modo desarrollo** puedes probar con tu propia cuenta **sin esperar
la revisión de Meta**. Esto es lo que nos interesa ahora.

1. Dentro del producto Instagram → **Configuración de la API**.
2. Añádete a ti mismo como **usuario de prueba** (tester) y acepta la
   invitación desde tu cuenta de Instagram.
3. Solicita estos permisos según el camino que elijas:

   **Camino A — Instagram Login** (más simple, recomendado):
   - `instagram_business_basic`
   - `instagram_business_content_publish`

   **Camino B — Facebook Login** (si ya tienes la página vinculada):
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_read_engagement`

4. Genera un **token de acceso**. Te dará uno de corta duración:
   cámbialo por uno **de larga duración (60 días)** — el propio panel de Meta
   tiene la opción, o usa el *Explorador de la API Graph*.
5. Consigue tu **igUserId** (el ID numérico, no el @handle). Desde el
   Explorador de la API Graph: consulta `me/accounts` y de ahí
   `{page-id}?fields=instagram_business_account`.

> 🔁 **El token caduca a los 60 días.** Habrá que renovarlo. Cuando llegue
> el momento, lo automatizamos.

---

## Bloque 4 — El túnel público (10 min)

Instagram **no acepta que le subas el archivo**: exige una URL pública desde
la que descargarse el vídeo. Como el panel corre en tu Mac, hace falta un túnel.

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:4322
```

Te dará una URL tipo `https://algo-random.trycloudflare.com`.
Pégala en `urlPublicaBase` (sin barra final).

> ⚠️ Esa URL cambia cada vez que reinicias el túnel. Para uso serio
> conviene un dominio fijo, pero para probar vale.

---

## Bloque 5 — TikTok (15 min)

1. Entra en **developers.tiktok.com** → **Manage apps** → **Create an app**.
2. Añade el producto **Content Posting API**.
3. Solicita el scope **`video.publish`**.
4. Haz el flujo OAuth y guarda el **accessToken** del usuario.

> ⚠️ **Importante:** hasta que TikTok audite tu app, los vídeos que subas
> llegan como **borrador privado** — tendrás que abrir la app del móvil y
> publicarlos a mano. Es una limitación suya, no del panel.

---

## Qué pasa después

Con esto podrás **probar publicaciones reales desde tu cuenta**.
Para pasar a producción de verdad (y para las respuestas automáticas de DMs)
hace falta la **revisión de Meta**:

| Qué | Permiso | Espera aprox. |
|---|---|---|
| Publicar contenido | `instagram_business_content_publish` | 2-4 semanas |
| Responder DMs | `instagram_business_manage_messages` | semanas a meses |
| Automatizar comentarios | `instagram_manage_comments` | 2-4 semanas |

La revisión pide un **vídeo de pantalla** enseñando el flujo completo,
una **vía de exclusión** (opt-out) para los usuarios y gestión de webhooks.

### Límites que condicionan el diseño

- **Publicación:** 100 posts por API cada 24h.
- **DMs:** solo puedes responder dentro de una **ventana de 24h** desde que
  el usuario te escribe. Tope de **200 mensajes/hora**.

---

## Fuentes

- [Meta — Publicar contenido](https://developers.facebook.com/docs/instagram-platform/content-publishing/)
- [Meta — Business Login for Instagram](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)
- [Meta — Access Token](https://developers.facebook.com/docs/instagram-platform/reference/access_token/)
