import { useEffect, useId, useRef, useState } from 'react';
import { usarTienda, type QueSeElige } from '../estado/tienda';
import {
  buscarEstaciones,
  buscarLugares,
  comoPunto,
  type Sugerencia,
} from '../servicios/geocodificacion';

const ESPERA_MS = 300;

export function CampoBusqueda({
  que,
  marcador,
}: {
  que: QueSeElige;
  marcador: string;
}) {
  const estaciones = usarTienda((e) => e.estaciones);
  const punto = usarTienda((e) => (que === 'origen' ? e.origen : e.destino));
  const queSeElige = usarTienda((e) => e.queSeElige);
  const elegir = usarTienda((e) => e.elegir);
  const fijarPuntoEn = usarTienda((e) => e.fijarPuntoEn);

  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState(false);
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [resaltada, setResaltada] = useState(0);
  const [buscando, setBuscando] = useState(false);

  const idLista = useId();
  const contenedor = useRef<HTMLDivElement>(null);

  // Cuando el punto llega de otra via (clic en el mapa, geolocalizacion,
  // intercambio), el campo refleja esa etiqueta en vez de lo que se tecleo.
  useEffect(() => {
    if (!editando) setTexto(punto?.etiqueta ?? '');
  }, [punto, editando]);

  // Estaciones al instante; Photon con espera para no disparar una
  // peticion por cada tecla.
  useEffect(() => {
    if (!editando || texto.trim().length < 2) {
      setSugerencias([]);
      return;
    }

    const locales = buscarEstaciones(texto, estaciones);
    setSugerencias(locales);
    setResaltada(0);

    if (texto.trim().length < 3) return;

    const control = new AbortController();
    setBuscando(true);

    const temporizador = setTimeout(() => {
      void buscarLugares(texto, control.signal).then((remotas) => {
        if (control.signal.aborted) return;
        setBuscando(false);
        const clavesLocales = new Set(locales.map((s) => s.clave));
        setSugerencias([...locales, ...remotas.filter((s) => !clavesLocales.has(s.clave))]);
      });
    }, ESPERA_MS);

    return () => {
      clearTimeout(temporizador);
      control.abort();
      setBuscando(false);
    };
  }, [texto, editando, estaciones]);

  // Cerrar al tocar fuera.
  useEffect(() => {
    if (!editando) return;

    const alTocarFuera = (evento: MouseEvent) => {
      if (!contenedor.current?.contains(evento.target as Node)) {
        setEditando(false);
        setSugerencias([]);
      }
    };

    document.addEventListener('mousedown', alTocarFuera);
    return () => document.removeEventListener('mousedown', alTocarFuera);
  }, [editando]);

  function seleccionar(sugerencia: Sugerencia) {
    fijarPuntoEn(que, comoPunto(sugerencia));
    setTexto(sugerencia.etiqueta);
    setEditando(false);
    setSugerencias([]);
  }

  function alTeclear(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (sugerencias.length === 0) {
      if (evento.key === 'Escape') setEditando(false);
      return;
    }

    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setResaltada((i) => (i + 1) % sugerencias.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setResaltada((i) => (i - 1 + sugerencias.length) % sugerencias.length);
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      const elegida = sugerencias[resaltada];
      if (elegida) seleccionar(elegida);
    } else if (evento.key === 'Escape') {
      setEditando(false);
      setSugerencias([]);
    }
  }

  const activo = queSeElige === que;
  const abierta = editando && sugerencias.length > 0;

  return (
    <div ref={contenedor} className="relative">
      <div
        className={`flex items-center gap-2 rounded-lg border px-3 transition ${
          activo && !editando
            ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
            : 'border-slate-300 bg-white focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-200'
        }`}
      >
        <span
          className={`inline-block size-2.5 shrink-0 rounded-full ${
            que === 'origen' ? 'bg-teal-700' : 'bg-red-700'
          }`}
          aria-hidden
        />

        <input
          type="text"
          value={texto}
          placeholder={marcador}
          onChange={(e) => {
            setTexto(e.target.value);
            setEditando(true);
          }}
          onFocus={() => {
            elegir(que);
            setEditando(true);
          }}
          onKeyDown={alTeclear}
          role="combobox"
          aria-expanded={abierta}
          aria-controls={idLista}
          aria-autocomplete="list"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-slate-400"
        />

        {buscando && (
          <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
        )}

        {texto && !buscando && (
          <button
            type="button"
            onClick={() => {
              setTexto('');
              setEditando(true);
              setSugerencias([]);
            }}
            className="shrink-0 text-slate-400 hover:text-slate-600"
            aria-label="Borrar"
          >
            ×
          </button>
        )}
      </div>

      {abierta && (
        <ul
          id={idLista}
          role="listbox"
          className="absolute inset-x-0 top-full z-1000 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {sugerencias.map((sugerencia, i) => (
            <li key={sugerencia.clave} role="option" aria-selected={i === resaltada}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => seleccionar(sugerencia)}
                onMouseEnter={() => setResaltada(i)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left ${
                  i === resaltada ? 'bg-emerald-50' : 'hover:bg-slate-50'
                }`}
              >
                <span className="mt-0.5 shrink-0 text-xs" aria-hidden>
                  {sugerencia.tipo === 'estacion' ? '🚲' : '📍'}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-800">
                    {sugerencia.etiqueta}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {sugerencia.detalle}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editando && texto.trim().length >= 3 && sugerencias.length === 0 && !buscando && (
        <div className="absolute inset-x-0 top-full z-1000 mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-lg">
          Sin resultados. También puedes tocar el mapa.
        </div>
      )}
    </div>
  );
}
