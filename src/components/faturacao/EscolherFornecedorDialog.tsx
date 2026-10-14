import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SeletorFornecedorFaturacao } from './SeletorFornecedorFaturacao';
import type { OpcaoFornecedor } from '@/types/faturacao';

interface EscolherFornecedorDialogProps {
  open: boolean;
  opcoes: OpcaoFornecedor[];
  integracaoId: string | null;
  onChange: (integracaoId: string) => void;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export const EscolherFornecedorDialog: React.FC<EscolherFornecedorDialogProps> = ({
  open,
  opcoes,
  integracaoId,
  onChange,
  onConfirmar,
  onCancelar,
}) => (
  <Dialog open={open} onOpenChange={(o) => !o && onCancelar()}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Por onde emitir este documento?</DialogTitle>
      </DialogHeader>
      <SeletorFornecedorFaturacao
        opcoes={opcoes}
        isLoading={false}
        error={null}
        integracaoId={integracaoId}
        onChange={onChange}
      />
      <DialogFooter>
        <Button variant="outline" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button onClick={onConfirmar} disabled={!integracaoId}>
          Emitir
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
