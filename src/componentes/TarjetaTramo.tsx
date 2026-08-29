import { VENTANA_GRATUITA_MIN } from '../dominio/constantes';
import { distancia, minutos } from '../util/formato';
import type { Estacion, Tramo } from '../dominio/tipos';

function Caminata({ tramo }: { tramo: Extract<Tramo, { modo: 'caminata' }> }) {
  return (
    <li className="flex gap-3 py-3">
      <span className="mt-0.5 text-lg leading-none" aria-hidden>
        🚶
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800">
          Camina {distancia(tramo.distanciaM)} · {minutos(tramo.duracionSeg)}
        </p>
        <p className="truncate text-sm text-slate-500">hasta {tramo.hasta.etiqueta}</p>
      </div>
    </li>
  );
}

function Bicicleta({ tramo }: { tramo: Extract<Tramo, { modo: 'bicicleta' }> }) {
  const excedido = tramo.margenMin <= 0;

  return (
    <li className="flex gap-3 py-3">
      <span className="mt-0.5 text-lg leading-none" aria-hidden>
        🚲
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800">
          Pedalea {distancia(tramo.distanciaM)} · {minutos(tramo.duracionSeg)}
        </p>
        <p className="truncate text-sm text-slate-500">
          {tramo.desde.codigo} → {tramo.hasta.codigo} {tramo.hasta.nombre}
        </p>

        {/* La prueba visible de la promesa del producto. */}
        <p
          className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
            excedido ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {excedido
            ? `Excede la ventana por ${Math.abs(tramo.margenMin).toFixed(1)} min`
            : `${tramo.margenMin.toFixed(1)} min de margen sobre los ${VENTANA_GRATUITA_MIN}`}
        </p>
      </div>
    </li>
  );
}

function Parada({ estacion, alternativa }: { estacion: Estacion; alternativa?: Estacion }) {
  return (
    <li className="my-1 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <span aria-hidden>⚓</span> Ancla aquí y toma otra bici
      </p>
      <p className="mt-1 text-sm text-amber-900/80">
        {estacion.codigo} {estacion.nombre} · {estacion.anclajes} anclajes
      </p>
      <p className="mt-1 text-xs text-amber-900/70">
        Esto reinicia tu ventana gratuita de {VENTANA_GRATUITA_MIN} minutos.
      </p>
      {alternativa && (
        <p className="mt-1 text-xs text-amber-900/70">
          Si no hay lugar: {alternativa.codigo} {alternativa.nombre}
        </p>
      )}
    </li>
  );
}

export function TarjetaTramo({ tramo, esUltimoDeBici }: { tramo: Tramo; esUltimoDeBici: boolean }) {
  if (tramo.modo === 'caminata') return <Caminata tramo={tramo} />;

  return (
    <>
      <Bicicleta tramo={tramo} />
      {!esUltimoDeBici && (
        <Parada estacion={tramo.hasta} {...(tramo.alternativaCercana ? { alternativa: tramo.alternativaCercana } : {})} />
      )}
    </>
  );
}
