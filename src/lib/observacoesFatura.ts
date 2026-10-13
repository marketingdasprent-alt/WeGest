// Observações que seguem para o documento fiscal (campo "Comments" no
// KeyInvoice, "Observacoes" no Primavera). A matrícula sai sempre; as notas
// externas do contrato ou da reserva entram a seguir, e quem emite pode
// acrescentar ou corrigir antes de criar o documento.

export interface FonteDasObservacoes {
  matricula?: string | null;
  /** Observações do contrato ou da reserva (as externas, não as internas). */
  notasExternas?: string | null;
}

/** "BN90PD" ou "bn-90-pd" ficam "BN-90-PD"; o que não tiver forma de matrícula fica como veio. */
export function formatarMatricula(valor: string | null | undefined): string {
  const limpa = (valor ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(limpa)) {
    return `${limpa.slice(0, 2)}-${limpa.slice(2, 4)}-${limpa.slice(4, 6)}`;
  }
  return (valor ?? '').trim();
}

/** O texto com que a caixa de observações abre. */
export function observacoesIniciais(fonte: FonteDasObservacoes): string {
  const linhas: string[] = [];
  const matricula = formatarMatricula(fonte.matricula);
  if (matricula) linhas.push(`Matrícula ${matricula}`);
  const notas = (fonte.notasExternas ?? '').trim();
  if (notas) linhas.push(notas);
  return linhas.join('\n');
}

/** O que segue para o emissor: sem espaços a mais e sem linhas vazias repetidas. */
export function observacoesParaEmitir(texto: string | null | undefined): string | undefined {
  const limpo = (texto ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, arr) => l !== '' || (i > 0 && arr[i - 1] !== ''))
    .join('\n')
    .trim();
  return limpo || undefined;
}
