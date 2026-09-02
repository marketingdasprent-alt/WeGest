import { notificacaoTemplate } from "../email/templates/notificacao.ts";
import type { QueueItemEnrichment } from "./enrichContext.ts";

// O caminho genérico (notification_templates + {{tokens}}) não tinha
// nenhum layout — mandava o corpo tal e qual como html. Isto põe-no dentro
// da mesma moldura que os 13 templates escritos à mão já usam
// (notificacaoTemplate), reaproveitando o enriquecimento que o lote da fila
// já calcula (ctaUrl, marca da organização, nome do destinatário) mas que
// só o caminho TEMPLATE_HANDLERS usava até agora.

const COR_ETIQUETA = "#67707C";
const COR_VALOR = "#1a1f29";

/**
 * Datas ISO em português: "2026-08-27T12:52:00+00:00" → "27/08/2026".
 *
 * Só a data, como `fmtDatePt` já fazia nos templates escritos à mão.
 * Converter fusos horários aqui seria inventar uma precisão que o payload
 * não garante — o valor vem como o domínio o gravou.
 */
export function datasEmPortugues(texto: string): string {
  return texto.replace(
    /\b(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?/g,
    (_m, ano, mes, dia) => `${dia}/${mes}/${ano}`
  );
}

// Uma linha vira linha de tabela quando parece "Etiqueta: valor" — etiqueta
// curta, no máximo três palavras, e o valor a não começar por HTML. Sem estes
// limites, uma frase com dois pontos a meio ("Tens 3 aviso(s) novo(s)
// hoje:<br>...", do digest) virava uma linha de tabela absurda.
const LINHA_CAMPO = /^([^:<]{1,24}):\s+(?!<)(.+)$/;

function pareceEtiqueta(etiqueta: string): boolean {
  return etiqueta.trim().split(/\s+/).length <= 3;
}

/**
 * Dá forma ao corpo que vem do template.
 *
 * O corpo é escrito em linhas — pelos seeds com `chr(10)`, e por quem o
 * escreve no painel carregando em Enter. Só que o resultado é entregue como
 * HTML, onde uma quebra de linha não quebra nada: tudo colapsava num
 * parágrafo corrido. Aqui as linhas voltam a existir, e as que são
 * "Etiqueta: valor" ganham uma tabela de duas colunas — sem ninguém ter de
 * escrever HTML.
 */
export function formatarCorpo(corpo: string): string {
  const linhas = datasEmPortugues(corpo).split(/\r?\n/);
  const blocos: string[] = [];
  let campos: Array<[string, string]> = [];

  const fecharTabela = () => {
    if (campos.length === 0) return;
    const linhasHtml = campos
      .map(
        ([etiqueta, valor]) =>
          `<tr><td style="padding:4px 14px 4px 0;font-size:13px;color:${COR_ETIQUETA};white-space:nowrap;vertical-align:top">${etiqueta}</td>` +
          `<td style="padding:4px 0;font-size:14px;font-weight:600;color:${COR_VALOR}">${valor}</td></tr>`
      )
      .join("");
    blocos.push(
      `<table role="presentation" style="border-collapse:collapse;margin:14px 0">${linhasHtml}</table>`
    );
    campos = [];
  };

  for (const linha of linhas) {
    const texto = linha.trim();
    if (!texto) {
      fecharTabela();
      continue;
    }

    const campo = texto.match(LINHA_CAMPO);
    if (campo && pareceEtiqueta(campo[1])) {
      campos.push([campo[1].trim(), campo[2].trim()]);
      continue;
    }

    fecharTabela();
    blocos.push(`<p style="margin:0 0 10px">${texto}</p>`);
  }

  fecharTabela();
  return blocos.join("\n");
}

export function buildGenericEmailHtml(
  titulo: string,
  corpo: string,
  ctx: QueueItemEnrichment
): string {
  return notificacaoTemplate({
    titulo,
    corpo: formatarCorpo(corpo),
    // Um aviso do motor lê-se como um painel: título, dados, botão. A
    // saudação só empurrava a informação para baixo. Os emails escritos à
    // mão, que falam com clientes e motoristas, mantêm-na.
    semSaudacao: true,
    emissorNome: ctx.emissorNome,
    emissorLogoUrl: ctx.emissorLogoUrl,
    ctaLabel: ctx.ctaUrl ? "Ver detalhes" : undefined,
    ctaUrl: ctx.ctaUrl,
  });
}
