import { z } from 'npm:zod@3.25.76';
import { readBoundedJson, RequestBodyError } from '../_shared/http/boundedJson.ts';

export const MAX_IMPORT_ROWS = 10000;
const text = z.string().max(1000).nullish();
const amount = z.union([z.number().finite(), z.string().max(100)]).nullish();
const transactionSchema = z
  .object({
    transaction_date: text,
    matricula: text,
    nr_equipamento: text,
    operador: text,
    barreira_entrada: text,
    barreira_saida: text,
    amount,
    tipo_evento: text,
    contrato: text,
    transaction_id: text,
    data_entrada: text,
    data_saida: text,
    local_entrada: text,
    local_saida: text,
    servico: text,
    valor: amount,
    contaMobilidade: text,
  })
  .passthrough();
const importSchema = z
  .object({
    integracao_id: z.string().uuid(),
    dados_csv: z.string().nullish(),
    transacoes: z.array(transactionSchema).max(MAX_IMPORT_ROWS).nullish(),
  })
  .refine((value) => Boolean(value.dados_csv) || Array.isArray(value.transacoes));

// Vai para via_verde_sync_queue.error_message: diz o campo, sem índices de linha.
function motivo(error: z.ZodError): string {
  const excedeLinhas = error.issues.some(
    (issue) => issue.code === 'too_big' && issue.path.join('.') === 'transacoes'
  );
  if (excedeLinhas) return `transacoes (máximo ${MAX_IMPORT_ROWS})`;
  const campos = error.issues.map((issue) =>
    issue.path.map((parte) => (typeof parte === 'number' ? '[]' : parte)).join('.')
  );
  const unicos = [...new Set(campos.map((campo) => campo.replaceAll('.[]', '[]') || 'dados_csv ou transacoes'))];
  return unicos.slice(0, 3).join(', ');
}

export async function readViaVerdeImport(req: Request) {
  const result = importSchema.safeParse(await readBoundedJson(req, 10 * 1024 * 1024));
  if (!result.success) {
    throw new RequestBodyError(`Importação Via Verde inválida: ${motivo(result.error)}`);
  }
  return result.data;
}
