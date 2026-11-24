import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { ValorAcordadoTvde } from './ValorAcordadoTvde';

const LABEL = 'Valor semanal acordado com o motorista';

function Harness({ inicial = null }: { inicial?: number | null }) {
  const [pretendido, setPretendido] = useState<number | null>(inicial);
  const [motivo, setMotivo] = useState('');
  return (
    <ValorAcordadoTvde
      precoTarifa={200}
      pretendido={pretendido}
      motivo={motivo}
      onPretendidoChange={setPretendido}
      onMotivoChange={setMotivo}
    />
  );
}

describe('ValorAcordadoTvde', () => {
  it('mostra o preço da tarifa como sugestão e nada de aviso enquanto está vazio', () => {
    render(<Harness />);
    expect(screen.getByLabelText(LABEL)).toHaveAttribute('placeholder', '200.00');
    expect(screen.queryByText(/Vai pedir aprovação/)).toBeNull();
    expect(screen.queryByLabelText('Motivo')).toBeNull();
  });

  it('valor diferente da tarifa: avisa e mostra o motivo', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(LABEL), { target: { value: '180' } });
    expect(
      screen.getByText(/Vai pedir aprovação ao Supervisor Gestor TVDE\. Até lá cobra-se a tarifa/)
    ).toHaveTextContent(/200,00/);
    expect(screen.getByLabelText('Motivo')).toBeInTheDocument();
  });

  it('valor igual à tarifa não avisa nem pede motivo', () => {
    render(<Harness inicial={200} />);
    expect(screen.queryByText(/Vai pedir aprovação/)).toBeNull();
    expect(screen.queryByLabelText('Motivo')).toBeNull();
  });

  it('esvaziar o campo devolve null e o motivo é editável', () => {
    const onPretendidoChange = vi.fn();
    const onMotivoChange = vi.fn();
    render(
      <ValorAcordadoTvde
        precoTarifa={200}
        pretendido={150}
        motivo=""
        onPretendidoChange={onPretendidoChange}
        onMotivoChange={onMotivoChange}
      />
    );
    fireEvent.change(screen.getByLabelText(LABEL), { target: { value: '' } });
    expect(onPretendidoChange).toHaveBeenCalledWith(null);
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Frota' } });
    expect(onMotivoChange).toHaveBeenCalledWith('Frota');
  });

  it('sem preço de tarifa não há aviso', () => {
    render(
      <ValorAcordadoTvde
        precoTarifa={null}
        pretendido={150}
        motivo=""
        onPretendidoChange={() => undefined}
        onMotivoChange={() => undefined}
      />
    );
    expect(screen.queryByText(/Vai pedir aprovação/)).toBeNull();
  });
});
