import type { ResultadoEnvioEmail } from '@/hooks/useEnvioResumos';

interface ResultadoEnvioEmailAvisoProps {
  resultado: ResultadoEnvioEmail;
}

export function ResultadoEnvioEmailAviso({ resultado }: ResultadoEnvioEmailAvisoProps) {
  const problemas = [...resultado.falhados, ...resultado.semEmail];

  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm">
      <p className="font-medium">
        {resultado.enviados} e-mail{resultado.enviados === 1 ? '' : 's'} enviado
        {resultado.enviados === 1 ? '' : 's'}
        {problemas.length > 0 && `, ${problemas.length} por enviar`}
      </p>
      {problemas.length > 0 && (
        <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
          {problemas.map((p) => (
            <li key={p.motoristaId}>
              <span className="text-foreground">{p.nome}</span>: {p.motivo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
