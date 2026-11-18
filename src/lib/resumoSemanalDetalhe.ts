import { z } from 'zod';

// O resumo da semana que o motorista abre no app. É a fotografia dos números
// que o escritório viu na lista de Contas/Resumo ao fechar a semana, gravada
// junto com o líquido (motorista_liquido_semanal.detalhe): o motorista vê
// exatamente o que conta para o pagamento, sem recalcular nada do lado dele.

const eur = z.number().finite();

const retencaoSchema = z.object({
  totalLiquido: eur,
  taxaIva: eur,
  iva: eur,
  totalDocumento: eur,
  taxaIrs: eur,
  irs: eur,
  totalAReceber: eur,
});

export const detalheResumoSchema = z.object({
  versao: z.literal(1),
  receitas: z.object({ bolt: eur, uber: eur, outras: eur }),
  /** Total de receitas como o documento do escritório o mostra (já com o corte). */
  totalReceitas: eur,
  despesas: z.object({
    aluguer: eur,
    combustivel: eur,
    portagens: eur,
    outros_custos: eur,
    slot: eur,
    caucao: eur,
    seguros: eur,
    reparacoes: eur,
  }),
  totalDespesas: eur,
  /** Só motoristas com Retenção: linhas de IVA e IRS. */
  retencao: retencaoSchema.nullable(),
  liquido: eur,
});

export type DetalheResumoSemanal = z.infer<typeof detalheResumoSchema>;

export interface EntradaDetalheResumo {
  faturadoBolt: number;
  faturadoUber: number;
  outrasReceitas: number;
  /** Receita da semana depois do corte (a que entra no líquido). */
  receitaAjustada: number;
  despesas: DetalheResumoSemanal['despesas'];
  retencao: DetalheResumoSemanal['retencao'];
  liquido: number;
}

const arredondar = (v: number) => Math.round(v * 100) / 100;

/**
 * Fotografia a gravar com o líquido. Devolve null se as parcelas não somarem ao
 * líquido gravado: mais vale o motorista ver "detalhe indisponível" do que um
 * resumo cujas contas não batem com o valor que vai receber.
 */
export function construirDetalheResumo(e: EntradaDetalheResumo): DetalheResumoSemanal | null {
  const despesas = {
    aluguer: arredondar(e.despesas.aluguer),
    combustivel: arredondar(e.despesas.combustivel),
    portagens: arredondar(e.despesas.portagens),
    outros_custos: arredondar(e.despesas.outros_custos),
    slot: arredondar(e.despesas.slot),
    caucao: arredondar(e.despesas.caucao),
    seguros: arredondar(e.despesas.seguros),
    reparacoes: arredondar(e.despesas.reparacoes),
  };
  const totalDespesas = arredondar(Object.values(despesas).reduce((a, b) => a + b, 0));
  const totalReceitas = arredondar(e.receitaAjustada);
  const liquido = arredondar(e.liquido);

  const esperado = e.retencao ? e.retencao.totalAReceber : totalReceitas - totalDespesas;
  if (!Number.isFinite(esperado) || Math.abs(esperado - liquido) > 0.02) return null;

  const detalhe: DetalheResumoSemanal = {
    versao: 1,
    receitas: {
      bolt: arredondar(e.faturadoBolt),
      uber: arredondar(e.faturadoUber),
      outras: arredondar(e.outrasReceitas),
    },
    totalReceitas,
    despesas,
    totalDespesas,
    retencao: e.retencao,
    liquido,
  };
  return detalheResumoSchema.safeParse(detalhe).success ? detalhe : null;
}

/** Lê o JSON da base; null se não existir ou não for da forma esperada. */
export function lerDetalheResumo(json: unknown): DetalheResumoSemanal | null {
  const r = detalheResumoSchema.safeParse(json);
  return r.success ? r.data : null;
}

/** Erro de gravar numa base que ainda não tem a coluna `detalhe`. */
export function ehColunaDetalheEmFalta(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  const msg = (erro.message ?? '').toLowerCase();
  return (
    (erro.code === '42703' || erro.code === 'PGRST204' || msg.includes('column')) &&
    msg.includes('detalhe')
  );
}
