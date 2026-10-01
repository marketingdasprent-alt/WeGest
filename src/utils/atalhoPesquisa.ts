interface TeclaPremida {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target: EventTarget | null;
}

/** "/" leva à pesquisa — mas nunca rouba a tecla a quem está a escrever noutro campo. */
export function deveFocarPesquisa(e: TeclaPremida): boolean {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return false;
  const alvo = e.target as HTMLElement | null;
  if (!alvo || typeof alvo.tagName !== 'string') return true;
  const tag = alvo.tagName.toLowerCase();
  return !(tag === 'input' || tag === 'textarea' || tag === 'select' || alvo.isContentEditable);
}
