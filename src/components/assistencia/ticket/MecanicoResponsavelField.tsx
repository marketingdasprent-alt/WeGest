import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useMecanicos, criarMecanico, atribuirMecanicoAoTicket } from '@/hooks/useMecanicos';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Wrench, Plus, Loader2 } from 'lucide-react';

const NONE = '__none__';

interface Props {
  ticketId: string;
  mecanicoId: string | null;
  onChanged: () => void;
}

/**
 * Campo "Mecânico responsável" na ficha do ticket. Escolhe do catálogo de
 * mecânicos (sem conta) e grava em `assistencia_tickets.mecanico_id`. Quem tem
 * a permissão `assistencia_mecanicos` pode cadastrar um mecânico na hora.
 * Distinto de "Assistente responsável" (atribuido_a = utilizador interno).
 */
export const MecanicoResponsavelField: React.FC<Props> = ({ ticketId, mecanicoId, onChanged }) => {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const podeGerir = hasPermission('assistencia_mecanicos');
  const { data: mecanicos = [], isLoading } = useMecanicos();
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoTel, setNovoTel] = useState('');
  const [adding, setAdding] = useState(false);

  const gravarTicket = async (novo: string | null) => {
    setSaving(true);
    try {
      await atribuirMecanicoAoTicket(ticketId, novo);
      toast({ title: 'Mecânico responsável atualizado.' });
      onChanged();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleQuickAdd = async () => {
    if (!novoNome.trim()) {
      toast({ title: 'Indique o nome do mecânico', variant: 'destructive' });
      return;
    }
    setAdding(true);
    try {
      const novoId = await criarMecanico(novoNome.trim(), novoTel.trim());
      await queryClient.invalidateQueries({ queryKey: ['mecanicos', 'ativos'] });
      setAddOpen(false);
      setNovoNome('');
      setNovoTel('');
      await gravarTicket(novoId); // já atribui o novo mecânico ao ticket
    } catch (e: any) {
      toast({ title: 'Erro ao criar mecânico', description: e.message, variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground font-bold flex items-center gap-1 mb-1">
        <Wrench className="h-3 w-3" /> Mecânico responsável
      </Label>
      <Select
        value={mecanicoId ?? NONE}
        onValueChange={(v) => gravarTicket(v === NONE ? null : v)}
        disabled={saving || isLoading}
      >
        <SelectTrigger>
          <SelectValue placeholder="Escolher mecânico" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Ninguém</SelectItem>
          {mecanicos.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {podeGerir && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 h-7 px-2 text-xs text-muted-foreground"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-3 w-3 mr-1" /> Novo mecânico
        </Button>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo mecânico</DialogTitle>
            <DialogDescription>
              Registe um mecânico (não precisa de conta). Fica logo atribuído a este ticket.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="qa-nome">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="qa-nome"
                placeholder="Ex: João Silva"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-tel">Telefone (opcional)</Label>
              <Input
                id="qa-tel"
                placeholder="Ex: 912 345 678"
                value={novoTel}
                onChange={(e) => setNovoTel(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancelar
            </Button>
            <Button onClick={handleQuickAdd} disabled={adding}>
              {adding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar e atribuir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
