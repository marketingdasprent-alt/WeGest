import { useState, useEffect, useMemo } from 'react';
import { User, FileText, Wallet, Car, FileSignature, Receipt, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { MotoristaTabDados } from './tabs/MotoristaTabDados';
import { MotoristaTabDocumentos } from './tabs/MotoristaTabDocumentos';
import { MotoristaTabFinanceiro } from './tabs/MotoristaTabFinanceiro';
import { MotoristaTabRecibos } from './tabs/MotoristaTabRecibos';
import { MotoristaTabViaturas } from './tabs/MotoristaTabViaturas';
import { MotoristaTabContratos } from './tabs/MotoristaTabContratos';
import { MotoristaTabDanos } from './tabs/MotoristaTabDanos';
import type { Motorista } from '@/pages/Motoristas';

type TabId = 'dados' | 'documentos' | 'financeiro' | 'recibos' | 'viaturas' | 'contratos' | 'danos';

interface Tab {
  id: TabId;
  label: string;
  icon: typeof User;
}

const TABS: Tab[] = [
  { id: 'dados', label: 'Dados', icon: User },
  { id: 'documentos', label: 'Documentos', icon: FileText },
  { id: 'financeiro', label: 'Financeiro', icon: Wallet },
  { id: 'recibos', label: 'Recibos', icon: Receipt },
  { id: 'viaturas', label: 'Viaturas', icon: Car },
  { id: 'contratos', label: 'Contratos', icon: FileSignature },
  { id: 'danos', label: 'Danos', icon: AlertTriangle },
];

interface MotoristaFullModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  motorista: Motorista | null;
  onMotoristaUpdated?: () => void;
  initialTab?: TabId;
  /**
   * Modo criação: abre o modal grande para ADICIONAR um motorista. Só a aba
   * "Dados" é mostrada (as restantes dependem de um motorista já persistido).
   * Pré-preenche o nome/IDs de plataforma quando vem do fluxo "criar ficha".
   */
  isCreating?: boolean;
  prefill?: { nome?: string; bolt_id?: string; uber_uuid?: string };
  /** Notificado com o motorista recém-criado (só em modo criação). */
  onMotoristaCreated?: (motorista: Motorista) => void;
}

// Ficha-rascunho usada em modo criação: o TabDados deteta `id === ''` para
// hidratar o form vazio (com prefill) e, no submit, fazer INSERT em vez de UPDATE.
function novaFichaRascunho(prefill?: {
  nome?: string;
  bolt_id?: string;
  uber_uuid?: string;
}): Motorista {
  return {
    id: '',
    codigo: 0,
    nome: prefill?.nome || '',
    bolt_id: prefill?.bolt_id || null,
    uber_uuid: prefill?.uber_uuid || null,
  } as Motorista;
}

export function MotoristaFullModal({
  open,
  onOpenChange,
  motorista,
  onMotoristaUpdated,
  initialTab = 'dados',
  isCreating = false,
  prefill,
  onMotoristaCreated,
}: MotoristaFullModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [dadosDraft, setDadosDraft] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (open) {
      // Em criação força sempre a aba "Dados" (as outras estão escondidas).
      setActiveTab(isCreating ? 'dados' : initialTab);
      setDadosDraft(null);
    }
  }, [initialTab, open, isCreating]);

  useEffect(() => {
    setDadosDraft(null);
  }, [motorista?.id]);

  // Em criação não há motorista persistido — usa-se uma ficha-rascunho.
  // Memoizada pelos VALORES do prefill para manter identidade estável: o TabDados
  // hidrata o form num useEffect dependente do objeto motorista; recriá-lo a cada
  // render re-resetaria o form e apagaria o que o utilizador está a escrever.
  const { nome: prefillNome, bolt_id: prefillBolt, uber_uuid: prefillUber } = prefill || {};
  const fichaRascunho = useMemo(
    () => novaFichaRascunho({ nome: prefillNome, bolt_id: prefillBolt, uber_uuid: prefillUber }),
    [prefillNome, prefillBolt, prefillUber]
  );
  const motoristaAtivo = isCreating ? fichaRascunho : motorista;
  if (!motoristaAtivo) return null;

  // Só a aba "Dados" faz sentido enquanto o motorista não existe na BD.
  const visibleTabs = isCreating ? TABS.filter((t) => t.id === 'dados') : TABS;

  const handleSave = () => {
    setDadosDraft(null);
    onMotoristaUpdated?.();
  };

  const handleClose = () => {
    setActiveTab('dados');
    setDadosDraft(null);
    onOpenChange(false);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dados':
        return (
          <MotoristaTabDados
            motorista={motoristaAtivo}
            onSave={handleSave}
            draft={dadosDraft}
            onDraftChange={setDadosDraft}
            isCreating={isCreating}
            onCreated={onMotoristaCreated}
          />
        );
      case 'documentos':
        return <MotoristaTabDocumentos motorista={motoristaAtivo} />;
      case 'financeiro':
        return <MotoristaTabFinanceiro motorista={motoristaAtivo} />;
      case 'recibos':
        return <MotoristaTabRecibos motorista={motoristaAtivo} />;
      case 'viaturas':
        return <MotoristaTabViaturas motorista={motoristaAtivo} />;
      case 'contratos':
        return (
          <MotoristaTabContratos
            motorista={motoristaAtivo}
            onMotoristaUpdated={onMotoristaUpdated}
          />
        );
      case 'danos':
        return <MotoristaTabDanos motorista={motoristaAtivo} />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] w-full h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isCreating ? (
                <DialogTitle className="text-xl">Adicionar Motorista</DialogTitle>
              ) : (
                <>
                  <DialogTitle className="text-xl flex items-center gap-2">
                    <span className="text-muted-foreground font-mono text-base">
                      #{motoristaAtivo.codigo}
                    </span>
                    {motoristaAtivo.nome}
                  </DialogTitle>
                  <Badge variant={motoristaAtivo.status_ativo ? 'default' : 'secondary'}>
                    {motoristaAtivo.status_ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Navigation Tabs */}
        <div className="px-6 py-2 border-b bg-muted/30 flex-shrink-0">
          <nav className="flex gap-1">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-6">{renderTabContent()}</ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
