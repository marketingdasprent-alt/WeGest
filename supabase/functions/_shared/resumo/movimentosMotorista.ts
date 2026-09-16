export interface MovimentoMotorista {
  tipo: string | null;
  categoria: string | null;
  valor: number | string | null;
}

export type DestinoMovimento =
  | 'receita_outras'
  | 'caucao'
  | 'seguros'
  | 'slot'
  | 'outros'
  | 'ignorado';

export interface Classificacao {
  destino: DestinoMovimento;
  motivo?: string;
}

export const DEBITOS_QUE_O_CONTRATO_COBRE = ['aluguer', 'renda_viatura'];

const JA_CALCULADAS_COMO_DEBITO = [...DEBITOS_QUE_O_CONTRATO_COBRE, 'reparacao'];

const JA_CONTADAS_COMO_RECEITA = ['bolt', 'uber'];

const ESCRITAS_PELO_PROPRIO_RESUMO = ['resumos'];

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function classificarMovimento(m: MovimentoMotorista): Classificacao {
  const categoria = norm(m.categoria);
  const ehCredito = norm(m.tipo) === 'credito';

  if (ESCRITAS_PELO_PROPRIO_RESUMO.includes(categoria)) {
    return {
      destino: 'ignorado',
      motivo: 'é o líquido que o próprio resumo escreveu, não uma linha da conta',
    };
  }

  if (ehCredito) {
    if (JA_CONTADAS_COMO_RECEITA.includes(categoria)) {
      return {
        destino: 'ignorado',
        motivo: `crédito de ${categoria} já está na receita da plataforma`,
      };
    }
    if (categoria === 'caucao') {
      return { destino: 'ignorado', motivo: 'devolução de caução, tratada à parte' };
    }
    return { destino: 'receita_outras' };
  }

  if (JA_CALCULADAS_COMO_DEBITO.includes(categoria)) {
    return {
      destino: 'ignorado',
      motivo: `${categoria} já é calculada a partir da própria fonte`,
    };
  }

  if (categoria === 'caucao') return { destino: 'caucao' };
  if (categoria === 'seguros') return { destino: 'seguros' };
  if (categoria === 'slot_mensal') return { destino: 'slot' };
  return { destino: 'outros' };
}

export interface MovimentosAgregados {
  receitaOutras: number;
  caucao: number;
  seguros: number;
  slot: number;
  outros: number;
  ignorados: Array<{ categoria: string; tipo: string; valor: number; motivo: string }>;
}

export function agregarMovimentos(
  movimentos: readonly MovimentoMotorista[] | null | undefined
): MovimentosAgregados {
  const acc: MovimentosAgregados = {
    receitaOutras: 0,
    caucao: 0,
    seguros: 0,
    slot: 0,
    outros: 0,
    ignorados: [],
  };

  for (const m of movimentos ?? []) {
    const valor = Number(m.valor) || 0;
    const { destino, motivo } = classificarMovimento(m);

    switch (destino) {
      case 'ignorado':
        acc.ignorados.push({
          categoria: norm(m.categoria),
          tipo: norm(m.tipo),
          valor,
          motivo: motivo ?? 'sem motivo registado',
        });
        break;
      case 'receita_outras':
        acc.receitaOutras += valor;
        break;
      case 'caucao':
        acc.caucao += valor;
        break;
      case 'seguros':
        acc.seguros += valor;
        break;
      case 'slot':
        acc.slot += valor;
        break;
      case 'outros':
        acc.outros += valor;
        break;
    }
  }

  return acc;
}
