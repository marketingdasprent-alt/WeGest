const GRAIN_SVG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>";

export const BackgroundField = () => {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background"
      data-testid="background-field"
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 animate-drift"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 60% 50% at 15% 8%, hsl(var(--primary) / 0.3) 0%, transparent 60%),' +
            'radial-gradient(ellipse 55% 60% at 88% 28%, hsl(var(--brand-navy) / 0.35) 0%, transparent 55%),' +
            'radial-gradient(ellipse 70% 55% at 50% 95%, hsl(var(--primary) / 0.18) 0%, transparent 60%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--border) / 0.6) 1px, transparent 1px),' +
            'linear-gradient(90deg, hsl(var(--border) / 0.6) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: `url("${GRAIN_SVG}")` }}
      />
      <div
        className="absolute inset-0"
        style={{ boxShadow: 'inset 0 0 240px 60px hsl(var(--background))' }}
      />
    </div>
  );
};
