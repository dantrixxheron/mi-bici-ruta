import { useState } from 'react';
import { usarTienda } from '../estado/tienda';
import { CampoBusqueda } from './CampoBusqueda';

export function SelectorPuntos() {
  const origen = usarTienda((e) => e.origen);
  const destino = usarTienda((e) => e.destino);
  const elegir = usarTienda((e) => e.elegir);
  const fijarPunto = usarTienda((e) => e.fijarPunto);
  const intercambiar = usarTienda((e) => e.intercambiar);
  const limpiar = usarTienda((e) => e.limpiar);

  const [ubicando, setUbicando] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState<string | null>(null);

  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      setErrorUbicacion('Tu navegador no permite geolocalización.');
      return;
    }

    setUbicando(true);
    setErrorUbicacion(null);

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        setUbicando(false);
        elegir('origen');
        fijarPunto({
          lat: posicion.coords.latitude,
          lon: posicion.coords.longitude,
          etiqueta: 'Mi ubicación',
        });
      },
      (error) => {
        setUbicando(false);
        setErrorUbicacion(
          error.code === error.PERMISSION_DENIED
            ? 'Permiso de ubicación denegado. Toca el mapa para marcar tu origen.'
            : 'No pude obtener tu ubicación. Toca el mapa para marcar tu origen.',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <CampoBusqueda que="origen" marcador="¿Dónde empiezas? Escribe o toca el mapa" />
          <CampoBusqueda que="destino" marcador="¿A dónde vas?" />
        </div>

        <button
          type="button"
          onClick={intercambiar}
          disabled={!origen || !destino}
          title="Intercambiar origen y destino"
          className="mt-4 rounded-lg border border-slate-300 bg-white p-2 text-slate-600 transition hover:border-slate-400 disabled:opacity-40"
        >
          <span aria-hidden>⇅</span>
          <span className="sr-only">Intercambiar</span>
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={usarMiUbicacion}
          disabled={ubicando}
          className="flex-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60"
        >
          {ubicando ? 'Ubicando…' : '◎ Usar mi ubicación'}
        </button>

        {(origen ?? destino) && (
          <button
            type="button"
            onClick={limpiar}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 transition hover:border-slate-400"
          >
            Limpiar
          </button>
        )}
      </div>

      {errorUbicacion && <p className="text-xs text-amber-800">{errorUbicacion}</p>}
    </div>
  );
}
