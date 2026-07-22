import { useState } from 'react';
import { FileText, Loader2, Car, User, Coins } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import { generateContratoPrestacaoPdf } from '@/utils/generateContratoPrestacaoPdf';
import { CidadeAssinaturaField } from '@/components/documentos/CidadeAssinaturaField';

import type { Reserva } from '@/types/reserva';
import type { Motorista } from '@/types/motorista';
import type { ViaturaBasic } from '@/hooks/useViaturas';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reserva: Reserva;
  motoristas: Motorista[];
  viaturas: ViaturaBasic[];
}

const fmtEur = (n: number | null) =>
  n != null ? `${n.toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €` : '—';

export const ContratoPrestacaoDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  reserva,
  motoristas,
  viaturas,
}) => {
  const { toast } = useToast();
  const { empresas } = useClientesEmpresas();
  const [loading, setLoading] = useState(false);
  const [cidadeAssinatura, setCidadeAssinatura] = useState('');

  const motorista = reserva.condutor_id
    ? (motoristas.find((m) => m.id === reserva.condutor_id) ?? null)
    : null;
  const viatura = reserva.viatura_id
    ? (viaturas.find((v) => v.id === reserva.viatura_id) ?? null)
    : null;
  // Emissor escolhido na reserva manda; fallback cobre reservas antigas
  // criadas antes do campo existir.
  const empresa =
    empresas.find((e) => e.id === reserva.emissor_id) ??
    empresas.find((e) => e.orgId === reserva.org_id) ??
    empresas[0] ??
    null;

  const podeGerar = !!motorista && !!empresa && !!cidadeAssinatura.trim();

  const gerar = async () => {
    if (!motorista) {
      toast({
        title: 'Sem motorista',
        description: 'Define o condutor (motorista) na aba Condutores antes de gerar.',
        variant: 'destructive',
      });
      return;
    }
    if (!cidadeAssinatura.trim()) {
      toast({ title: 'Indique a cidade de assinatura', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      // 1) Regista o contrato de prestação (devolve o código gerado).
      const { data: inserted, error } = await (supabase as any)
        .from('contratos_prestacao')
        .insert({
          motorista_id: motorista.id,
          viatura_id: reserva.viatura_id,
          reserva_id: reserva.id,
          data_inicio: reserva.data_inicio
            ? new Date(reserva.data_inicio).toISOString().split('T')[0]
            : undefined,
          // Coluna chama-se valor_semanal por legado, mas o slot é cobrado ao
          // mês — usa slot_valor_mensal (o campo que a app realmente preenche).
          valor_semanal: reserva.slot_valor_mensal,
          motorista_nome: motorista.nome,
          motorista_nif: motorista.nif ?? null,
          motorista_morada: motorista.morada ?? null,
          motorista_email: motorista.email ?? null,
          motorista_telefone: motorista.telefone ?? null,
        })
        .select('id, codigo')
        .single();

      if (error) throw error;

      // 2) Gera o PDF a partir do template, já com o número do contrato.
      await generateContratoPrestacaoPdf({
        motorista,
        viatura,
        valorSemanal: reserva.slot_valor_mensal,
        dataInicio: reserva.data_inicio,
        numeroContrato: inserted?.codigo ?? null,
        empresa,
        action: 'print',
        cidadeAssinatura,
      });

      toast({
        title: 'Contrato de prestação gerado',
        description: `Registado${inserted?.codigo ? ` (#${inserted.codigo})` : ''} e aberto para impressão.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Erro ao gerar contrato',
        description: err instanceof Error ? err.message : 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-600" />
            Contrato de Prestação de Serviços
          </DialogTitle>
          <DialogDescription>
            Regime slot — gera o documento e regista o contrato do motorista.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-start gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Motorista</p>
              <p className="font-medium">
                {motorista?.nome ?? (
                  <span className="text-amber-600 italic">Define o condutor na aba Condutores</span>
                )}
              </p>
              {motorista?.nif && (
                <p className="text-xs text-muted-foreground">NIF: {motorista.nif}</p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <Car className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Viatura (do motorista)</p>
              <p className="font-medium">
                {viatura ? `${viatura.matricula} · ${viatura.marca} ${viatura.modelo}` : '—'}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <Coins className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Valor mensal do slot</p>
              <p className="font-medium">{fmtEur(reserva.slot_valor_mensal)}</p>
            </div>
          </div>
          <CidadeAssinaturaField value={cidadeAssinatura} onChange={setCidadeAssinatura} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={gerar} disabled={!podeGerar || loading} className="gap-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Gerar e Registar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
