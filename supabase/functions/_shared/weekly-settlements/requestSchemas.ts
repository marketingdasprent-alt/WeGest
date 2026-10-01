import { z } from 'npm:zod@3.25.76';
import { readBoundedJson, RequestBodyError } from '../http/boundedJson.ts';

export const MAX_SETTLEMENTS_PER_BATCH = 100;
const money = z.number().finite();
const text = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[^\r\n]*$/);
const settlementSchema = z.object({
  driver_name: text,
  email: z.string().trim().email().max(254),
  total_faturado: money,
  faturado_bolt: money,
  faturado_uber: money,
  liquido: money,
  combustivel: money.optional(),
  aluguer: money,
  reparacoes: money.optional(),
  outros_custos: money.optional(),
  periodo: text,
});
// O envelope é estrito; cada acerto valida-se à parte para um dado mau (ex.:
// email com acento) falhar só essa linha, como antes, em vez do lote todo.
const bulkSchema = z.object({
  settlements: z.array(z.unknown()).min(1).max(MAX_SETTLEMENTS_PER_BATCH),
});

export type Settlement = z.infer<typeof settlementSchema>;
export type SettlementItem =
  | { ok: true; settlement: Settlement }
  | { ok: false; label: string; error: string };

function rotuloDoItem(item: unknown, index: number): string {
  if (typeof item === 'object' && item !== null) {
    const { email, driver_name } = item as Record<string, unknown>;
    if (typeof email === 'string' && email.trim()) return email.trim().slice(0, 254);
    if (typeof driver_name === 'string' && driver_name.trim()) return driver_name.trim().slice(0, 200);
  }
  return `acerto #${index + 1}`;
}

export async function readSettlements(req: Request): Promise<SettlementItem[]> {
  const result = bulkSchema.safeParse(await readBoundedJson(req, 256 * 1024));
  if (!result.success) {
    throw new RequestBodyError(
      `Lote de acertos inválido: é preciso uma lista de 1 a ${MAX_SETTLEMENTS_PER_BATCH} acertos`
    );
  }
  return result.data.settlements.map((item, index): SettlementItem => {
    const parsed = settlementSchema.safeParse(item);
    if (parsed.success) return { ok: true, settlement: parsed.data };
    const campos = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || 'acerto'))];
    return {
      ok: false,
      label: rotuloDoItem(item, index),
      error: `Dados do acerto inválidos: ${campos.join(', ')}`,
    };
  });
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });
const weeklySchema = z.object({ semanaInicio: isoDate.optional(), semanaFim: isoDate.optional() });

export async function readWeeklyPeriod(req: Request) {
  const result = weeklySchema.safeParse(await readBoundedJson(req, 4096, true));
  if (!result.success) throw new RequestBodyError('Período semanal inválido');
  return result.data;
}
