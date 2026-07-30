import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, ChevronRight } from 'lucide-react';
import { useMeusAcordosAtivos } from '@/hooks/useAcordoVistaDevedor';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

/**
 * Atalho para o(s) plano(s) de pagamento em que este motorista é o
 * responsável pela dívida (contrato TVDE parcelado — ver
 * 20260730150000_acordo_cessao_motorista_desbloqueada.sql). Sem isto não
 * havia forma de o motorista encontrar /motorista/painel/acordos/:id: a
 * rota existe mas nada no painel ligava para lá. Nunca aparece para quem
 * não tem nenhum acordo ativo (caso comum) — sem estado vazio, ao
 * contrário de outros cartões deste dashboard, para não ocupar espaço com
 * algo que a esmagadora maioria dos motoristas nunca vai ter.
 */
export function MotoristaAcordoCard() {
  const navigate = useNavigate();
  const { data: acordos, isLoading } = useMeusAcordosAtivos();

  if (isLoading || !acordos || acordos.length === 0) return null;

  return (
    <Card className="rounded-[1.5rem] md:rounded-[2rem] overflow-hidden border-border bg-background">
      <CardHeader className="p-6 md:p-8 pb-2 md:pb-4">
        <CardTitle className="text-lg font-black flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          Plano{acordos.length > 1 ? 's' : ''} de pagamento
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {acordos.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => navigate(`/motorista/painel/acordos/${a.id}`)}
              className="w-full flex items-center justify-between gap-4 p-6 md:p-8 pt-4 md:pt-4 text-left hover:bg-muted/30 transition-all group"
            >
              <div>
                <p className="font-bold text-foreground group-hover:text-primary transition-colors">
                  Acordo #{a.codigo}
                </p>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">
                  Falta pagar
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl font-black tabular-nums">
                  {formatCurrency(a.faltaPagar)}
                </span>
                <ChevronRight className="h-5 w-5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
