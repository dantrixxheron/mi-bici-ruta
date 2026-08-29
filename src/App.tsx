import { useEffect } from 'react';
import { Mapa } from './componentes/Mapa';
import { PanelItinerario } from './componentes/PanelItinerario';
import { SelectorPuntos } from './componentes/SelectorPuntos';
import { usarTienda } from './estado/tienda';

function Encabezado() {
  const cargaGrafo = usarTienda((e) => e.cargaGrafo);
  const estaciones = usarTienda((e) => e.estaciones);

  return (
    <header className="flex items-baseline gap-2 border-b border-slate-200 bg-white px-4 py-2">
      <h1 className="text-lg font-bold tracking-tight text-emerald-800">MiRuta</h1>
      <p className="truncate text-xs text-slate-500">
        {estaciones.length > 0 ? `${estaciones.length} estaciones MiBici` : 'Cargando…'}
      </p>
      {cargaGrafo === 'cargando' && (
        <span className="ml-auto shrink-0 text-xs text-slate-400">preparando rutas…</span>
      )}
    </header>
  );
}

export default function App() {
  const iniciar = usarTienda((e) => e.iniciar);
  const cargaEstaciones = usarTienda((e) => e.cargaEstaciones);
  const errorCarga = usarTienda((e) => e.errorCarga);

  useEffect(() => {
    void iniciar();
  }, [iniciar]);

  if (cargaEstaciones === 'error') {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold text-red-800">No pude cargar los datos</p>
          <p className="mt-2 max-w-sm text-sm text-slate-600">{errorCarga}</p>
          <p className="mt-4 text-xs text-slate-500">
            ¿Generaste los datos? Corre <code className="rounded bg-slate-100 px-1">npm run datos</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col md:flex-row-reverse">
      {/* Mapa: ocupa todo en escritorio, la mitad superior en movil. */}
      <div className="relative min-h-0 flex-1">
        <Mapa />
      </div>

      {/* Panel: columna lateral en escritorio, hoja inferior en movil. */}
      <aside className="flex max-h-[55%] shrink-0 flex-col border-t border-slate-200 bg-white md:max-h-none md:h-full md:w-[380px] md:border-r md:border-t-0">
        <Encabezado />

        <div className="border-b border-slate-200 p-3">
          <SelectorPuntos />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <PanelItinerario />
        </div>
      </aside>
    </div>
  );
}
