import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserCog } from 'lucide-react';
import { useAssistentesDisponiveis } from '@/hooks/useAssistentesDisponiveis';

const NONE = '__none__';

// ── Seletor controlado (reutilizável) ─────────────────────────────────────────
// Lista os membros dos grupos marcados "Disponível para assistência",
// agrupados por grupo. Usado tanto na criação do ticket (estado local) como
// no detalhe (grava logo). value/onChange usam null = "Ninguém".

interface SelectProps {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  /** Só corre a query quando o campo é visível/relevante. */
  enabled?: boolean;
}

export const AssistenteResponsavelSelect: React.FC<SelectProps> = ({
  value,
  onChange,
  disabled,
  enabled = true,
}) => {
  const { data: grupos = [], isLoading } = useAssistentesDisponiveis(enabled);

  if (!isLoading && grupos.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhum grupo disponível. Ative "Disponível para assistência" num grupo em Permissões →
        Assistência.
      </p>
    );
  }

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger>
        <SelectValue placeholder="Escolher mecânico" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Ninguém</SelectItem>
        {grupos.map((g) => (
          <SelectGroup key={g.cargoId}>
            <SelectLabel>{g.cargoNome}</SelectLabel>
            {g.membros.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.nome}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
};

// ── Campo da ficha do ticket (grava logo em atribuido_a) ──────────────────────

interface FieldProps {
  ticketId: string;
  atribuidoA: string | null;
  onChanged: () => void;
}

/**
 * Campo "Assistente responsável" na ficha do ticket. Grava a escolha em
 * `assistencia_tickets.atribuido_a` imediatamente. Só é mostrado a quem pode
 * gerir a assistência (ver TicketSidebar/TicketDetails).
 */
export const AssistenteResponsavelField: React.FC<FieldProps> = ({
  ticketId,
  atribuidoA,
  onChanged,
}) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const handleChange = async (novo: string | null) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('assistencia_tickets')
        .update({ atribuido_a: novo })
        .eq('id', ticketId);
      if (error) throw error;
      toast({ title: 'Mecânico responsável atualizado.' });
      onChanged();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground font-bold flex items-center gap-1 mb-1">
        <UserCog className="h-3 w-3" /> Mecânico responsável
      </Label>
      <AssistenteResponsavelSelect value={atribuidoA} onChange={handleChange} disabled={saving} />
    </div>
  );
};
