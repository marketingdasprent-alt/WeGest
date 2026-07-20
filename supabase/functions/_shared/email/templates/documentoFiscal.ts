/** Escapa HTML e converte quebras de linha em parágrafos/br para o corpo do email. */
export function documentoFiscalTemplate(mensagem: string): { html: string } {
  const escapado = (mensagem || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const corpo = escapado
    .split(/\r?\n/)
    .map((linha) => (linha.trim() === '' ? '<br>' : `<p style="margin:0 0 8px">${linha}</p>`))
    .join('');
  return { html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333">${corpo}</div>` };
}
