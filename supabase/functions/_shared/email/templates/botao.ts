export interface BotaoEmailOpcoes {
  cor: string;
  tamanhoLetra?: number;
}

/**
 * Botão de email que o Outlook desenha bem. A cor e o espaçamento ficam na
 * célula (o Outlook ignora padding em <a>), e não há espaços dentro da
 * célula: lá viravam uma linha em branco e empurravam o texto para o fundo.
 */
export function botaoEmail(url: string, rotulo: string, { cor, tamanhoLetra = 14 }: BotaoEmailOpcoes): string {
  const alturaLinha = tamanhoLetra + 6;
  const vertical = Math.round(alturaLinha * 0.6);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;margin:0 auto">` +
    `<tr><td align="center" valign="middle" bgcolor="${cor}" style="background:${cor};border-radius:8px;padding:${vertical}px 28px;mso-padding-alt:${vertical}px 28px">` +
    `<a href="${url}" target="_blank" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:${tamanhoLetra}px;line-height:${alturaLinha}px;font-weight:700;color:#ffffff;text-decoration:none">${rotulo}</a>` +
    `</td></tr></table>`
  );
}
