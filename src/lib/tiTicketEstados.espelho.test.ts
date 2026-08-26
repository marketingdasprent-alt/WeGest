import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { proximoEstado, type EstadoTicket, type EventoTicket } from './tiTicketEstados';

const ESTADOS: EstadoTicket[] = [
  'aberto',
  'com_sugestao',
  'nao_resolvido',
  'presencial',
  'resolvido',
];
const EVENTOS: EventoTicket[] = [
  'sugerir',
  'foi_util',
  'nao_ajudou',
  'marcar_presencial',
  'fechar',
];

describe('a cópia em Deno da máquina de estados', () => {
  it('não divergiu da fonte em src/lib', () => {
    // A edge function corre em Deno e não importa de src/. Esta comparação é o
    // que impede as duas cópias de se separarem em silêncio.
    const fonte = readFileSync('supabase/functions/ti-sugestao-responder/index.ts', 'utf8');
    const bloco = fonte.match(/const TRANSICOES[^=]*=\s*(\{[\s\S]*?\n\};)/);
    expect(bloco, 'bloco TRANSICOES encontrado na edge function').toBeTruthy();

    // eslint-disable-next-line no-eval
    const copia = eval(`(${bloco![1].replace(/;$/, '')})`) as Record<
      string,
      Record<string, string>
    >;

    for (const estado of ESTADOS) {
      for (const evento of EVENTOS) {
        expect(copia[estado]?.[evento] ?? null, `${estado} + ${evento}`).toBe(
          proximoEstado(estado, evento)
        );
      }
    }
  });
});
