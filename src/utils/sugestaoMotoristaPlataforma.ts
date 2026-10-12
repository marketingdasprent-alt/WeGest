export const normalizarNome = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const partesDoNome = (nome: string) =>
  normalizarNome(nome)
    .split(' ')
    .filter((p) => p.length > 2);

/**
 * Ficha a sugerir para uma conta Uber/Bolt, pelo nome que a plataforma mostra.
 * Só quando há UMA candidata: "Paulo Jorge" na Bolt servia ao Paulo Jorge Amado
 * da Silva e ao Paulo Jorge Caldeira, e a sugestão escolhia o primeiro da lista.
 */
export function sugerirMotoristaPorNome<T extends { id: string; nome: string }>(
  nomeDaConta: string,
  motoristas: readonly T[]
): string | null {
  const partes = partesDoNome(nomeDaConta);
  if (partes.length === 0) return null;
  const candidatas = motoristas.filter((m) => {
    const mp = partesDoNome(m.nome);
    return partes.filter((p) => mp.includes(p)).length >= 2;
  });
  return candidatas.length === 1 ? candidatas[0].id : null;
}
