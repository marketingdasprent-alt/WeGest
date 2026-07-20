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
            'radial-gradient(circle at 20% 20%, hsl(var(--primary) / 0.18) 0%, transparent 45%),' +
            'radial-gradient(circle at 80% 70%, hsl(var(--primary) / 0.12) 0%, transparent 50%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, hsl(var(--foreground) / 0.08) 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />
    </div>
  );
};
