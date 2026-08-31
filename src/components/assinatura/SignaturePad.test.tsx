import { createRef } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { SignaturePad, type SignaturePadHandle } from './SignaturePad';

/**
 * O pad de assinatura.
 *
 * O jsdom não desenha em canvas, por isso substitui-se o contexto 2D e o
 * `toDataURL` do próprio canvas por duplos. Não é o desenho que está a ser
 * verificado — é a **coordenação**: quando o pad avisa que houve traço, o valor
 * já tem de estar disponível a quem for buscá-lo.
 */
beforeAll(() => {
  const contextoFalso = {
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  };

  HTMLCanvasElement.prototype.getContext = vi.fn(() => contextoFalso) as never;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,DESENHO') as never;

  // O jsdom não implementa captura de ponteiro; sem isto o handler rebenta.
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

function desenharUmTraco() {
  const canvas = document.querySelector('canvas') as HTMLCanvasElement;
  // O canvas em jsdom não tem dimensões; dá-se-lhe uma caixa para que a
  // conversão de coordenadas não divida por zero.
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 200 }) as DOMRect;

  fireEvent.pointerDown(canvas, { clientX: 100, clientY: 50, pointerId: 1 });
  return canvas;
}

/** Traco completo: pousa, arrasta e levanta — como uma assinatura a serio. */
function desenharTracoCompleto() {
  const canvas = desenharUmTraco();
  fireEvent.pointerMove(canvas, { clientX: 160, clientY: 70, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 220, clientY: 40, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 220, clientY: 40, pointerId: 1 });
  return canvas;
}

describe('SignaturePad', () => {
  /**
   * O bug que obrigava a assinar duas vezes: `toDataURL` guardava-se com
   * `if (empty) return null`, lendo o estado do React. No primeiro traço esse
   * estado ainda era `true` — o React só o actualiza no render seguinte — por
   * isso quem respondia ao aviso recebia `null`, o botão de submeter ficava
   * desligado, e só o segundo traço é que "pegava".
   */
  it('já devolve a assinatura no primeiro traço, quando avisa que houve traço', () => {
    const ref = createRef<SignaturePadHandle>();
    let valorNoMomentoDoAviso: string | null | undefined;

    render(
      <SignaturePad
        ref={ref}
        onChange={(vazio) => {
          valorNoMomentoDoAviso = vazio ? null : ref.current?.toDataURL();
        }}
      />
    );

    desenharUmTraco();

    expect(valorNoMomentoDoAviso).toBe('data:image/png;base64,DESENHO');
  });

  it('diz que já não está vazio no mesmo instante do aviso', () => {
    const ref = createRef<SignaturePadHandle>();
    let vazioNoMomentoDoAviso: boolean | undefined;

    render(
      <SignaturePad ref={ref} onChange={() => (vazioNoMomentoDoAviso = ref.current?.isEmpty())} />
    );

    desenharUmTraco();

    expect(vazioNoMomentoDoAviso).toBe(false);
  });

  it('devolve null enquanto ninguém desenhou', () => {
    const ref = createRef<SignaturePadHandle>();
    render(<SignaturePad ref={ref} />);

    expect(ref.current?.isEmpty()).toBe(true);
    expect(ref.current?.toDataURL()).toBeNull();
  });

  it('volta a ficar vazio depois de limpar', () => {
    const ref = createRef<SignaturePadHandle>();
    render(<SignaturePad ref={ref} />);

    desenharUmTraco();
    expect(ref.current?.isEmpty()).toBe(false);

    ref.current?.clear();

    expect(ref.current?.isEmpty()).toBe(true);
    expect(ref.current?.toDataURL()).toBeNull();
  });

  it('mostra a indicação de desenhar só enquanto está vazio', () => {
    render(<SignaturePad />);

    expect(screen.getByText(/desenhe aqui a sua assinatura/i)).toBeInTheDocument();

    desenharUmTraco();

    expect(screen.queryByText(/desenhe aqui a sua assinatura/i)).not.toBeInTheDocument();
  });
});

/**
 * O aviso tinha de sair TAMBEM no fim do traco.
 *
 * Saia so no `pointerDown`, e quem o recebe vai logo buscar o `toDataURL` — ou
 * seja, fotografava o canvas quando so la estava o ponto inicial. O desenho
 * feito a seguir, no arrastar, nunca chegava a ser capturado: a assinatura
 * submetida ia sempre um traco atrasada, e era preciso desenhar outra vez para
 * a anterior "pegar".
 */
describe('SignaturePad — o valor capturado tem de ser o traco inteiro', () => {
  it('avisa outra vez quando o traco termina', () => {
    const avisos: boolean[] = [];
    render(<SignaturePad onChange={(vazio) => avisos.push(vazio)} />);

    desenharTracoCompleto();

    // Um aviso no inicio (para o botao ligar logo) e outro no fim (para o
    // valor capturado ser o desenho completo).
    expect(avisos.length).toBeGreaterThanOrEqual(2);
    expect(avisos[avisos.length - 1]).toBe(false);
  });

  it('levantar o dedo sem ter desenhado nao inventa avisos', () => {
    const avisos: boolean[] = [];
    render(<SignaturePad onChange={(vazio) => avisos.push(vazio)} />);

    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 200 }) as DOMRect;
    fireEvent.pointerUp(canvas, { clientX: 10, clientY: 10, pointerId: 1 });

    expect(avisos).toHaveLength(0);
  });
});
