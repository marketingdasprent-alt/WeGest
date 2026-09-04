// Construção do bloco "Precisa da tua atenção" da dashboard de frota.
// Separado do componente por ser lógica pura — decide o que aparece, com que
// cor e por que ordem, a partir de números que já vêm carregados. É também o
// que faz o DashboardFrota.tsx caber no limite de 500 linhas.
import { format, addMonths } from 'date-fns';
import { pt } from 'date-fns/locale';
import { CalendarClock, ShieldAlert, Wallet, UserPlus, FileText } from 'lucide-react';
import type { CategoriaAlerta, CorAlerta } from '@/components/dashboard/AlertaCategoriaRow';
import type { ContasAReceber } from '@/hooks/useContasAReceber';
import { formatCurrency } from './atividade';

export interface EntradasAlertasFrota {
  contratosExpirados: any[];
  contratosAPrazo: any[];
  extintoresAPrazo: any[];
  contasAReceber: ContasAReceber | undefined;
  isExecutivo: boolean;
  candidaturasPendentes: number;
}

/** No máximo 4 categorias — nunca uma lista longa. */
export function construirAlertasFrota({
  contratosExpirados,
  contratosAPrazo,
  extintoresAPrazo,
  contasAReceber,
  isExecutivo,
  candidaturasPendentes,
}: EntradasAlertasFrota): CategoriaAlerta[] {
  const categorias: CategoriaAlerta[] = [];

  const totalContratos = contratosExpirados.length + contratosAPrazo.length;
  if (totalContratos > 0) {
    const pior = contratosExpirados[0] ?? contratosAPrazo[0];
    const codigo =
      pior.numero_contrato != null
        ? `CT-${String(pior.numero_contrato).padStart(4, '0')}`
        : pior.motorista_nome;
    const linha = contratosExpirados.includes(pior)
      ? `${codigo} expirou há ${Math.abs(pior._diffDays)} dia${Math.abs(pior._diffDays) !== 1 ? 's' : ''}`
      : `${codigo} renova em ${format(pior._renovacao, 'dd MMM', { locale: pt })}`;
    const outros = totalContratos - 1;
    categorias.push({
      id: 'contratos',
      icon: FileText,
      cor: contratosExpirados.length > 0 ? 'destructive' : 'warning',
      titulo: 'Contratos',
      descricao: linha,
      detalhe:
        outros > 0
          ? `+${outros} outro${outros !== 1 ? 's' : ''} contrato${outros !== 1 ? 's' : ''}`
          : null,
      contagem: totalContratos,
      href: totalContratos === 1 ? `/renting/contratos/${pior.id}` : '/renting/contratos',
    });
  }

  if (extintoresAPrazo.length > 0) {
    // A lista vem ordenada por validade ascendente, logo [0] é o pior caso —
    // e é dele que fala a linha principal. O agregado desce para a segunda
    // linha: uma matrícula dá para agir, um número sozinho não dá.
    const pior = extintoresAPrazo[0];
    const validadePior = new Date(pior.extintor_validade);
    const piorExpirado = validadePior.getTime() < Date.now();
    const algumExpirado = extintoresAPrazo.some(
      (e) => new Date(e.extintor_validade).getTime() < Date.now()
    );
    const outros = extintoresAPrazo.length - 1;
    categorias.push({
      id: 'seguranca',
      icon: ShieldAlert,
      cor: algumExpirado ? 'destructive' : 'warning',
      titulo: 'Segurança',
      descricao: piorExpirado
        ? `${pior.matricula} — extintor expirado`
        : `${pior.matricula} — extintor expira ${format(validadePior, 'dd MMM', { locale: pt })}`,
      detalhe:
        outros > 0
          ? `+${outros} outra${outros !== 1 ? 's' : ''} viatura${outros !== 1 ? 's' : ''}`
          : null,
      contagem: extintoresAPrazo.length,
      href: extintoresAPrazo.length === 1 ? `/viaturas/${pior.id}` : '/viaturas',
    });
  }

  if (isExecutivo && (contasAReceber?.emAberto?.length ?? 0) > 0) {
    const emAberto = contasAReceber!.emAberto;
    const total = emAberto.reduce((s, c) => s + c.saldo, 0);
    const algumCritico = emAberto.some((c) => c.diasEmAberto > 60);
    // `emAberto` vem ordenado por dias em aberto (desc) — [0] é a mais antiga.
    const pior = emAberto[0];
    const outras = emAberto.length - 1;
    categorias.push({
      id: 'cobrancas',
      icon: Wallet,
      cor: algumCritico ? 'destructive' : 'warning',
      titulo: 'Cobranças',
      descricao: `${pior.destinatarioNome} · ${formatCurrency(pior.saldo)} há ${pior.diasEmAberto} dias`,
      detalhe:
        outras > 0
          ? `+${outras} outra${outras !== 1 ? 's' : ''} · ${formatCurrency(total)} em aberto`
          : null,
      contagem: emAberto.length,
      href: '/administrativo/faturacao',
    });
  }

  if (candidaturasPendentes > 0) {
    categorias.push({
      id: 'motoristas',
      icon: UserPlus,
      cor: 'warning',
      titulo: 'Motoristas',
      descricao: `${candidaturasPendentes} candidatura${candidaturasPendentes !== 1 ? 's' : ''} aguarda${candidaturasPendentes !== 1 ? 'm' : ''} aprovação`,
      detalhe: null,
      contagem: candidaturasPendentes,
      href: '/motoristas/candidaturas',
    });
  }

  // O que já falhou (destructive) antes do que ainda está a prazo (warning).
  // Antes a ordem era a de construção — o tipo de alerta —, o que punha um
  // contrato a renovar daqui a 50 dias acima de faturas críticas.
  // `sort` é estável, por isso dentro do mesmo nível a ordem por tipo mantém-se.
  return categorias.sort((a, b) => (a.cor === b.cor ? 0 : a.cor === 'destructive' ? -1 : 1));
}

/**
 * Separa os contratos activos em "a renovar" (até 60 dias) e "expirados".
 *
 * Renovação = `data_inicio` + `duracao_meses`, quando não há `data_fim`.
 * Deduplica pela chave motorista+viatura+início: a mesma prestação aparece por
 * vezes duas vezes na base, e fica a de número mais alto.
 */
export function classificarContratos(contratosAtivos: any[] | null, agora = new Date()) {
  const hojeSemHora = new Date(agora);
  hojeSemHora.setHours(0, 0, 0, 0);

  const todos = (contratosAtivos || []).map((ct: any) => {
    const fim = ct.data_fim
      ? new Date(ct.data_fim + 'T00:00:00')
      : addMonths(new Date(ct.data_inicio + 'T00:00:00'), ct.duracao_meses ?? 12);
    const diffDays = Math.ceil((fim.getTime() - hojeSemHora.getTime()) / (1000 * 60 * 60 * 24));
    return { ...ct, _renovacao: fim, _diffDays: diffDays };
  });

  const unicos = Array.from(
    todos
      .reduce((map: Map<string, any>, ct: any) => {
        const key = `${ct.motorista_id ?? ''}|${ct.viatura_id ?? ''}|${ct.data_inicio ?? ''}`;
        const existente = map.get(key);
        if (!existente || (ct.numero_contrato ?? 0) > (existente.numero_contrato ?? 0)) {
          map.set(key, ct);
        }
        return map;
      }, new Map<string, any>())
      .values()
  );

  const porRenovacao = (a: any, b: any) => a._renovacao.getTime() - b._renovacao.getTime();
  return {
    aPrazo: unicos.filter((ct: any) => ct._diffDays >= 0 && ct._diffDays <= 60).sort(porRenovacao),
    expirados: unicos.filter((ct: any) => ct._diffDays < 0).sort(porRenovacao),
  };
}
