import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ContactoMotorista, EstadoEnvio } from '@/hooks/useEnvioResumos';
import {
  assuntoEmailResumo,
  linkEmailPara,
  linkWhatsAppPara,
  montarMensagemEnvio,
  NOMES_CANAL,
  telefoneParaWhatsApp,
  type CanalEnvio,
} from './envioResumos';
import type { MotoristaResumo } from './contasResumoExports';

interface EnviarResumoLinhaProps {
  canal: CanalEnvio;
  resumo: MotoristaResumo;
  contacto: ContactoMotorista | undefined;
  estado: EstadoEnvio | undefined;
  weekStart: Date;
  weekEnd: Date;
  formatCurrency: (valor: number) => string;
  onEnviado: () => void;
}

export function EnviarResumoLinha({
  canal,
  resumo,
  contacto,
  estado,
  weekStart,
  weekEnd,
  formatCurrency,
  onEnviado,
}: EnviarResumoLinhaProps) {
  const jaNoCanal = estado?.canais.includes(canal) ?? false;
  const telefone = telefoneParaWhatsApp(contacto?.telefone);
  const email = contacto?.email?.trim() || null;
  const destino = canal === 'whatsapp' ? telefone : canal === 'email' ? email : null;

  const handleAbrir = () => {
    if (!destino) return;
    const texto = montarMensagemEnvio({
      nome: resumo.driver_name,
      inicio: weekStart,
      fim: weekEnd,
      liquido: resumo.liquido,
      fmt: formatCurrency,
    });
    const url =
      canal === 'whatsapp'
        ? linkWhatsAppPara(destino, texto)
        : linkEmailPara(destino, assuntoEmailResumo(weekStart, weekEnd), texto);
    window.open(url, '_blank', 'noopener');
    onEnviado();
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{resumo.driver_name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatCurrency(resumo.liquido)}
          {canal !== 'app' &&
            ` · ${destino ?? (canal === 'whatsapp' ? 'sem telemóvel válido' : 'sem e-mail')}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {jaNoCanal ? (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-600" />
            Enviado
          </Badge>
        ) : (
          estado && (
            <Badge variant="outline" className="text-xs">
              No perfil
            </Badge>
          )
        )}
        {canal !== 'app' && (
          <Button size="sm" variant="outline" disabled={!destino} onClick={handleAbrir}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            {jaNoCanal ? 'Reenviar' : NOMES_CANAL[canal]}
          </Button>
        )}
      </div>
    </div>
  );
}
