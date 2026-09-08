import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const ESTADOS_ABERTO = ['pendente', 'aberto', 'em_andamento', 'aguardando'];

// NOTA sobre os dados (verificado na base a 2026-09-04): dos 141 tickets, os
// estados em uso são só 'resolvido' (128), 'pendente' (11) e 'aberto' (2).
// 'em_andamento' e 'aguardando' NUNCA foram usados, e nenhum ticket aberto tem
// mecânico, responsável, prazo ou reparação associada — o fluxo real vai de
// aberto/pendente directo a resolvido. Qualquer bloco assente nesses campos
// aparece vazio para sempre; já aconteceu duas vezes neste ecrã.

/** Ordem de gravidade, do mais grave para o menos. */
export const PRIORIDADES = ['urgente', 'alta', 'media', 'baixa'] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

export interface AssistenciaInicioKpis {
  porResolver: number;
  naoAtribuidos: number;
  atribuidosAMim: number;
  resolvidosHoje: number;
  /** Dias do ticket aberto há mais tempo. 0 quando não há nenhum. */
  diasMaisAntigo: number;
  /** Abertos há mais de `DIAS_ABERTO_DEMAIS`. */
  abertosHaMuito: number;
}

/** A partir daqui um ticket aberto deixa de ser normal e passa a ser acumulação. */
export const DIAS_ABERTO_DEMAIS = 30;

export interface CategoriaResumo {
  id: string;
  nome: string;
  cor: string;
  icone: string;
  contagem: number;
}

/** Ticket aberto, com o que a dashboard precisa para o listar e alertar. */
export interface TicketAberto {
  id: string;
  numero: number;
  titulo: string;
  status: string | null;
  prioridade: Prioridade | null;
  atribuido: boolean;
  criadoEm: string | null;
  dataEstimada: string | null;
  /** Dias corridos desde a abertura. */
  diasAberto: number;
  /** Matrícula da viatura do ticket — ver `viaturasComTicket`. */
  matricula: string | null;
}

/** Um ponto da série: quantos abriram e quantos se resolveram no balde. */
export interface MovimentoTicket {
  dia: string;
  abertos: number;
  resolvidos: number;
}

export interface AssistenciaInicioResumo {
  kpis: AssistenciaInicioKpis;
  categorias: CategoriaResumo[];
  /** Abertos por prioridade, do mais grave para o menos. */
  prioridades: { prioridade: Prioridade; contagem: number }[];
  /** Abertos sem prioridade gravada — não são "média", são desconhecidos. */
  semPrioridade: number;
  /** Abertos por atribuir, do mais antigo para o mais recente. */
  porAtribuir: TicketAberto[];
  /** Abertos com prazo ultrapassado, do mais atrasado para o menos. */
  atrasados: TicketAberto[];
  /** Abertos com a matrícula da viatura, do mais antigo para o mais recente. */
  viaturasComTicket: TicketAberto[];
  /** Aberturas e resoluções ao dia — o gráfico agrupa a partir daqui. */
  movimentos: MovimentoTicket[];
  loading: boolean;
}

const KPIS_VAZIO: AssistenciaInicioKpis = {
  porResolver: 0,
  naoAtribuidos: 0,
  atribuidosAMim: 0,
  resolvidosHoje: 0,
  diasMaisAntigo: 0,
  abertosHaMuito: 0,
};

const VAZIO: Omit<AssistenciaInicioResumo, 'loading'> = {
  kpis: KPIS_VAZIO,
  categorias: [],
  prioridades: [],
  semPrioridade: 0,
  porAtribuir: [],
  atrasados: [],
  viaturasComTicket: [],
  movimentos: [],
};

/** O dia (`yyyy-MM-dd`) de um timestamp, ou null se não houver. */
function dia(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 10) : null;
}

function diasDesde(iso: string | null | undefined, agora: Date): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 86_400_000));
}

/**
 * Tudo o que o ecrã "Início" da Assistência mostra, de uma só leitura da
 * tabela de tickets.
 *
 * A série do gráfico vem AO DIA e não já agrupada: o período é escolhido no
 * ecrã e mudá-lo não pode obrigar a ir outra vez à base de dados — os tickets
 * já cá estão todos.
 */
export function useAssistenciaInicioResumo(userId: string | null | undefined) {
  const [resumo, setResumo] = useState(VAZIO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      const agora = new Date();
      const hojeStr = dia(agora.toISOString());

      const [{ data: tickets }, { data: categoriasData }] = await Promise.all([
        supabase
          .from('assistencia_tickets')
          .select(
            'id, numero, titulo, status, prioridade, atribuido_a, categoria_id, viatura_id, created_at, data_estimada, data_resolucao'
          ),
        supabase
          .from('assistencia_categorias')
          .select('id, nome, cor, icone')
          .eq('ativo', true)
          .order('ordem', { ascending: true }),
      ]);
      if (cancelado) return;

      const todosTickets = tickets ?? [];
      const abertos = todosTickets.filter((t) => ESTADOS_ABERTO.includes(t.status));

      const paraTicket = (
        t: (typeof abertos)[number],
        matricula: string | null = null
      ): TicketAberto => ({
        id: t.id,
        numero: t.numero,
        titulo: t.titulo,
        status: t.status,
        prioridade: (t.prioridade as Prioridade | null) ?? null,
        atribuido: Boolean(t.atribuido_a),
        criadoEm: t.created_at,
        dataEstimada: t.data_estimada,
        diasAberto: diasDesde(t.created_at, agora),
        matricula,
      });

      // Prazo ultrapassado: a data estimada é um dia de calendário, por isso
      // compara-se ao dia — um ticket com prazo para hoje ainda não está
      // atrasado.
      const atrasados = abertos
        .filter((t) => t.data_estimada && dia(t.data_estimada)! < hojeStr!)
        .map((t) => paraTicket(t))
        .sort((a, b) => (a.dataEstimada! < b.dataEstimada! ? -1 : 1));

      const porAtribuir = abertos
        .filter((t) => !t.atribuido_a)
        .map((t) => paraTicket(t))
        .sort((a, b) => b.diasAberto - a.diasAberto);

      const kpis: AssistenciaInicioKpis = {
        porResolver: abertos.length,
        naoAtribuidos: porAtribuir.length,
        atribuidosAMim: userId ? abertos.filter((t) => t.atribuido_a === userId).length : 0,
        resolvidosHoje: todosTickets.filter((t) => dia(t.data_resolucao) === hojeStr).length,
        // O KPI mede IDADE e não prazo: nenhum ticket tem `data_estimada`
        // preenchida, por isso "fora do prazo" dava 0 para sempre e escondia
        // que há tickets abertos há mais de cem dias.
        diasMaisAntigo: abertos.reduce(
          (max, t) => Math.max(max, diasDesde(t.created_at, agora)),
          0
        ),
        abertosHaMuito: abertos.filter((t) => diasDesde(t.created_at, agora) > DIAS_ABERTO_DEMAIS)
          .length,
      };

      const contagemPorCategoria = new Map<string, number>();
      abertos.forEach((t) => {
        if (!t.categoria_id) return;
        contagemPorCategoria.set(
          t.categoria_id,
          (contagemPorCategoria.get(t.categoria_id) ?? 0) + 1
        );
      });

      const categorias = (categoriasData ?? []).map((c) => ({
        id: c.id,
        nome: c.nome,
        cor: c.cor ?? '#3B82F6',
        icone: c.icone ?? 'wrench',
        contagem: contagemPorCategoria.get(c.id) ?? 0,
      }));

      // Sem `?? 'media'`: um ticket sem prioridade gravada não é de prioridade
      // média, é um ticket que ninguém classificou. Somá-lo à média fazia o
      // ecrã afirmar uma coisa que a tabela não diz.
      const prioridades = PRIORIDADES.map((p) => ({
        prioridade: p,
        contagem: abertos.filter((t) => t.prioridade === p).length,
      }));
      const semPrioridade = abertos.length - prioridades.reduce((s, p) => s + p.contagem, 0);

      // Que viaturas têm problema por resolver — o único recorte com dados a
      // sério (ver a nota no topo do ficheiro). Filtrar por estado de oficina
      // ou por mecânico atribuído dava sempre lista vazia.
      const porIdade = [...abertos].sort(
        (a, b) => diasDesde(b.created_at, agora) - diasDesde(a.created_at, agora)
      );

      // Segunda consulta em vez de join embebido — mesma razão de
      // useViaturasNaOficina: a relação não está declarada como FK no PostgREST
      // e o embedding falharia em silêncio.
      const matriculaPorViatura = new Map<string, string | null>();
      const idsViatura = [...new Set(porIdade.map((t) => t.viatura_id).filter(Boolean))];
      if (idsViatura.length > 0) {
        const { data: viaturas } = await supabase
          .from('viaturas')
          .select('id, matricula')
          .in('id', idsViatura as string[]);
        if (cancelado) return;
        (viaturas ?? []).forEach((v) => matriculaPorViatura.set(v.id, v.matricula));
      }
      const viaturasComTicket = porIdade.map((t) =>
        paraTicket(t, matriculaPorViatura.get(t.viatura_id) ?? null)
      );

      // Um movimento por dia com actividade. Abrir e resolver são eventos
      // distintos: o mesmo ticket conta no dia em que abriu E no dia em que se
      // resolveu.
      const porDia = new Map<string, MovimentoTicket>();
      const registar = (chave: string | null, campo: 'abertos' | 'resolvidos') => {
        if (!chave) return;
        const actual = porDia.get(chave) ?? { dia: chave, abertos: 0, resolvidos: 0 };
        actual[campo] += 1;
        porDia.set(chave, actual);
      };
      todosTickets.forEach((t) => {
        registar(dia(t.created_at), 'abertos');
        registar(dia(t.data_resolucao), 'resolvidos');
      });

      setResumo({
        kpis,
        categorias,
        prioridades,
        semPrioridade,
        porAtribuir,
        atrasados,
        viaturasComTicket,
        movimentos: [...porDia.values()].sort((a, b) => (a.dia < b.dia ? -1 : 1)),
      });
      setLoading(false);
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [userId]);

  return { ...resumo, loading };
}
