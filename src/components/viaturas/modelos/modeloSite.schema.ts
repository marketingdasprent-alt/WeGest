// Dados do modelo que o site de rent-a-car mostra ("Clio ou similar"). Os limites
// repetem os CHECK de viatura_modelos (migração 20261001110000), para o erro
// aparecer em PT no formulário em vez de vir da base.
import { z } from 'zod';
import { SUPABASE_URL } from '@/integrations/supabase/env';

const inteiroOuNulo = (min: number, max: number, msg: string) =>
  z.number().int(msg).min(min, msg).max(max, msg).nullable();

/** URL público do bucket modelos-viaturas no projecto Supabase. */
export function prefixoFotosModelo(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/modelos-viaturas/`;
}

/**
 * A API publica imagem_url ao site: só aceita fotos do nosso bucket, nunca um
 * URL qualquer escrito à mão (imagem de terceiros ou rastreio no site).
 */
export function criarModeloSiteSchema(prefixoFotos: string) {
  return z.object({
    caixa: z.enum(['manual', 'automatica']).nullable(),
    lugares: inteiroOuNulo(1, 9, 'Lugares entre 1 e 9'),
    portas: inteiroOuNulo(2, 6, 'Portas entre 2 e 6'),
    bagageira: inteiroOuNulo(0, 10, 'Bagageira entre 0 e 10 malas'),
    ar_condicionado: z.boolean(),
    imagem_url: z
      .string()
      .url('URL inválido')
      .refine((u) => u.startsWith(prefixoFotos), 'A foto tem de ser carregada aqui, no WeGest.')
      .nullable(),
  });
}

export const modeloSiteSchema = criarModeloSiteSchema(prefixoFotosModelo(SUPABASE_URL));
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

const TODAS_AS_EXTENSOES = ['jpg', 'jpeg', 'png', 'webp'] as const;

/**
 * As fotos antigas deste modelo com outra extensão: trocar um .png por um .webp
 * deixava o .png órfão no bucket público. Remove-se antes do upload.
 */
export function outrosCaminhosFotoModelo(
  orgId: string,
  modeloId: string,
  caminhoNovo: string
): string[] {
  return TODAS_AS_EXTENSOES.map((ext) => `${orgId}/${modeloId}.${ext}`).filter(
    (c) => c !== caminhoNovo
  );
}
