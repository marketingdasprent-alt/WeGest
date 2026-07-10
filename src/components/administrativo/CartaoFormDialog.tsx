import { Loader2, Fuel, UserCheck, History, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  TIPO_INFO,
  STATUS_INFO,
  STATUS_ORDER,
  todayISO,
  type CartaoFrota,
  type FormState,
  type StatusCartao,
  type Movimento,
  type MotoristaOption,
} from './cartoesFlotaTab.types';

interface CartaoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CartaoFrota | null;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  showPin: boolean;
  setShowPin: React.Dispatch<React.SetStateAction<boolean>>;
  motoristas: MotoristaOption[];
  motoristaNome: (id: string | null) => string;
  saving: boolean;
  onSave: () => void;
}

export function CartaoFormDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  showPin,
  setShowPin,
  motoristas,
  motoristaNome,
  saving,
  onSave,
}: CartaoFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[96vw] h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b bg-muted/30 shrink-0">
          <DialogTitle className="flex flex-wrap items-center gap-3 text-lg">
            {editing ? 'Editar Cartão Frota' : 'Novo Cartão Frota'}
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_INFO[form.tipo].badgeCls}`}
            >
              {TIPO_INFO[form.tipo].label}
            </span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_INFO[form.status].cls}`}
            >
              {STATUS_INFO[form.status].label}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Body (scroll) */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
          {/* ── Dados do Cartão ── */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Fuel className="h-4 w-4 text-muted-foreground" /> Dados do Cartão
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as typeof f.tipo }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bp">BP</SelectItem>
                    <SelectItem value="repsol">Repsol</SelectItem>
                    <SelectItem value="edp">EDP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cartão (Nº) *</Label>
                <Input
                  placeholder="Ex: 1234567890"
                  value={form.numero}
                  onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Detentor do Cartão</Label>
                <Input
                  placeholder="Ex: DISTÂNCIA 01"
                  value={form.detentor}
                  onChange={(e) => setForm((f) => ({ ...f, detentor: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Plafond (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={form.limite}
                  onChange={(e) => setForm((f) => ({ ...f, limite: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Validade</Label>
                <Input
                  type="date"
                  value={form.data_validade}
                  onChange={(e) => setForm((f) => ({ ...f, data_validade: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Âmbito do Cartão</Label>
                <Input
                  placeholder="Ex: Combustível, Elétrico…"
                  value={form.ambito}
                  onChange={(e) => setForm((f) => ({ ...f, ambito: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>PIN do Cartão</Label>
                <div className="relative">
                  <Input
                    type={showPin ? 'text' : 'password'}
                    placeholder="PIN"
                    value={form.pin}
                    onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                    onClick={() => setShowPin((s) => !s)}
                  >
                    {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* ── Atribuição & Movimento ── */}
          <section className="space-y-4 border-t pt-6">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-muted-foreground" /> Atribuição & Movimento
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as StatusCartao }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_INFO[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Movimento</Label>
                <Select
                  value={form.movimento}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      movimento: v as Movimento,
                      data_entrega: v === 'entrega' && !f.data_entrega ? todayISO() : f.data_entrega,
                      data_devolucao:
                        v === 'devolucao' && !f.data_devolucao ? todayISO() : f.data_devolucao,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Sem alteração</SelectItem>
                    <SelectItem value="entrega">Entrega (atribuir a motorista)</SelectItem>
                    <SelectItem value="devolucao">Devolução (libertar cartão)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Último motorista</Label>
                <Input
                  readOnly
                  value={
                    motoristaNome(form.ultimo_motorista_id) ||
                    editing?.ultimo_motorista?.nome ||
                    '—'
                  }
                  className="bg-muted/50 text-muted-foreground"
                />
              </div>
            </div>

            {/* Campos condicionais por movimento */}
            {form.movimento === 'entrega' && (
              <div className="grid gap-4 sm:grid-cols-2 rounded-lg border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-900/10">
                <div className="space-y-1.5">
                  <Label>Motorista *</Label>
                  <Select
                    value={form.motorista_id || '__none__'}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, motorista_id: v === '__none__' ? '' : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar motorista" />
                    </SelectTrigger>
                    <SelectContent>
                      {motoristas.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Data de entrega</Label>
                  <Input
                    type="date"
                    value={form.data_entrega}
                    onChange={(e) => setForm((f) => ({ ...f, data_entrega: e.target.value }))}
                  />
                </div>
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  Ao guardar: status → <strong>Em Uso</strong>
                  {editing?.motorista_id ? '; o motorista atual passa a Último.' : '.'}
                </p>
              </div>
            )}

            {form.movimento === 'devolucao' && (
              <div className="grid gap-4 sm:grid-cols-2 rounded-lg border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-900/10">
                <div className="space-y-1.5">
                  <Label>Motorista atual</Label>
                  <Input
                    readOnly
                    value={motoristaNome(form.motorista_id) || editing?.motorista?.nome || '—'}
                    className="bg-muted/50 text-muted-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Data de devolução</Label>
                  <Input
                    type="date"
                    value={form.data_devolucao}
                    onChange={(e) => setForm((f) => ({ ...f, data_devolucao: e.target.value }))}
                  />
                </div>
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  Ao guardar: status → <strong>Disponível</strong>, o motorista passa a{' '}
                  <strong>Último</strong> e o cartão fica livre.
                </p>
              </div>
            )}

            {form.movimento === 'nenhum' && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Motorista atual</Label>
                  <Select
                    value={form.motorista_id || '__none__'}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, motorista_id: v === '__none__' ? '' : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sem motorista" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Sem motorista —</SelectItem>
                      {motoristas.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Data de entrega</Label>
                  <Input
                    type="date"
                    value={form.data_entrega}
                    onChange={(e) => setForm((f) => ({ ...f, data_entrega: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Data de devolução</Label>
                  <Input
                    type="date"
                    value={form.data_devolucao}
                    onChange={(e) => setForm((f) => ({ ...f, data_devolucao: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </section>

          {/* ── Observações ── */}
          <section className="space-y-4 border-t pt-6">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" /> Observações
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Observações gerais</Label>
                <Textarea
                  placeholder="Notas gerais sobre o cartão…"
                  value={form.notas}
                  onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nota de devolução</Label>
                <Textarea
                  placeholder="Estado do cartão na devolução, motivo…"
                  value={form.devolucao}
                  onChange={(e) => setForm((f) => ({ ...f, devolucao: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t bg-muted/30 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editing ? 'Guardar' : 'Criar Cartão'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
