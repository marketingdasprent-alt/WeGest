import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Search, Car, ChevronRight, Loader2, Wrench } from 'lucide-react';
import { cn, matchesSearch } from '@/lib/utils';

interface Viatura {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  status: string;
}

interface Categoria {
  id: string;
  nome: string;
  cor: string;
}

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

const PRIORIDADES = [
  {
    value: 'baixa',
    label: 'Baixa',
    color: 'border-gray-400 bg-gray-400/10 text-gray-600 dark:text-gray-400',
  },
  {
    value: 'media',
    label: 'Média',
    color: 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  },
  {
    value: 'alta',
    label: 'Alta',
    color: 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  },
  {
    value: 'urgente',
    label: 'Urgente',
    color: 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400',
  },
];

export const NovoTicketPage: React.FC<Props> = ({ onClose, onSuccess }) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [viaturas, setViaturas] = useState<Viatura[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedViatura, setSelectedViatura] = useState<Viatura | null>(null);

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState('media');
  const [categoriaId, setCategoriaId] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [vRes, cRes] = await Promise.all([
        supabase
          .from('viaturas')
          .select('id, matricula, marca, modelo, status')
          .neq('status', 'vendida')
          .order('matricula'),
        supabase
          .from('assistencia_categorias')
          .select('id, nome, cor')
          .eq('ativo', true)
          .order('ordem'),
      ]);
      setViaturas(vRes.data || []);
      setCategorias(cRes.data || []);
      setLoading(false);
    };
    load();
  }, []);

  const filteredViaturas = viaturas.filter(
    (v) =>
      matchesSearch(v.matricula, searchTerm) ||
      matchesSearch(v.marca, searchTerm) ||
      matchesSearch(v.modelo, searchTerm)
  );

  const handleSubmit = async () => {
    if (!selectedViatura || !titulo.trim()) return;
    try {
      setSubmitting(true);

      // Fetch motorista associado à viatura (se existir)
      const { data: assoc } = await supabase
        .from('motorista_viaturas')
        .select('motorista_id')
        .eq('viatura_id', selectedViatura.id)
        .eq('status', 'ativo')
        .is('data_fim', null)
        .maybeSingle();

      await supabase.from('assistencia_tickets').insert({
        viatura_id: selectedViatura.id,
        motorista_id: assoc?.motorista_id || null,
        categoria_id: categoriaId || null,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        prioridade,
        status: 'pendente',
        criado_por: user?.id,
      });

      toast({
        title: 'Ticket criado',
        description: 'O gestor de assistência irá tratar do seu pedido.',
      });
      onSuccess();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!selectedViatura && !!titulo.trim();

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 bg-card shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={step === 1 ? onClose : () => setStep(1)}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold leading-tight">Novo Ticket de Assistência</h1>
          <p className="text-xs text-muted-foreground truncate">
            {step === 1
              ? 'Passo 1 — Selecione a viatura'
              : `Passo 2 — ${selectedViatura?.matricula} · ${selectedViatura?.marca} ${selectedViatura?.modelo}`}
          </p>
        </div>
        {step === 2 && (
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="shrink-0">
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />A enviar...
              </>
            ) : (
              'Enviar Pedido'
            )}
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : step === 1 ? (
          /* ── Step 1: Vehicle picker ── */
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por matrícula ou modelo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>

            {filteredViaturas.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Car className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>Nenhuma viatura encontrada.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredViaturas.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setSelectedViatura(v);
                      setStep(2);
                    }}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-muted/50 hover:border-primary/40 transition-all text-left"
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Car className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono font-bold">{v.matricula}</p>
                      <p className="text-sm text-muted-foreground">
                        {v.marca} {v.modelo}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'text-xs px-2 py-1 rounded-full capitalize shrink-0',
                        v.status === 'disponivel'
                          ? 'bg-green-100 text-green-700'
                          : v.status === 'manutencao'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'
                      )}
                    >
                      {v.status === 'em_uso' ? 'em uso' : v.status}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── Step 2: Ticket details ── */
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
            {/* Prioridade */}
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRIORIDADES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPrioridade(p.value)}
                    className={cn(
                      'rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all',
                      prioridade === p.value
                        ? p.color + ' font-semibold'
                        : 'border-border hover:border-primary/40 text-foreground'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Detalhes */}
            <div className="space-y-4 rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" />
                Detalhes do Pedido
              </h2>

              <div className="space-y-1.5">
                <Label htmlFor="titulo">
                  Título <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="titulo"
                  placeholder="Ex: Barulho no motor, revisão anual..."
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="categoria">Categoria</Label>
                <Select value={categoriaId} onValueChange={setCategoriaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar categoria (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: c.cor }}
                          />
                          {c.nome}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  placeholder="Descreva o problema com mais detalhe..."
                  rows={4}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
