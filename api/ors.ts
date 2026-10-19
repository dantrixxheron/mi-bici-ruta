/**
 * Proxy de OpenRouteService.
 *
 * Existe por una sola razon: la llave no puede viajar al navegador. Con
 * VITE_ORS_API_KEY quedaba en texto plano dentro del bundle publicado y
 * cualquiera podia extraerla y agotar la cuota diaria. Aqui vive del lado
 * del servidor, en una variable de entorno que el cliente nunca ve.
 *
 * Efecto secundario util: la app pasa a llamar a su propio origen, asi que
 * deja de depender de que ORS mande cabeceras CORS.
 */

export const config = { runtime: 'edge' };

const BASE = 'https://api.heigit.org/openrouteservice';

/**
 * Lista blanca. Sin ella esto seria un relay gratuito hacia ORS pagado con
 * MI cuota: basta que alguien descubra la URL para usarla como su propia
 * API. Solo pasan los dos endpoints que la app usa de verdad.
 */
const PERMITIDOS = new Set([
  'v2/directions/cycling-regular/geojson',
  'v2/directions/foot-walking/geojson',
]);

export default async function handler(peticion: Request): Promise<Response> {
  if (peticion.method !== 'POST') {
    return json({ error: 'Solo POST' }, 405);
  }

  const llave = process.env.ORS_API_KEY;
  if (!llave) {
    // 503 y no 500: no es un fallo del codigo sino de la configuracion del
    // despliegue. El mensaje dice exactamente que falta.
    return json({ error: 'ORS_API_KEY no esta configurada en el servidor.' }, 503);
  }

  // Vercel no soporta [...ruta] de varios segmentos fuera de Next.js, asi
  // que vercel.json reescribe /api/ors/<ruta> a /api/ors?ruta=<ruta>.
  const url = new URL(peticion.url);
  const ruta = url.searchParams.get('ruta') ?? url.pathname.replace(/^\/api\/ors\/?/, '');
  if (!PERMITIDOS.has(ruta)) {
    return json({ error: `Ruta no permitida: ${ruta}` }, 403);
  }

  try {
    const respuesta = await fetch(`${BASE}/${ruta}`, {
      method: 'POST',
      headers: {
        Authorization: llave,
        'Content-Type': 'application/json',
        // El endpoint /geojson responde 406 ante 'application/json' a secas.
        Accept: 'application/geo+json, application/json',
      },
      body: await peticion.text(),
    });

    // Se devuelve el cuerpo tal cual, incluso en error: asi el aviso de
    // diagnostico del cliente puede mostrar el motivo real de ORS en vez
    // de un 502 opaco.
    return new Response(respuesta.body, {
      status: respuesta.status,
      headers: { 'Content-Type': respuesta.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (e) {
    return json({ error: `No pude alcanzar a ORS: ${e instanceof Error ? e.message : e}` }, 502);
  }
}

function json(cuerpo: unknown, status: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
