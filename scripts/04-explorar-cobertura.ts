/**
 * Diagnostico de cobertura: hasta donde llega realmente MiBici.
 * Sirve para elegir casos de prueba honestos y para saber que zonas del
 * AMG hay que declarar fuera de alcance en la interfaz.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { haversineM, masCercana } from '../src/servicios/geo';
import { RADIO_CAMINATA_M } from '../src/dominio/constantes';
import type { ArchivoEstaciones } from '../src/dominio/tipos';

const RAIZ = resolve(import.meta.dirname, '..');
const archivo = JSON.parse(
  readFileSync(resolve(RAIZ, 'data/estaciones.json'), 'utf8'),
) as ArchivoEstaciones;
const estaciones = archivo.estaciones;

const lats = estaciones.map((e) => e.lat);
const lons = estaciones.map((e) => e.lon);

console.log('CAJA DE COBERTURA');
console.log(`  lat  ${Math.min(...lats).toFixed(5)} .. ${Math.max(...lats).toFixed(5)}`);
console.log(`  lon  ${Math.min(...lons).toFixed(5)} .. ${Math.max(...lons).toFixed(5)}`);
console.log(
  `  ~${(haversineM({ lat: Math.min(...lats), lon: -103.37 }, { lat: Math.max(...lats), lon: -103.37 }) / 1000).toFixed(1)} km norte-sur, ` +
    `~${(haversineM({ lat: 20.68, lon: Math.min(...lons) }, { lat: 20.68, lon: Math.max(...lons) }) / 1000).toFixed(1)} km este-oeste`,
);

const extremo = (etiqueta: string, comparar: (a: (typeof estaciones)[number], b: (typeof estaciones)[number]) => number) => {
  const e = [...estaciones].sort(comparar)[0]!;
  console.log(`  ${etiqueta.padEnd(6)} ${e.codigo}  ${e.nombre}  (${e.lat}, ${e.lon})`);
};

console.log('\nESTACIONES EXTREMAS');
extremo('norte', (a, b) => b.lat - a.lat);
extremo('sur', (a, b) => a.lat - b.lat);
extremo('este', (a, b) => b.lon - a.lon);
extremo('oeste', (a, b) => a.lon - b.lon);

const REFERENCIAS: Array<[string, number, number]> = [
  ['Catedral de Guadalajara', 20.6767, -103.3475],
  ['Mercado San Juan de Dios', 20.676, -103.3358],
  ['Colonia Americana', 20.674, -103.372],
  ['Glorieta Chapalita', 20.6656, -103.3928],
  ['CUCEI', 20.6553, -103.3253],
  ['Expo Guadalajara', 20.6521, -103.3894],
  ['Basilica de Zapopan', 20.7203, -103.3915],
  ['Parque Metropolitano', 20.7089, -103.4013],
  ['Andares', 20.7093, -103.4155],
  ['Centro de Tlaquepaque', 20.6409, -103.312],
  ['Estadio Akron', 20.6819, -103.4625],
  ['Aeropuerto GDL', 20.5218, -103.3111],
  ['Zoologico Guadalajara', 20.7107, -103.3212],
  ['Tonala Centro', 20.6242, -103.2333],
  ['CUCEA', 20.7383, -103.4106],
  ['Plaza Patria', 20.7091, -103.3689],
  ['Parque Alcalde', 20.6968, -103.3506],
  ['Centro Magno', 20.6743, -103.3805],
];

console.log(`\nDISTANCIA A LA ESTACION MAS CERCANA  (radio de caminata: ${RADIO_CAMINATA_M} m)`);
for (const [nombre, lat, lon] of REFERENCIAS) {
  const punto = { lat, lon };
  const cercana = masCercana(punto, estaciones)!;
  const d = Math.round(haversineM(punto, cercana));
  const estado = d <= RADIO_CAMINATA_M ? 'CUBIERTO' : 'FUERA   ';
  console.log(`  ${estado}  ${String(d).padStart(5)} m  ${nombre.padEnd(26)} -> ${cercana.codigo}`);
}
