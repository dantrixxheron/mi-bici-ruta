import { SEGUNDOS_POR_MINUTO } from '../dominio/constantes';

export function minutos(segundos: number): string {
  const m = Math.round(segundos / SEGUNDOS_POR_MINUTO);
  if (m < 60) return `${m} min`;
  const horas = Math.floor(m / 60);
  const resto = m % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

export function distancia(metros: number): string {
  return metros < 1000 ? `${Math.round(metros)} m` : `${(metros / 1000).toFixed(1)} km`;
}
