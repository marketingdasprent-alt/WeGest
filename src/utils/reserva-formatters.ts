/**
 * Helpers de data para formulários de reserva.
 * Extraídos de ReservaTabGeral para reutilização.
 */

const padDate = (n: number) => String(n).padStart(2, '0');

export function formatLocalInput(d: Date): string {
  return `${d.getFullYear()}-${padDate(d.getMonth() + 1)}-${padDate(d.getDate())}T${padDate(d.getHours())}:${padDate(d.getMinutes())}`;
}

export function diferencaDias(inicio: string, fim: string): number | null {
  if (!inicio || !fim) return null;
  const di = new Date(inicio).getTime();
  const df = new Date(fim).getTime();
  if (Number.isNaN(di) || Number.isNaN(df) || df <= di) return null;
  return Math.max(1, Math.ceil((df - di) / (1000 * 60 * 60 * 24)));
}

export function addDaysToLocalInput(localInput: string, days: number): string | null {
  if (!localInput) return null;
  const d = new Date(localInput);
  if (Number.isNaN(d.getTime())) return null;
  return formatLocalInput(new Date(d.getTime() + days * 24 * 60 * 60 * 1000));
}

export function addOneMonthSameDayToLocalInput(localInput: string): string | null {
  if (!localInput) return null;
  const d = new Date(localInput);
  if (Number.isNaN(d.getTime())) return null;
  return formatLocalInput(
    new Date(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes())
  );
}

export function firstDayNextMonthToLocalInput(localInput: string): string | null {
  if (!localInput) return null;
  const d = new Date(localInput);
  if (Number.isNaN(d.getTime())) return null;
  return formatLocalInput(
    new Date(d.getFullYear(), d.getMonth() + 1, 1, d.getHours(), d.getMinutes())
  );
}
