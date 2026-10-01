// Dados do modelo que o site de rent-a-car mostra ("Clio ou similar"). Os limites
// repetem os CHECK de viatura_modelos (migração 20261001110000), para o erro
// aparecer em PT no formulário em vez de vir da base.
import { z } from 'zod';

const inteiroOuNulo = (min: number, max: number, msg: string) =>
  z.number().int(msg).min(min, msg).max(max, msg).nullable();

export const modeloSiteSchema = z.object({
  caixa: z.enum(['manual', 'automatica']).nullable(),
  lugares: inteiroOuNulo(1, 9, 'Lugares entre 1 e 9'),
  portas: inteiroOuNulo(2, 6, 'Portas entre 2 e 6'),
  bagageira: inteiroOuNulo(0, 10, 'Bagageira entre 0 e 10 malas'),
  ar_condicionado: z.boolean(),
  imagem_url: z.string().url('URL inválido').nullable(),
});
export type ModeloSiteInput = z.infer<typeof modeloSiteSchema>;

export const modeloSiteVazio: ModeloSiteInput = {
  caixa: null,
  lugares: null,
  portas: null,
  bagageira: null,
  ar_condicionado: true,
  imagem_url: null,
};

/** Linha de viatura_modelos tal como vem da base (caixa é text). */
export interface LinhaModeloSite {
  caixa?: string | null;
  lugares?: number | null;
  portas?: number | null;
  bagageira?: number | null;
  ar_condicionado?: boolean | null;
  imagem_url?: string | null;
}

export function modeloSiteDeLinha(row: LinhaModeloSite | null | undefined): ModeloSiteInput {
  const caixa = row?.caixa === 'manual' || row?.caixa === 'automatica' ? row.caixa : null;
  return {
    caixa,
    lugares: row?.lugares ?? null,
    portas: row?.portas ?? null,
    bagageira: row?.bagageira ?? null,
    ar_condicionado: row?.ar_condicionado ?? true,
    imagem_url: row?.imagem_url ?? null,
  };
}

// Limites do bucket modelos-viaturas (2 MB, jpeg/png/webp): validar antes evita
// um upload que o Storage recusa com uma mensagem em inglês.
const EXTENSOES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const TAMANHO_MAXIMO = 2 * 1024 * 1024;

export function validarFotoModelo(ficheiro: Pick<File, 'type' | 'size'>): string | null {
  if (!EXTENSOES[ficheiro.type]) return 'Use JPEG, PNG ou WebP.';
  if (ficheiro.size > TAMANHO_MAXIMO) return 'A foto tem de ter até 2 MB.';
  return null;
}

/** <org>/<modelo>.<ext>: a pasta da org é o que a policy de escrita exige. */
export function caminhoFotoModelo(
  orgId: string,
  modeloId: string,
  ficheiro: Pick<File, 'type'>
): string {
  return `${orgId}/${modeloId}.${EXTENSOES[ficheiro.type] ?? 'jpg'}`;
}
