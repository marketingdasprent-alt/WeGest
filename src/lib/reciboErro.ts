import { errorMessage } from '@/utils/errorMessage';

/** Em que passo o recibo falhou — muda o que o utilizador tem de fazer a seguir. */
export type FaseRecibo = 'keyinvoice' | 'gravar' | 'gravar_apos_keyinvoice';

export interface ErroReciboExplicado {
  titulo: string;
  oQueFazer: string;
  /** Mensagem original, para quem tiver de investigar. */
  detalhe: string;
  /** false quando tentar outra vez pode duplicar o recibo no KeyInvoice. */
  podeTentarDeNovo: boolean;
}

export class ErroRecibo extends Error {
  constructor(public readonly explicacao: ErroReciboExplicado) {
    super(`${explicacao.titulo} ${explicacao.oQueFazer}`);
    this.name = 'ErroRecibo';
  }
}

interface Regra {
  padrao: RegExp;
  titulo: string;
  oQueFazer: string;
}

// O KeyInvoice responde em texto livre; estas são as recusas conhecidas.
const REGRAS: Regra[] = [
  {
    padrao: /superior ao valor pendente/i,
    titulo: 'O KeyInvoice diz que esta fatura tem menos por pagar do que o WeGest.',
    oQueFazer:
      'Abra a fatura no KeyInvoice: ou já tem lá um recibo feito à mão, ou o valor dela é diferente do WeGest (acontece nas FT26 8 a 28, emitidas sem IVA). Corrija com a contabilidade antes de tentar de novo.',
  },
  {
    padrao: /s[ée]rie de documento inv[áa]lida/i,
    titulo: 'A série dos recibos não existe nesta conta do KeyInvoice.',
    oQueFazer:
      'Peça a um administrador para confirmar a série de Recibos (RC) em Integrações → Faturação.',
  },
  {
    padrao: /documento original .* não encontrado|exige o documento original/i,
    titulo: 'O WeGest não encontra o documento desta fatura no KeyInvoice.',
    oQueFazer:
      'A fatura pode ter sido emitida fora do WeGest. Faça o recibo diretamente no KeyInvoice.',
  },
  {
    padrao: /cliente|NIF/i,
    titulo: 'O KeyInvoice recusou os dados do cliente.',
    oQueFazer: 'Confirme o nome e o NIF na ficha do cliente e tente de novo.',
  },
  {
    padrao: /authenticate|chave do keyinvoice|não configurad/i,
    titulo: 'O WeGest não conseguiu entrar no KeyInvoice.',
    oQueFazer: 'Peça a um administrador para verificar a ligação em Integrações → Faturação.',
  },
  {
    padrao: /failed to fetch|networkerror|non-2xx|falha a contactar|timeout/i,
    titulo: 'Sem ligação ao serviço de faturação.',
    oQueFazer: 'Verifique a internet e tente de novo dentro de alguns minutos.',
  },
];

function classeDoErro(erro: unknown): string | undefined {
  if (typeof erro !== 'object' || erro === null) return undefined;
  const classe = (erro as { classe?: unknown }).classe;
  return typeof classe === 'string' ? classe : undefined;
}

/** Traduz a falha de um recibo para algo que quem não é contabilista percebe e consegue corrigir. */
export function explicarErroRecibo(
  erro: unknown,
  fase: FaseRecibo,
  numeroRecibo?: string | null
): ErroReciboExplicado {
  const detalhe = errorMessage(erro, 'motivo desconhecido');

  if (fase === 'gravar_apos_keyinvoice') {
    return {
      titulo: `O recibo${numeroRecibo ? ` ${numeroRecibo}` : ''} foi criado no KeyInvoice, mas o WeGest não o conseguiu guardar.`,
      oQueFazer:
        'NÃO tente de novo — criava um segundo recibo. Avise um administrador para o registar no WeGest.',
      detalhe,
      podeTentarDeNovo: false,
    };
  }

  if (fase === 'gravar') {
    return {
      titulo: 'O WeGest não conseguiu guardar o recibo.',
      oQueFazer:
        'Nada foi enviado ao KeyInvoice. Tente de novo; se repetir, avise um administrador.',
      detalhe,
      podeTentarDeNovo: true,
    };
  }

  // O pedido pode ter chegado ao KeyInvoice sem resposta: repetir arrisca um recibo duplicado.
  if (classeDoErro(erro) === 'unknown') {
    return {
      titulo: 'Não se sabe se o recibo foi criado no KeyInvoice.',
      oQueFazer:
        'Procure o recibo no KeyInvoice antes de tentar de novo. Se lá estiver, avise um administrador para o registar no WeGest.',
      detalhe,
      podeTentarDeNovo: false,
    };
  }

  const regra = REGRAS.find((r) => r.padrao.test(detalhe));
  return {
    titulo: regra?.titulo ?? 'O KeyInvoice recusou o recibo.',
    oQueFazer:
      regra?.oQueFazer ??
      'A fatura continua por pagar no WeGest. Leia o motivo abaixo; se não for claro, avise um administrador.',
    detalhe,
    podeTentarDeNovo: true,
  };
}
