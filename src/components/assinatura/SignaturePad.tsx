import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface SignaturePadHandle {
  /** Limpa o canvas. */
  clear: () => void;
  /** True se nada foi desenhado. */
  isEmpty: () => boolean;
  /** Exporta a assinatura como data URL PNG (transparente), recortada à área
   *  desenhada para evitar margens vazias. Devolve null se estiver vazia. */
  toDataURL: () => string | null;
}

interface SignaturePadProps {
  /** Data URL a carregar inicialmente (assinatura já guardada). */
  value?: string | null;
  /** Disparado quando o traço termina (útil para ativar o botão Guardar). */
  onChange?: (isEmpty: boolean) => void;
  className?: string;
  /** Cor do traço. */
  penColor?: string;
}

// Resolução interna do canvas (independente do tamanho CSS). Mais alta = traço
// mais nítido no PDF. 4:1 é a proporção típica de uma assinatura.
const CANVAS_W = 800;
const CANVAS_H = 200;

/**
 * Canvas de assinatura compatível com rato (desktop), dedo (tablet/telemóvel)
 * e ecrãs tácteis em geral via Pointer Events. Desenha com linhas suavizadas
 * e exporta um PNG transparente recortado.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  ({ value, onChange, className, penColor = '#1a1a2e' }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    // `empty` serve o desenho do ecrã (a indicação "Desenhe aqui"); `emptyRef` é
    // a verdade que o `toDataURL`/`isEmpty` consultam.
    //
    // Têm de ser duas coisas porque o aviso `onChange` sai no mesmo instante em
    // que o traço começa, e quem o recebe vai logo buscar o valor. O estado do
    // React só muda no render seguinte — a ler dali, a primeira assinatura
    // devolvia sempre `null` e obrigava a desenhar duas vezes para "pegar".
    const [empty, setEmpty] = useState(true);
    const emptyRef = useRef(true);

    const marcarVazio = (vazio: boolean) => {
      emptyRef.current = vazio;
      setEmpty(vazio);
    };

    // Bounding box do traço (em coords do canvas) para recortar no export.
    const bounds = useRef({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

    const ctxOf = () => canvasRef.current?.getContext('2d') ?? null;

    const resetBounds = () => {
      bounds.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    };

    const setupCtx = (ctx: CanvasRenderingContext2D) => {
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = penColor;
    };

    // Posição do ponteiro em coordenadas do canvas (escala CSS → resolução real).
    const posFromEvent = (e: PointerEvent | React.PointerEvent) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
      const y = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
      return { x, y };
    };

    const trackBounds = (x: number, y: number) => {
      const b = bounds.current;
      b.minX = Math.min(b.minX, x);
      b.minY = Math.min(b.minY, y);
      b.maxX = Math.max(b.maxX, x);
      b.maxY = Math.max(b.maxY, y);
    };

    const handlePointerDown = (e: React.PointerEvent) => {
      e.preventDefault();
      const ctx = ctxOf();
      if (!ctx) return;
      canvasRef.current?.setPointerCapture(e.pointerId);
      drawing.current = true;
      const p = posFromEvent(e);
      last.current = p;
      trackBounds(p.x, p.y);
      // Um único toque (ponto) também conta como traço — desenha um ponto.
      setupCtx(ctx);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 0.1, p.y + 0.1);
      ctx.stroke();
      marcarVazio(false);
      // Cada novo traço marca alteração — mesmo por cima de uma assinatura já
      // carregada (senão o botão Guardar nunca reativava ao redesenhar).
      onChange?.(false);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      if (!drawing.current) return;
      e.preventDefault();
      const ctx = ctxOf();
      if (!ctx || !last.current) return;
      const p = posFromEvent(e);
      setupCtx(ctx);
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
      trackBounds(p.x, p.y);
    };

    const endStroke = (e: React.PointerEvent) => {
      if (!drawing.current) return;
      drawing.current = false;
      last.current = null;
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer já libertado */
      }
      // Segundo aviso, e é este que interessa ao valor. O do `pointerDown`
      // serve para o botão ligar logo, mas quem o recebe fotografa o canvas
      // nesse instante — quando só lá está o ponto inicial. Sem este, o que
      // era submetido ia sempre um traço atrasado: desenhava-se, e só o traço
      // SEGUINTE é que capturava o anterior.
      onChange?.(false);
    };

    const doClear = () => {
      const ctx = ctxOf();
      if (!ctx || !canvasRef.current) return;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      resetBounds();
      marcarVazio(true);
      onChange?.(true);
    };

    // Carregar assinatura inicial (quando dada). Centrada, mantendo aspeto.
    useEffect(() => {
      const ctx = ctxOf();
      if (!ctx || !canvasRef.current) return;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      resetBounds();
      if (!value) {
        marcarVazio(true);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(CANVAS_W / img.width, CANVAS_H / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        const dx = (CANVAS_W - w) / 2;
        const dy = (CANVAS_H - h) / 2;
        ctx.drawImage(img, dx, dy, w, h);
        // Registar bounds aproximados para permitir re-exportar o valor carregado.
        bounds.current = { minX: dx, minY: dy, maxX: dx + w, maxY: dy + h };
        marcarVazio(false);
      };
      img.src = value;
    }, [value]);

    useImperativeHandle(ref, () => ({
      clear: doClear,
      isEmpty: () => emptyRef.current,
      toDataURL: () => {
        const canvas = canvasRef.current;
        if (!canvas || emptyRef.current) return null;
        const b = bounds.current;
        if (!isFinite(b.minX)) return canvas.toDataURL('image/png');
        // Recorta à área desenhada com uma margem, para o PDF não levar espaço morto.
        const pad = 12;
        const sx = Math.max(0, b.minX - pad);
        const sy = Math.max(0, b.minY - pad);
        const sw = Math.min(CANVAS_W - sx, b.maxX - b.minX + pad * 2);
        const sh = Math.min(CANVAS_H - sy, b.maxY - b.minY + pad * 2);
        if (sw <= 0 || sh <= 0) return canvas.toDataURL('image/png');
        const out = document.createElement('canvas');
        out.width = Math.round(sw);
        out.height = Math.round(sh);
        const octx = out.getContext('2d');
        if (!octx) return canvas.toDataURL('image/png');
        octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
        return out.toDataURL('image/png');
      },
    }));

    return (
      <div
        className={cn(
          'relative rounded-md border bg-white touch-none select-none overflow-hidden',
          className
        )}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="w-full h-auto block cursor-crosshair touch-none"
          style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
        />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-muted-foreground/60">Desenhe aqui a sua assinatura</span>
          </div>
        )}
      </div>
    );
  }
);

SignaturePad.displayName = 'SignaturePad';
