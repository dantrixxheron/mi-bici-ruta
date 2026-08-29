import { create } from 'zustand';
import { prepararContexto, planificar, type ContextoPlaneacion } from '../dominio/planificador';
import { refinarConOrs, hayLlave } from '../servicios/ors';
import type {
  ArchivoEstaciones,
  ArchivoGrafo,
  Estacion,
  Punto,
  ResultadoPlaneacion,
} from '../dominio/tipos';

export type EstadoCarga = 'inicial' | 'cargando' | 'listo' | 'error';
export type QueSeElige = 'origen' | 'destino';

type Tienda = {
  estaciones: Estacion[];
  contexto: ContextoPlaneacion | null;

  /**
   * Dos cargas separadas a proposito. estaciones.json pesa 40 KB y permite
   * pintar el mapa de inmediato; grafo.json pesa 1.4 MB y solo hace falta
   * cuando el usuario ya eligio origen y destino, cosa que le toma varios
   * segundos. Bloquear el primer render con el grafo seria regalar esos
   * segundos por nada.
   */
  cargaEstaciones: EstadoCarga;
  cargaGrafo: EstadoCarga;
  errorCarga: string | null;

  origen: Punto | null;
  destino: Punto | null;
  queSeElige: QueSeElige;

  resultado: ResultadoPlaneacion | null;
  refinando: boolean;

  iniciar: () => Promise<void>;
  fijarPunto: (punto: Punto) => void;
  elegir: (que: QueSeElige) => void;
  intercambiar: () => void;
  limpiar: () => void;
};

async function traerJson<T>(url: string): Promise<T> {
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error(`${url} respondio ${respuesta.status}`);
  return (await respuesta.json()) as T;
}

export const usarTienda = create<Tienda>((set, get) => {
  /** Cancela el refinado en curso si el usuario cambia la ruta antes de que llegue. */
  let refinadoEnCurso: AbortController | null = null;

  function replanificar(): void {
    const { contexto, origen, destino } = get();
    if (!contexto || !origen || !destino) {
      set({ resultado: null });
      return;
    }

    const resultado = planificar(contexto, origen, destino);
    set({ resultado });

    refinadoEnCurso?.abort();
    refinadoEnCurso = null;

    if (!resultado.ok || !hayLlave()) return;

    const control = new AbortController();
    refinadoEnCurso = control;
    set({ refinando: true });

    void refinarConOrs(resultado.itinerario, control.signal)
      .then((refinado) => {
        if (control.signal.aborted) return;
        set({ resultado: { ok: true, itinerario: refinado }, refinando: false });
      })
      .catch(() => {
        if (!control.signal.aborted) set({ refinando: false });
      });
  }

  return {
    estaciones: [],
    contexto: null,
    cargaEstaciones: 'inicial',
    cargaGrafo: 'inicial',
    errorCarga: null,
    origen: null,
    destino: null,
    queSeElige: 'origen',
    resultado: null,
    refinando: false,

    async iniciar() {
      if (get().cargaEstaciones !== 'inicial') return;

      set({ cargaEstaciones: 'cargando' });
      let estaciones: Estacion[];

      try {
        const archivo = await traerJson<ArchivoEstaciones>('/datos/estaciones.json');
        estaciones = archivo.estaciones;
        set({ estaciones, cargaEstaciones: 'listo' });
      } catch (e) {
        set({
          cargaEstaciones: 'error',
          errorCarga: `No pude cargar el catalogo de estaciones. ${e instanceof Error ? e.message : ''}`,
        });
        return;
      }

      // El mapa ya se puede usar; el grafo baja detras.
      set({ cargaGrafo: 'cargando' });
      try {
        const grafo = await traerJson<ArchivoGrafo>('/datos/grafo.json');
        set({ contexto: prepararContexto(estaciones, grafo), cargaGrafo: 'listo' });
        replanificar();
      } catch (e) {
        set({
          cargaGrafo: 'error',
          errorCarga: `No pude cargar la red de rutas. ${e instanceof Error ? e.message : ''}`,
        });
      }
    },

    fijarPunto(punto) {
      const { queSeElige } = get();
      if (queSeElige === 'origen') {
        set({ origen: punto, queSeElige: 'destino' });
      } else {
        set({ destino: punto, queSeElige: 'origen' });
      }
      replanificar();
    },

    elegir(que) {
      set({ queSeElige: que });
    },

    intercambiar() {
      const { origen, destino } = get();
      set({ origen: destino, destino: origen });
      replanificar();
    },

    limpiar() {
      refinadoEnCurso?.abort();
      refinadoEnCurso = null;
      set({
        origen: null,
        destino: null,
        resultado: null,
        queSeElige: 'origen',
        refinando: false,
      });
    },
  };
});
