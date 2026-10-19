/**
 * Parametros del dominio. Todo numero magico del proyecto vive aqui.
 */

/** Regla de MiBici: los primeros 30 min de cada viaje no generan cargo. */
export const VENTANA_GRATUITA_MIN = 30;

/**
 * Colchon restado a la ventana. Es la decision de diseno mas importante
 * del algoritmo: un estimado de ruteo es un promedio, asi que una ruta
 * planeada a 29 min falla aproximadamente la mitad de las veces.
 * Tres minutos convierten "no te van a cobrar" en una promesa defendible.
 */
export const MARGEN_SEGURIDAD_MIN = 3;

/** Techo real por tramo en bicicleta. Ninguna arista del grafo lo excede. */
export const VENTANA_EFECTIVA_MIN = VENTANA_GRATUITA_MIN - MARGEN_SEGURIDAD_MIN;

/** Anclar, validar y desanclar otra bici. Ver pregunta abierta 1 del README. */
export const PENALIZACION_ANCLAJE_MIN = 2;

/** Distancia maxima que se le pide caminar al usuario hasta una estacion. */
export const RADIO_CAMINATA_M = 1000;

/**
 * Prefiltro geodesico para el constructor de grafo. A 13 km/h, 27 min son
 * ~5.9 km de calle; con un factor de rodeo de 1.35 eso equivale a ~4.4 km
 * en linea recta. Se usa 6000 m para dejar holgura y no perder aristas
 * validas por culpa del prefiltro.
 */
export const RADIO_PREFILTRO_M = 6000;

/**
 * Calibracion de las duraciones de ORS para bicicleta compartida.
 *
 * Medido sobre las 139 255 aristas del grafo real: el perfil
 * cycling-regular asume 18.0 km/h con varianza casi nula (p25 17.8,
 * p95 18.0). Es una velocidad plana: no modela semaforos, altos, cuestas
 * ni el tipo de bicicleta. Corresponde a una bici ligera con ciclista en
 * forma, no a una MiBici urbana de 3 velocidades con canastilla.
 *
 * 18.0 / 1.38 = 13 km/h, la misma cifra que ya usaba el modo respaldo.
 *
 * El sesgo es deliberado y asimetrico: subestimar el tiempo le cuesta al
 * usuario un cargo real, sobreestimarlo solo le sugiere una parada de mas.
 * Ante la duda, lento.
 */
export const FACTOR_CALIBRACION_BICI = 1.38;

/** Velocidades de respaldo, solo cuando OpenRouteService no responde. */
export const VELOCIDAD_CAMINATA_KMH = 4.5;
export const VELOCIDAD_BICI_KMH = 13;

/**
 * Factor de rodeo: cuanto mas larga es la calle real que la linea recta.
 * Solo aplica en modo respaldo.
 */
export const FACTOR_RODEO = 1.35;

export const SEGUNDOS_POR_MINUTO = 60;

export const VENTANA_EFECTIVA_SEG = VENTANA_EFECTIVA_MIN * SEGUNDOS_POR_MINUTO;
export const PENALIZACION_ANCLAJE_SEG = PENALIZACION_ANCLAJE_MIN * SEGUNDOS_POR_MINUTO;

/** Nodos sentinela del grafo efimero que se arma en cada consulta. */
export const NODO_ORIGEN = -1;
export const NODO_DESTINO = -2;
