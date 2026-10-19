/**
 * data/estaciones.json -> data/grafo.json
 *
 * Precomputa la matriz de tiempos entre estaciones y conserva UNICAMENTE
 * los pares que caben en la ventana efectiva. La regla de negocio queda
 * asi codificada como filtro de aristas: cualquier camino que Dijkstra
 * encuentre despues cumple los 30 minutos por construccion.
 *
 * Dos modos:
 *
 *   npm run datos:grafo                 usa OpenRouteService (requiere ORS_API_KEY)
 *   npm run datos:grafo -- --respaldo   estimacion geodesica, sin red
 *
 * El modo respaldo existe para no bloquear el desarrollo del motor
 * mientras se consigue la llave, y como plan B si ORS falla durante el
 * hackathon. Los tiempos son peores pero la topologia del grafo es la misma.
 *
 * El modo ORS es reanudable: cada bloque de la matriz se cachea en
 * data/.cache-matriz/. Si el proceso se corta, volver a correrlo retoma
 * donde se quedo sin re-consumir cuota.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { haversineM } from '../src/servicios/geo';
import { CACHE_MATRIZ as CACHE, ESTACIONES_JSON as ENTRADA, GRAFO_JSON as SALIDA } from './rutas';
import {
  FACTOR_CALIBRACION_BICI,
  FACTOR_RODEO,
  RADIO_PREFILTRO_M,
  VELOCIDAD_BICI_KMH,
  VENTANA_EFECTIVA_MIN,
  VENTANA_EFECTIVA_SEG,
} from '../src/dominio/constantes';
import type {
  ArchivoEstaciones,
  ArchivoGrafo,
  AristaCompacta,
  Estacion,
} from '../src/dominio/tipos';

const PERFIL = 'cycling-regular';

/**
 * OpenRouteService migro a la infraestructura unificada de HeiGIT.
 *
 *   viejo   https://api.openrouteservice.org/v2/matrix/{perfil}
 *   nuevo   https://api.heigit.org/openrouteservice/v2/matrix/{perfil}
 *
 * Fechas del anuncio oficial:
 *   28-abr-2026  el host viejo queda deprecado
 *   27-ago-2026  su cuota se reduce al 10% de la del plan
 *   28-sep-2026  se apaga por completo
 *
 * Construir el grafo contra el host viejo hoy significa chocar con el 10%
 * de la cuota a mitad de la matriz. Se usa el nuevo por omision.
 */
const BASE_ORS = process.env.ORS_BASE_URL ?? 'https://api.heigit.org/openrouteservice';
const URL_MATRIZ = `${BASE_ORS}/v2/matrix/${PERFIL}`;

/** sources x destinations por peticion. 50x50 = 2500 rutas, el tope del plan gratuito. */
const BLOQUE = 50;
/** El plan gratuito permite ~40 peticiones de matriz por minuto. */
const PAUSA_ENTRE_PETICIONES_MS = 1_800;

const argumentos = process.argv.slice(2);
const MODO_RESPALDO = argumentos.includes('--respaldo');
const gradoMaximo = leerOpcionNumerica('--max-grado');

function leerOpcionNumerica(bandera: string): number | null {
  const i = argumentos.indexOf(bandera);
  if (i === -1) return null;
  const valor = Number.parseInt(argumentos[i + 1] ?? '', 10);
  return Number.isFinite(valor) ? valor : null;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Matriz = { duraciones: number[][]; distancias: number[][] };

async function pedirBloque(
  llave: string,
  origenes: Estacion[],
  destinos: Estacion[],
): Promise<Matriz> {
  const locations = [...origenes, ...destinos].map((e) => [e.lon, e.lat]);
  const cuerpo = {
    locations,
    sources: origenes.map((_, i) => i),
    destinations: destinos.map((_, i) => origenes.length + i),
    metrics: ['duration', 'distance'],
    units: 'm',
  };

  for (let intento = 1; intento <= 5; intento++) {
    const respuesta = await fetch(URL_MATRIZ, {
      method: 'POST',
      headers: {
        Authorization: llave,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(cuerpo),
    });

    if (respuesta.ok) {
      const datos = (await respuesta.json()) as { durations: number[][]; distances: number[][] };
      return { duraciones: datos.durations, distancias: datos.distances };
    }

    // 429 = cuota por minuto agotada. Retroceso exponencial.
    if (respuesta.status === 429 && intento < 5) {
      const espera = 2 ** intento * 5_000;
      console.warn(`  429 recibido, esperando ${espera / 1000}s (intento ${intento}/5)`);
      await dormir(espera);
      continue;
    }

    throw new Error(`ORS respondio ${respuesta.status}: ${await respuesta.text()}`);
  }

  throw new Error('ORS: se agotaron los reintentos');
}

async function construirConOrs(estaciones: Estacion[]): Promise<Matriz> {
  // Una sola llave de ORS para todo el proyecto. Se acepta tambien el nombre
  // La llave NO lleva prefijo VITE_ a proposito: con el, Vite la habria
  // metido en el bundle publico. Solo la ven este script y el proxy.
  const llave = process.env.VITE_ORS_API_KEY ?? process.env.ORS_API_KEY;
  if (!llave || llave.startsWith('pon_aqui')) {
    throw new Error(
      'Falta VITE_ORS_API_KEY.\n' +
        '  Consiguela gratis en https://openrouteservice.org/dev/#/signup\n' +
        '  Luego: copia .env.example a .env y pon la llave ahi.\n' +
        '  O corre con --respaldo para generar un grafo estimado sin red.',
    );
  }

  mkdirSync(CACHE, { recursive: true });

  const n = estaciones.length;
  const duraciones = Array.from({ length: n }, () => new Array<number>(n).fill(Infinity));
  const distancias = Array.from({ length: n }, () => new Array<number>(n).fill(Infinity));

  const bloques = Math.ceil(n / BLOQUE);
  const totalPeticiones = bloques * bloques;
  let hechas = 0;

  for (let bi = 0; bi < bloques; bi++) {
    for (let bj = 0; bj < bloques; bj++) {
      hechas++;
      const rutaCache = resolve(CACHE, `bloque-${bi}-${bj}.json`);

      let matriz: Matriz;
      if (existsSync(rutaCache)) {
        matriz = JSON.parse(readFileSync(rutaCache, 'utf8')) as Matriz;
        process.stdout.write(`\r  bloque ${hechas}/${totalPeticiones} (cache)      `);
      } else {
        const origenes = estaciones.slice(bi * BLOQUE, (bi + 1) * BLOQUE);
        const destinos = estaciones.slice(bj * BLOQUE, (bj + 1) * BLOQUE);
        matriz = await pedirBloque(llave, origenes, destinos);
        writeFileSync(rutaCache, JSON.stringify(matriz), 'utf8');
        process.stdout.write(`\r  bloque ${hechas}/${totalPeticiones} (ORS)        `);
        await dormir(PAUSA_ENTRE_PETICIONES_MS);
      }

      for (let i = 0; i < matriz.duraciones.length; i++) {
        for (let j = 0; j < matriz.duraciones[i]!.length; j++) {
          const dur = matriz.duraciones[i]![j];
          const dis = matriz.distancias[i]?.[j];
          if (dur == null || dis == null) continue;
          // Calibrado aqui, no despues: asi el filtro de la ventana y la
          // invariante "ninguna arista excede 27 min" operan sobre el tiempo
          // que de verdad se le va a prometer al usuario.
          duraciones[bi * BLOQUE + i]![bj * BLOQUE + j] = dur * FACTOR_CALIBRACION_BICI;
          distancias[bi * BLOQUE + i]![bj * BLOQUE + j] = dis;
        }
      }
    }
  }

  process.stdout.write('\n');
  return { duraciones, distancias };
}

/**
 * Estimacion sin red: distancia geodesica corregida por un factor de rodeo,
 * dividida entre la velocidad promedio. Subestima en zonas con barreras
 * (rio, vias, avenidas sin cruce), por eso el grafo resultante se marca
 * como modoRespaldo y no debe usarse para prometerle nada al usuario.
 */
function construirPorEstimacion(estaciones: Estacion[]): Matriz {
  const n = estaciones.length;
  const metrosPorSegundo = (VELOCIDAD_BICI_KMH * 1000) / 3600;

  const duraciones = Array.from({ length: n }, () => new Array<number>(n).fill(Infinity));
  const distancias = Array.from({ length: n }, () => new Array<number>(n).fill(Infinity));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const recta = haversineM(estaciones[i]!, estaciones[j]!);
      if (recta > RADIO_PREFILTRO_M) continue;
      const calle = recta * FACTOR_RODEO;
      distancias[i]![j] = calle;
      duraciones[i]![j] = calle / metrosPorSegundo;
    }
  }

  return { duraciones, distancias };
}

async function main(): Promise<void> {
  const archivo = JSON.parse(readFileSync(ENTRADA, 'utf8')) as ArchivoEstaciones;
  const estaciones = archivo.estaciones;

  console.log(`Estaciones     ${estaciones.length}`);
  console.log(`Modo           ${MODO_RESPALDO ? 'RESPALDO (estimacion geodesica)' : 'OpenRouteService'}`);
  if (!MODO_RESPALDO) console.log(`Endpoint       ${URL_MATRIZ}`);
  console.log(`Ventana        ${VENTANA_EFECTIVA_MIN} min (${VENTANA_EFECTIVA_SEG} s)`);
  if (gradoMaximo) console.log(`Grado maximo   ${gradoMaximo} aristas por estacion`);
  console.log('');

  const matriz = MODO_RESPALDO
    ? construirPorEstimacion(estaciones)
    : await construirConOrs(estaciones);

  const aristas: Record<string, AristaCompacta[]> = {};
  let total = 0;
  let gradoMaximoVisto = 0;
  let podadas = 0;

  for (let i = 0; i < estaciones.length; i++) {
    const desde = estaciones[i]!;
    let salientes: AristaCompacta[] = [];

    for (let j = 0; j < estaciones.length; j++) {
      if (i === j) continue;
      const duracion = matriz.duraciones[i]![j]!;
      const distancia = matriz.distancias[i]![j]!;

      // Aqui vive la regla de negocio.
      if (!Number.isFinite(duracion) || duracion > VENTANA_EFECTIVA_SEG) continue;

      salientes.push([estaciones[j]!.id, Math.round(duracion), Math.round(distancia)]);
    }

    // Poda opcional: conservar las aristas mas largas que aun caben en la
    // ventana. Son las valiosas, porque avanzan mas por cada re-anclaje.
    if (gradoMaximo && salientes.length > gradoMaximo) {
      podadas += salientes.length - gradoMaximo;
      salientes.sort((a, b) => b[1] - a[1]);
      salientes = salientes.slice(0, gradoMaximo);
    }

    salientes.sort((a, b) => a[1] - b[1]);
    gradoMaximoVisto = Math.max(gradoMaximoVisto, salientes.length);

    if (salientes.length > 0) {
      aristas[String(desde.id)] = salientes;
      total += salientes.length;
    }
  }

  const grafo: ArchivoGrafo = {
    generadoEn: new Date().toISOString(),
    parametros: {
      perfil: MODO_RESPALDO ? 'estimacion-geodesica' : PERFIL,
      ventanaEfectivaMin: VENTANA_EFECTIVA_MIN,
      radioPrefiltroM: RADIO_PREFILTRO_M,
      modoRespaldo: MODO_RESPALDO,
    },
    totalNodos: Object.keys(aristas).length,
    totalAristas: total,
    aristas,
  };

  mkdirSync(dirname(SALIDA), { recursive: true });
  writeFileSync(SALIDA, JSON.stringify(grafo), 'utf8');

  const bytes = readFileSync(SALIDA).length;
  const aisladas = estaciones.length - grafo.totalNodos;

  console.log(`\nNodos con aristas   ${grafo.totalNodos}`);
  console.log(`Estaciones aisladas ${aisladas}`);
  console.log(`Aristas             ${total}`);
  console.log(`Grado promedio      ${(total / Math.max(1, grafo.totalNodos)).toFixed(1)}`);
  console.log(`Grado maximo        ${gradoMaximoVisto}`);
  if (podadas > 0) console.log(`Aristas podadas     ${podadas}`);
  console.log(`Tamano              ${(bytes / 1024).toFixed(0)} KB  (${SALIDA})`);
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
