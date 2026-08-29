# MiRuta

**Planeador de rutas multimodales para MiBici que garantiza que ningún tramo en bicicleta exceda la ventana gratuita de 30 minutos.**

Guadalajara tiene 368 estaciones de MiBici y un sistema tarifario donde cada viaje es gratuito durante los primeros 30 minutos. Ningún planeador existente —ni la app oficial, ni Google Maps— toma esa regla en cuenta: te dan una ruta directa de 45 minutos y te cobran el excedente. MiRuta parte esa ruta en tramos, insertando paradas en estaciones intermedias donde re-anclas y vuelves a tomar bici, de modo que el contador se reinicia y el viaje completo sigue costando cero.

Además, MiRuta trata **caminar como parte de la ruta**: el trayecto de tu punto de partida a la primera estación y de la última estación a tu destino se contabilizan en la distancia y el tiempo totales, porque son parte real del viaje.

---

## 1. Contexto y problema

### El problema concreto

MiBici cobra por viaje, no por trayecto. Un "viaje" empieza cuando desanclas una bicicleta y termina cuando la anclas en cualquier estación. Los primeros 30 minutos de cada viaje están incluidos en la suscripción; a partir de ahí se acumulan cargos.

Esto crea un comportamiento que los usuarios experimentados ya practican informalmente: **re-anclar antes del minuto 30 para reiniciar el contador**. El problema es que hacerlo bien requiere saber, antes de salir, qué estaciones quedan sobre tu ruta y a qué distancia acumulada. Nadie tiene esa información a la mano.

### Lo que no resuelve nadie hoy

| Herramienta | Rutas ciclistas | Conoce estaciones MiBici | Respeta ventana de 30 min |
|---|---|---|---|
| Google Maps | Sí | Parcial | No |
| App oficial MiBici | No | Sí | No |
| Komoot / Strava | Sí | No | No |
| **MiRuta** | **Sí** | **Sí** | **Sí** |

### Usuario objetivo

Suscriptor de MiBici en el Área Metropolitana de Guadalajara (Guadalajara, Zapopan, San Pedro Tlaquepaque, Tonalá) que hace trayectos de media distancia —típicamente 4 a 12 km— donde el riesgo de exceder 30 minutos es real. Casos de uso frecuentes: casa → trabajo, casa → universidad, trayectos de fin de semana entre colonias.

---

## 2. Propuesta de valor

Dos cosas, y solo dos:

1. **Segmentación automática por ventana gratuita.** Dado un origen y un destino, MiRuta devuelve una secuencia de tramos donde ninguno en bicicleta supera los 30 minutos estimados.
2. **Ruta multimodal honesta.** Caminar cuenta. La distancia y el tiempo que se muestran incluyen los tramos a pie hacia y desde las estaciones, no solo la parte pedaleada.

Todo lo demás es secundario y está explícitamente fuera de alcance para la primera versión (ver §8).

---

## 3. Alcance de la primera versión

### Contexto de desarrollo

- **Formato:** hackathon, 24–48 horas, una persona.
- **Producto:** PWA responsive, prioridad móvil (se usa en la calle, con mapa).
- **Cobertura geográfica:** área de servicio de MiBici en el AMG.
- **Sin backend propio.** Aplicación estática con datos precomputados. Esto elimina despliegue de servidor, base de datos y autenticación del alcance.

### Historias de usuario del núcleo

| # | Como usuario quiero… | Para… | Prioridad |
|---|---|---|---|
| H1 | Fijar mi origen tocando el mapa o usando mi ubicación | No tener que escribir direcciones | **Debe** |
| H2 | Fijar mi destino tocando el mapa | Definir el trayecto | **Debe** |
| H3 | Ver la ruta dibujada con sus tramos diferenciados | Entender por dónde voy | **Debe** |
| H4 | Ver dónde debo re-anclar la bici y volver a tomar otra | No pasarme de los 30 minutos | **Debe** |
| H5 | Ver el tiempo y distancia totales, desglosados en caminata y bici | Decidir si me conviene el trayecto | **Debe** |
| H6 | Ver el tiempo de cada tramo con margen respecto a los 30 min | Confiar en que no me van a cobrar | **Debe** |
| H7 | Buscar una dirección por texto | Planear sin conocer el mapa | Debería |
| H8 | Instalar la app en mi teléfono | Abrirla rápido | Debería |
| H9 | Consultar una ruta ya calculada sin conexión | Usarla en la calle sin datos | Podría |

### Criterios de aceptación del núcleo

- Para cualquier par origen–destino dentro del área de servicio, MiRuta devuelve una ruta válida o un mensaje explícito de por qué no existe.
- Ningún tramo en bicicleta de una ruta devuelta excede `VENTANA_EFECTIVA_MIN` (27 min por defecto, ver §6).
- El tiempo total mostrado es la suma verificable de los tramos, incluyendo caminatas y maniobras de anclaje.
- El cálculo de ruta responde en menos de 2 segundos en un teléfono de gama media.

---

## 4. Datos

### 4.1 Estaciones (fuente única, estática)

**Archivo:** `nomenclatura_YYYY_MM.csv` publicado en [mibici.net/es/datos-abiertos](https://mibici.net/es/datos-abiertos/)

Estructura verificada:

```csv
id,name,latitude,longitude,dpcapacity
2,(GDL-001) C. Epigmenio Glez./ Av. 16 de Sept.,20.666378,-103.34882,15
3,(GDL-002) C. Colonias  / Av.  Niños héroes,20.667228,-103.366,15
4,(GDL-003) C. Vidrio / Av. Chapultepec,20.66769,-103.368252,19
```

| Campo | Uso en MiRuta |
|---|---|
| `id` | Identificador de nodo en el grafo |
| `name` | Etiqueta en UI. Contiene un código de zona entre paréntesis (`GDL-001`, `ZAP-…`) que sirve para agrupar por municipio |
| `latitude`, `longitude` | Nodos del grafo y marcadores del mapa |
| `dpcapacity` | Número de anclajes. Se usa solo como señal informativa ("estación grande, más probable que haya lugar") |

**Preprocesamiento:** el CSV se convierte una vez a `data/estaciones.json`, se normalizan los nombres (espacios dobles, acentos inconsistentes) y se extrae el código de zona a un campo propio. El archivo resultante ronda los 40 KB y se carga completo en el cliente.

### 4.2 Decisión: sin datos en tiempo real

MiRuta **no consulta disponibilidad de bicicletas ni de anclajes**. Es una decisión deliberada, no una limitación pendiente de resolver:

- Elimina la dependencia más frágil del sistema. Una demo no se cae porque un feed externo esté lento.
- El caso de uso es *planeación*, generalmente minutos u horas antes del viaje. La disponibilidad de ese momento no predice la del momento del trayecto.
- Con 368 estaciones y capacidades de 15–20 anclajes, la probabilidad de encontrar una estación completamente vacía o completamente llena es baja fuera de horas pico.

**Mitigación en UI:** cada parada sugerida muestra, además, la estación alternativa más cercana. Si el usuario llega y no hay lugar, tiene un plan B inmediato sin recalcular.

Si en el futuro se quisiera incorporar tiempo real, la vía es el feed GBFS que Datos Abiertos Jalisco publica para el dataset *Disponibilidad de bicicletas en estaciones de Mi Bici*. Queda documentado como extensión, no como requisito.

### 4.3 Ruteo

**Servicio:** [OpenRouteService](https://openrouteservice.org/) (API gratuita con llave, ~2 000 peticiones/día).

Se usan dos perfiles:

| Perfil ORS | Uso en MiRuta |
|---|---|
| `cycling-regular` | Tramos entre estaciones |
| `foot-walking` | Tramo inicial origen → estación y final estación → destino |

Se eligió sobre OSRM público porque el servidor demo de OSRM solo expone perfil de automóvil, y sobre OSRM auto-hospedado porque descargar y procesar el extracto de Jalisco con Docker consume varias horas del presupuesto de 48.

---

## 5. Arquitectura

### 5.1 Principio rector

**Todo el cálculo pesado ocurre en tiempo de construcción, no en tiempo de ejecución.** El grafo de estaciones no cambia entre una consulta y otra, así que se precomputa una vez y se distribuye como archivo estático. En ejecución, la app solo resuelve un Dijkstra sobre un grafo pequeño que ya tiene en memoria.

Consecuencia: no hay backend, no hay base de datos, no hay latencia de red en el camino crítico, y el consumo de la API externa es de unas pocas llamadas por ruta en lugar de miles.

```
┌─────────────────────────────────────────────────────────────┐
│  TIEMPO DE CONSTRUCCIÓN  (script Node, se corre una vez)     │
│                                                              │
│  nomenclatura.csv ──► normalizar ──► estaciones.json         │
│         │                                                    │
│         ▼                                                    │
│  filtro haversine (pares a < 6 km)                           │
│         │                                                    │
│         ▼                                                    │
│  ORS Matrix API (cycling-regular, por lotes)                 │
│         │                                                    │
│         ▼                                                    │
│  descartar pares > VENTANA_EFECTIVA ──► grafo.json (~200 KB) │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  TIEMPO DE EJECUCIÓN  (navegador, PWA estática)              │
│                                                              │
│  origen + destino                                            │
│      │                                                       │
│      ├──► estaciones candidatas por radio de caminata        │
│      │                                                       │
│      ├──► Dijkstra sobre grafo.json          [ms, local]     │
│      │                                                       │
│      ├──► ORS foot-walking × 2               [tramos a pie]  │
│      ├──► ORS directions × n                 [geometrías]    │
│      │                                                       │
│      └──► Itinerario renderizado sobre mapa                  │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Stack propuesto

| Capa | Elección | Por qué esta y no otra |
|---|---|---|
| Lenguaje | TypeScript | El modelo de datos del itinerario tiene suficientes variantes (tramo a pie vs. tramo en bici) como para que los tipos eviten bugs a las 3 a.m. |
| Build / dev | Vite | Arranque instantáneo, cero configuración. Next.js aportaría SSR y rutas de API que aquí no se usan. |
| UI | React | Ecosistema de mapas maduro. |
| Mapa | Leaflet + react-leaflet, teselas OpenStreetMap | No requiere llave de API ni cuenta. MapLibre GL se ve mejor pero añade fricción de estilo y llave de teselas; queda como mejora si sobra tiempo. |
| Estado | Zustand o `useState` | El estado es pequeño: origen, destino, itinerario, cargando. Redux sería sobreingeniería. |
| Estilos | Tailwind CSS | Velocidad de iteración en móvil. |
| PWA | `vite-plugin-pwa` | Manifiesto y service worker con configuración mínima. |
| Despliegue | Vercel o Netlify | Sitio estático, despliegue por push. |

**Alternativa considerada y descartada:** Supabase/Firebase. No hay nada que persistir ni usuarios que autenticar en la primera versión.

### 5.3 Estructura de carpetas

```
MiRuta/
├── README.md
├── scripts/
│   ├── 01-normalizar-estaciones.ts   # CSV → estaciones.json
│   └── 02-construir-grafo.ts         # ORS Matrix → grafo.json
├── data/
│   ├── nomenclatura_2026_07.csv      # fuente original, versionada
│   ├── estaciones.json               # generado
│   └── grafo.json                    # generado
├── src/
│   ├── dominio/
│   │   ├── tipos.ts                  # Estacion, Tramo, Itinerario
│   │   ├── constantes.ts             # ventana, velocidades, radios
│   │   ├── dijkstra.ts               # búsqueda de camino mínimo
│   │   └── planificador.ts           # orquesta el cálculo completo
│   ├── servicios/
│   │   ├── ors.ts                    # cliente OpenRouteService
│   │   └── geo.ts                    # haversine, utilidades
│   ├── componentes/
│   │   ├── Mapa.tsx
│   │   ├── PanelItinerario.tsx
│   │   ├── TarjetaTramo.tsx
│   │   └── SelectorPuntos.tsx
│   └── App.tsx
└── public/
```

---

## 6. El algoritmo

Esta es la parte que da valor al proyecto y merece definirse con precisión.

### 6.1 Constantes

```ts
export const VENTANA_GRATUITA_MIN = 30;   // regla de MiBici
export const MARGEN_SEGURIDAD_MIN  = 3;   // colchón por semáforos, tráfico, buscar anclaje
export const VENTANA_EFECTIVA_MIN  = 27;  // VENTANA_GRATUITA - MARGEN

export const PENALIZACION_ANCLAJE_MIN = 2;   // anclar + desanclar + validar
export const RADIO_CAMINATA_M         = 1000; // distancia máxima a pie a una estación
export const VELOCIDAD_CAMINATA_KMH   = 4.5;  // solo para el respaldo sin ORS
export const VELOCIDAD_BICI_KMH       = 13;   // solo para el respaldo sin ORS
```

`MARGEN_SEGURIDAD_MIN` es la decisión de diseño más importante del algoritmo. Un estimado de ruteo es un promedio; una ruta planeada a 29 minutos falla la mitad de las veces. Tres minutos de colchón convierten la promesa "no te van a cobrar" en algo defendible. Es configurable por si el usuario quiere ser más agresivo o más conservador.

### 6.2 Modelo del grafo

- **Nodos:** las 368 estaciones, más dos nodos efímeros por consulta (`ORIGEN`, `DESTINO`).
- **Aristas de bicicleta** entre estaciones `A → B`: existen **solo si** `duración(A,B) ≤ VENTANA_EFECTIVA_MIN`. La regla de negocio se codifica como filtro de aristas, no como restricción posterior. Esto significa que *cualquier* camino que Dijkstra encuentre cumple la ventana por construcción.
- **Aristas de caminata** `ORIGEN → estación` y `estación → DESTINO`: existen si la estación está a menos de `RADIO_CAMINATA_M`.
- **Arista directa** `ORIGEN → DESTINO` a pie: existe si están a menos de `RADIO_CAMINATA_M`, para no forzar bici en trayectos absurdamente cortos.
- **Costo de arista:** duración en segundos. Las aristas de bicicleta suman además `PENALIZACION_ANCLAJE_MIN`, lo que hace que el algoritmo prefiera naturalmente rutas con menos paradas cuando hay empate en tiempo.

### 6.3 Procedimiento

```
planificar(origen, destino):
  1. candidatasOrigen  ← estaciones a < RADIO_CAMINATA_M de origen
     candidatasDestino ← estaciones a < RADIO_CAMINATA_M de destino
     si ambas vacías → error "fuera del área de servicio de MiBici"

  2. construir grafo efímero:
       grafo.json (aristas bici precomputadas)
       + aristas a pie desde ORIGEN a cada candidataOrigen
       + aristas a pie desde cada candidataDestino a DESTINO
       + arista directa a pie ORIGEN→DESTINO si aplica

  3. camino ← dijkstra(grafo, ORIGEN, DESTINO)
     si no hay camino → error "sin conexión de estaciones entre esos puntos"

  4. para cada arista del camino, materializar un Tramo:
       - modo: 'caminata' | 'bicicleta'
       - origen, destino (punto o estación)
       - distanciaM, duracionSeg
       - para tramos de bici: margenMin = VENTANA_GRATUITA - duracion

  5. pedir a ORS las geometrías reales de cada tramo para dibujar

  6. devolver Itinerario { tramos, totales }
```

### 6.4 Tipos del dominio

```ts
type Estacion = {
  id: number;
  nombre: string;
  zona: string;          // 'GDL' | 'ZAP' | 'TLQ' | 'TON'
  lat: number;
  lon: number;
  anclajes: number;
};

type Tramo =
  | { modo: 'caminata';  desde: Punto;    hasta: Punto;
      distanciaM: number; duracionSeg: number; geometria: LatLng[] }
  | { modo: 'bicicleta'; desde: Estacion; hasta: Estacion;
      distanciaM: number; duracionSeg: number; geometria: LatLng[];
      margenMin: number; alternativaCercana?: Estacion };

type Itinerario = {
  tramos: Tramo[];
  totales: {
    duracionSeg: number;
    distanciaM: number;
    distanciaCaminataM: number;   // visible en UI: caminar cuenta
    distanciaBiciM: number;
    duracionCaminataSeg: number;
    duracionBiciSeg: number;
    numeroParadas: number;        // re-anclajes intermedios
  };
};
```

### 6.5 Ejemplo trabajado

Trayecto de 9.2 km, aproximadamente Zapopan Centro → Chapalita:

```
🚶 Caminata      Punto de partida → (ZAP-014) Av. Vallarta / Av. Patria
                 480 m · 6 min

🚲 Tramo 1       (ZAP-014) → (ZAP-039) Av. Vallarta / Av. Rafael Sanzio
                 5.1 km · 23 min          ✓ margen de 7 min

⚓ Parada        Ancla aquí y toma otra bici. Esto reinicia tu ventana gratuita.
                 Alternativa a 220 m: (ZAP-041) Av. Guadalupe / Av. Patria

🚲 Tramo 2       (ZAP-039) → (GDL-102) Av. Chapalita / Av. Guadalupe
                 3.2 km · 15 min          ✓ margen de 15 min

🚶 Caminata      (GDL-102) → Destino
                 340 m · 4 min

─────────────────────────────────────────────────────
TOTAL   9.2 km · 50 min   ·   $0 en cargos extra
        🚲 8.3 km / 38 min      🚶 0.9 km / 10 min
        1 parada intermedia
```

Sin MiRuta, ese mismo trayecto directo tomaría ~42 minutos de pedaleo continuo: 12 minutos por encima de la ventana gratuita, con el cargo correspondiente.

---

## 7. Diseño de la interfaz

Una sola pantalla. En móvil, mapa a pantalla completa con una hoja deslizable abajo; en escritorio, mapa con panel lateral.

```
┌────────────────────────────────┐
│  MiRuta                    ⚙   │
│  ┌──────────────────────────┐  │
│  │ ◉ Mi ubicación           │  │
│  │ ◎ Toca el mapa…          │  │
│  └──────────────────────────┘  │
│                                │
│         [ M A P A ]            │
│    · estaciones en gris        │
│    · ruta a pie punteada       │
│    · ruta en bici sólida       │
│    · paradas con marcador ⚓   │
│                                │
├────────────────────────────────┤
│ ▔▔▔▔                           │  ← hoja deslizable
│  50 min · 9.2 km · 1 parada    │
│  🚲 38 min  🚶 10 min          │
│  ─────────────────────────     │
│  🚶 6 min a ZAP-014            │
│  🚲 23 min  ✓ 7 min de margen  │
│  ⚓ Re-ancla en ZAP-039        │
│  🚲 15 min  ✓ 15 min de margen │
│  🚶 4 min al destino           │
└────────────────────────────────┘
```

**Reglas visuales:**

- Tramos a pie: línea punteada. Tramos en bici: línea sólida y más gruesa. La diferencia debe leerse sin leyenda.
- El margen de cada tramo se muestra siempre y en verde. Es la prueba visible de la promesa del producto.
- Las paradas de re-anclaje usan un marcador distinto del de las estaciones normales y llevan una etiqueta que explica *por qué* hay que parar. La primera vez que alguien ve la app no sabe qué es re-anclar.
- El desglose caminata/bici aparece en el encabezado del resumen, no escondido en el detalle.

---

## 8. Fuera de alcance

Lista explícita, para protegerla de la tentación a mitad del hackathon:

- Disponibilidad de bicicletas y anclajes en tiempo real
- Cuentas de usuario, historial y rutas guardadas en servidor
- Cálculo de tarifas en pesos por excedente
- Comparativa contra automóvil o transporte público
- Puntos de interés en las paradas
- Navegación paso a paso por voz
- Ciudades distintas al AMG
- Modo oscuro
- Internacionalización (solo español)

---

## 9. Plan de ejecución (48 horas, una persona)

| Bloque | Horas | Entregable | Estado |
|---|---|---|---|
| **0. Preparación** | 0–2 | Repo, Vite + React + TS + Tailwind, llave de ORS obtenida y probada con curl | ☐ |
| **1. Datos** | 2–5 | `estaciones.json` generado y validado. Las 368 estaciones se pintan en un mapa Leaflet | ☐ |
| **2. Grafo** | 5–10 | `02-construir-grafo.ts` corrido. `grafo.json` versionado. Verificar a mano 3 pares conocidos | ☐ |
| **3. Motor** | 10–18 | Dijkstra + planificador, con pruebas sobre 5 pares origen–destino fijos. **Sin UI todavía** | ☐ |
| **4. Mapa** | 18–26 | Selección de origen/destino, dibujo de la ruta con tramos diferenciados | ☐ |
| **5. Panel** | 26–34 | Itinerario, totales desglosados, márgenes, tarjetas de parada | ☐ |
| **6. Pulido** | 34–40 | Estados de carga y error, responsive móvil, PWA, despliegue | ☐ |
| **7. Demo** | 40–46 | Guion, 3 rutas de respaldo precalculadas, ensayo | ☐ |
| **Colchón** | 46–48 | Lo que se rompa | ☐ |

**Punto de control crítico:** al terminar el bloque 3 debe existir un motor que, invocado desde consola, devuelva un itinerario correcto. Si a la hora 18 eso no funciona, el proyecto se recorta al plan B de §10 en lugar de seguir hacia la UI.

---

## 10. Riesgos y planes de contingencia

| Riesgo | Impacto | Mitigación |
|---|---|---|
| ORS agota cuota o se cae durante la demo | Crítico | El grafo ya está precomputado en disco: la ruta se calcula sin red. Solo las geometrías dependen de ORS, y su respaldo es dibujar líneas rectas entre puntos. La demo no se cae. |
| La matriz de ORS excede límites por lote | Alto | Filtrado previo por haversine a 6 km y envío en lotes de 40×40 con reintentos. El script guarda avance parcial y es reanudable. |
| No existe camino entre origen y destino | Medio | Mensaje explícito indicando la estación más cercana al punto problemático, en vez de un error genérico. |
| Estimaciones de ORS demasiado optimistas para GDL | Medio | Para eso existe `MARGEN_SEGURIDAD_MIN`. Es configurable y se puede subir a 5 min tras probar en campo. |
| Perderse puliendo el mapa | Alto (para un solo desarrollador) | §8 es vinculante. El bloque 3 termina antes de tocar UI. |
| Sin conexión durante la demo en vivo | Crítico | Tres rutas precalculadas embebidas como JSON, activables desde un parámetro en la URL. |

---

## 11. Cómo se sabe si funcionó

**Correctitud** — sobre 20 pares origen–destino aleatorios dentro del área de servicio:
- 100 % de los tramos de bici devueltos están bajo los 27 minutos
- ≥ 90 % de los pares producen una ruta válida
- El tiempo total coincide con la suma de los tramos, sin discrepancias de redondeo

**Rendimiento**
- Cálculo de ruta bajo 2 s en móvil de gama media
- Carga inicial bajo 3 s en 4G

**Demo**
- Alguien que nunca ha usado la app entiende, sin explicación, por qué hay una parada intermedia

---

## 12. Preguntas abiertas

Pendientes de verificar en fuentes oficiales de MiBici antes de fijar los parámetros:

1. **¿Hay un tiempo mínimo de espera entre anclar una bicicleta y desanclar otra?** Varios sistemas imponen un bloqueo de 2 a 5 minutos. Si existe, `PENALIZACION_ANCLAJE_MIN` debe reflejarlo y afecta directamente la utilidad del producto.
2. **¿La ventana de 30 minutos aplica igual a suscripción anual y a pases temporales?** Si difieren, la ventana debe ser un parámetro seleccionable por el usuario.
3. **¿Se permite re-anclar en la misma estación de la que se tomó la bicicleta?** Relevante para trayectos circulares.
4. **¿Con qué frecuencia se actualiza `nomenclatura_YYYY_MM.csv`?** Determina cada cuánto hay que regenerar el grafo.
5. **Licencia de los datos abiertos de MiBici.** El portal no la declara explícitamente; conviene confirmarla antes de cualquier publicación.
6. **Licencia del propio proyecto.** Pendiente de decidir.

---

## 13. Fuentes

- [MiBici — Datos abiertos](https://mibici.net/es/datos-abiertos/) — nomenclatura de estaciones e históricos de viajes
- [MiBici — Sitio oficial](https://mibici.net/) — reglas de uso y tarifas
- [Datos Abiertos Jalisco — Disponibilidad de bicicletas en estaciones de Mi Bici](https://datos.jalisco.gob.mx/dataset/disponibilidad-de-bicicletas-en-estaciones-de-mi-bici) — feed GBFS en tiempo real (extensión futura)
- [Histórico de viajes MiBici](https://datos.jalisco.gob.mx/historico-de-viajes-del-sistema-de-bicicleta-publica-mibici) — datos de demanda para análisis posterior
- [OpenRouteService](https://openrouteservice.org/) — motor de ruteo ciclista y peatonal
- [Especificación GBFS](https://gbfs.org/documentation/reference/) — estándar del feed en tiempo real
- [juanjdeleon/mibici-demo](https://github.com/juanjdeleon/mibici-demo) — ejemplo de consumo de los datos abiertos
