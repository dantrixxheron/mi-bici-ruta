import { resolve } from 'node:path';

export const RAIZ = resolve(import.meta.dirname, '..');

/** Fuente oficial descargada de mibici.net. Se versiona tal cual llego. */
export const CSV_NOMENCLATURA = resolve(RAIZ, 'data/nomenclatura_2026_07.csv');

/**
 * Los artefactos generados viven bajo public/ para que Vite los sirva y el
 * navegador pueda pedirlos con fetch. Eso es lo que permite la carga
 * diferida del grafo: si se importaran como modulos, sus 1.4 MB acabarian
 * dentro del bundle y bloquearian el primer render.
 */
export const ESTACIONES_JSON = resolve(RAIZ, 'public/datos/estaciones.json');
export const GRAFO_JSON = resolve(RAIZ, 'public/datos/grafo.json');

/** Avance parcial del constructor de matriz. No se versiona. */
export const CACHE_MATRIZ = resolve(RAIZ, 'data/.cache-matriz');

/** Rutas publicas equivalentes, tal como las pide el navegador. */
export const URL_ESTACIONES = '/datos/estaciones.json';
export const URL_GRAFO = '/datos/grafo.json';
