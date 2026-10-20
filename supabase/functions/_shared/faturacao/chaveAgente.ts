// Autenticação do agente Primavera pela chave (plataformas_configuracao.client_secret).
// A comparação é feita aqui, em memória: filtrar por client_secret no PostgREST
// punha a chave na URL e ela ficava gravada nos logs do Supabase.

export interface LinhaChaveAgente {
  id: string;
  client_secret: string | null;
}

// Tempo constante para chaves do mesmo tamanho: não revela quantos caracteres batem.
export function chavesIguais(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diferenca = 0;
  for (let i = 0; i < ea.length; i++) diferenca |= ea[i] ^ eb[i];
  return diferenca === 0;
}

// Uma chave repetida em duas integrações conta como não reconhecida, como antes.
export function integracaoDaChave(linhas: LinhaChaveAgente[], chave: string): string | null {
  if (!chave) return null;
  const iguais = linhas.filter(
    (l) => l.client_secret != null && chavesIguais(l.client_secret, chave)
  );
  return iguais.length === 1 ? iguais[0].id : null;
}
