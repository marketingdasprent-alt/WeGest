import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  FileSignature,
  Pencil,
  User,
  Phone,
  CreditCard,
  Car,
  FileText,
  MessageSquare,
  Fuel,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MotoristaStatusBadge } from '@/lib/statusBadges';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SectionCard } from '@/components/ui/section-card';
import { MotoristaFullModal } from './MotoristaFullModal';
import { supabase } from '@/integrations/supabase/client';
import type { Motorista } from '@/pages/Motoristas';

interface ViaturaAtual {
  matricula: string;
  marca: string;
  modelo: string;
  ano: number | null;
  cor: string | null;
  categoria: string | null;
  data_inicio: string;
}

interface MotoristaDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  motorista: Motorista | null;
  onMotoristaUpdated?: () => void;
}

export function MotoristaDetailsDrawer({
  open,
  onOpenChange,
  motorista,
  onMotoristaUpdated,
}: MotoristaDetailsDrawerProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [initialModalTab, setInitialModalTab] = useState<'dados' | 'contratos'>('dados');
  const [viaturaAtual, setViaturaAtual] = useState<ViaturaAtual | null>(null);

  useEffect(() => {
    if (!motorista) return;
    supabase
      .from('motorista_viaturas')
      .select('data_inicio, viaturas(matricula, marca, modelo, ano, cor, categoria)')
      .eq('motorista_id', motorista.id)
      .eq('status', 'ativo')
      .is('data_fim', null)
      .order('data_inicio', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.viaturas) {
          const v = data.viaturas as any;
          setViaturaAtual({ ...v, data_inicio: data.data_inicio });
        } else {
          setViaturaAtual(null);
        }
      });
  }, [motorista?.id]);

  if (!motorista) return null;

  const handleEditClose = (shouldRefresh: boolean) => {
    setEditDialogOpen(false);
    if (shouldRefresh) {
      onOpenChange(false);
      onMotoristaUpdated?.();
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy');
    } catch {
      return '-';
    }
  };

  const handleViewContracts = () => {
    setInitialModalTab('contratos');
    setEditDialogOpen(true);
  };

  const handleEdit = () => {
    setInitialModalTab('dados');
    setEditDialogOpen(true);
  };

  const InfoItem = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-xl flex items-center gap-2">
              <span className="text-muted-foreground font-mono">#{motorista.codigo}</span>
              {motorista.nome}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar
              </Button>
              <MotoristaStatusBadge statusAtivo={motorista.status_ativo} />
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Dados Pessoais */}
          <SectionCard
            icon={<User className="h-4 w-4" />}
            title="Dados Pessoais"
            headerClassName="bg-blue-50 dark:bg-blue-950/30"
          >
            <div className="space-y-2 text-sm">
              <InfoItem label="NIF" value={motorista.nif || '-'} />
              <InfoItem label="Morada" value={motorista.morada || '-'} />
              <InfoItem label="Código Postal" value={motorista.codigo_postal || '-'} />
              <InfoItem label="Cidade (Residência)" value={motorista.cidade || '-'} />
              <InfoItem label="IBAN" value={motorista.iban || '-'} />
              <InfoItem label="Gestor Responsável" value={motorista.gestor_responsavel || '-'} />
              <InfoItem label="Uber UUID" value={motorista.uber_uuid || '-'} />
              <InfoItem label="Bolt ID" value={motorista.bolt_id || '-'} />
            </div>
          </SectionCard>

          {/* Contactos */}
          <SectionCard
            icon={<Phone className="h-4 w-4" />}
            title="Contactos"
            headerClassName="bg-green-50 dark:bg-green-950/30"
          >
            <div className="space-y-2 text-sm">
              <InfoItem label="Telefone" value={motorista.telefone || '-'} />
              <InfoItem label="Email" value={motorista.email || '-'} />
            </div>
          </SectionCard>

          {/* Documento de Identificação */}
          <SectionCard
            icon={<CreditCard className="h-4 w-4" />}
            title="Documento de Identificação"
            headerClassName="bg-amber-50 dark:bg-amber-950/30"
          >
            <div className="space-y-2 text-sm">
              <InfoItem label="Tipo" value={motorista.documento_tipo || '-'} />
              <InfoItem label="Número" value={motorista.documento_numero || '-'} />
              <InfoItem label="Validade" value={formatDate(motorista.documento_validade)} />
              {(motorista.documento_ficheiro_url ||
                motorista.documento_identificacao_verso_url) && (
                <div className="flex gap-2 pt-2">
                  {motorista.documento_ficheiro_url && (
                    <Button variant="outline" size="sm" className="h-7 text-[10px]" asChild>
                      <a
                        href={motorista.documento_ficheiro_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Frente
                      </a>
                    </Button>
                  )}
                  {motorista.documento_identificacao_verso_url && (
                    <Button variant="outline" size="sm" className="h-7 text-[10px]" asChild>
                      <a
                        href={motorista.documento_identificacao_verso_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Verso
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          {/* Carta de Condução */}
          <SectionCard
            icon={<Car className="h-4 w-4" />}
            title="Carta de Condução"
            headerClassName="bg-purple-50 dark:bg-purple-950/30"
          >
            <div className="space-y-2 text-sm">
              <InfoItem label="Número" value={motorista.carta_conducao || '-'} />
              <InfoItem label="Categorias" value={motorista.carta_categorias?.join(', ') || '-'} />
              <InfoItem label="Validade" value={formatDate(motorista.carta_validade)} />
              {(motorista.carta_ficheiro_url || motorista.carta_conducao_verso_url) && (
                <div className="flex gap-2 pt-2">
                  {motorista.carta_ficheiro_url && (
                    <Button variant="outline" size="sm" className="h-7 text-[10px]" asChild>
                      <a
                        href={motorista.carta_ficheiro_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Frente
                      </a>
                    </Button>
                  )}
                  {motorista.carta_conducao_verso_url && (
                    <Button variant="outline" size="sm" className="h-7 text-[10px]" asChild>
                      <a
                        href={motorista.carta_conducao_verso_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Verso
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </SectionCard>

          {/* Licença TVDE */}
          <SectionCard
            icon={<FileText className="h-4 w-4" />}
            title="Licença TVDE"
            headerClassName="bg-orange-50 dark:bg-orange-950/30"
          >
            <div className="space-y-2 text-sm">
              <InfoItem label="Número" value={motorista.licenca_tvde_numero || '-'} />
              <InfoItem label="Validade" value={formatDate(motorista.licenca_tvde_validade)} />
              {motorista.licenca_tvde_ficheiro_url && (
                <div className="pt-2">
                  <Button variant="outline" size="sm" className="h-7 text-[10px]" asChild>
                    <a
                      href={motorista.licenca_tvde_ficheiro_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver Documento
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Cartões Frota */}
          <SectionCard
            icon={<Fuel className="h-4 w-4" />}
            title="Cartões Frota"
            headerClassName="bg-orange-50 dark:bg-orange-950/30"
          >
            <div className="space-y-2 text-sm">
              {motorista.cartao_bp && <InfoItem label="BP" value={motorista.cartao_bp} />}
              {motorista.cartao_repsol && (
                <InfoItem label="REPSOL" value={motorista.cartao_repsol} />
              )}
              {motorista.cartao_edp && <InfoItem label="EDP" value={motorista.cartao_edp} />}
              {!motorista.cartao_bp && !motorista.cartao_repsol && !motorista.cartao_edp && (
                <p className="text-muted-foreground italic text-center py-2">
                  Nenhum cartão associado
                </p>
              )}
            </div>
          </SectionCard>

          {/* Viatura Atual */}
          <SectionCard
            icon={<Car className="h-4 w-4" />}
            title="Viatura Atual"
            headerClassName="bg-sky-50 dark:bg-sky-950/30"
          >
            {viaturaAtual ? (
              <div className="space-y-2 text-sm">
                <InfoItem label="Matrícula" value={viaturaAtual.matricula} />
                <InfoItem
                  label="Marca / Modelo"
                  value={`${viaturaAtual.marca} ${viaturaAtual.modelo}`}
                />
                {viaturaAtual.ano && <InfoItem label="Ano" value={String(viaturaAtual.ano)} />}
                {viaturaAtual.cor && <InfoItem label="Cor" value={viaturaAtual.cor} />}
                {viaturaAtual.categoria && (
                  <InfoItem label="Categoria" value={viaturaAtual.categoria} />
                )}
                <InfoItem label="Desde" value={formatDate(viaturaAtual.data_inicio)} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic text-center py-2">
                Sem viatura associada
              </p>
            )}
          </SectionCard>
        </div>

        {/* Observações - largura total */}
        {motorista.observacoes && (
          <SectionCard
            icon={<MessageSquare className="h-4 w-4" />}
            title="Observações"
            headerClassName="bg-muted/50"
            className="mt-4"
          >
            <p className="text-sm">{motorista.observacoes}</p>
          </SectionCard>
        )}

        {/* Ações */}
        <div className="pt-4 mt-2 border-t">
          <Button onClick={handleViewContracts} className="w-full" variant="outline">
            <FileSignature className="h-4 w-4 mr-2" />
            Ver Contratos
          </Button>
        </div>
      </DialogContent>

      <MotoristaFullModal
        open={editDialogOpen}
        onOpenChange={(open) => handleEditClose(!open)}
        motorista={motorista}
        onMotoristaUpdated={onMotoristaUpdated}
        initialTab={initialModalTab}
      />
    </Dialog>
  );
}
