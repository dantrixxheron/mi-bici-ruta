/**
 * Verificador de la llave de OpenRouteService.
 *
 * Construir el grafo son ~100 peticiones de matriz. Descubrir a la mitad
 * que la llave, el host o el formato de autenticacion estan mal cuesta
 * cuota que no se recupera hasta el dia siguiente. Este script lo
 * comprueba con 2 peticiones minimas antes de gastar nada.
 *
 *   npx tsx scripts/05-probar-ors.ts
 *
 * Prueba, en este orden:
 *   1. matriz contra el host nuevo de HeiGIT
 *   2. directions contra el host nuevo
 *   3. el host viejo, solo para reportar si sigue vivo
 *
 * Y para cada uno prueba los dos formatos de cabecera posibles, porque
 * las llaves nuevas tienen forma de JWT y no esta documentado si van
 * crudas o con prefijo Bearer.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ESTACIONES_JSON, RAIZ } from './rutas';
import type { ArchivoEstaciones } from '../src/dominio/tipos';

const HOST_NUEVO = 'https://api.heigit.org/openrouteservice';
const HOST_VIEJO = 'https://api.openrouteservice.org';

function leerLlave(): string {
  const directa = process.env.VITE_ORS_API_KEY ?? process.env.ORS_API_KEY;
  if (directa && !directa.startsWith('pon_aqui')) return directa;

  // Node no carga .env por si solo en este contexto; se lee a mano.
  try {
    const env = readFileSync(resolve(RAIZ, '.env'), 'utf8');
    const linea = env.match(/^\s*(?:VITE_)?ORS_API_KEY\s*=\s*(.+)$/m);
    const valor = linea?.[1]?.trim().replace(/^["']|["']$/g, '');
    if (valor && !valor.startsWith('pon_aqui')) return valor;
  } catch {
    /* sin .env */
  }

  console.error('No encontre una llave.');
  console.error('  Pon VITE_ORS_API_KEY en el archivo .env y vuelve a correr esto.');
  process.exit(1);
}

const llave = leerLlave();

const estaciones = (
  JSON.parse(readFileSync(ESTACIONES_JSON, 'utf8')) as ArchivoEstaciones
).estaciones.slice(0, 3);

const coordenadas = estaciones.map((e) => [e.lon, e.lat]);

type Resultado = {
  ok: boolean;
  estado: number;
  formato: string;
  cuerpo: string;
  cabeceras: Record<string, string>;
};

async function intentar(url: string, cuerpo: unknown): Promise<Resultado> {
  const formatos: Array<[string, string]> = [
    ['cruda', llave],
    ['Bearer', `Bearer ${llave}`],
  ];

  let ultimo: Resultado | null = null;

  for (const [nombre, valor] of formatos) {
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: valor,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(cuerpo),
    });

    const texto = await respuesta.text();
    const cabeceras: Record<string, string> = {};
    respuesta.headers.forEach((v, k) => {
      if (/ratelimit|remaining|quota|retry/i.test(k)) cabeceras[k] = v;
    });

    const resultado: Resultado = {
      ok: respuesta.ok,
      estado: respuesta.status,
      formato: nombre,
      cuerpo: texto.slice(0, 400),
      cabeceras,
    };

    if (respuesta.ok) return resultado;
    ultimo = resultado;
    // Si el error no es de autenticacion, cambiar el formato no ayudara.
    if (respuesta.status !== 401 && respuesta.status !== 403) break;
  }

  return ultimo!;
}

function reportar(etiqueta: string, r: Resultado): void {
  console.log(`\n${etiqueta}`);
  console.log(`  ${r.ok ? 'OK' : 'FALLA'}  HTTP ${r.estado}   cabecera: Authorization ${r.formato}`);

  if (Object.keys(r.cabeceras).length > 0) {
    console.log('  cuota:');
    for (const [k, v] of Object.entries(r.cabeceras)) console.log(`    ${k}: ${v}`);
  }

  if (!r.ok) {
    console.log(`  respuesta: ${r.cuerpo}`);
  }
}

async function main(): Promise<void> {
  console.log('='.repeat(72));
  console.log(`Llave: ${llave.slice(0, 12)}...${llave.slice(-6)}  (${llave.length} caracteres)`);
  console.log(`Forma: ${llave.split('.').length === 3 ? 'JWT (llave nueva de HeiGIT)' : 'cadena simple (llave antigua)'}`);
  console.log(`Prueba con ${estaciones.length} estaciones: ${estaciones.map((e) => e.codigo).join(', ')}`);
  console.log('='.repeat(72));

  const cuerpoMatriz = {
    locations: coordenadas,
    metrics: ['duration', 'distance'],
    units: 'm',
  };

  const matrizNueva = await intentar(`${HOST_NUEVO}/v2/matrix/cycling-regular`, cuerpoMatriz);
  reportar('MATRIZ  host nuevo (api.heigit.org)', matrizNueva);

  if (matrizNueva.ok) {
    const datos = JSON.parse(matrizNueva.cuerpo.length < 400 ? matrizNueva.cuerpo : '{}') as {
      durations?: number[][];
    };
    if (datos.durations) {
      console.log('  duraciones (segundos):');
      for (const fila of datos.durations) {
        console.log(`    ${fila.map((d) => String(Math.round(d)).padStart(6)).join(' ')}`);
      }
    }
  }

  const direcciones = await intentar(`${HOST_NUEVO}/v2/directions/foot-walking/geojson`, {
    coordinates: coordenadas.slice(0, 2),
  });
  reportar('DIRECTIONS  host nuevo (a pie, para tramos y geometrias)', direcciones);

  const matrizVieja = await intentar(`${HOST_VIEJO}/v2/matrix/cycling-regular`, cuerpoMatriz);
  reportar('MATRIZ  host viejo (api.openrouteservice.org) — se apaga el 28-sep-2026', matrizVieja);

  console.log(`\n${'='.repeat(72)}`);
  if (matrizNueva.ok && direcciones.ok) {
    console.log('LISTO. La llave sirve en el host nuevo.');
    console.log('Siguiente paso:  npm run datos:grafo');
  } else {
    console.log('La llave AUN NO sirve para lo que necesita MiRuta.');
    console.log('Mientras tanto sigue funcionando:  npm run datos:grafo -- --respaldo');
  }
  process.exit(matrizNueva.ok && direcciones.ok ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
