/**
 * Banco de pruebas del motor, sin UI y sin red.
 *
 * Verifica los criterios de aceptacion del README (seccion 11):
 *   - 100% de los tramos de bici por debajo de la ventana efectiva
 *   - >= 90% de los pares producen ruta valida
 *   - el total coincide con la suma de los tramos
 *   - tiempo de calculo por debajo del presupuesto
 *
 * Este es el punto de control de la hora 18 del plan: si esto pasa,
 * el producto existe aunque no tenga interfaz.
 */

import { readFileSync } from 'node:fs';
import { ESTACIONES_JSON, GRAFO_JSON } from './rutas';
import { prepararContexto, planificar } from '../src/dominio/planificador';
import { haversineM } from '../src/servicios/geo';
import {
  PENALIZACION_ANCLAJE_SEG,
  SEGUNDOS_POR_MINUTO,
  VENTANA_EFECTIVA_SEG,
  VENTANA_GRATUITA_MIN,
} from '../src/dominio/constantes';
import type { ArchivoEstaciones, ArchivoGrafo, Punto } from '../src/dominio/tipos';

const estacionesArchivo = JSON.parse(readFileSync(ESTACIONES_JSON, 'utf8')) as ArchivoEstaciones;
const grafo = JSON.parse(readFileSync(GRAFO_JSON, 'utf8')) as ArchivoGrafo;

const contexto = prepararContexto(estacionesArchivo.estaciones, grafo);

const punto = (lat: number, lon: number, etiqueta: string): Punto => ({ lat, lon, etiqueta });

/**
 * Referencias reconocibles del AMG. La cobertura de cada una se verifico
 * con scripts/04-explorar-cobertura.ts: MiBici NO llega a Andares (2.4 km
 * a la estacion mas cercana), al Parque Metropolitano (1.6 km), al Estadio
 * Akron (4.0 km), al Zoologico (2.2 km) ni a Tonala centro (7.3 km).
 */
const LUGARES = {
  catedral: punto(20.6767, -103.3475, 'Catedral de Guadalajara'),
  zapopanCentro: punto(20.7203, -103.3915, 'Basilica de Zapopan'),
  chapalita: punto(20.6656, -103.3928, 'Glorieta Chapalita'),
  cucei: punto(20.6553, -103.3253, 'CUCEI'),
  cucea: punto(20.7383, -103.4106, 'CUCEA'),
  expo: punto(20.6521, -103.3894, 'Expo Guadalajara'),
  americana: punto(20.674, -103.372, 'Colonia Americana'),
  sanJuanDeDios: punto(20.676, -103.3358, 'Mercado San Juan de Dios'),
  plazaPatria: punto(20.7091, -103.3689, 'Plaza Patria'),
  centroMagno: punto(20.6743, -103.3805, 'Centro Magno'),
  tlaquepaque: punto(20.6409, -103.312, 'Centro de Tlaquepaque'),
  extremoEste: punto(20.6638, -103.2971, 'Extremo este (Javier Mina)'),
  extremoOeste: punto(20.6589, -103.4332, 'Extremo oeste (Zapopan)'),
  // Fuera de cobertura, a proposito.
  andares: punto(20.7093, -103.4155, 'Andares'),
  estadioAkron: punto(20.6819, -103.4625, 'Estadio Akron'),
} as const;

type Espera = 'ruta' | 'fuera-de-cobertura';
const CASOS: Array<[string, Punto, Punto, Espera]> = [
  ['Muy corto  Catedral -> San Juan de Dios', LUGARES.catedral, LUGARES.sanJuanDeDios, 'ruta'],
  ['Corto      Americana -> Centro Magno', LUGARES.americana, LUGARES.centroMagno, 'ruta'],
  ['Medio      Catedral -> Chapalita', LUGARES.catedral, LUGARES.chapalita, 'ruta'],
  ['Medio      Americana -> CUCEI', LUGARES.americana, LUGARES.cucei, 'ruta'],
  ['Largo      Catedral -> Zapopan Centro', LUGARES.catedral, LUGARES.zapopanCentro, 'ruta'],
  ['Largo      Expo -> Plaza Patria', LUGARES.expo, LUGARES.plazaPatria, 'ruta'],
  ['Diagonal   Expo -> Zapopan Centro', LUGARES.expo, LUGARES.zapopanCentro, 'ruta'],
  ['Extremo    Tlaquepaque -> CUCEA', LUGARES.tlaquepaque, LUGARES.cucea, 'ruta'],
  ['Extremo    Este -> Oeste (14 km)', LUGARES.extremoEste, LUGARES.extremoOeste, 'ruta'],
  ['Extremo    Tlaquepaque -> Extremo oeste', LUGARES.tlaquepaque, LUGARES.extremoOeste, 'ruta'],
  ['Sin cobert CUCEI -> Andares', LUGARES.cucei, LUGARES.andares, 'fuera-de-cobertura'],
  ['Sin cobert Catedral -> Estadio Akron', LUGARES.catedral, LUGARES.estadioAkron, 'fuera-de-cobertura'],
];

const mm = (seg: number) => `${Math.round(seg / SEGUNDOS_POR_MINUTO)} min`;
const km = (m: number) => `${(m / 1000).toFixed(1)} km`;

let fallos = 0;
const marcar = (ok: boolean, texto: string) => {
  if (!ok) fallos++;
  return `${ok ? 'OK  ' : 'FALLA'} ${texto}`;
};

console.log('='.repeat(72));
console.log(`Estaciones ${estacionesArchivo.total}   Aristas ${grafo.totalAristas}   Perfil ${grafo.parametros.perfil}`);
if (grafo.parametros.modoRespaldo) {
  console.log('AVISO: grafo en modo respaldo. Los tiempos son estimaciones geodesicas.');
}
console.log('='.repeat(72));

for (const [nombre, origen, destino, espera] of CASOS) {
  const t0 = performance.now();
  const resultado = planificar(contexto, origen, destino);
  const ms = performance.now() - t0;

  const recta = haversineM(origen, destino);
  console.log(`\n${nombre}`);
  console.log(`  linea recta ${km(recta)}   calculo ${ms.toFixed(1)} ms`);

  if (!resultado.ok) {
    const esperado = espera === 'fuera-de-cobertura';
    console.log(
      `  ${marcar(esperado, `sin ruta (${resultado.motivo})${esperado ? ', como se esperaba' : ''}`)}`,
    );
    console.log(`       ${resultado.detalle}`);
    continue;
  }

  if (espera === 'fuera-de-cobertura') {
    console.log(`  ${marcar(false, 'se esperaba que NO hubiera ruta, pero se encontro una')}`);
  }

  const { tramos, totales } = resultado.itinerario;

  for (const tramo of tramos) {
    if (tramo.modo === 'caminata') {
      console.log(`    caminata   ${km(tramo.distanciaM).padStart(8)}  ${mm(tramo.duracionSeg).padStart(7)}  ${tramo.hasta.etiqueta}`);
    } else {
      const excede = tramo.duracionSeg > VENTANA_EFECTIVA_SEG;
      if (excede) fallos++;
      console.log(
        `    bicicleta  ${km(tramo.distanciaM).padStart(8)}  ${mm(tramo.duracionSeg).padStart(7)}  ` +
          `margen ${tramo.margenMin.toFixed(1)} min ${excede ? '  <-- EXCEDE LA VENTANA' : ''}  ` +
          `-> ${tramo.hasta.codigo}`,
      );
    }
  }

  console.log(
    `  TOTAL ${km(totales.distanciaM)}  ${mm(totales.duracionSeg)}  ` +
      `(bici ${km(totales.distanciaBiciM)}/${mm(totales.duracionBiciSeg)}, ` +
      `pie ${km(totales.distanciaCaminataM)}/${mm(totales.duracionCaminataSeg)})  ` +
      `${totales.numeroParadas} parada(s)`,
  );

  const sumaDeclarada =
    totales.duracionCaminataSeg +
    totales.duracionBiciSeg +
    totales.numeroParadas * PENALIZACION_ANCLAJE_SEG;
  console.log(`  ${marcar(Math.abs(sumaDeclarada - totales.duracionSeg) < 1, 'el total coincide con la suma de tramos')}`);
}

// ---------------------------------------------------------------------------
// Barrido aleatorio reproducible: pares de estaciones desplazados hasta 400 m
// para simular origenes y destinos reales, no puntos ya sobre una estacion.
// ---------------------------------------------------------------------------

function generadorReproducible(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const azar = generadorReproducible(20260829);
const MUESTRAS = 200;
const estaciones = estacionesArchivo.estaciones;

let conRuta = 0;
let tramosBiciTotal = 0;
let violaciones = 0;
let sumaMs = 0;
let peorMs = 0;
let sumaParadas = 0;
let maximoParadas = 0;
const distribucionParadas = new Map<number, number>();

for (let i = 0; i < MUESTRAS; i++) {
  const a = estaciones[Math.floor(azar() * estaciones.length)]!;
  const b = estaciones[Math.floor(azar() * estaciones.length)]!;
  if (a.id === b.id) continue;

  const desplazar = () => (azar() - 0.5) * 0.007; // ~ +-390 m
  const origen = punto(a.lat + desplazar(), a.lon + desplazar(), 'origen');
  const destino = punto(b.lat + desplazar(), b.lon + desplazar(), 'destino');

  const t0 = performance.now();
  const resultado = planificar(contexto, origen, destino);
  const ms = performance.now() - t0;
  sumaMs += ms;
  peorMs = Math.max(peorMs, ms);

  if (!resultado.ok) continue;
  conRuta++;

  const paradas = resultado.itinerario.totales.numeroParadas;
  sumaParadas += paradas;
  maximoParadas = Math.max(maximoParadas, paradas);
  distribucionParadas.set(paradas, (distribucionParadas.get(paradas) ?? 0) + 1);

  for (const tramo of resultado.itinerario.tramos) {
    if (tramo.modo !== 'bicicleta') continue;
    tramosBiciTotal++;
    if (tramo.duracionSeg > VENTANA_EFECTIVA_SEG) violaciones++;
    if (tramo.margenMin <= 0) violaciones++;
  }
}

const porcentajeConRuta = (conRuta / MUESTRAS) * 100;

console.log(`\n${'='.repeat(72)}`);
console.log(`BARRIDO ALEATORIO  ${MUESTRAS} pares`);
console.log('='.repeat(72));
console.log(`  con ruta valida     ${conRuta}/${MUESTRAS}  (${porcentajeConRuta.toFixed(1)}%)`);
console.log(`  tramos de bici      ${tramosBiciTotal}`);
console.log(`  paradas promedio    ${(sumaParadas / Math.max(1, conRuta)).toFixed(2)}   maximo ${maximoParadas}`);
console.log(`  distribucion de paradas:`);
for (const [n, c] of [...distribucionParadas].sort((x, y) => x[0] - y[0])) {
  console.log(`      ${n} parada(s): ${String(c).padStart(3)}  ${'#'.repeat(Math.round((c / conRuta) * 50))}`);
}
console.log(`  calculo promedio    ${(sumaMs / MUESTRAS).toFixed(1)} ms   peor ${peorMs.toFixed(1)} ms`);

console.log(`\n${'='.repeat(72)}`);
console.log(marcar(violaciones === 0, `ningun tramo excede ${VENTANA_EFECTIVA_SEG / SEGUNDOS_POR_MINUTO} min (violaciones: ${violaciones})`));
console.log(marcar(porcentajeConRuta >= 90, `>= 90% de los pares producen ruta (${porcentajeConRuta.toFixed(1)}%)`));
console.log(marcar(peorMs < 2000, `peor caso de calculo por debajo de 2000 ms (${peorMs.toFixed(1)} ms)`));
console.log(marcar(VENTANA_GRATUITA_MIN === 30, 'la ventana gratuita sigue siendo de 30 min'));

console.log(`\n${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASARON' : `${fallos} COMPROBACION(ES) FALLARON`}`);
process.exit(fallos === 0 ? 0 : 1);
