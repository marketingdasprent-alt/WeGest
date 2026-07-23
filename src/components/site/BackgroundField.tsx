const GRAIN_SVG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>";

// Fundo quase plano de propósito: um único glow assimétrico (não um
// cluster de blobs coloridos) + grelha técnica ténue + grão. O contraste
// vem da tipografia e do espaço, não de cor de fundo a competir com o
// conteúdo.
export const BackgroundField = () => {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background"
      data-testid="background-field"
      aria-hidden="true"
    >
      <div
        className="absolute -top-[20%] left-[8%] h-[50vw] w-[50vw] rounded-full opacity-[0.1]"
        style={{
          background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)',
          filter: 'blur(90px)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--border)) 1px, transparent 1px),' +
            'linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{ backgroundImage: `url("${GRAIN_SVG}")` }}
      />
    </div>
  );
};
