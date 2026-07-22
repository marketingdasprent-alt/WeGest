interface ModuleHeaderProps {
  title: string;
  subtitle: string;
}

export const ModuleHeader = ({ title, subtitle }: ModuleHeaderProps) => (
  <div className="border-b border-border px-8 py-5">
    <h2 className="font-display text-xl font-semibold text-foreground">{title}</h2>
    <p className="text-sm text-muted-foreground">{subtitle}</p>
  </div>
);
