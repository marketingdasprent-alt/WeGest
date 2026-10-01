import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ComQuemCelula, CombustivelCelula, DocumentosCelula } from './ViaturaCelulas';

const HOJE = new Date('2026-09-30T10:00:00');

describe('ComQuemCelula', () => {
  it('mostra o motorista que tem o carro', () => {
    render(
      <ComQuemCelula
        estado="em_tvde"
        situacao={{ ocupante: { tipo: 'motorista', id: 'm1', nome: 'João Silva' } }}
        hoje={HOJE}
      />
    );
    expect(screen.getByText('João Silva')).not.toBeNull();
  });

  it('disponível: há quanto tempo está parada, com cor pela urgência', () => {
    render(
      <ComQuemCelula estado="disponivel" situacao={{ livreDesde: '2026-08-20' }} hoje={HOJE} />
    );
    const texto = screen.getByText('Livre há 41 dias');
    expect(texto.className).toContain('text-destructive');
  });

  it('parada há poucos dias fica a verde; sem histórico diz-o', () => {
    const { rerender } = render(
      <ComQuemCelula estado="disponivel" situacao={{ livreDesde: '2026-09-28' }} hoje={HOJE} />
    );
    expect(screen.getByText('Livre há 2 dias').className).toContain('text-green-600');
    rerender(<ComQuemCelula estado="disponivel" situacao={undefined} hoje={HOJE} />);
    expect(screen.getByText('Livre · sem histórico')).not.toBeNull();
  });

  it('fim marcado no futuro fica à vista (dado a rever)', () => {
    render(
      <ComQuemCelula estado="disponivel" situacao={{ livreDesde: '2026-10-04' }} hoje={HOJE} />
    );
    expect(screen.getByText('Fim marcado a 04/10')).not.toBeNull();
  });

  it('noutros estados sem ocupante, um traço', () => {
    render(<ComQuemCelula estado="manutencao" situacao={undefined} hoje={HOJE} />);
    expect(screen.getByText('—')).not.toBeNull();
  });
});

describe('DocumentosCelula', () => {
  it('o mais urgente primeiro, e avisa que há outro', () => {
    render(
      <DocumentosCelula
        viatura={{ inspecao_validade: '2026-10-12', seguro_validade: '2026-09-27' }}
        hoje={HOJE}
      />
    );
    expect(screen.getByText(/Seguro vencido há 3 dias/)).not.toBeNull();
    expect(screen.getByText('+1')).not.toBeNull();
  });

  it('tudo em dia / sem datas', () => {
    const { rerender } = render(
      <DocumentosCelula viatura={{ inspecao_validade: '2027-06-01' }} hoje={HOJE} />
    );
    expect(screen.getByText('Em dia')).not.toBeNull();
    rerender(<DocumentosCelula viatura={{}} hoje={HOJE} />);
    expect(screen.getByText('Sem datas')).not.toBeNull();
  });
});

describe('CombustivelCelula', () => {
  it('mostra o nome agrupado, seja qual for a grafia gravada', () => {
    render(<CombustivelCelula valor="eletrico" />);
    expect(screen.getByText('Elétrico')).not.toBeNull();
  });

  it('sem valor: N/D', () => {
    render(<CombustivelCelula valor={null} />);
    expect(screen.getByText('N/D')).not.toBeNull();
  });
});
