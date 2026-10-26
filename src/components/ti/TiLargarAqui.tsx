import { Upload } from 'lucide-react';

/** Véu por cima da zona enquanto se arrasta um ficheiro. O pai tem de ser `relative`. */
export function TiLargarAqui({ visivel }: { visivel: boolean }) {
  if (!visivel) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-[inherit] border-2 border-dashed border-primary bg-background/85 text-sm font-medium text-primary backdrop-blur-sm">
      <Upload className="h-6 w-6" />
      Largue aqui para anexar
    </div>
  );
}
