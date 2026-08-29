import type { LatLng } from '../dominio/tipos';

const RADIO_TIERRA_M = 6_371_000;

const aRadianes = (grados: number) => (grados * Math.PI) / 180;

/** Distancia sobre la esfera, en metros. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = aRadianes(b.lat - a.lat);
  const dLon = aRadianes(b.lon - a.lon);
  const lat1 = aRadianes(a.lat);
  const lat2 = aRadianes(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(h));
}

/**
 * Cota inferior barata para descartar pares antes de llamar a haversine.
 * A la latitud de Guadalajara (~20.7 grados) un grado de longitud son
 * ~104 km y uno de latitud ~110.6 km. Sirve como criba previa en bucles
 * de O(n^2) sobre 451 estaciones.
 */
export function excedeRadioRapido(a: LatLng, b: LatLng, radioM: number): boolean {
  const dLatM = Math.abs(a.lat - b.lat) * 110_600;
  if (dLatM > radioM) return true;
  const dLonM = Math.abs(a.lon - b.lon) * 104_000;
  return dLonM > radioM;
}

/** Estaciones dentro de un radio, ordenadas de la mas cercana a la mas lejana. */
export function estacionesEnRadio<T extends LatLng>(
  punto: LatLng,
  candidatas: readonly T[],
  radioM: number,
): Array<{ estacion: T; distanciaM: number }> {
  const dentro: Array<{ estacion: T; distanciaM: number }> = [];

  for (const estacion of candidatas) {
    if (excedeRadioRapido(punto, estacion, radioM)) continue;
    const distanciaM = haversineM(punto, estacion);
    if (distanciaM <= radioM) dentro.push({ estacion, distanciaM });
  }

  dentro.sort((x, y) => x.distanciaM - y.distanciaM);
  return dentro;
}

export function masCercana<T extends LatLng>(punto: LatLng, candidatas: readonly T[]): T | undefined {
  let mejor: T | undefined;
  let mejorDistancia = Infinity;

  for (const candidata of candidatas) {
    const d = haversineM(punto, candidata);
    if (d < mejorDistancia) {
      mejorDistancia = d;
      mejor = candidata;
    }
  }

  return mejor;
}
