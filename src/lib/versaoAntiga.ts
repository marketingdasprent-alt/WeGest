// Depois de um deploy, uma aba aberta com a versão anterior pede ficheiros
// (chunks) que já não existem no servidor. A secção rebenta e "Tentar de novo"
// falha sempre, porque o import falhado fica em memória até recarregar.
// Recarregar uma vez traz a versão nova; a marca na sessão evita um ciclo se o
// erro afinal for outro.

const MARCA = 'wegest_recarregou_versao_nova';
/** Uma recarga por janela de tempo: um segundo deploy mais tarde volta a poder recarregar. */
const JANELA_MS = 60_000;

const PADROES = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
  /ChunkLoadError/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
];

export function eErroDeVersaoAntiga(erro: unknown): boolean {
  if (!erro) return false;
  const texto =
    erro instanceof Error ? `${erro.name} ${erro.message}` : typeof erro === 'string' ? erro : '';
  return PADROES.some((p) => p.test(texto));
}

/**
 * Recarrega a página se não o fez há pouco. Devolve true quando recarregou.
 * `agora` e `armazenamento` são injectáveis para os testes.
 */
export function recarregarParaVersaoNova(
  janela: Window = window,
  agora: number = Date.now(),
  armazenamento: Storage | null = janela.sessionStorage ?? null
): boolean {
  try {
    const ultima = Number(armazenamento?.getItem(MARCA) ?? 0);
    if (ultima && agora - ultima < JANELA_MS) return false;
    armazenamento?.setItem(MARCA, String(agora));
  } catch {
    // Sem sessionStorage (modo privado restrito): recarrega na mesma, uma vez por erro.
  }
  janela.location.reload();
  return true;
}
