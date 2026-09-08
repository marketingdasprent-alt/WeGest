// Constrói as linhas de `motorista_liquido_semanal` a gravar a partir da lista
// de Contas/Resumo — o líquido de TODOS os motoristas da semana, de uma vez.
//
// Até aqui o líquido só ficava gravado quando alguém abria o Resumo Financeiro
// de um motorista, um a um: quem nunca fosse aberto não tinha líquido nenhum,
// não tinha movimento no perfil, e por isso nunca aparecia nas Dívidas mesmo a
// dever (caso real: 231 motoristas activos, 2 com líquido gravado).
//
// Grava-se o valor JÁ CALCULADO pela lista — não se recalcula aqui. O que fica
// gravado tem de ser o mesmo número que esteve no ecrã.

export interface ResumoParaGravar {
  motorista_id?: string;
  driver_name: string;
  liquido: number;
}

export interface LinhaLiquidoSemanal {
  motorista_id: string;
  motorista_nome: string;
  semana_inicio: string;
  semana_fim: string;
  liquido: number;
  gravado_em: string;
  gravado_por: string | null;
}

export interface ContextoGravacao {
  /** `yyyy-MM-dd` — a mesma semana que a lista está a mostrar. */
  semanaInicio: string;
  semanaFim: string;
  gravadoEm: string;
  gravadoPor: string | null;
}

/**
 * Uma linha por motorista identificado. Linhas de plataforma sem motorista
 * associado (um condutor da Bolt que ainda não foi ligado a ninguém no CRM)
 * ficam de fora: não há perfil onde gravar, e inventar um seria pior.
 *
 * Um líquido de 0 é gravado na mesma — é uma afirmação ("esta semana não deu
 * nem deve"), e o trigger encarrega-se de apagar o movimento que porventura
 * exista de uma gravação anterior.
 */
export function construirLinhasLiquidoSemanal(
  resumos: readonly ResumoParaGravar[],
  ctx: ContextoGravacao
): LinhaLiquidoSemanal[] {
  const porMotorista = new Map<string, LinhaLiquidoSemanal>();

  for (const r of resumos) {
    if (!r.motorista_id) continue;
    if (!Number.isFinite(r.liquido)) continue;

    // A lista já funde duplicados por motorista, mas o upsert em lote rebenta
    // com "ON CONFLICT DO UPDATE command cannot affect row a second time" se
    // duas linhas trouxerem o mesmo motorista. Fica a última, como no ecrã.
    porMotorista.set(r.motorista_id, {
      motorista_id: r.motorista_id,
      motorista_nome: r.driver_name,
      semana_inicio: ctx.semanaInicio,
      semana_fim: ctx.semanaFim,
      liquido: Number(r.liquido.toFixed(2)),
      gravado_em: ctx.gravadoEm,
      gravado_por: ctx.gravadoPor,
    });
  }

  return Array.from(porMotorista.values());
}
