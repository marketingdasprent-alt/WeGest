// supabase/functions/_shared/repsol/matricula.ts
//
// A matrícula de uma abastecida da Repsol não vem de um campo de confiança.
// No export português a coluna `MATRÍCULA` vem sempre vazia e o que existe é
// `MATRÍCULA/CONDUTOR TICKET` — o campo que o condutor digita no teclado da
// bomba. Em Setembro/2026 esse campo trazia, além de matrículas, `0`, `1`,
// `01`, `-`, `------`, `P`, `O` e `00000`.
//
// Daí uma validação de formato antes de casar com `viaturas`: sem ela, um `1`
// ou um `0` batem com qualquer coisa e o consumo vai parar à viatura errada.

/**
 * Devolve a matrícula normalizada (maiúsculas, sem separadores) ou null se o
 * valor não puder ser uma matrícula portuguesa.
 *
 * Todas as séries portuguesas — `AA-00-00`, `00-00-AA`, `00-AA-00` e a actual
 * `AA-00-AA` — têm seis caracteres alfanuméricos com pelo menos duas letras e
 * pelo menos dois dígitos. É o que se exige, e não um padrão exacto por série:
 * o objectivo é recusar lixo, não validar o registo automóvel.
 *
 * Um valor que passe aqui ainda pode não existir na frota — quem casa com
 * `viaturas` é o importador, e uma matrícula desconhecida fica sem viatura.
 */
/**
 * A forma normalizada com que os dois lados do casamento se encontram:
 * maiúsculas, só letras e dígitos. Serve para indexar as matrículas da frota,
 * que são dado de confiança e por isso não passam pela validação de formato —
 * uma matrícula estrangeira, ou de série antiga, tem de continuar a casar.
 */
export function chaveMatricula(raw: string): string {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function parseMatricula(raw: string): string | null {
  const limpa = chaveMatricula(raw);
  if (limpa.length !== 6) return null;
  const letras = (limpa.match(/[A-Z]/g) || []).length;
  const digitos = (limpa.match(/[0-9]/g) || []).length;
  if (letras < 2 || digitos < 2) return null;
  return limpa;
}
