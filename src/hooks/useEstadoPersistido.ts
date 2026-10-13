import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { subWeeks } from 'date-fns';

/**
 * 'local' sobrevive a fechar o browser (ordenação: escolhe-se uma vez).
 * 'sessao' só dura enquanto o separador estiver aberto (pesquisa e filtros:
 * voltar à página mantém-nos, mas no dia seguinte a lista não aparece
 * filtrada sem ninguém se lembrar porquê).
 */
export type Armazenamento = 'local' | 'sessao';

export interface OpcoesEstadoPersistido<T> {
  armazenamento?: Armazenamento;
  serializar?: (valor: T) => string;
  /** Devolve undefined quando o texto guardado não serve — fica o valor inicial. */
  desserializar?: (texto: string) => T | undefined;
}

const PREFIXO = 'wegest:estado:';

function armazenamentoDe(tipo: Armazenamento): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return tipo === 'local' ? window.localStorage : window.sessionStorage;
  } catch (error: unknown) {
    // Modo privado ou cookies bloqueados: o filtro funciona, só não fica guardado.
    console.warn('[estado persistido] armazenamento indisponível', error);
    return null;
  }
}

export function lerGuardado(chave: string, tipo: Armazenamento): string | null {
  const armazenamento = armazenamentoDe(tipo);
  if (!armazenamento) return null;
  try {
    return armazenamento.getItem(PREFIXO + chave);
  } catch (error: unknown) {
    console.warn('[estado persistido] não foi possível ler', chave, error);
    return null;
  }
}

export function guardar(chave: string, tipo: Armazenamento, texto: string): void {
  const armazenamento = armazenamentoDe(tipo);
  if (!armazenamento) return;
  try {
    armazenamento.setItem(PREFIXO + chave, texto);
  } catch (error: unknown) {
    console.warn('[estado persistido] não foi possível guardar', chave, error);
  }
}

const ehObjectoSimples = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);

/** JSON, mas só aceita um valor do mesmo tipo do inicial; objectos juntam-se ao
 *  inicial, para um filtro novo acrescentado depois não ficar undefined. */
function desserializarJson<T>(inicial: T) {
  return (texto: string): T | undefined => {
    try {
      const valor: unknown = JSON.parse(texto);
      if (typeof valor !== typeof inicial) return undefined;
      if (ehObjectoSimples(inicial)) {
        return ehObjectoSimples(valor) ? ({ ...inicial, ...valor } as T) : undefined;
      }
      return valor as T;
    } catch {
      // Texto guardado por uma versão antiga ou mexido à mão: fica o inicial.
      return undefined;
    }
  };
}

/** useState que se lembra do valor ao sair e voltar à página. */
export function useEstadoPersistido<T>(
  chave: string,
  inicial: T | (() => T),
  opcoes: OpcoesEstadoPersistido<T> = {}
): [T, Dispatch<SetStateAction<T>>] {
  const armazenamento = opcoes.armazenamento ?? 'sessao';
  // Em ref: um serializar escrito inline mudava a cada render e regravava sempre.
  const serializar = useRef(opcoes.serializar ?? ((v: T) => JSON.stringify(v)));

  const [valor, setValor] = useState<T>(() => {
    const valorInicial = typeof inicial === 'function' ? (inicial as () => T)() : inicial;
    const texto = lerGuardado(chave, armazenamento);
    if (texto === null) return valorInicial;
    const desserializar = opcoes.desserializar ?? desserializarJson(valorInicial);
    const guardado = desserializar(texto);
    return guardado === undefined ? valorInicial : guardado;
  });

  useEffect(() => {
    guardar(chave, armazenamento, serializar.current(valor));
  }, [chave, armazenamento, valor]);

  return [valor, setValor];
}

/** Para semanas e datas: guarda em ISO, recusa datas inválidas. */
export const opcoesData: OpcoesEstadoPersistido<Date> = {
  serializar: (d) => d.toISOString(),
  desserializar: (texto) => {
    const d = new Date(texto);
    return Number.isNaN(d.getTime()) ? undefined : d;
  },
};

/** Como opcoesData, para filtros de data que podem estar vazios. */
export const opcoesDataOuNada: OpcoesEstadoPersistido<Date | null> = {
  serializar: (d) => (d ? d.toISOString() : ''),
  desserializar: (texto) => {
    if (texto === '') return null;
    const d = new Date(texto);
    return Number.isNaN(d.getTime()) ? undefined : d;
  },
};

/** Semana escolhida nos ecrãs semanais; por omissão a semana passada, a que se fecha. */
export function useSemanaPersistida(chave: string): [Date, Dispatch<SetStateAction<Date>>] {
  return useEstadoPersistido<Date>(chave, () => subWeeks(new Date(), 1), opcoesData);
}
