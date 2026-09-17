// Para onde vai cada movimento financeiro do motorista.
//
// Antes vivia escrito à mão em três sítios que discordavam entre si (um
// crédito de `renda_viatura` era descartado em silêncio pelo resumo mas
// contado noutros ecrãs). Regras: só se ignora um DÉBITO já calculado por
// outra via (evita duplicar); um CRÉDITO nunca é ignorado por esse motivo
// (é sempre um acerto, não duplica); categoria desconhecida vai para "outros",
// nunca desaparece; e tudo o que é ignorado fica registado em `ignorados` com motivo.

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

/** Categorias que o PRÓPRIO resumo escreve de volta em motorista_financeiro.
 *
 *  O trigger `sincronizar_movimento_resumo` grava o líquido da semana como
 *  movimento dentro da própria semana; voltar a lê-lo aqui somava o líquido a
 *  si mesmo, dobrando a cada recarregamento. Ignora-se nos dois sentidos,
 *  porque não é uma cobrança duplicada — é a conta a entrar na própria conta. */
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
  // Slot mensal (ver NovoMovimentoFinanceiroOverlay / gerar_cobrancas_slot_mensais):
  // linha própria para não se misturar com "outros custos" avulsos.
  if (categoria === 'slot_mensal') return { destino: 'slot' };
  return { destino: 'outros' };
}

export interface MovimentosAgregados {
  receitaOutras: number;
  caucao: number;
  seguros: number;
  slot: number;
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
