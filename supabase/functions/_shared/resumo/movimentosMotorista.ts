// Para onde vai cada movimento financeiro do motorista.
//
// Vivia escrito à mão em três sítios — o resumo do motorista, o fecho de
// contas e a lista de Contas/Resumo — e os três discordavam. Um crédito de
// categoria `renda_viatura` (o acerto de uma viatura parada na oficina) era
// contado como receita pelo fecho, contado como extra pela lista, e
// DESCARTADO EM SILÊNCIO pelo resumo. O motorista via o valor desaparecer
// sem explicação, e os dois ecrãs que têm de mostrar o mesmo mostravam
// números diferentes.
//
// A regra deixa de ser uma lista de categorias a ignorar e passa a ser o
// motivo por trás dela:
//
//   1. Ignora-se um DÉBITO quando o resumo já calcula essa mesma coisa a
//      partir de outra fonte — o aluguer sai dos dias × tarifa, a reparação
//      sai da viatura. Contar o movimento outra vez duplicava.
//
//   2. Um CRÉDITO nunca é ignorado por esse motivo. Os blocos calculados só
//      produzem cobranças; um crédito na mesma categoria é um acerto, e um
//      acerto nunca duplica — corrige.
//
//   3. O que não se reconhece vai para "outros". Uma categoria nova não pode
//      fazer dinheiro desaparecer só porque ninguém se lembrou dela aqui.
//
//   4. O que é mesmo ignorado sai na lista `ignorados`, com motivo. Nada
//      desaparece em silêncio — é o que permitiu a este erro viver meses.

export interface MovimentoMotorista {
  tipo: string | null;
  categoria: string | null;
  valor: number | string | null;
}

export type DestinoMovimento = 'receita_outras' | 'caucao' | 'seguros' | 'outros' | 'ignorado';

export interface Classificacao {
  destino: DestinoMovimento;
  /** Preenchido só quando destino === 'ignorado'. */
  motivo?: string;
}

/** Categorias cujo débito o CONTRATO já representa (aluguer = dias × tarifa).
 *  Exportada porque quem mostra o resumo precisa de saber isto: sem contrato
 *  a cobrir o período, um débito destes não está representado em lado nenhum
 *  e tem de ser mostrado como valor por explicar, em vez de sumir. */
export const DEBITOS_QUE_O_CONTRATO_COBRE = ['aluguer', 'renda_viatura'];

/** Categorias cujo DÉBITO o resumo já calcula por outra via. */
const JA_CALCULADAS_COMO_DEBITO = [...DEBITOS_QUE_O_CONTRATO_COBRE, 'reparacao'];

/** Categorias cujo CRÉDITO já vem na receita das plataformas. */
const JA_CONTADAS_COMO_RECEITA = ['bolt', 'uber'];

/** O movimento que o próprio resumo escreve (o líquido da semana). Não pode
 *  voltar a entrar no cálculo que o produziu: se entrasse, cada abertura do
 *  resumo lia o seu resultado anterior como despesa (ou receita) nova e o
 *  número fugia sozinho — −500, depois −1000, depois −1500. Regra: o resumo
 *  não se conta a si mesmo, em nenhum dos sentidos. */
const ESCRITAS_PELO_PROPRIO_RESUMO = ['resumos'];

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function classificarMovimento(m: MovimentoMotorista): Classificacao {
  const categoria = norm(m.categoria);
  const ehCredito = norm(m.tipo) === 'credito';

  // Antes de tudo o resto: o resumo nunca se lê a si próprio.
  if (ESCRITAS_PELO_PROPRIO_RESUMO.includes(categoria)) {
    return {
      destino: 'ignorado',
      motivo: 'é o líquido que este resumo produziu — não entra no próprio cálculo',
    };
  }

  if (ehCredito) {
    if (JA_CONTADAS_COMO_RECEITA.includes(categoria)) {
      return {
        destino: 'ignorado',
        motivo: `crédito de ${categoria} já está na receita da plataforma`,
      };
    }
    // A caução devolvida tem tratamento próprio no bloco da caução.
    if (categoria === 'caucao') {
      return { destino: 'ignorado', motivo: 'devolução de caução, tratada à parte' };
    }
    // Tudo o resto — incluindo acertos de renda_viatura e reparacao — entra.
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
  return { destino: 'outros' };
}

export interface MovimentosAgregados {
  receitaOutras: number;
  caucao: number;
  seguros: number;
  outros: number;
  /** O que ficou de fora, e porquê. Para mostrar, auditar ou avisar. */
  ignorados: Array<{ categoria: string; tipo: string; valor: number; motivo: string }>;
}

export function agregarMovimentos(
  movimentos: readonly MovimentoMotorista[] | null | undefined
): MovimentosAgregados {
  const acc: MovimentosAgregados = {
    receitaOutras: 0,
    caucao: 0,
    seguros: 0,
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
      case 'outros':
        acc.outros += valor;
        break;
    }
  }

  return acc;
}
