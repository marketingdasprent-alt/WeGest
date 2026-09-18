import { format } from 'date-fns';
import type { SlotPeriodo } from '../MotoristaResumoDialog';

export interface DadosMensagem {
  /** Link assinado para o PDF. Sem ele a mensagem vai só com os totais. */
  linkPdf?: string;
  nome: string;
  inicio: Date;
  fim: Date;
  receitas: number;
  despesas: number;
  liquido: number;
  slotPeriodos: SlotPeriodo[];
  /** Formatador de moeda do ecrã, para a mensagem dizer o mesmo que o resumo. */
  fmt: (valor: number) => string;
}

/** Mensagem que segue com o PDF. Vive fora do componente para se poder ler e
 *  testar sem montar o diálogo inteiro. */
export function montarMensagemResumo({
  nome,
  inicio,
  fim,
  receitas,
  despesas,
  liquido,
  slotPeriodos,
  fmt,
  linkPdf,
}: DadosMensagem): string {
  const slot =
    slotPeriodos.length > 0
      ? '\n\n*Aluguer Slot:*\n' +
        slotPeriodos
          .map(
            (p) =>
              `  ${p.matricula} (${p.dataInicioStr}–${p.dataFimStr}): ${p.dias}d × ${fmt(p.taxaDiaria)}/d = ${fmt(p.custo)}`
          )
          .join('\n') +
        (slotPeriodos.length > 1 ? `\n  Total Slot: ${fmt(slotPeriodos.reduce((s, p) => s + p.custo, 0))}` : '')
      : '';

  return (
    `*RESUMO FINANCEIRO - WeGest*\n\nOlá *${nome}*,\n` +
    `Período: ${format(inicio, 'dd/MM/yyyy')} a ${format(fim, 'dd/MM/yyyy')}\n\n` +
    `*Receitas:* ${fmt(receitas)}\n` +
    `*Despesas:* ${fmt(despesas)}${slot}\n` +
    `*Líquido Final:* ${fmt(liquido)}\n\n` +
    (linkPdf
      ? `Resumo detalhado (expira em ${DIAS_VALIDADE_LINK} dias):\n${linkPdf}\n\n`
      : '') +
    'Se tiver alguma dúvida, por favor contacte-nos.'
  );
}

/**
 * Nome do ficheiro no storage. Curto de propósito: ele entra no URL assinado
 * duas vezes — no caminho e outra vez dentro do token, que é base64 do caminho
 * — por isso cada carácter aqui conta quase a dobrar na mensagem. O nome do
 * motorista não faz falta: o ficheiro já vive na pasta dele, e a semana chega
 * para o distinguir.
 */
export function nomeFicheiroResumo(inicio: Date): string {
  return `resumo-${format(inicio, 'yyyy-MM-dd')}.pdf`;
}

/**
 * Quanto tempo o link assinado aguenta. A hora que a aplicação usa para abrir
 * ficheiros dentro do ecrã não serve numa mensagem que a pessoa pode só ler no
 * dia seguinte; sete dias cobrem a semana a que o resumo diz respeito.
 */
export const DIAS_VALIDADE_LINK = 7;

export const SEGUNDOS_VALIDADE_LINK = DIAS_VALIDADE_LINK * 24 * 60 * 60;

/** Link do WhatsApp sem número: é o WhatsApp que pergunta a conversa. */
export function linkWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

