import type { Itinerario, LatLng, Tramo } from '../dominio/tipos';
import {
  FACTOR_CALIBRACION_BICI,
  PENALIZACION_ANCLAJE_SEG,
  SEGUNDOS_POR_MINUTO,
  VENTANA_GRATUITA_MIN,
} from '../dominio/constantes';

/**
 * Cliente de OpenRouteService.
 *
 * OJO con el host: api.openrouteservice.org quedo deprecado el 28-abr-2026,
 * su cuota bajo al 10% el 27-ago-2026 y se apaga el 28-sep-2026. Todo va
 * contra la infraestructura unificada de HeiGIT.
 *
 * Este modulo es OPCIONAL por diseno. Sin llave, o si ORS falla, la app
 * sigue funcionando con las estimaciones geodesicas del planificador y
 * lineas rectas en el mapa. Ninguna funcion de aqui lanza excepciones
 * hacia arriba: devuelven null y el llamador se queda con lo que tenia.
 */

/**
 * La app ya no habla con ORS directamente ni conoce la llave: todo pasa
 * por /api/ors, que la agrega del lado del servidor. Ver api/ors/[...ruta].ts
 * y el proxy equivalente de vite.config.ts para desarrollo.
 */
const BASE = '/api/ors';

/**
 * Diagnostico. Este modulo cae al respaldo en silencio por diseno, y eso
 * vuelve indistinguibles tres causas muy distintas: no hay llave, el
 * servidor la rechazo, o el navegador bloqueo la peticion. Sin este aviso
 * las tres se ven igual en el mapa: una linea recta.
 */
let yaAvise = false;
function avisarUnaVez(causa: string, detalle?: string): void {
  if (yaAvise) return;
  yaAvise = true;
  console.warn(
    `[MiRuta] Geometrias en modo respaldo (lineas rectas). Causa: ${causa}` +
      (detalle ? `
${detalle}` : ''),
  );
}

export type Perfil = 'cycling-regular' | 'foot-walking';

type RespuestaDirections = {
  features?: Array<{
    geometry?: { coordinates?: [number, number][] };
    properties?: { summary?: { distance?: number; duration?: number } };
  }>;
};

export type TramoRuteado = {
  distanciaM: number;
  duracionSeg: number;
  geometria: LatLng[];
};

/** Una peticion de ruta. Devuelve null ante cualquier problema. */
export async function rutear(
  perfil: Perfil,
  desde: LatLng,
  hasta: LatLng,
  senal?: AbortSignal,
): Promise<TramoRuteado | null> {
  try {
    const respuesta = await fetch(`${BASE}/v2/directions/${perfil}/geojson`, {
      method: 'POST',
      // Sin Authorization: la pone el proxy. El Accept si viaja porque el
      // endpoint /geojson responde 406 ante 'application/json' a secas.
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/geo+json, application/json',
      },
      body: JSON.stringify({
        coordinates: [
          [desde.lon, desde.lat],
          [hasta.lon, hasta.lat],
        ],
      }),
      ...(senal ? { signal: senal } : {}),
    });

    if (!respuesta.ok) {
      avisarUnaVez(
        `ORS respondio HTTP ${respuesta.status}.`,
        (await respuesta.text()).slice(0, 300),
      );
      return null;
    }

    const datos = (await respuesta.json()) as RespuestaDirections;
    const rasgo = datos.features?.[0];
    const coordenadas = rasgo?.geometry?.coordinates;
    const resumen = rasgo?.properties?.summary;

    if (!coordenadas || !resumen?.distance || !resumen.duration) return null;

    return {
      distanciaM: Math.round(resumen.distance),
      duracionSeg: Math.round(resumen.duration),
      geometria: coordenadas.map(([lon, lat]) => ({ lat, lon })),
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    avisarUnaVez(
      'la peticion ni siquiera llego a completarse. Casi siempre es CORS o falta de red.',
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

function recalcularTotales(tramos: Tramo[]): Itinerario['totales'] {
  let distanciaCaminataM = 0;
  let distanciaBiciM = 0;
  let duracionCaminataSeg = 0;
  let duracionBiciSeg = 0;
  let tramosBici = 0;

  for (const tramo of tramos) {
    if (tramo.modo === 'caminata') {
      distanciaCaminataM += tramo.distanciaM;
      duracionCaminataSeg += tramo.duracionSeg;
    } else {
      distanciaBiciM += tramo.distanciaM;
      duracionBiciSeg += tramo.duracionSeg;
      tramosBici++;
    }
  }

  const numeroParadas = Math.max(0, tramosBici - 1);

  return {
    duracionSeg:
      duracionCaminataSeg + duracionBiciSeg + numeroParadas * PENALIZACION_ANCLAJE_SEG,
    distanciaM: distanciaCaminataM + distanciaBiciM,
    distanciaCaminataM,
    distanciaBiciM,
    duracionCaminataSeg,
    duracionBiciSeg,
    numeroParadas,
  };
}

/**
 * Sustituye estimaciones por mediciones reales de ORS: tiempo y distancia
 * de los tramos a pie, y geometria de todos los tramos.
 *
 * Importante para la honestidad del producto: al refinar un tramo de bici
 * se RECALCULA su margen con la duracion real. Si el grafo venia del modo
 * respaldo y la calle resulta mas lenta que la estimacion, el margen puede
 * volverse negativo. Cuando eso pasa el tramo queda marcado y la interfaz
 * lo muestra en rojo, en vez de sostener una promesa que ya no se cumple.
 */
export async function refinarConOrs(
  itinerario: Itinerario,
  senal?: AbortSignal,
): Promise<Itinerario> {
  const refinados = await Promise.all(
    itinerario.tramos.map(async (tramo): Promise<Tramo> => {
      const perfil: Perfil = tramo.modo === 'caminata' ? 'foot-walking' : 'cycling-regular';
      const real = await rutear(perfil, tramo.desde, tramo.hasta, senal);

      if (!real) return tramo;

      if (tramo.modo === 'caminata') {
        return {
          ...tramo,
          distanciaM: real.distanciaM,
          duracionSeg: real.duracionSeg,
          geometria: real.geometria,
          geometriaAproximada: false,
        };
      }

      // Misma calibracion que aplico el constructor del grafo. Sin esto el
      // refinado sobrescribiria los tiempos calibrados con los crudos de
      // ORS y volveria a prometer margenes que no se cumplen.
      const duracionSeg = Math.round(real.duracionSeg * FACTOR_CALIBRACION_BICI);

      return {
        ...tramo,
        distanciaM: real.distanciaM,
        duracionSeg,
        geometria: real.geometria,
        geometriaAproximada: false,
        margenMin:
          Math.round((VENTANA_GRATUITA_MIN - duracionSeg / SEGUNDOS_POR_MINUTO) * 10) / 10,
      };
    }),
  );

  return { tramos: refinados, totales: recalcularTotales(refinados) };
}
