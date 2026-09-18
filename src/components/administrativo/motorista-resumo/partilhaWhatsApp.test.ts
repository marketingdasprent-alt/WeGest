import { describe, it, expect } from 'vitest';
import {
  montarMensagemResumo,
  nomeFicheiroResumo,
  linkWhatsApp,
  type DadosMensagem,
} from './partilhaWhatsApp';

const fmt = (v: number) => `${v.toFixed(2)} €`;

const dados: DadosMensagem = {
  nome: 'João Silva',
  inicio: new Date(2026, 8, 7),
  fim: new Date(2026, 8, 13),
  receitas: 2161.2,
  despesas: 325,
  liquido: 1836.2,
  slotPeriodos: [],
  fmt,
};

describe('montarMensagemResumo', () => {
  it('leva nome, período e os três totais', () => {
    const m = montarMensagemResumo(dados);
    expect(m).toContain('João Silva');
    expect(m).toContain('07/09/2026 a 13/09/2026');
    expect(m).toContain('2161.20 €');
    expect(m).toContain('325.00 €');
    expect(m).toContain('1836.20 €');
  });

  it('aponta para o resumo detalhado quando há link', () => {
    // Sem isto, quem recebe vê três totais e não sabe que há o detalhe todo.
    const m = montarMensagemResumo({ ...dados, linkPdf: 'https://x/r.pdf' });
    expect(m).toMatch(/Resumo detalhado/i);
  });

  it('discrimina cada período de slot quando existe', () => {
    const m = montarMensagemResumo({
      ...dados,
      slotPeriodos: [
        {
          matricula: 'BS-40-XX',
          dias: 7,
          taxaDiaria: 46.43,
          custo: 325,
          dataInicioStr: '07/09',
          dataFimStr: '13/09',
        },
      ],
    });
    expect(m).toContain('BS-40-XX');
    expect(m).toContain('07/09');
  });

  it('não deixa uma secção de slot vazia quando não há slot', () => {
    expect(montarMensagemResumo(dados)).not.toContain('Aluguer Slot');
  });
});

describe('nomeFicheiroResumo', () => {
  it('é a semana e mais nada — cada carácter aqui pesa a dobrar no link', () => {
    expect(nomeFicheiroResumo(dados.inicio)).toBe('resumo-2026-09-07.pdf');
  });

  it('não leva caracteres que o storage ou o URL recusem', () => {
    expect(nomeFicheiroResumo(dados.inicio)).toMatch(/^[a-z0-9.-]+$/);
  });
});

describe('mensagem com link para o PDF', () => {
  it('inclui o link quando existe', () => {
    const m = montarMensagemResumo({ ...dados, linkPdf: 'https://x.supabase.co/resumo.pdf' });
    expect(m).toContain('https://x.supabase.co/resumo.pdf');
  });

  it('diz que o link expira — quem recebe tem de saber que não é eterno', () => {
    const m = montarMensagemResumo({ ...dados, linkPdf: 'https://x/r.pdf' });
    expect(m).toMatch(/expira|dias/i);
  });

  it('sem link, não sobra nenhuma frase pendurada a falar de PDF nenhum', () => {
    const m = montarMensagemResumo(dados);
    expect(m).not.toMatch(/expira/i);
    expect(m).not.toContain('http');
  });
});

describe('linkWhatsApp', () => {
  it('abre a escolha de contacto, sem número fixo', () => {
    expect(linkWhatsApp('olá')).toBe('https://wa.me/?text=ol%C3%A1');
  });

  it('escapa quebras de linha e símbolos da mensagem', () => {
    expect(linkWhatsApp('a\nb & c')).toBe('https://wa.me/?text=a%0Ab%20%26%20c');
  });
});

describe('sem emojis', () => {
  it('a mensagem não leva pictogramas — chegavam partidos ao WhatsApp', () => {
    const m = montarMensagemResumo({
      ...dados,
      linkPdf: 'https://x/r.pdf',
      slotPeriodos: [
        {
          matricula: 'BS-40-XX',
          dias: 7,
          taxaDiaria: 46.43,
          custo: 325,
          dataInicioStr: '07/09',
          dataFimStr: '13/09',
        },
      ],
    });
    expect(m).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
