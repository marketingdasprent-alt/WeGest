import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const ESTADOS_ABERTO = ['pendente', 'aberto', 'em_andamento', 'aguardando'];

/** Ordem de gravidade, do mais grave para o menos. */
export const PRIORIDADES = ['urgente', 'alta', 'media', 'baixa'] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

export interface AssistenciaInicioKpis {
  porResolver: number;
  naoAtribuidos: number;
  atribuidosAMim: number;
  resolvidosHoje: number;
  /** Abertos cuja `data_estimada` já passou. */
  prazoUltrapassado: number;
}

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
  prioridade: Prioridade | null;
  atribuido: boolean;
  criadoEm: string | null;
  dataEstimada: string | null;
  /** Dias corridos desde a abertura. */
  diasAberto: number;
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
  /** Aberturas e resoluções ao dia — o gráfico agrupa a partir daqui. */
  movimentos: MovimentoTicket[];
  loading: boolean;
}

const KPIS_VAZIO: AssistenciaInicioKpis = {
  porResolver: 0,
  naoAtribuidos: 0,
  atribuidosAMim: 0,
  resolvidosHoje: 0,
  prazoUltrapassado: 0,
};

const VAZIO: Omit<AssistenciaInicioResumo, 'loading'> = {
  kpis: KPIS_VAZIO,
  categorias: [],
  prioridades: [],
  semPrioridade: 0,
  porAtribuir: [],
  atrasados: [],
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
            'id, numero, titulo, status, prioridade, atribuido_a, categoria_id, created_at, data_estimada, data_resolucao'
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

      const paraTicket = (t: (typeof abertos)[number]): TicketAberto => ({
        id: t.id,
        numero: t.numero,
        titulo: t.titulo,
        prioridade: (t.prioridade as Prioridade | null) ?? null,
        atribuido: Boolean(t.atribuido_a),
        criadoEm: t.created_at,
        dataEstimada: t.data_estimada,
        diasAberto: diasDesde(t.created_at, agora),
      });

      // Prazo ultrapassado: a data estimada é um dia de calendário, por isso
      // compara-se ao dia — um ticket com prazo para hoje ainda não está
      // atrasado.
      const atrasados = abertos
        .filter((t) => t.data_estimada && dia(t.data_estimada)! < hojeStr!)
        .map(paraTicket)
        .sort((a, b) => (a.dataEstimada! < b.dataEstimada! ? -1 : 1));

      const porAtribuir = abertos
        .filter((t) => !t.atribuido_a)
        .map(paraTicket)
        .sort((a, b) => b.diasAberto - a.diasAberto);

      const kpis: AssistenciaInicioKpis = {
        porResolver: abertos.length,
        naoAtribuidos: porAtribuir.length,
        atribuidosAMim: userId ? abertos.filter((t) => t.atribuido_a === userId).length : 0,
        resolvidosHoje: todosTickets.filter((t) => dia(t.data_resolucao) === hojeStr).length,
        prazoUltrapassado: atrasados.length,
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
