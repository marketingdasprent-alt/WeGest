import { describe, expect, it } from 'vitest';
import {
  assuntoEmailResumo,
  linkEmailPara,
  linkWhatsAppPara,
  montarMensagemEnvio,
  telefoneParaWhatsApp,
} from './envioResumos';

const fmt = (v: number) => `${v.toFixed(2)} €`;

describe('telefoneParaWhatsApp', () => {
  it('número PT sem indicativo ganha o 351', () => {
    expect(telefoneParaWhatsApp('912 345 678')).toBe('351912345678');
  });

  it('aceita +351 e 00351', () => {
    expect(telefoneParaWhatsApp('+351 912-345-678')).toBe('351912345678');
    expect(telefoneParaWhatsApp('00351912345678')).toBe('351912345678');
  });

  it('número estrangeiro com indicativo fica como está', () => {
    expect(telefoneParaWhatsApp('+55 11 98765 4321')).toBe('5511987654321');
  });

  it('vazio ou lixo devolve null', () => {
    expect(telefoneParaWhatsApp(null)).toBeNull();
    expect(telefoneParaWhatsApp('')).toBeNull();
    expect(telefoneParaWhatsApp('123')).toBeNull();
  });
});

describe('mensagem e links', () => {
  const inicio = new Date(2026, 10, 2);
  const fim = new Date(2026, 10, 8);

  it('mensagem leva o nome, o período e o líquido', () => {
    const texto = montarMensagemEnvio({ nome: 'Ana', inicio, fim, liquido: 420.5, fmt });
    expect(texto).toContain('Olá Ana');
    expect(texto).toContain('02/11/2026 a 08/11/2026');
    expect(texto).toContain('420.50 €');
  });

  it('link do WhatsApp vai directo ao número', () => {
    expect(linkWhatsAppPara('351912345678', 'olá & adeus')).toBe(
      'https://wa.me/351912345678?text=ol%C3%A1%20%26%20adeus'
    );
  });

  it('link do e-mail codifica assunto e corpo', () => {
    const assunto = assuntoEmailResumo(inicio, fim);
    expect(assunto).toBe('Resumo semanal 02/11 - 08/11/2026');
    expect(linkEmailPara('a@b.pt', assunto, 'x y')).toBe(
      'mailto:a%40b.pt?subject=Resumo%20semanal%2002%2F11%20-%2008%2F11%2F2026&body=x%20y'
    );
  });
});
