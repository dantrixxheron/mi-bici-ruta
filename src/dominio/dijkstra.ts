export type ModoTramo = 'caminata' | 'bicicleta';

export type Arista = {
  hacia: number;
  /** Costo de la arista en segundos, incluida la penalizacion de anclaje. */
  costoSeg: number;
  /** Tiempo de desplazamiento puro, sin penalizacion. Es lo que se muestra. */
  duracionSeg: number;
  distanciaM: number;
  modo: ModoTramo;
};

export type ListaAdyacencia = Map<number, Arista[]>;

/** Min-heap binario sobre pares (costo, nodo). */
class ColaPrioridad {
  private costos: number[] = [];
  private nodos: number[] = [];

  get vacia(): boolean {
    return this.nodos.length === 0;
  }

  insertar(costo: number, nodo: number): void {
    this.costos.push(costo);
    this.nodos.push(nodo);
    this.subir(this.nodos.length - 1);
  }

  extraerMinimo(): { costo: number; nodo: number } {
    const costo = this.costos[0]!;
    const nodo = this.nodos[0]!;
    const ultimoCosto = this.costos.pop()!;
    const ultimoNodo = this.nodos.pop()!;

    if (this.nodos.length > 0) {
      this.costos[0] = ultimoCosto;
      this.nodos[0] = ultimoNodo;
      this.bajar(0);
    }

    return { costo, nodo };
  }

  private subir(indice: number): void {
    let i = indice;
    while (i > 0) {
      const padre = (i - 1) >> 1;
      if (this.costos[padre]! <= this.costos[i]!) break;
      this.intercambiar(i, padre);
      i = padre;
    }
  }

  private bajar(indice: number): void {
    let i = indice;
    const n = this.nodos.length;

    for (;;) {
      const izq = 2 * i + 1;
      const der = izq + 1;
      let menor = i;

      if (izq < n && this.costos[izq]! < this.costos[menor]!) menor = izq;
      if (der < n && this.costos[der]! < this.costos[menor]!) menor = der;
      if (menor === i) break;

      this.intercambiar(i, menor);
      i = menor;
    }
  }

  private intercambiar(a: number, b: number): void {
    const c = this.costos[a]!;
    this.costos[a] = this.costos[b]!;
    this.costos[b] = c;

    const n = this.nodos[a]!;
    this.nodos[a] = this.nodos[b]!;
    this.nodos[b] = n;
  }
}

export type CaminoMinimo = {
  costoSeg: number;
  /** Aristas en orden desde el inicio hasta el fin. */
  aristas: Arista[];
  /** Nodos visitados, incluidos inicio y fin. */
  nodos: number[];
};

/**
 * Dijkstra con descarte perezoso de entradas obsoletas: en lugar de
 * disminuir la clave, se insertan duplicados y se ignoran al extraerlos.
 * Con ~450 nodos y ~15k aristas el costo extra es irrelevante y el codigo
 * queda mucho mas corto.
 */
export function caminoMinimo(
  adyacencia: ListaAdyacencia,
  inicio: number,
  fin: number,
): CaminoMinimo | null {
  const distancia = new Map<number, number>([[inicio, 0]]);
  const anterior = new Map<number, { nodo: number; arista: Arista }>();
  const cerrados = new Set<number>();
  const cola = new ColaPrioridad();

  cola.insertar(0, inicio);

  while (!cola.vacia) {
    const { costo, nodo } = cola.extraerMinimo();

    if (cerrados.has(nodo)) continue;
    cerrados.add(nodo);

    if (nodo === fin) break;

    for (const arista of adyacencia.get(nodo) ?? []) {
      if (cerrados.has(arista.hacia)) continue;

      const nuevoCosto = costo + arista.costoSeg;
      const costoConocido = distancia.get(arista.hacia);

      if (costoConocido === undefined || nuevoCosto < costoConocido) {
        distancia.set(arista.hacia, nuevoCosto);
        anterior.set(arista.hacia, { nodo, arista });
        cola.insertar(nuevoCosto, arista.hacia);
      }
    }
  }

  const costoFinal = distancia.get(fin);
  if (costoFinal === undefined || !cerrados.has(fin)) return null;

  const aristas: Arista[] = [];
  const nodos: number[] = [fin];

  let actual = fin;
  while (actual !== inicio) {
    const paso = anterior.get(actual);
    if (!paso) return null; // inalcanzable; no deberia ocurrir si cerrados lo contiene
    aristas.push(paso.arista);
    nodos.push(paso.nodo);
    actual = paso.nodo;
  }

  aristas.reverse();
  nodos.reverse();

  return { costoSeg: costoFinal, aristas, nodos };
}
