import type { Estacion, LatLng } from '../dominio/tipos';

/**
 * Busqueda por texto para elegir origen y destino sin tocar el mapa.
 *
 * Dos fuentes, deliberadamente:
 *
 *   1. Las 451 estaciones de MiBici, en memoria. Instantaneo, sin red,
 *      sin cuota. Cubre el caso mas comun de esta app en particular:
 *      "llevame a tal estacion".
 *
 *   2. Photon (photon.komoot.io) para direcciones y puntos de interes.
 *      Es gratuito y SIN LLAVE, que es justamente el punto: el
 *      geocodificador de OpenRouteService tambien exige la llave que
 *      todavia esperamos, asi que usarlo dejaria la busqueda bloqueada.
 *      Photon ademas esta pensado para type-ahead.
 *
 * Si Photon falla, la busqueda de estaciones sigue funcionando. La
 * degradacion es parcial, no total.
 */

const PHOTON = 'https://photon.komoot.io/api';

/**
 * Caja del AMG. Sin este filtro duro, "catedral" devuelve Buenos Aires y
 * San Jose antes que la de Guadalajara: el sesgo por lat/lon ordena los
 * resultados pero no los restringe.
 */
const CAJA_AMG = { oesteLon: -103.55, surLat: 20.55, esteLon: -103.2, norteLat: 20.82 };
const CENTRO_AMG = { lat: 20.6767, lon: -103.3475 };

export type Sugerencia = {
  clave: string;
  etiqueta: string;
  detalle: string;
  tipo: 'estacion' | 'lugar';
  lat: number;
  lon: number;
};

/** Quita acentos y normaliza para que "nino" encuentre "Niños". */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function buscarEstaciones(
  consulta: string,
  estaciones: readonly Estacion[],
  limite = 4,
): Sugerencia[] {
  const q = normalizar(consulta);
  if (q.length < 2) return [];

  const puntuadas: Array<{ estacion: Estacion; puntos: number }> = [];

  for (const estacion of estaciones) {
    const codigo = normalizar(estacion.codigo);
    const nombre = normalizar(estacion.nombre);

    let puntos = 0;
    if (codigo.startsWith(q)) puntos = 100;
    else if (nombre.startsWith(q)) puntos = 80;
    else if (nombre.includes(q)) puntos = 50;
    else if (codigo.includes(q)) puntos = 40;

    if (puntos > 0) puntuadas.push({ estacion, puntos });
  }

  return puntuadas
    .sort((a, b) => b.puntos - a.puntos || a.estacion.codigo.localeCompare(b.estacion.codigo))
    .slice(0, limite)
    .map(({ estacion }) => ({
      clave: `estacion-${estacion.id}`,
      etiqueta: `${estacion.codigo} ${estacion.nombre}`,
      detalle: `Estación MiBici · ${estacion.anclajes} anclajes`,
      tipo: 'estacion' as const,
      lat: estacion.lat,
      lon: estacion.lon,
    }));
}

type RasgoPhoton = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    city?: string;
    state?: string;
    osm_value?: string;
  };
};

function describir(p: NonNullable<RasgoPhoton['properties']>): string {
  const calle = [p.street, p.housenumber].filter(Boolean).join(' ');
  return [calle, p.district, p.city].filter(Boolean).join(', ');
}

export async function buscarLugares(
  consulta: string,
  senal?: AbortSignal,
  limite = 5,
): Promise<Sugerencia[]> {
  if (consulta.trim().length < 3) return [];

  const parametros = new URLSearchParams({
    q: consulta,
    limit: String(limite * 2), // se piden de mas porque luego se deduplican
    bbox: `${CAJA_AMG.oesteLon},${CAJA_AMG.surLat},${CAJA_AMG.esteLon},${CAJA_AMG.norteLat}`,
    lat: String(CENTRO_AMG.lat),
    lon: String(CENTRO_AMG.lon),
    // Sin parametro lang: Photon solo acepta de/en/fr/it y responde 400 con "es".
  });

  try {
    const respuesta = await fetch(`${PHOTON}?${parametros}`, senal ? { signal: senal } : {});
    if (!respuesta.ok) return [];

    const datos = (await respuesta.json()) as { features?: RasgoPhoton[] };
    const vistos = new Set<string>();
    const sugerencias: Sugerencia[] = [];

    for (const rasgo of datos.features ?? []) {
      const p = rasgo.properties;
      const c = rasgo.geometry?.coordinates;
      if (!p?.name || !c) continue;

      const [lon, lat] = c;

      // Photon devuelve el mismo lugar varias veces (parada, estacion, nodo).
      // Se deduplica por nombre y por coordenada redondeada a ~100 m.
      const clave = `${normalizar(p.name)}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);

      sugerencias.push({
        clave: `lugar-${clave}`,
        etiqueta: p.name,
        detalle: describir(p) || p.state || 'Jalisco',
        tipo: 'lugar',
        lat,
        lon,
      });

      if (sugerencias.length >= limite) break;
    }

    return sugerencias;
  } catch {
    // Incluye AbortError cuando el usuario sigue escribiendo.
    return [];
  }
}

export const comoPunto = (s: Sugerencia): LatLng & { etiqueta: string } => ({
  lat: s.lat,
  lon: s.lon,
  etiqueta: s.etiqueta,
});
