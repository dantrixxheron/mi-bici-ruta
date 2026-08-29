import { usarTienda } from '../estado/tienda';
import { hayLlave } from '../servicios/ors';
import { distancia, minutos } from '../util/formato';
import { TarjetaTramo } from './TarjetaTramo';

function Aviso({ tono, children }: { tono: 'ambar' | 'rojo' | 'azul'; children: React.ReactNode }) {
  const clases = {
    ambar: 'border-amber-300 bg-amber-50 text-amber-900',
    rojo: 'border-red-300 bg-red-50 text-red-900',
    azul: 'border-sky-300 bg-sky-50 text-sky-900',
  }[tono];

  return <div className={`rounded-lg border px-3 py-2 text-sm ${clases}`}>{children}</div>;
}

export function PanelItinerario() {
  const resultado = usarTienda((e) => e.resultado);
  const origen = usarTienda((e) => e.origen);
  const destino = usarTienda((e) => e.destino);
  const cargaGrafo = usarTienda((e) => e.cargaGrafo);
  const refinando = usarTienda((e) => e.refinando);

  if (!origen || !destino) {
    return (
      <div className="px-4 py-6 text-center text-sm text-slate-500">
        <p className="font-medium text-slate-700">
          {!origen ? 'Toca el mapa para marcar dónde empiezas' : 'Ahora toca tu destino'}
        </p>
        <p className="mt-1">
          MiRuta parte la ruta en tramos para que ninguno pase de 30 minutos.
        </p>
      </div>
    );
  }

  if (cargaGrafo === 'cargando') {
    return (
      <div className="px-4 py-6 text-center text-sm text-slate-500">
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 align-middle" />
        <span className="ml-2 align-middle">Cargando la red de estaciones…</span>
      </div>
    );
  }

  if (cargaGrafo === 'error') {
    return (
      <div className="p-4">
        <Aviso tono="rojo">No pude cargar la red de rutas. Recarga la página.</Aviso>
      </div>
    );
  }

  if (!resultado) return null;

  if (!resultado.ok) {
    return (
      <div className="space-y-2 p-4">
        <Aviso tono="ambar">
          <p className="font-semibold">No hay ruta posible</p>
          <p className="mt-1">{resultado.detalle}</p>
        </Aviso>
        {resultado.estacionMasCercana && (
          <p className="text-xs text-slate-500">
            Mueve el punto más cerca de {resultado.estacionMasCercana.codigo}{' '}
            {resultado.estacionMasCercana.nombre}.
          </p>
        )}
      </div>
    );
  }

  const { tramos, totales } = resultado.itinerario;
  const ultimoBici = tramos.map((t) => t.modo).lastIndexOf('bicicleta');
  const hayExcedido = tramos.some((t) => t.modo === 'bicicleta' && t.margenMin <= 0);

  return (
    <div className="px-4 pb-6">
      <div className="sticky top-0 -mx-4 border-b border-slate-200 bg-white px-4 pb-3 pt-1">
        <p className="text-2xl font-bold tracking-tight text-slate-900">
          {minutos(totales.duracionSeg)}
          <span className="ml-2 text-base font-normal text-slate-500">
            {distancia(totales.distanciaM)}
          </span>
        </p>

        {/* Caminar cuenta: el desglose va arriba, no escondido en el detalle. */}
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
          <span>
            🚲 {distancia(totales.distanciaBiciM)} · {minutos(totales.duracionBiciSeg)}
          </span>
          <span>
            🚶 {distancia(totales.distanciaCaminataM)} · {minutos(totales.duracionCaminataSeg)}
          </span>
          <span className="font-medium text-amber-800">
            ⚓ {totales.numeroParadas}{' '}
            {totales.numeroParadas === 1 ? 'parada' : 'paradas'}
          </span>
        </p>

        {refinando && (
          <p className="mt-1 text-xs text-slate-400">Afinando con rutas reales de calle…</p>
        )}
      </div>

      <div className="space-y-2 pt-3">
        {hayExcedido && (
          <Aviso tono="rojo">
            Un tramo excede los 30 minutos con los tiempos reales de calle. Considera una parada
            intermedia adicional.
          </Aviso>
        )}

        {!hayLlave() && (
          <Aviso tono="azul">
            Tiempos estimados por distancia geodésica. Añade tu llave de OpenRouteService para
            obtener tiempos de calle reales.
          </Aviso>
        )}
      </div>

      <ol className="divide-y divide-slate-100">
        {tramos.map((tramo, i) => (
          <TarjetaTramo key={i} tramo={tramo} esUltimoDeBici={i === ultimoBici} />
        ))}
      </ol>
    </div>
  );
}
