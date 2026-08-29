/** Zonas realmente presentes en la nomenclatura de MiBici (verificado en datos). */
export type Zona = 'GDL' | 'ZPN' | 'TLQ';

export type LatLng = { lat: number; lon: number };

export type Estacion = LatLng & {
  id: number;
  /** Nombre ya normalizado, sin el codigo entre parentesis. */
  nombre: string;
  /** Codigo oficial, p. ej. "GDL-001". */
  codigo: string;
  zona: Zona;
  /** dpcapacity: numero de anclajes. Siempre > 0 en estaciones activas. */
  anclajes: number;
};

export type ArchivoEstaciones = {
  generadoEn: string;
  fuente: string;
  total: number;
  descartadas: number;
  estaciones: Estacion[];
};

/**
 * Arista de bicicleta ya filtrada por la ventana efectiva.
 * Forma compacta [idDestino, duracionSeg, distanciaM] para que
 * grafo.json quepa holgadamente en el cliente.
 */
export type AristaCompacta = [destino: number, duracionSeg: number, distanciaM: number];

export type ArchivoGrafo = {
  generadoEn: string;
  parametros: {
    perfil: string;
    ventanaEfectivaMin: number;
    radioPrefiltroM: number;
    /** true si se genero sin ORS, con estimacion geodesica. */
    modoRespaldo: boolean;
  };
  totalNodos: number;
  totalAristas: number;
  /** Lista de adyacencia: id de estacion -> aristas salientes. */
  aristas: Record<string, AristaCompacta[]>;
};

/** Un extremo del viaje: puede ser un punto suelto del mapa o una estacion. */
export type Punto = LatLng & { etiqueta: string };

export type TramoCaminata = {
  modo: 'caminata';
  desde: Punto;
  hasta: Punto;
  distanciaM: number;
  duracionSeg: number;
  geometria: LatLng[];
  /** true si la geometria es una linea recta por falta de ORS. */
  geometriaAproximada: boolean;
};

export type TramoBicicleta = {
  modo: 'bicicleta';
  desde: Estacion;
  hasta: Estacion;
  distanciaM: number;
  duracionSeg: number;
  geometria: LatLng[];
  geometriaAproximada: boolean;
  /** Minutos que sobran frente a la ventana gratuita. Siempre > 0. */
  margenMin: number;
  /** Plan B si el usuario llega y no hay anclaje libre. */
  alternativaCercana?: Estacion;
};

export type Tramo = TramoCaminata | TramoBicicleta;

export type TotalesItinerario = {
  duracionSeg: number;
  distanciaM: number;
  distanciaCaminataM: number;
  distanciaBiciM: number;
  duracionCaminataSeg: number;
  duracionBiciSeg: number;
  /** Re-anclajes intermedios: tramos de bici menos uno. */
  numeroParadas: number;
};

export type Itinerario = {
  tramos: Tramo[];
  totales: TotalesItinerario;
};

export type MotivoFallo =
  | 'origen-fuera-de-cobertura'
  | 'destino-fuera-de-cobertura'
  | 'sin-camino';

export type ResultadoPlaneacion =
  | { ok: true; itinerario: Itinerario }
  | { ok: false; motivo: MotivoFallo; detalle: string; estacionMasCercana?: Estacion };
