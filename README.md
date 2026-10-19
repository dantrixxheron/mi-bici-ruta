# MiRuta

**Planeador de rutas multimodales para MiBici que garantiza que ningún tramo en bicicleta exceda la ventana gratuita de 30 minutos.**

Guadalajara tiene 451 estaciones activas de MiBici y un sistema tarifario donde cada viaje es gratuito durante los primeros 30 minutos. Ningún planeador existente —ni la app oficial, ni Google Maps— toma esa regla en cuenta: te dan una ruta directa de 45 minutos y te cobran el excedente. MiRuta parte esa ruta en tramos, insertando paradas en estaciones intermedias donde re-anclas y vuelves a tomar bici, de modo que el contador se reinicia y el viaje completo sigue costando cero.

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
- **Sin backend propio, salvo un proxy de nueve líneas.** La app es estática y con datos precomputados: no hay base de datos ni autenticación. La única pieza de servidor es una función serverless que añade la llave de OpenRouteService a las peticiones de ruteo, para que no viaje en el bundle público (ver §5.5).

### Historias de usuario del núcleo

| # | Como usuario quiero… | Para… | Prioridad |
|---|---|---|---|
| H1 | Fijar mi origen tocando el mapa o usando mi ubicación | No tener que escribir direcciones | **Debe** |
| H2 | Fijar mi destino tocando el mapa | Definir el trayecto | **Debe** |
| H3 | Ver la ruta dibujada con sus tramos diferenciados | Entender por dónde voy | **Debe** |
| H4 | Ver dónde debo re-anclar la bici y volver a tomar otra | No pasarme de los 30 minutos | **Debe** |
| H5 | Ver el tiempo y distancia totales, desglosados en caminata y bici | Decidir si me conviene el trayecto | **Debe** |
| H6 | Ver el tiempo de cada tramo con margen respecto a los 30 min | Confiar en que no me van a cobrar | **Debe** |
| H7 | Buscar una dirección por texto | Planear sin conocer el mapa | Debería — ✅ hecha (§4.5) |
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

**Particularidades reales del archivo**, verificadas al procesarlo (`scripts/01-normalizar-estaciones.ts`). Ninguna es evidente al abrirlo, y cada una rompe un parser ingenuo:

| Hallazgo | Consecuencia |
|---|---|
| Codificación **Windows-1252**, no UTF-8 | Leerlo como UTF-8 corrompe todos los acentos: "Niños héroes" queda ilegible |
| Al menos una fila trae comas dentro del nombre, entrecomilladas: `334,"(GDL-261)C. Jarauta, Javier Mina",…` | Un `split(',')` la parte mal. Hace falta un parser que respete comillas |
| **39 estaciones tienen `dpcapacity = 0`**: son bajas del sistema | Solo 14 lo declaran en el nombre con prefijo `Ex-`/`ex(`. **La capacidad es la señal confiable; el nombre no lo es** |
| Zonas presentes: `GDL`, `ZPN`, `TLQ` | No existe `ZAP` ni `TON`. Tlaquepaque tiene apenas 15 estaciones; Tonalá, ninguna |
| Nombres con espacios dobles y a veces sin espacio tras el paréntesis | Requieren normalización antes de mostrarse |

**Resultado:** 490 filas → **451 estaciones activas** (342 GDL, 94 ZPN, 15 TLQ), 39 descartadas. El `estaciones.json` resultante pesa 90 KB (~15 KB comprimido) y se carga completo en el cliente al abrir la app.

### 4.2 Cobertura real del sistema

El área servida mide aproximadamente **11.5 km norte-sur por 14.2 km este-oeste**. Verificado con `scripts/04-explorar-cobertura.ts`, hay destinos conocidos del AMG que quedan **fuera** del radio de caminata:

| Destino | Estación más cercana | ¿Cubierto? |
|---|---|---|
| Centro, Americana, Chapalita, Expo, CUCEI | < 210 m | Sí |
| Basílica de Zapopan, Plaza Patria, Centro Magno | < 150 m | Sí |
| Centro de Tlaquepaque | 180 m | Sí |
| CUCEA | 978 m | Sí, al límite |
| Parque Metropolitano | 1 612 m | **No** |
| Zoológico de Guadalajara | 2 155 m | **No** |
| Andares | 2 374 m | **No** |
| Estadio Akron | 3 979 m | **No** |
| Tonalá centro | 7 260 m | **No** |
| Aeropuerto | 12 749 m | **No** |

Esto no es un defecto de MiRuta sino del sistema que modela, pero **la interfaz debe comunicarlo con claridad**: cuando el destino cae fuera, el mensaje indica la estación más cercana y su distancia, en vez de un error genérico.

### 4.3 Decisión: sin datos en tiempo real

MiRuta **no consulta disponibilidad de bicicletas ni de anclajes**. Es una decisión deliberada, no una limitación pendiente de resolver:

- Elimina la dependencia más frágil del sistema. Una demo no se cae porque un feed externo esté lento.
- El caso de uso es *planeación*, generalmente minutos u horas antes del viaje. La disponibilidad de ese momento no predice la del momento del trayecto.
- Con 451 estaciones y una capacidad mediana de 15–19 anclajes, la probabilidad de encontrar una estación completamente vacía o completamente llena es baja fuera de horas pico.

**Mitigación en UI:** cada parada sugerida muestra, además, la estación alternativa más cercana. Si el usuario llega y no hay lugar, tiene un plan B inmediato sin recalcular.

Si en el futuro se quisiera incorporar tiempo real, la vía es el feed GBFS que Datos Abiertos Jalisco publica para el dataset *Disponibilidad de bicicletas en estaciones de Mi Bici*. Queda documentado como extensión, no como requisito.

### 4.4 Ruteo

**Servicio:** [OpenRouteService](https://openrouteservice.org/), en el plan estándar gratuito: **2 500 peticiones/día**, 40 por minuto, hasta 3 500 pares por petición de matriz.

Se usan dos perfiles:

| Perfil ORS | Uso en MiRuta |
|---|---|
| `cycling-regular` | Tramos entre estaciones |
| `foot-walking` | Tramo inicial origen → estación y final estación → destino |

Se eligió sobre OSRM público porque el servidor demo de OSRM solo expone perfil de automóvil, y sobre OSRM auto-hospedado porque descargar y procesar el extracto de Jalisco con Docker consume varias horas del presupuesto de 48.

> **Migración a HeiGIT.** OpenRouteService movió su infraestructura: `api.openrouteservice.org` quedó deprecado el 28-abr-2026, su cuota bajó al 10 % el 27-ago-2026 y **se apaga el 28-sep-2026**. Todas las llamadas van a `https://api.heigit.org/openrouteservice/v2/…`. La URL base es configurable con `ORS_BASE_URL`.

**El plan gratuito alcanza de sobra, y eso no era obvio de antemano.** Se solicitó el plan colaborativo, de mayor cuota, y fue rechazado por tratarse de un proyecto personal y no institucional. La respuesta resultó ser la correcta: construir el grafo completo gasta **100 peticiones de las 2 500 diarias**, un 4 %. En ejecución son unas 4 por ruta planeada, es decir ~600 rutas al día. Conviene medir el consumo real antes de pedir una ampliación; aquí costó varios días de espera averiguarlo.

`npm run probar:ors` valida la llave con 2 peticiones antes de gastar las 100 de la matriz.

#### El endpoint `/geojson` y el 406

`/v2/directions/{perfil}/geojson` hace negociación de contenido estricta. Pedirle `Accept: application/json` es declarar que solo se acepta JSON plano, y el servidor responde **406 Not Acceptable** en lugar de servir un tipo que no se pidió. Hay que mandar `application/geo+json`.

El error pasó inadvertido porque `ors.ts` cae al respaldo en silencio por diseño: sin llave, con llave rechazada o con la petición bloqueada, las tres causas se veían idénticas en pantalla —una línea recta—. El módulo ahora emite un `console.warn` que las distingue. La matriz nunca se vio afectada, porque ese endpoint sí devuelve JSON plano.

#### Calibración: ORS es optimista para una bicicleta compartida

Medido sobre las 98 406 aristas del grafo, `cycling-regular` asume **18.0 km/h con varianza casi nula** (p25 17.8, p95 18.0). Es una velocidad plana: no modela semáforos, altos, cuestas ni tipo de bicicleta. Describe una bici ligera con ciclista en forma, no una MiBici urbana de tres velocidades con canastilla y postura erguida.

El síntoma apareció al comparar contra Google Maps: la app marcaba 32 minutos donde Maps daba más del doble. Se aplica `FACTOR_CALIBRACION_BICI = 1.38`, que lleva ORS a 13 km/h — exactamente la cifra que ya usaba el modo respaldo, que resultó **más realista que el dato «real»**.

El factor se aplica en dos lugares, y omitir el segundo anula el primero:

| Dónde | Por qué |
|---|---|
| `scripts/02-construir-grafo.ts` | Para que el filtro de la ventana opere sobre el tiempo que de verdad se le promete al usuario |
| `refinarConOrs` en `src/servicios/ors.ts` | El refinado sobrescribe las duraciones con las crudas de ORS; sin calibrar ahí, la app vuelve a los tiempos optimistas en cuanto llega la respuesta |

El sesgo es deliberado y asimétrico: subestimar el tiempo le cuesta al usuario un cargo real, sobreestimarlo solo le sugiere una parada de más.

Recalibrar **no gasta cuota**: los 100 bloques crudos de la matriz quedan en `data/.cache-matriz/`, así que cambiar el factor y volver a correr `npm run datos:grafo` reconstruye el grafo sin tocar la red.

### 4.5 Búsqueda por texto (geocodificación)

**Decisión: Photon, no el geocodificador de OpenRouteService.**

ORS también ofrece geocodificación, pero exige la misma llave que el resto de sus servicios. Usarla habría dejado la búsqueda bloqueada esperando aprobación, cuando es justamente la función que vuelve usable la app sin conocer el mapa. [Photon](https://photon.komoot.io/) es gratuito, **no requiere llave**, y está diseñado para type-ahead.

La búsqueda combina dos fuentes, y esa combinación es deliberada:

| Fuente | Qué cubre | Latencia | Si falla |
|---|---|---|---|
| Las 451 estaciones, en memoria | «GDL-033», «Chapultepec», códigos y nombres | Instantánea, sin red | No puede fallar |
| Photon | Direcciones, colonias, puntos de interés | ~300 ms, con espera antifuego | La búsqueda de estaciones sigue funcionando |

La degradación es parcial, no total: si Photon se cae, todavía puedes buscar cualquier estación.

Dos detalles que solo aparecieron al probar el servicio contra datos reales:

- **`lang=es` devuelve HTTP 400.** Photon solo acepta `de`, `en`, `fr` e `it`. Se omite el parámetro.
- **El sesgo por `lat`/`lon` ordena pero no restringe.** Buscar «catedral» devolvía la de Buenos Aires y la de San José antes que la de Guadalajara. Hace falta el filtro duro `bbox` sobre la caja del AMG.

Photon además devuelve el mismo lugar varias veces (nodo, parada, estación); los resultados se deduplican por nombre y por coordenada redondeada a ~100 m.

---

## 5. Arquitectura

### 5.1 Principio rector

**Todo el cálculo pesado ocurre en tiempo de construcción, no en tiempo de ejecución.** El grafo de estaciones no cambia entre una consulta y otra, así que se precomputa una vez y se distribuye como archivo estático. En ejecución, la app solo resuelve un Dijkstra sobre un grafo pequeño que ya tiene en memoria.

Consecuencia: no hay backend, no hay base de datos, no hay latencia de red en el camino crítico, y el consumo de la API externa es de unas pocas llamadas por ruta en lugar de miles.

**Tamaño real del grafo, y qué se hizo al respecto.** La primera versión de este documento estimaba `grafo.json` en unos 200 KB. Medido, resultó ser **1.4 MB (534 KB comprimido con gzip)**: con 451 estaciones en un área de 14 × 11 km, la ventana de 27 minutos alcanza para llegar a varios kilómetros de calle, de modo que **cada estación conecta en promedio con otras 218**. El grafo es mucho más denso de lo previsto.

La respuesta no es podar el grafo sino **diferir su carga**:

- La app pinta el mapa y las 451 estaciones con solo `estaciones.json` (90 KB).
- `grafo.json` se descarga en segundo plano mientras el usuario elige origen y destino, cosa que toma varios segundos de todos modos.
- Para cuando se pulsa «planear», ya está en memoria.

Podar habría degradado la calidad de las rutas de forma difícil de acotar; diferir no cuesta nada y no sacrifica optimalidad. El constructor conserva una bandera `--max-grado N` como escape si alguna vez hace falta, pero no se usa por omisión.

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
│  calibrar ×1.38, descartar > VENTANA ──► grafo.json (1.4 MB) │
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
│      ├──► /api/ors  a pie × 2                [tramos a pie]  │
│      ├──► /api/ors  directions × n           [geometrías]      │
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
| Despliegue | Vercel | Sitio estático más una función serverless para el proxy de la llave (§5.5). Netlify serviría igual, con otra convención de carpetas. |

**Alternativa considerada y descartada:** Supabase/Firebase. No hay nada que persistir ni usuarios que autenticar en la primera versión. El proxy de §5.5 no cambia eso: guarda un secreto, no un estado.

### 5.3 Estructura de carpetas

`✅` implementado y en uso

```
MiRuta/
├── README.md
├── api/
│   └── ors/[...ruta].ts              ✅ proxy: guarda la llave del cliente
├── scripts/
│   ├── 01-normalizar-estaciones.ts   ✅ CSV → estaciones.json
│   ├── 02-construir-grafo.ts         ✅ matriz de tiempos → grafo.json
│   ├── 03-probar-motor.ts            ✅ banco de pruebas del motor
│   ├── 04-explorar-cobertura.ts      ✅ diagnóstico del área servida
│   └── 05-probar-ors.ts              ✅ verificador de la llave
├── data/
│   ├── nomenclatura_2026_07.csv      ✅ fuente oficial, versionada
│   └── .cache-matriz/                ✅ 100 bloques crudos: recalibrar sin red
├── public/datos/
│   ├── estaciones.json               ✅ generado — 451 estaciones, 89 KB
│   └── grafo.json                    ✅ generado — 98 406 aristas, 1.4 MB
├── src/
│   ├── dominio/
│   │   ├── tipos.ts                  ✅ Estacion, Tramo, Itinerario
│   │   ├── constantes.ts             ✅ ventana, velocidades, calibración
│   │   ├── dijkstra.ts               ✅ camino mínimo con montículo binario
│   │   └── planificador.ts           ✅ orquesta el cálculo completo
│   ├── servicios/
│   │   ├── geo.ts                    ✅ haversine, búsquedas por radio
│   │   ├── ors.ts                    ✅ refina tramos a pie y geometrías
│   │   └── geocodificacion.ts        ✅ búsqueda por texto (Photon)
│   ├── componentes/
│   │   ├── Mapa.tsx                  ✅
│   │   ├── PanelItinerario.tsx       ✅
│   │   ├── TarjetaTramo.tsx          ✅
│   │   ├── SelectorPuntos.tsx        ✅
│   │   └── CampoBusqueda.tsx         ✅
│   ├── estado/tienda.ts              ✅ Zustand
│   └── App.tsx                       ✅
└── vite.config.ts                    ✅ PWA + proxy de desarrollo
```

### 5.4 Cómo correrlo

```bash
npm install

# 1. Catálogo oficial → estaciones.json
npm run datos:estaciones

# 2. Grafo. Sin llave de ORS, con estimación geodésica:
npm run datos:grafo -- --respaldo
#    Con llave real (copia .env.example a .env y pon ORS_API_KEY):
npm run datos:grafo

# 3. Verificar el motor. Sale con código != 0 si algo falla.
npm run probar:motor

# 4. Diagnóstico de cobertura del sistema
npx tsx scripts/04-explorar-cobertura.ts

# 5. Interfaz (bloque 4 en adelante)
npm run dev
```

**El modo respaldo es la decisión que desbloqueó el proyecto.** Permite construir y validar el motor completo sin depender de una llave de API ni de la red. Los tiempos son estimaciones geodésicas —peores que los reales— pero la topología del grafo es la misma, así que todo el código posterior se desarrolla contra datos de forma correcta. Cuando llega la llave, un solo comando lo sustituye sin tocar una línea de la aplicación.

---

### 5.5 La llave no puede viajar al navegador

Durante casi todo el desarrollo la llave se leyó como `VITE_ORS_API_KEY`. Vite entrega al cliente toda variable con ese prefijo, así que al compilar quedaba **en texto plano dentro de `dist/assets/index-*.js`**: cualquiera que abriera el sitio publicado podía extraerla y agotar las 2 500 peticiones diarias. Publicar así es irreversible — una llave expuesta solo se puede rotar, no despublicar.

La solución es una función serverless de nueve líneas útiles:

```
  navegador  ──►  /api/ors/v2/directions/…  ──►  api.heigit.org
   (sin llave)      (añade Authorization)         (ORS)
```

| Pieza | Papel |
|---|---|
| `api/ors.ts` | En producción. Lee `ORS_API_KEY` del entorno del servidor |
| `server.proxy` en `vite.config.ts` | El equivalente en desarrollo, para que `npm run dev` se comporte igual |
| `ORS_API_KEY` sin prefijo `VITE_` | El prefijo es justamente lo que la publicaba |

Dos detalles que no son opcionales:

- **Lista blanca de rutas.** El proxy solo deja pasar `v2/directions/{cycling-regular,foot-walking}/geojson`. Sin ella sería un relay abierto hacia ORS pagado con la cuota del proyecto: bastaría descubrir la URL para usarlo como API propia.
- **El cliente ya no pregunta «¿hay llave?».** No puede saberlo. El aviso de «tiempos estimados» del panel ahora mira `geometriaAproximada`, es decir si ORS realmente contestó. Es un indicador más honesto: describe los datos en pantalla, no la configuración.

Efecto secundario útil: al llamar a su propio origen, la app deja de depender de que ORS envíe cabeceras CORS.

---

### 5.6 Despliegue

```bash
npm i -g vercel
vercel login
vercel link
vercel env add ORS_API_KEY     # Production, Preview y Development
vercel --prod
```

Vercel detecta Vite solo (build `npm run build`, salida `dist/`) y toma `api/` como función serverless. No hace falta `vercel.json`. El HTTPS resultante es además un requisito, no un lujo: sin contexto seguro el navegador no entrega la geolocalización de la historia H1.

Verificación de que la llave no se publicó:

```bash
npm run build
LLAVE=$(grep "^ORS_API_KEY=" .env | cut -d= -f2)
grep -rq "${LLAVE:0:12}" dist/ && echo "EXPUESTA" || echo "limpio"
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

export const FACTOR_CALIBRACION_BICI  = 1.38; // ORS 18 km/h → MiBici 13 km/h
```

`FACTOR_CALIBRACION_BICI` corrige un sesgo medido: ORS estima 18 km/h para todo tramo ciclista, que es una bici ligera y no una MiBici (ver §4.4). Sin él la app promete márgenes que no se cumplen. Se aplica tanto al construir el grafo como al refinar con ORS en el cliente; calibrar solo uno de los dos no sirve de nada.

`MARGEN_SEGURIDAD_MIN` es la decisión de diseño más importante del algoritmo. Un estimado de ruteo es un promedio; una ruta planeada a 29 minutos falla la mitad de las veces. Tres minutos de colchón convierten la promesa "no te van a cobrar" en algo defendible. Es configurable por si el usuario quiere ser más agresivo o más conservador.

### 6.2 Modelo del grafo

- **Nodos:** las 451 estaciones activas, más dos nodos efímeros por consulta (`ORIGEN`, `DESTINO`).
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

Salida real del motor (`npm run probar:motor`), Catedral de Guadalajara → Basílica de Zapopan:

```
🚶 Caminata      Punto de partida → GDL-052 Av. Juárez / 16 de Septiembre
                 200 m · 3 min

🚲 Tramo 1       GDL-052 → GDL-092
                 3.1 km · 15 min          ✓ margen de 15.5 min

⚓ Parada        Ancla aquí y toma otra bici. Esto reinicia tu ventana gratuita.

🚲 Tramo 2       GDL-092 → ZPN-013
                 5.3 km · 25 min          ✓ margen de 5.4 min

🚶 Caminata      ZPN-013 → Basílica de Zapopan
                 100 m · 1 min

─────────────────────────────────────────────────────
TOTAL   8.7 km · 45 min
        🚲 8.4 km / 39 min      🚶 0.3 km / 4 min
        1 parada intermedia
```

Sin la parada, ese trayecto serían 39 minutos de pedaleo continuo: **9 minutos por encima de la ventana gratuita**, con el cargo correspondiente.

> Los tiempos provienen del grafo real de OpenRouteService (`modoRespaldo: false`), calibrado a 13 km/h según §4.4.

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
| **0. Preparación** | 0–2 | Repo git, Vite + React + TS + Tailwind, dependencias instaladas | ✅ |
| **1. Datos** | 2–5 | `estaciones.json` generado y validado: 451 estaciones activas | ✅ |
| **2. Grafo** | 5–10 | `grafo.json` con 98 406 aristas, todas dentro de la ventana | ✅ |
| **3. Motor** | 10–18 | Dijkstra + planificador + banco de pruebas | ✅ |
| **3b. Grafo real** | — | Regenerar con OpenRouteService y calibrar | ✅ |
| **4. Mapa** | 18–26 | Selección de origen/destino, dibujo de la ruta con tramos diferenciados | ✅ |
| **5. Panel** | 26–34 | Itinerario, totales desglosados, márgenes, tarjetas de parada | ✅ |
| **6. Pulido** | 34–40 | Estados de carga y error, responsive móvil, PWA, proxy de la llave | ✅ |
| **7. Demo** | 40–46 | Guion, 3 rutas de respaldo precalculadas, ensayo | ☐ |
| **Colchón** | 46–48 | Lo que se rompa | ☐ |

**Punto de control crítico — superado.** El bloque 3 exigía un motor que, invocado desde consola, devolviera itinerarios correctos. `npm run probar:motor` lo demuestra sobre 12 casos con nombre y 200 pares aleatorios. El producto ya existe aunque todavía no tenga interfaz.

El modo respaldo permitió completar los bloques 1–3 **sin llave de OpenRouteService**, y la predicción se cumplió: cuando llegó la llave, el bloque 3b fue volver a correr `npm run datos:grafo` sin tocar el motor ni la interfaz.

Lo que sí obligó a cambiar código fueron dos cosas que el plan no anticipaba: que ORS estima 18 km/h para una bici que va a 13 (§4.4), y que la llave no puede viajar al navegador (§5.5).

---

## 10. Riesgos y planes de contingencia

| Riesgo | Impacto | Mitigación |
|---|---|---|
| ORS agota cuota o se cae durante la demo | Crítico | El grafo ya está precomputado en disco: la ruta se calcula sin red. Solo las geometrías dependen de ORS, y su respaldo es dibujar líneas rectas entre puntos. La demo no se cae. |
| La matriz de ORS excede límites por lote | Alto | Filtrado previo por haversine a 6 km y envío en lotes de 50×50 —el tope del plan es 3 500 pares— con reintentos y retroceso exponencial ante 429. El script cachea cada bloque en disco y es reanudable. |
| No existe camino entre origen y destino | Medio | Mensaje explícito indicando la estación más cercana al punto problemático, en vez de un error genérico. |
| Estimaciones de ORS demasiado optimistas para GDL | Medio | Para eso existe `MARGEN_SEGURIDAD_MIN`. Es configurable y se puede subir a 5 min tras probar en campo. |
| Perderse puliendo el mapa | Alto (para un solo desarrollador) | §8 es vinculante. El bloque 3 termina antes de tocar UI. |
| Sin conexión durante la demo en vivo | Crítico | Tres rutas precalculadas embebidas como JSON, activables desde un parámetro en la URL. |

---

## 11. Cómo se sabe si funcionó

Automatizado en `npm run probar:motor`, que devuelve código de salida distinto de cero si algo falla.

**Correctitud** — medido sobre 200 pares aleatorios reproducibles (semilla fija) más 12 casos con nombre:

| Criterio | Meta | Medido |
|---|---|---|
| Tramos de bici bajo la ventana efectiva | 100 % | **100 %** (0 violaciones en 314 tramos) |
| Pares que producen ruta válida | ≥ 90 % | **99.5 %** (199/200) |
| Total = suma de tramos | exacto | **exacto** |
| Destinos fuera de cobertura rechazados con mensaje útil | sí | **sí** |

**Rendimiento**

| Criterio | Meta | Medido |
|---|---|---|
| Cálculo de ruta | < 2 000 ms | **7 ms promedio, 22 ms peor caso** |
| Carga inicial en 4G | < 3 s | pendiente. `estaciones.json` son 13 KB comprimidos; el grafo son 534 KB y baja en diferido (§5.1) |

**Utilidad del producto** — la métrica que justifica que MiRuta exista: **el 51.8 % de los trayectos requiere al menos una parada** (86 de 199 una parada, 17 dos paradas). Sin MiRuta, ese 51.8 % de usuarios paga cargos que podría evitar.

La cifra se movió mucho durante el desarrollo y conviene decir por qué, porque explica de qué depende:

| Grafo | Velocidad | Trayectos con parada |
|---|---|---|
| Respaldo geodésico | 13 km/h estimada | 54 % |
| ORS crudo | 18.0 km/h medida | 27.5 % |
| ORS calibrado (actual) | 13.0 km/h | **51.8 %** |

La versión de ORS sin calibrar era la más optimista y la más peligrosa: reducía a la mitad los trayectos marcados como riesgosos, prometiendo gratuidad en viajes que sí se cobran.

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
7. **¿Es 1.38 el factor correcto?** Se eligió porque lleva ORS a los 13 km/h que ya usaba el modo respaldo, no porque se haya medido en campo. La fuente natural para fijarlo es el [histórico de viajes](https://datos.jalisco.gob.mx/historico-de-viajes-del-sistema-de-bicicleta-publica-mibici): tiene millones de trayectos reales con estación de origen, de destino y marcas de tiempo, o sea la velocidad efectiva verdadera del sistema. Recalibrar no cuesta cuota (§4.4).

---

## 13. Fuentes

- [MiBici — Datos abiertos](https://mibici.net/es/datos-abiertos/) — nomenclatura de estaciones e históricos de viajes
- [MiBici — Sitio oficial](https://mibici.net/) — reglas de uso y tarifas
- [Datos Abiertos Jalisco — Disponibilidad de bicicletas en estaciones de Mi Bici](https://datos.jalisco.gob.mx/dataset/disponibilidad-de-bicicletas-en-estaciones-de-mi-bici) — feed GBFS en tiempo real (extensión futura)
- [Histórico de viajes MiBici](https://datos.jalisco.gob.mx/historico-de-viajes-del-sistema-de-bicicleta-publica-mibici) — datos de demanda para análisis posterior
- [OpenRouteService](https://openrouteservice.org/) — motor de ruteo ciclista y peatonal
- [Especificación GBFS](https://gbfs.org/documentation/reference/) — estándar del feed en tiempo real
- [juanjdeleon/mibici-demo](https://github.com/juanjdeleon/mibici-demo) — ejemplo de consumo de los datos abiertos
