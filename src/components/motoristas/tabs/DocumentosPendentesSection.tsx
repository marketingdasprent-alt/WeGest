import React, { useState } from 'react';
import { CheckCircle2, Clock, Eye, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { SectionCard } from '@/components/ui/section-card';
import {
  useAprovarDocumentoMotorista,
  useDocumentosPendentesMotorista,
  useRejeitarDocumentoMotorista,
  type DocumentoPendenteMotorista,
} from '@/hooks/useAprovacaoDocumentosMotorista';
import { TIPOS_DOCUMENTO_MOTORISTA } from '@/utils/documentosMotorista';

interface DocumentosPendentesSectionProps {
  motoristaId: string;
  /** Depois de aprovar/rejeitar: a ficha mudou, quem nos renderiza recarrega. */
  onAlterado?: () => void;
}

const rotulo = (tipo: string) =>
  TIPOS_DOCUMENTO_MOTORISTA.find((t) => t.value === tipo)?.label ?? tipo;

/**
 * Documentos que o motorista enviou pelo portal e aguardam validação.
 *
 * É uma caixa de entrada: sem pendentes não ocupa espaço (a maior parte do
 * tempo não há nenhum). Aprovar chama a RPC que copia o ficheiro para a
 * coluna oficial da ficha; rejeitar exige motivo, que o motorista vê.
 */
export const DocumentosPendentesSection: React.FC<DocumentosPendentesSectionProps> = ({
  motoristaId,
  onAlterado,
}) => {
  const { data: pendentes = [], error } = useDocumentosPendentesMotorista(motoristaId);
  const aprovar = useAprovarDocumentoMotorista(motoristaId);
  const rejeitar = useRejeitarDocumentoMotorista(motoristaId);
  const [aRejeitar, setARejeitar] = useState<DocumentoPendenteMotorista | null>(null);
  const [motivo, setMotivo] = useState('');

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar os documentos por aprovar deste motorista.
      </p>
    );
  }
  if (pendentes.length === 0) return null;

  const ver = async (path: string) => {
    try {
      const { data, error: erroUrl } = await supabase.storage
        .from('motorista-documentos')
        .createSignedUrl(path, 3600);
      if (erroUrl) throw erroUrl;
      window.open(data.signedUrl, '_blank');
    } catch (e: unknown) {
      console.error('[DocumentosPendentesSection] Erro ao abrir documento:', e);
      toast.error('Não foi possível abrir o documento');
    }
  };

  const fecharRejeicao = () => {
    setARejeitar(null);
    setMotivo('');
  };

  const confirmarRejeicao = () => {
    if (!aRejeitar) return;
    rejeitar.mutate(
      { documentoId: aRejeitar.id, motivo },
      {
        onSuccess: () => {
          fecharRejeicao();
          onAlterado?.();
        },
      }
    );
  };

  return (
    <>
      <SectionCard
        icon={<Clock className="h-4 w-4" />}
        title={`Enviados pelo motorista — por aprovar (${pendentes.length})`}
        headerClassName="bg-amber-50 dark:bg-amber-950/30"
      >
        <p className="mb-3 text-sm text-muted-foreground">
          Ao aprovar, o documento substitui o actual na ficha. Ao rejeitar, o motorista vê o motivo
          no portal e pode enviar outro.
        </p>
        <ul className="divide-y divide-border">
          {pendentes.map((d) => (
            <li
              key={d.id}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{rotulo(d.tipo_documento)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {d.nome_ficheiro ?? 'ficheiro'}
                  {d.created_at &&
                    ` · ${format(new Date(d.created_at), "d MMM yyyy 'às' HH:mm", { locale: pt })}`}
                  {d.data_validade &&
                    ` · validade ${format(new Date(d.data_validade), 'dd/MM/yyyy')}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => ver(d.ficheiro_url)}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Ver
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={aprovar.isPending}
                  onClick={() => aprovar.mutate(d.id, { onSuccess: () => onAlterado?.() })}
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Aprovar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={rejeitar.isPending}
                  onClick={() => setARejeitar(d)}
                >
                  <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Rejeitar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      <Dialog open={!!aRejeitar} onOpenChange={(aberto) => !aberto && fecharRejeicao()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar documento</DialogTitle>
            <DialogDescription>
              {aRejeitar && rotulo(aRejeitar.tipo_documento)} — o motorista vai ver este motivo no
              portal.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: fotografia ilegível, documento caducado, falta o verso…"
            rows={3}
            aria-label="Motivo da rejeição"
          />
          <DialogFooter>
            <Button variant="outline" onClick={fecharRejeicao}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!motivo.trim() || rejeitar.isPending}
              onClick={confirmarRejeicao}
            >
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
