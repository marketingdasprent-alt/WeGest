// Formulário público dentro de um iframe no site da organização.
//
// `?embed=1` tira o cabeçalho, o fundo e o rodapé, e a página avisa a página
// mãe da sua altura, para o iframe crescer com o conteúdo e não haver scroll
// dentro de scroll. O site precisa de um pedaço de JavaScript para ouvir
// esse aviso: é o que `codigoDeIncorporacao` devolve, pronto a colar.

export const TIPO_MENSAGEM_ALTURA = 'wegest-formulario:altura';

export interface MensagemDeAltura {
  tipo: typeof TIPO_MENSAGEM_ALTURA;
  altura: number;
}

export function modoEmbedAtivo(parametros: URLSearchParams | string): boolean {
  const p = typeof parametros === 'string' ? new URLSearchParams(parametros) : parametros;
  const valor = (p.get('embed') ?? '').trim().toLowerCase();
  return valor === '1' || valor === 'true';
}

export function mensagemDeAltura(altura: number): MensagemDeAltura {
  return { tipo: TIPO_MENSAGEM_ALTURA, altura: Math.ceil(altura) };
}

/** A altura que vem numa mensagem da janela, ou null se não for nossa. */
export function alturaDaMensagem(dados: unknown): number | null {
  if (!dados || typeof dados !== 'object') return null;
  const m = dados as Partial<MensagemDeAltura>;
  if (m.tipo !== TIPO_MENSAGEM_ALTURA) return null;
  return typeof m.altura === 'number' && Number.isFinite(m.altura) && m.altura > 0
    ? m.altura
    : null;
}

export function urlDeIncorporacao(origem: string, formularioId: string): string {
  return `${origem.replace(/\/+$/, '')}/formulario/${formularioId}?embed=1`;
}

/** O que se cola no site: o iframe e o ouvinte que lhe acerta a altura. */
export function codigoDeIncorporacao(origem: string, formularioId: string): string {
  const origemLimpa = origem.replace(/\/+$/, '');
  const url = urlDeIncorporacao(origemLimpa, formularioId);
  return [
    `<iframe id="wegest-formulario" src="${url}" title="Formulário" style="width:100%;border:0;min-height:600px" loading="lazy"></iframe>`,
    '<script>',
    "  window.addEventListener('message', function (evento) {",
    `    if (evento.origin !== '${origemLimpa}') return;`,
    '    var dados = evento.data || {};',
    `    if (dados.tipo !== '${TIPO_MENSAGEM_ALTURA}' || typeof dados.altura !== 'number') return;`,
    "    document.getElementById('wegest-formulario').style.height = Math.ceil(dados.altura) + 'px';",
    '  });',
    '</script>',
  ].join('\n');
}
