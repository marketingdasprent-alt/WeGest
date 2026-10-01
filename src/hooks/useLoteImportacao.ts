import { useMemo, useState } from 'react';

import {
  chaveDoFicheiro,
  contasComDadosNaSemana,
  useAnalisarFicheiros,
  type AnaliseImportacao,
  type ImportacaoAPedido,
} from '@/hooks/useImportacaoAutomatica';
import {
  contasEmFalta,
  faltaParaImportar,
  repetidosNoLote,
  type ContaImportacao,
  type Periodo,
  type PlataformaImportacao,
} from '@/utils/importacaoAutomatica';

export interface LinhaLote {
  chave: string;
  nome: string;
  plataforma: PlataformaImportacao | null;
  contaId: string | null;
  periodo: Periodo | null;
  motivo: string;
  falta: string | null;
  substitui: boolean;
  repetido: boolean;
}

interface Escolha {
  contaId?: string;
  periodo?: Periodo;
}

/** O lote de ficheiros largados: o que se detectou e o que a pessoa corrigiu. */
export function useLoteImportacao(contas: ContaImportacao[]) {
  const analisar = useAnalisarFicheiros(contas);
  const [analise, setAnalise] = useState<AnaliseImportacao>({ ficheiros: [], comDados: {} });
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});

  // O erro da análise fica em analisar.error e aparece no ecrã.
  const adicionar = (novos: File[]) => {
    const jaLa = new Set(analise.ficheiros.map((f) => f.chave));
    const porAnalisar = novos.filter((f) => !jaLa.has(chaveDoFicheiro(f)));
    if (porAnalisar.length === 0) return;
    analisar.mutate(porAnalisar, {
      onSuccess: (r) =>
        setAnalise((a) => ({
          ficheiros: [...a.ficheiros, ...r.ficheiros],
          comDados: { ...a.comDados, ...r.comDados },
        })),
    });
  };

  const retirar = (chave: string) =>
    setAnalise((a) => ({ ...a, ficheiros: a.ficheiros.filter((f) => f.chave !== chave) }));

  const escolher = (chave: string, e: Escolha) => {
    setEscolhas((atual) => ({ ...atual, [chave]: { ...atual[chave], ...e } }));
    const inicio = e.periodo?.inicio;
    if (inicio && !(inicio in analise.comDados)) {
      contasComDadosNaSemana(inicio)
        .then((c) => setAnalise((a) => ({ ...a, comDados: { ...a.comDados, [inicio]: c } })))
        .catch((err: unknown) =>
          console.warn('[importação automática] dados da semana', inicio, err)
        );
    }
  };

  const limpar = () => {
    setAnalise({ ficheiros: [], comDados: {} });
    setEscolhas({});
  };

  const linhas = useMemo<LinhaLote[]>(() => {
    const base = analise.ficheiros.map((f) => {
      const e = escolhas[f.chave] ?? {};
      const contaId = e.contaId ?? f.deteccao.contaId;
      const periodo = e.periodo ?? f.periodo;
      const comDados = periodo ? (analise.comDados[periodo.inicio] ?? []) : [];
      return {
        chave: f.chave,
        nome: f.ficheiro.name,
        plataforma: f.plataforma,
        contaId,
        periodo,
        motivo: e.contaId ? 'Conta escolhida à mão.' : f.deteccao.motivo,
        falta: faltaParaImportar({ plataforma: f.plataforma, contaId, periodo }),
        substitui: !!contaId && comDados.includes(contaId),
        repetido: false,
      };
    });
    const repetidos = repetidosNoLote(base);
    return base.map((l) => ({ ...l, repetido: repetidos.has(l.chave) }));
  }, [analise, escolhas]);

  const faltas = useMemo(
    () =>
      Object.entries(analise.comDados).map(([inicio, comDados]) => {
        const semana = linhas.find((l) => l.periodo?.inicio === inicio)?.periodo;
        const nosFicheiros = new Set(
          linhas.filter((l) => l.periodo?.inicio === inicio && l.contaId).map((l) => l.contaId!)
        );
        return {
          semana: semana ?? { inicio, fim: inicio },
          contas: contasEmFalta(contas, nosFicheiros, new Set(comDados)),
        };
      }),
    [analise.comDados, linhas, contas]
  );

  const pedidos = (): ImportacaoAPedido[] =>
    linhas.map((l) => ({
      chave: l.chave,
      plataforma: l.plataforma!,
      contaId: l.contaId!,
      periodo: l.periodo,
      texto: analise.ficheiros.find((f) => f.chave === l.chave)!.texto,
      nomeFicheiro: l.nome,
    }));

  const pronto = linhas.length > 0 && linhas.every((l) => !l.falta && !l.repetido);

  return {
    linhas,
    faltas,
    adicionar,
    retirar,
    escolher,
    limpar,
    pedidos,
    pronto,
    analisando: analisar.isPending,
    erroAnalise: analisar.error,
  };
}
