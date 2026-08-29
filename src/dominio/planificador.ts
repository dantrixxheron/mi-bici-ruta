import {
  FACTOR_RODEO,
  NODO_DESTINO,
  NODO_ORIGEN,
  PENALIZACION_ANCLAJE_SEG,
  RADIO_CAMINATA_M,
  SEGUNDOS_POR_MINUTO,
  VELOCIDAD_CAMINATA_KMH,
  VENTANA_GRATUITA_MIN,
} from './constantes';
import { caminoMinimo, type Arista, type ListaAdyacencia } from './dijkstra';
import { estacionesEnRadio, haversineM, masCercana } from '../servicios/geo';
import type {
  ArchivoGrafo,
  Estacion,
  Itinerario,
  LatLng,
  Punto,
  ResultadoPlaneacion,
  TotalesItinerario,
  Tramo,
} from './tipos';

export type ContextoPlaneacion = {
  estaciones: Estacion[];
  grafo: ArchivoGrafo;
  /** Indice id -> estacion, precalculado una vez al cargar la app. */
  porId: Map<number, Estacion>;
};

export function prepararContexto(
  estaciones: Estacion[],
  grafo: ArchivoGrafo,
): ContextoPlaneacion {
  return {
    estaciones,
    grafo,
    porId: new Map(estaciones.map((e) => [e.id, e])),
  };
}

/**
 * Estimacion geodesica de una caminata. El planificador la usa para TODAS
 * las estaciones candidatas durante la busqueda; pedirle a OpenRouteService
 * una ruta a pie por cada una de las ~30 estaciones que puede haber a menos
 * de 1 km seria absurdo. Los dos tramos a pie que sobreviven a la busqueda
 * se refinan despues con ORS en servicios/ors.ts.
 */
function estimarCaminata(a: LatLng, b: LatLng): { distanciaM: number; duracionSeg: number } {
  const distanciaM = haversineM(a, b) * FACTOR_RODEO;
  const duracionSeg = distanciaM / ((VELOCIDAD_CAMINATA_KMH * 1000) / 3600);
  return { distanciaM, duracionSeg };
}

function lineaRecta(a: LatLng, b: LatLng): LatLng[] {
  return [
    { lat: a.lat, lon: a.lon },
    { lat: b.lat, lon: b.lon },
  ];
}

/**
 * Arma el grafo efimero de la consulta: las aristas de bicicleta
 * precomputadas mas los enlaces a pie desde el origen y hacia el destino.
 */
function construirAdyacencia(
  contexto: ContextoPlaneacion,
  origen: LatLng,
  destino: LatLng,
  candidatasOrigen: Array<{ estacion: Estacion; distanciaM: number }>,
  candidatasDestino: Array<{ estacion: Estacion; distanciaM: number }>,
): ListaAdyacencia {
  const adyacencia: ListaAdyacencia = new Map();

  for (const [idBruto, salientes] of Object.entries(contexto.grafo.aristas)) {
    const id = Number(idBruto);
    const aristas: Arista[] = [];

    for (const [hacia, duracionSeg, distanciaM] of salientes) {
      // Una estacion puede existir en el grafo pero haber sido dada de baja
      // en una regeneracion posterior del catalogo.
      if (!contexto.porId.has(hacia)) continue;
      aristas.push({
        hacia,
        duracionSeg,
        distanciaM,
        costoSeg: duracionSeg + PENALIZACION_ANCLAJE_SEG,
        modo: 'bicicleta',
      });
    }

    adyacencia.set(id, aristas);
  }

  const desdeOrigen: Arista[] = [];
  for (const { estacion } of candidatasOrigen) {
    const { distanciaM, duracionSeg } = estimarCaminata(origen, estacion);
    desdeOrigen.push({
      hacia: estacion.id,
      duracionSeg,
      distanciaM,
      costoSeg: duracionSeg,
      modo: 'caminata',
    });
  }

  // Trayectos tan cortos que sacar una bici no tiene sentido.
  const directo = estimarCaminata(origen, destino);
  if (haversineM(origen, destino) <= RADIO_CAMINATA_M) {
    desdeOrigen.push({
      hacia: NODO_DESTINO,
      duracionSeg: directo.duracionSeg,
      distanciaM: directo.distanciaM,
      costoSeg: directo.duracionSeg,
      modo: 'caminata',
    });
  }

  adyacencia.set(NODO_ORIGEN, desdeOrigen);

  for (const { estacion } of candidatasDestino) {
    const { distanciaM, duracionSeg } = estimarCaminata(estacion, destino);
    const salientes = adyacencia.get(estacion.id) ?? [];
    salientes.push({
      hacia: NODO_DESTINO,
      duracionSeg,
      distanciaM,
      costoSeg: duracionSeg,
      modo: 'caminata',
    });
    adyacencia.set(estacion.id, salientes);
  }

  return adyacencia;
}

function calcularTotales(tramos: Tramo[]): TotalesItinerario {
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
    // El tiempo de re-anclaje es tiempo real del viaje: se cuenta.
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

export function planificar(
  contexto: ContextoPlaneacion,
  origen: Punto,
  destino: Punto,
): ResultadoPlaneacion {
  const candidatasOrigen = estacionesEnRadio(origen, contexto.estaciones, RADIO_CAMINATA_M);
  const candidatasDestino = estacionesEnRadio(destino, contexto.estaciones, RADIO_CAMINATA_M);

  const sePuedeCaminarDirecto = haversineM(origen, destino) <= RADIO_CAMINATA_M;

  if (candidatasOrigen.length === 0 && !sePuedeCaminarDirecto) {
    const cercana = masCercana(origen, contexto.estaciones);
    return {
      ok: false,
      motivo: 'origen-fuera-de-cobertura',
      detalle: cercana
        ? `No hay estaciones de MiBici a menos de ${RADIO_CAMINATA_M} m del origen. La mas cercana es ${cercana.codigo} a ${Math.round(haversineM(origen, cercana))} m.`
        : 'No hay estaciones de MiBici cerca del origen.',
      ...(cercana ? { estacionMasCercana: cercana } : {}),
    };
  }

  if (candidatasDestino.length === 0 && !sePuedeCaminarDirecto) {
    const cercana = masCercana(destino, contexto.estaciones);
    return {
      ok: false,
      motivo: 'destino-fuera-de-cobertura',
      detalle: cercana
        ? `No hay estaciones de MiBici a menos de ${RADIO_CAMINATA_M} m del destino. La mas cercana es ${cercana.codigo} a ${Math.round(haversineM(destino, cercana))} m.`
        : 'No hay estaciones de MiBici cerca del destino.',
      ...(cercana ? { estacionMasCercana: cercana } : {}),
    };
  }

  const adyacencia = construirAdyacencia(
    contexto,
    origen,
    destino,
    candidatasOrigen,
    candidatasDestino,
  );

  const camino = caminoMinimo(adyacencia, NODO_ORIGEN, NODO_DESTINO);

  if (!camino) {
    return {
      ok: false,
      motivo: 'sin-camino',
      detalle:
        'No existe una cadena de estaciones que conecte esos dos puntos respetando la ventana de 30 minutos.',
    };
  }

  const tramos: Tramo[] = [];

  for (let i = 0; i < camino.aristas.length; i++) {
    const arista = camino.aristas[i]!;
    const nodoDesde = camino.nodos[i]!;
    const nodoHacia = camino.nodos[i + 1]!;

    const puntoDesde: Punto | Estacion =
      nodoDesde === NODO_ORIGEN ? origen : contexto.porId.get(nodoDesde)!;
    const puntoHacia: Punto | Estacion =
      nodoHacia === NODO_DESTINO ? destino : contexto.porId.get(nodoHacia)!;

    if (arista.modo === 'caminata') {
      const comoPunto = (p: Punto | Estacion): Punto =>
        'codigo' in p ? { lat: p.lat, lon: p.lon, etiqueta: `${p.codigo} ${p.nombre}` } : p;

      tramos.push({
        modo: 'caminata',
        desde: comoPunto(puntoDesde),
        hasta: comoPunto(puntoHacia),
        distanciaM: Math.round(arista.distanciaM),
        duracionSeg: Math.round(arista.duracionSeg),
        geometria: lineaRecta(puntoDesde, puntoHacia),
        geometriaAproximada: true,
      });
      continue;
    }

    const estacionDesde = puntoDesde as Estacion;
    const estacionHacia = puntoHacia as Estacion;

    // Plan B si el usuario llega y no encuentra anclaje libre.
    const alternativa = masCercana(
      estacionHacia,
      contexto.estaciones.filter((e) => e.id !== estacionHacia.id && e.id !== estacionDesde.id),
    );

    tramos.push({
      modo: 'bicicleta',
      desde: estacionDesde,
      hasta: estacionHacia,
      distanciaM: Math.round(arista.distanciaM),
      duracionSeg: Math.round(arista.duracionSeg),
      geometria: lineaRecta(estacionDesde, estacionHacia),
      geometriaAproximada: true,
      margenMin:
        Math.round((VENTANA_GRATUITA_MIN - arista.duracionSeg / SEGUNDOS_POR_MINUTO) * 10) / 10,
      ...(alternativa ? { alternativaCercana: alternativa } : {}),
    });
  }

  const itinerario: Itinerario = { tramos, totales: calcularTotales(tramos) };
  return { ok: true, itinerario };
}
