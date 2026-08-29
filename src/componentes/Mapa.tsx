import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { usarTienda } from '../estado/tienda';
import { distancia, minutos } from '../util/formato';
import type { Estacion, Itinerario, LatLng } from '../dominio/tipos';

const CENTRO_GDL: [number, number] = [20.6767, -103.3475];

const COLOR_BICI = '#047857';
const COLOR_BICI_EXCEDIDO = '#b91c1c';
const COLOR_PIE = '#475569';
const COLOR_ESTACION = '#94a3b8';

const comoTupla = (p: LatLng): [number, number] => [p.lat, p.lon];

const chincheta = (clase: string, texto: string) =>
  L.divIcon({
    html: `<div class="pin ${clase}">${texto}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

const ICONO_ORIGEN = chincheta('pin-origen', 'A');
const ICONO_DESTINO = chincheta('pin-destino', 'B');

function CapturarClics(): null {
  const fijarPunto = usarTienda((e) => e.fijarPunto);
  const queSeElige = usarTienda((e) => e.queSeElige);

  useMapEvents({
    click(evento) {
      fijarPunto({
        lat: evento.latlng.lat,
        lon: evento.latlng.lng,
        etiqueta: queSeElige === 'origen' ? 'Punto de partida' : 'Destino',
      });
    },
  });

  return null;
}

/** Encuadra el mapa sobre la ruta cada vez que cambia. */
function EncuadrarRuta({ itinerario }: { itinerario: Itinerario | null }): null {
  const mapa = useMap();

  useEffect(() => {
    if (!itinerario) return;

    const puntos = itinerario.tramos.flatMap((t) => t.geometria.map(comoTupla));
    if (puntos.length < 2) return;

    mapa.fitBounds(L.latLngBounds(puntos), {
      paddingTopLeft: [40, 90],
      // Deja aire abajo para que la hoja deslizable no tape el final de la ruta.
      paddingBottomRight: [40, 260],
      maxZoom: 16,
    });
  }, [itinerario, mapa]);

  return null;
}

function Estaciones({ estaciones }: { estaciones: Estacion[] }) {
  return (
    <>
      {estaciones.map((estacion) => (
        <CircleMarker
          key={estacion.id}
          center={comoTupla(estacion)}
          radius={3}
          pathOptions={{ color: COLOR_ESTACION, weight: 1, fillOpacity: 0.7 }}
        >
          <Tooltip direction="top">
            <span className="font-semibold">{estacion.codigo}</span> {estacion.nombre}
            <br />
            {estacion.anclajes} anclajes
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

function Ruta({ itinerario }: { itinerario: Itinerario }) {
  // Una parada es el final de todo tramo de bici salvo el ultimo.
  const paradas = useMemo(() => {
    const tramosBici = itinerario.tramos.filter((t) => t.modo === 'bicicleta');
    return tramosBici.slice(0, -1).map((t) => t.hasta);
  }, [itinerario]);

  return (
    <>
      {itinerario.tramos.map((tramo, i) => (
        <Polyline
          key={i}
          positions={tramo.geometria.map(comoTupla)}
          pathOptions={
            tramo.modo === 'caminata'
              ? { color: COLOR_PIE, weight: 4, dashArray: '1 7', lineCap: 'round', opacity: 0.9 }
              : {
                  color: tramo.margenMin <= 0 ? COLOR_BICI_EXCEDIDO : COLOR_BICI,
                  weight: 6,
                  opacity: 0.9,
                }
          }
        >
          <Tooltip sticky>
            {tramo.modo === 'caminata' ? 'A pie' : 'En bici'} · {distancia(tramo.distanciaM)} ·{' '}
            {minutos(tramo.duracionSeg)}
          </Tooltip>
        </Polyline>
      ))}

      {paradas.map((parada) => (
        <Marker
          key={`parada-${parada.id}`}
          position={comoTupla(parada)}
          icon={chincheta('pin-parada', '&#9875;')}
        >
          <Tooltip direction="top" offset={[0, -14]}>
            <span className="font-semibold">Re-ancla aqui</span>
            <br />
            {parada.codigo} {parada.nombre}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

export function Mapa() {
  const estaciones = usarTienda((e) => e.estaciones);
  const origen = usarTienda((e) => e.origen);
  const destino = usarTienda((e) => e.destino);
  const resultado = usarTienda((e) => e.resultado);

  const itinerario = resultado?.ok ? resultado.itinerario : null;

  return (
    <MapContainer
      center={CENTRO_GDL}
      zoom={13}
      preferCanvas
      zoomControl={false}
      className="h-full w-full"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | rutas por <a href="https://openrouteservice.org/">openrouteservice</a> | estaciones: <a href="https://mibici.net/es/datos-abiertos/">MiBici datos abiertos</a>'
        maxZoom={19}
      />

      <CapturarClics />
      <EncuadrarRuta itinerario={itinerario} />
      <Estaciones estaciones={estaciones} />

      {itinerario && <Ruta itinerario={itinerario} />}

      {origen && <Marker position={comoTupla(origen)} icon={ICONO_ORIGEN} />}
      {destino && <Marker position={comoTupla(destino)} icon={ICONO_DESTINO} />}
    </MapContainer>
  );
}
