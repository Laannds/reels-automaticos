/**
 * Publicación automática a Instagram Reels y TikTok.
 *
 * Las credenciales se leen de panel/datos/credenciales.json, que rellena el
 * usuario a mano (nunca se piden ni se guardan desde la interfaz). Formato:
 *
 * {
 *   "instagram": { "igUserId": "...", "accessToken": "..." },
 *   "tiktok":    { "accessToken": "..." },
 *   "urlPublicaBase": "https://xxx.trycloudflare.com"
 * }
 *
 * Nota sobre Instagram: su API NO acepta subir el archivo directamente, exige
 * una URL pública desde la que Meta descarga el vídeo. Por eso hace falta
 * "urlPublicaBase": un túnel (cloudflared/ngrok) apuntando a este mismo panel,
 * que sirve los vídeos en /media/<archivo>.
 */
import { statSync, createReadStream } from "node:fs";
import { leer } from "./almacen.mjs";

const IG_API = "https://graph.facebook.com/v21.0";
const TT_API = "https://open.tiktokapis.com/v2";

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export const credenciales = () => leer("credenciales", {});

/** Qué está configurado y qué falta, para pintarlo en la interfaz. */
export const estadoConfiguracion = () => {
  const c = credenciales();
  return {
    instagram: {
      listo: Boolean(c.instagram?.igUserId && c.instagram?.accessToken && c.urlPublicaBase),
      falta: [
        !c.instagram?.igUserId && "igUserId",
        !c.instagram?.accessToken && "accessToken",
        !c.urlPublicaBase && "urlPublicaBase (túnel público)",
      ].filter(Boolean),
    },
    tiktok: {
      listo: Boolean(c.tiktok?.accessToken),
      falta: [!c.tiktok?.accessToken && "accessToken"].filter(Boolean),
    },
  };
};

/**
 * Comprueba las credenciales contra las APIs reales sin publicar nada.
 * Sirve para saber al instante si un token funciona (y de qué cuenta es)
 * en vez de descubrirlo cuando falla una publicación programada.
 */
export const probarConexion = async () => {
  const c = credenciales();
  const resultado = {};

  // Instagram: pedimos el propio perfil. Si el token vale, devuelve el @handle.
  if (!c.instagram?.igUserId || !c.instagram?.accessToken) {
    resultado.instagram = { ok: false, mensaje: "Faltan igUserId o accessToken" };
  } else {
    try {
      const r = await fetch(
        `${IG_API}/${c.instagram.igUserId}?fields=username,account_type,media_count` +
          `&access_token=${c.instagram.accessToken}`
      ).then((x) => x.json());
      resultado.instagram = r.error
        ? { ok: false, mensaje: r.error.message }
        : {
            ok: true,
            mensaje: `Conectado como @${r.username}` +
              (r.account_type ? ` (${r.account_type})` : "") +
              (r.media_count != null ? ` · ${r.media_count} publicaciones` : ""),
          };
    } catch (err) {
      resultado.instagram = { ok: false, mensaje: `No se pudo conectar: ${err.message}` };
    }
  }

  // Túnel público: comprobamos que responde y sirve los vídeos.
  if (!c.urlPublicaBase) {
    resultado.tunel = { ok: false, mensaje: "Sin URL pública configurada" };
  } else {
    try {
      const r = await fetch(`${c.urlPublicaBase.replace(/\/$/, "")}/api/salud`, {
        signal: AbortSignal.timeout(8000),
      });
      resultado.tunel = r.ok
        ? { ok: true, mensaje: "El túnel responde correctamente" }
        : { ok: false, mensaje: `El túnel respondió ${r.status}` };
    } catch (err) {
      resultado.tunel = { ok: false, mensaje: `No responde: ${err.message}` };
    }
  }

  // TikTok: pedimos la info del creador (endpoint que no publica nada).
  if (!c.tiktok?.accessToken) {
    resultado.tiktok = { ok: false, mensaje: "Falta accessToken" };
  } else {
    try {
      const r = await fetch(`${TT_API}/post/publish/creator_info/query/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.tiktok.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      }).then((x) => x.json());
      const nick = r.data?.creator_nickname;
      resultado.tiktok =
        r.error?.code && r.error.code !== "ok"
          ? { ok: false, mensaje: r.error.message ?? r.error.code }
          : { ok: true, mensaje: nick ? `Conectado como ${nick}` : "Token válido" };
    } catch (err) {
      resultado.tiktok = { ok: false, mensaje: `No se pudo conectar: ${err.message}` };
    }
  }

  return resultado;
};

// ── Instagram Reels ────────────────────────────────────────────────────
export const publicarInstagram = async ({ archivoNombre, caption, log }) => {
  const c = credenciales();
  const { igUserId, accessToken } = c.instagram ?? {};
  if (!igUserId || !accessToken) throw new Error("Faltan credenciales de Instagram");
  if (!c.urlPublicaBase) {
    throw new Error(
      "Falta urlPublicaBase. Instagram descarga el vídeo desde una URL pública: " +
        "arranca un túnel (p.ej. cloudflared tunnel --url http://localhost:4322) " +
        "y pon esa URL en credenciales.json"
    );
  }

  const videoUrl = `${c.urlPublicaBase.replace(/\/$/, "")}/media/${encodeURIComponent(archivoNombre)}`;
  log?.(`📤 Instagram: creando contenedor (${videoUrl})`);

  const crear = await fetch(`${IG_API}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      access_token: accessToken,
    }),
  }).then((r) => r.json());

  if (crear.error) throw new Error(`Instagram: ${crear.error.message}`);
  const creationId = crear.id;
  log?.(`   contenedor ${creationId}, esperando a que Meta procese el vídeo…`);

  // Meta tarda en descargar y procesar: hay que esperar a FINISHED
  for (let intento = 0; intento < 40; intento++) {
    await espera(5000);
    const estado = await fetch(
      `${IG_API}/${creationId}?fields=status_code,status&access_token=${accessToken}`
    ).then((r) => r.json());

    if (estado.status_code === "FINISHED") {
      log?.("   ✅ procesado, publicando…");
      break;
    }
    if (estado.status_code === "ERROR") {
      throw new Error(`Instagram falló al procesar: ${estado.status ?? "sin detalle"}`);
    }
    log?.(`   … ${estado.status_code ?? "procesando"} (${(intento + 1) * 5}s)`);
    if (intento === 39) throw new Error("Instagram: tiempo de espera agotado procesando el vídeo");
  }

  const publicar = await fetch(`${IG_API}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
  }).then((r) => r.json());

  if (publicar.error) throw new Error(`Instagram: ${publicar.error.message}`);
  log?.(`✅ Publicado en Instagram (id ${publicar.id})`);
  return { red: "instagram", id: publicar.id };
};

// ── TikTok ─────────────────────────────────────────────────────────────
// A diferencia de Instagram, TikTok sí acepta subir el archivo directamente.
//
// Flujo obligatorio según la documentación oficial:
//   1. creator_info/query  → TikTok EXIGE consultarlo antes de publicar,
//      y devuelve qué niveles de privacidad admite esa cuenta.
//   2. video/init          → abre la subida y da la URL de destino.
//   3. PUT a esa URL       → el archivo (troceado si es grande).
//   4. status/fetch        → confirma que el post se creó de verdad.

const TT_CHUNK = 10_000_000; // 10 MB, el tamaño que usa TikTok en sus ejemplos

const ttPeticion = async (url, accessToken, cuerpo) => {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  }).then((x) => x.json());

  if (r.error?.code && r.error.code !== "ok") {
    const detalle = r.error.message ?? r.error.code;
    // Error típico de apps sin auditar intentando publicar en público
    if (String(r.error.code).includes("unaudited_client")) {
      throw new Error(
        `TikTok: ${detalle}. Tu app aún no está auditada, así que solo puede ` +
          `publicar en privado. Es normal al empezar.`
      );
    }
    throw new Error(`TikTok: ${detalle}`);
  }
  return r.data ?? {};
};

export const publicarTikTok = async ({ rutaArchivo, caption, log }) => {
  const c = credenciales();
  const accessToken = c.tiktok?.accessToken;
  if (!accessToken) throw new Error("Falta el accessToken de TikTok");

  // 1. Consultar al creador (obligatorio antes de publicar)
  log?.("🔎 TikTok: consultando datos de la cuenta…");
  const info = await ttPeticion(`${TT_API}/post/publish/creator_info/query/`, accessToken);
  const opciones = info.privacy_level_options ?? [];
  log?.(`   cuenta: ${info.creator_nickname ?? "?"} · privacidad admitida: ${opciones.join(", ") || "?"}`);

  // Elegimos siempre lo más conservador que la cuenta permita: privado.
  // Así nada sale publicado sin que tú lo revises antes en la app.
  const privacidad = opciones.includes("SELF_ONLY")
    ? "SELF_ONLY"
    : opciones[0];
  if (!privacidad) throw new Error("TikTok no devolvió niveles de privacidad válidos");

  // 2. Iniciar la subida
  const tam = statSync(rutaArchivo).size;
  const trozos = Math.max(1, Math.ceil(tam / TT_CHUNK));
  const tamTrozo = trozos === 1 ? tam : TT_CHUNK;
  log?.(`📤 subiendo ${Math.round(tam / 1_000_000)} MB en ${trozos} trozo(s), privacidad ${privacidad}`);

  const init = await ttPeticion(`${TT_API}/post/publish/video/init/`, accessToken, {
    post_info: { title: caption, privacy_level: privacidad },
    source_info: {
      source: "FILE_UPLOAD",
      video_size: tam,
      chunk_size: tamTrozo,
      total_chunk_count: trozos,
    },
  });

  const { upload_url, publish_id } = init;
  if (!upload_url) throw new Error("TikTok no devolvió URL de subida");

  // 3. Subir el archivo, troceado si hace falta
  for (let i = 0; i < trozos; i++) {
    const desde = i * tamTrozo;
    const hasta = Math.min(desde + tamTrozo, tam) - 1;
    const subida = await fetch(upload_url, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(hasta - desde + 1),
        "Content-Range": `bytes ${desde}-${hasta}/${tam}`,
      },
      body: createReadStream(rutaArchivo, { start: desde, end: hasta }),
      duplex: "half",
    });
    if (!subida.ok) {
      throw new Error(`TikTok: fallo subiendo el trozo ${i + 1}/${trozos} (${subida.status})`);
    }
    if (trozos > 1) log?.(`   trozo ${i + 1}/${trozos} ✓`);
  }

  // 4. Confirmar que TikTok lo ha procesado
  log?.("   subido, esperando confirmación…");
  for (let intento = 0; intento < 20; intento++) {
    await espera(3000);
    const est = await ttPeticion(`${TT_API}/post/publish/status/fetch/`, accessToken, {
      publish_id,
    });
    if (est.status === "PUBLISH_COMPLETE") {
      log?.(`✅ TikTok lo tiene listo (publish_id ${publish_id}).`);
      log?.("   ⚠️ Está en PRIVADO: ábrelo en la app del móvil para publicarlo.");
      return { red: "tiktok", id: publish_id };
    }
    if (est.status === "FAILED") {
      throw new Error(`TikTok falló al procesar: ${est.fail_reason ?? "sin detalle"}`);
    }
    log?.(`   … ${est.status ?? "procesando"} (${(intento + 1) * 3}s)`);
  }

  // Si no confirma a tiempo no es necesariamente un fallo: suele acabar saliendo
  log?.(`⚠️ Subido (publish_id ${publish_id}) pero TikTok no confirmó a tiempo. Revísalo en la app.`);
  return { red: "tiktok", id: publish_id };
};

export const publicar = async ({ red, rutaArchivo, archivoNombre, caption, log }) => {
  if (red === "instagram") return publicarInstagram({ archivoNombre, caption, log });
  if (red === "tiktok") return publicarTikTok({ rutaArchivo, caption, log });
  throw new Error(`Red desconocida: ${red}`);
};
