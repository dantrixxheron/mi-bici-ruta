/**
 * CSV oficial de nomenclatura -> data/estaciones.json
 *
 * Particularidades reales del archivo, verificadas contra
 * nomenclatura_2026_07.csv (490 filas):
 *
 *   - Codificacion Windows-1252, NO UTF-8. Leerlo como UTF-8 corrompe
 *     todos los acentos ("Ninos heroes" aparece con caracteres de reemplazo).
 *   - Al menos una fila trae comas dentro del nombre, entrecomillado:
 *       334,"(GDL-261)C. Jarauta, Javier Mina",...
 *     Un split(',') ingenuo la parte mal.
 *   - 39 estaciones tienen dpcapacity = 0: son bajas del sistema.
 *     Solo 14 de ellas lo declaran en el nombre con prefijo "Ex-"/"ex(".
 *     La capacidad es la senal confiable; el nombre no lo es.
 *   - Zonas presentes: GDL, ZPN, TLQ. No existe "ZAP" ni "TON".
 *   - Nombres con espacios dobles y a veces sin espacio tras el parentesis.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ArchivoEstaciones, Estacion, Zona } from '../src/dominio/tipos';

const RAIZ = resolve(import.meta.dirname, '..');
const ENTRADA = resolve(RAIZ, 'data/nomenclatura_2026_07.csv');
const SALIDA = resolve(RAIZ, 'data/estaciones.json');

const ZONAS_VALIDAS = new Set<string>(['GDL', 'ZPN', 'TLQ']);

/** Parser CSV minimo que respeta comillas dobles y comas internas. */
function partirLineaCsv(linea: string): string[] {
  const campos: string[] = [];
  let actual = '';
  let enComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const caracter = linea[i]!;

    if (enComillas) {
      if (caracter === '"') {
        if (linea[i + 1] === '"') {
          actual += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        actual += caracter;
      }
    } else if (caracter === '"') {
      enComillas = true;
    } else if (caracter === ',') {
      campos.push(actual);
      actual = '';
    } else {
      actual += caracter;
    }
  }

  campos.push(actual);
  return campos;
}

/**
 * Separa "(GDL-261)C. Jarauta, Javier Mina" en codigo y nombre legible.
 * Devuelve null si la fila no trae un codigo de zona valido, lo que en la
 * practica solo ocurre en estaciones dadas de baja.
 */
function extraerCodigo(bruto: string): { codigo: string; zona: Zona; nombre: string } | null {
  const limpio = bruto.replace(/\s+/g, ' ').trim();
  const coincidencia = limpio.match(/^\(?\s*(?:ex)?\s*\(?\s*([A-Z]{3})\s*-\s*(\d+)\s*\)?\s*(.*)$/i);

  if (!coincidencia) return null;

  const zonaBruta = coincidencia[1]!.toUpperCase();
  if (!ZONAS_VALIDAS.has(zonaBruta)) return null;

  const numero = coincidencia[2]!.padStart(3, '0');
  const nombre = coincidencia[3]!.replace(/^[)\s]+/, '').replace(/\s+/g, ' ').trim();

  return { codigo: `${zonaBruta}-${numero}`, zona: zonaBruta as Zona, nombre };
}

function main(): void {
  // Windows-1252: decodificarlo como UTF-8 rompe todos los acentos.
  const crudo = new TextDecoder('windows-1252').decode(readFileSync(ENTRADA));
  const lineas = crudo.split(/\r?\n/).filter((l) => l.trim() !== '');

  const encabezado = partirLineaCsv(lineas[0]!);
  const esperado = ['id', 'name', 'latitude', 'longitude', 'dpcapacity'];
  if (encabezado.join(',') !== esperado.join(',')) {
    throw new Error(
      `El encabezado del CSV cambio.\n  esperado: ${esperado.join(',')}\n  recibido: ${encabezado.join(',')}`,
    );
  }

  const estaciones: Estacion[] = [];
  const descartadas: string[] = [];

  for (const linea of lineas.slice(1)) {
    const campos = partirLineaCsv(linea);
    if (campos.length !== 5) {
      descartadas.push(`campos=${campos.length}: ${linea}`);
      continue;
    }

    const [idBruto, nombreBruto, latBruta, lonBruta, capacidadBruta] = campos as [
      string, string, string, string, string,
    ];

    const id = Number.parseInt(idBruto, 10);
    const lat = Number.parseFloat(latBruta);
    const lon = Number.parseFloat(lonBruta);
    const anclajes = Number.parseInt(capacidadBruta, 10);

    if (!Number.isFinite(id) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      descartadas.push(`numeros invalidos: ${linea}`);
      continue;
    }

    // Senal autoritativa de baja del sistema.
    if (!Number.isFinite(anclajes) || anclajes <= 0) {
      descartadas.push(`sin anclajes (baja): ${nombreBruto}`);
      continue;
    }

    // Sanidad geografica: el AMG cabe holgadamente en esta caja.
    if (lat < 20.5 || lat > 20.9 || lon < -103.6 || lon > -103.1) {
      descartadas.push(`fuera del AMG: ${nombreBruto} (${lat}, ${lon})`);
      continue;
    }

    const codigo = extraerCodigo(nombreBruto);
    if (!codigo) {
      descartadas.push(`sin codigo de zona: ${nombreBruto}`);
      continue;
    }

    estaciones.push({
      id,
      nombre: codigo.nombre,
      codigo: codigo.codigo,
      zona: codigo.zona,
      lat,
      lon,
      anclajes,
    });
  }

  estaciones.sort((a, b) => a.codigo.localeCompare(b.codigo));

  const duplicados = new Set<number>();
  const vistos = new Set<number>();
  for (const e of estaciones) {
    if (vistos.has(e.id)) duplicados.add(e.id);
    vistos.add(e.id);
  }
  if (duplicados.size > 0) {
    throw new Error(`Ids de estacion duplicados: ${[...duplicados].join(', ')}`);
  }

  const archivo: ArchivoEstaciones = {
    generadoEn: new Date().toISOString(),
    fuente: 'nomenclatura_2026_07.csv',
    total: estaciones.length,
    descartadas: descartadas.length,
    estaciones,
  };

  writeFileSync(SALIDA, JSON.stringify(archivo, null, 2), 'utf8');

  const porZona = new Map<string, number>();
  for (const e of estaciones) porZona.set(e.zona, (porZona.get(e.zona) ?? 0) + 1);

  console.log(`Leidas      ${lineas.length - 1} filas de ${ENTRADA}`);
  console.log(`Activas     ${estaciones.length}`);
  console.log(`Descartadas ${descartadas.length}`);
  for (const [zona, n] of [...porZona].sort()) console.log(`  ${zona}  ${n}`);
  console.log(`\nEscrito     ${SALIDA}`);
  console.log(`\nMuestra:`);
  for (const e of estaciones.slice(0, 3)) {
    console.log(`  ${e.codigo}  ${e.nombre}  (${e.lat}, ${e.lon})  ${e.anclajes} anclajes`);
  }
}

main();
