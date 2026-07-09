import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useOrgId } from '@/contexts/TenantContext';
import { Motorista } from '@/pages/Motoristas';
import { ViaturaDialog } from '@/components/viaturas/ViaturaDialog';
import { Loader2, X } from 'lucide-react';
import {
  formSchemaValidado,
  buildMotoristaPayload,
  normalizeNif,
  type FormValues,
} from './motoristaDialog.schema';
import { useGestoresTvde } from './useGestoresTvde';
import { useMotoristaCartoesFrota } from './useMotoristaCartoesFrota';
import { MotoristaFormDadosPessoais } from './MotoristaFormDadosPessoais';
import { MotoristaFormCartoesIntegracoes } from './MotoristaFormCartoesIntegracoes';
import { MotoristaFormDocumentos } from './MotoristaFormDocumentos';
import { MotoristaFormObservacoesSlot } from './MotoristaFormObservacoesSlot';

interface MotoristaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  motorista: Motorista | null;
  onMotoristaCreated?: (motorista: Motorista) => void;
  /** Pré-preenche campos quando se cria uma ficha nova (modo criação). */
  prefill?: { nome?: string; bolt_id?: string; uber_uuid?: string };
}

export function MotoristaDialog({
  open,
  onOpenChange,
  motorista,
  onMotoristaCreated,
  prefill,
}: MotoristaDialogProps) {
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Lock SÍNCRONO contra duplo-submit. O state isSubmitting só desativa o
  // botão no próximo render; a verificação de duplicado por NIF é TOCTOU
  // (dois cliques rápidos fazem ambos o SELECT antes de qualquer INSERT).
  // O ref bloqueia o 2º submit já, sem depender de re-render nem do NIF.
  const submittingRef = useRef(false);
  // Encadeamento slot: após criar um motorista slot, abre o ViaturaDialog
  // para criar o carro próprio (obrigatório). pendingSlotMotorista guarda o
  // motorista recém-criado; cancelCountRef permite escape no 2º cancelamento.
  const [pendingSlotMotorista, setPendingSlotMotorista] = useState<Motorista | null>(null);
  const cancelCountRef = useRef(0);
  const orgId = useOrgId();
  const gestores = useGestoresTvde(orgId);
  const [gestorPopoverOpen, setGestorPopoverOpen] = useState(false);
  const { toast } = useToast();
  const { cartoesFrota, selectedCartao, setSelectedCartao, syncCartoes } = useMotoristaCartoesFrota(
    open,
    motorista?.id
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchemaValidado),
    defaultValues: {
      nome: '',
      nif: '',
      telefone: '',
      email: '',
      documento_tipo: '',
      documento_numero: '',
      documento_validade: '',
      carta_conducao: '',
      carta_categorias: [],
      carta_validade: '',
      licenca_tvde_numero: '',
      licenca_tvde_validade: '',
      morada: '',
      codigo_postal: '',
      data_contratacao: '',
      cidade: '',
      status_ativo: true,
      is_slot: false,
      observacoes: '',
      iban: '',
      gestor_responsavel: '',
      bolt_id: '',
      uber_uuid: '',
      documento_ficheiro_url: '',
      documento_identificacao_verso_url: '',
      carta_ficheiro_url: '',
      carta_conducao_verso_url: '',
      licenca_tvde_ficheiro_url: '',
      registo_criminal_url: '',
      comprovativo_morada_url: '',
      comprovativo_iban_url: '',
    },
  });

  useEffect(() => {
    if (motorista) {
      form.reset({
        nome: motorista.nome,
        nif: motorista.nif || '',
        telefone: motorista.telefone || '',
        email: motorista.email || '',
        documento_tipo: motorista.documento_tipo || '',
        documento_numero: motorista.documento_numero || '',
        documento_validade: motorista.documento_validade || '',
        carta_conducao: motorista.carta_conducao || '',
        carta_categorias: motorista.carta_categorias || [],
        carta_validade: motorista.carta_validade || '',
        licenca_tvde_numero: motorista.licenca_tvde_numero || '',
        licenca_tvde_validade: motorista.licenca_tvde_validade || '',
        morada: motorista.morada || '',
        codigo_postal: motorista.codigo_postal || '',
        data_contratacao: motorista.data_contratacao || '',
        cidade: motorista.cidade || '',
        status_ativo: motorista.status_ativo ?? true,
        is_slot: (motorista as { is_slot?: boolean | null }).is_slot ?? false,
        observacoes: motorista.observacoes || '',
        iban: motorista.iban || '',
        gestor_responsavel: motorista.gestor_responsavel || '',
        bolt_id: motorista.bolt_id || '',
        uber_uuid: motorista.uber_uuid || '',
        documento_ficheiro_url: motorista.documento_ficheiro_url || '',
        documento_identificacao_verso_url: motorista.documento_identificacao_verso_url || '',
        carta_ficheiro_url: motorista.carta_ficheiro_url || '',
        carta_conducao_verso_url: motorista.carta_conducao_verso_url || '',
        licenca_tvde_ficheiro_url: motorista.licenca_tvde_ficheiro_url || '',
        registo_criminal_url: motorista.registo_criminal_url || '',
        comprovativo_morada_url: motorista.comprovativo_morada_url || '',
        comprovativo_iban_url: motorista.comprovativo_iban_url || '',
      });
    } else {
      form.reset({
        nome: prefill?.nome || '',
        nif: '',
        telefone: '',
        email: '',
        documento_tipo: '',
        documento_numero: '',
        documento_validade: '',
        carta_conducao: '',
        carta_categorias: [],
        carta_validade: '',
        licenca_tvde_numero: '',
        licenca_tvde_validade: '',
        morada: '',
        codigo_postal: '',
        data_contratacao: '',
        cidade: '',
        status_ativo: true,
        is_slot: false,
        observacoes: '',
        iban: '',
        gestor_responsavel: '',
        bolt_id: prefill?.bolt_id || '',
        uber_uuid: prefill?.uber_uuid || '',
        documento_ficheiro_url: '',
        documento_identificacao_verso_url: '',
        carta_ficheiro_url: '',
        carta_conducao_verso_url: '',
        licenca_tvde_ficheiro_url: '',
        registo_criminal_url: '',
        comprovativo_morada_url: '',
        comprovativo_iban_url: '',
      });
    }
  }, [motorista, prefill, form]);

  const onSubmit = async (values: FormValues) => {
    // Prevenir duplo clique (lock síncrono — ver submittingRef acima)
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      setLoading(true);

      const nifNormalizado = normalizeNif(values.nif);

      // Verificar duplicado por NIF antes de criar (apenas para novos motoristas)
      if (!motorista && nifNormalizado) {
        const { data: existing } = await supabase
          .from('motoristas_ativos')
          .select('id, nome, codigo')
          .eq('nif', nifNormalizado)
          .maybeSingle();

        if (existing) {
          toast({
            title: 'Motorista já existe',
            description: `Já existe um motorista com este NIF: ${existing.nome} (Cód. ${existing.codigo})`,
            variant: 'destructive',
          });
          return;
        }
      }

      const dataToSave = buildMotoristaPayload(values);

      if (motorista) {
        // Update
        const { error } = await supabase
          .from('motoristas_ativos')
          .update(dataToSave)
          .eq('id', motorista.id);

        if (error) throw error;

        // Sync cartões frota
        await syncCartoes(motorista.id);

        toast({
          title: 'Motorista atualizado',
          description: 'Os dados do motorista foram atualizados com sucesso.',
        });

        onOpenChange(false);
      } else {
        // Insert - retornar os dados do novo motorista
        const { data: newMotorista, error } = await supabase
          .from('motoristas_ativos')
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;

        // Sync cartões frota
        if (newMotorista) await syncCartoes(newMotorista.id);

        toast({
          title: 'Motorista criado',
          description: 'O motorista foi criado com sucesso.',
        });

        // Slot: NÃO fecha já — abre o ViaturaDialog para criar o carro próprio
        // (obrigatório). Só fecha e notifica quando o carro for criado (ou no
        // escape do 2º cancelamento).
        if (newMotorista && values.is_slot) {
          cancelCountRef.current = 0;
          setPendingSlotMotorista(newMotorista as Motorista);
        } else {
          onOpenChange(false);
          if (newMotorista) {
            onMotoristaCreated?.(newMotorista as Motorista);
          }
        }
      }
    } catch (error: any) {
      console.error('Erro ao salvar motorista:', error);
      toast({
        title: 'Erro ao salvar motorista',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      submittingRef.current = false;
      setLoading(false);
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={() => onOpenChange(false)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden [&>button:last-child]:hidden">
          <DialogHeader className="px-6 py-4 border-b bg-card flex flex-row items-center justify-between shrink-0">
            <div className="space-y-0.5">
              <DialogTitle className="text-2xl font-bold">
                {motorista ? 'Editar Motorista' : 'Adicionar Motorista'}
              </DialogTitle>
              <DialogDescription>
                {motorista
                  ? 'Atualize as informações do motorista'
                  : 'Preencha os dados do novo motorista'}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="rounded-full"
            >
              <X className="h-5 w-5" />
            </Button>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-8">
                <section className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <div className="h-8 w-1 bg-primary rounded-full" />
                    <h3 className="text-lg font-semibold">Dados Pessoais</h3>
                  </div>
                  <MotoristaFormDadosPessoais
                    form={form}
                    gestores={gestores}
                    gestorPopoverOpen={gestorPopoverOpen}
                    setGestorPopoverOpen={setGestorPopoverOpen}
                  />
                  <MotoristaFormCartoesIntegracoes
                    form={form}
                    cartoesFrota={cartoesFrota}
                    selectedCartao={selectedCartao}
                    setSelectedCartao={setSelectedCartao}
                  />
                </section>

                <MotoristaFormDocumentos form={form} motoristaId={motorista?.id} />

                <MotoristaFormObservacoesSlot form={form} />
              </form>
            </Form>
          </div>

          <div className="px-6 py-4 border-t bg-card flex items-center justify-end gap-3 shrink-0">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="h-11 px-8"
            >
              Cancelar
            </Button>
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={loading || isSubmitting}
              className="h-11 px-10 font-bold"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gravando...
                </>
              ) : motorista ? (
                'Guardar Alterações'
              ) : (
                'Criar Motorista'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {pendingSlotMotorista && (
        <ViaturaDialog
          open={true}
          viatura={null}
          slotMotoristaId={pendingSlotMotorista.id}
          onOpenChange={(o) => {
            if (o) return;
            // Cancelamento sem criar carro: obrigatório → 1º avisa e reabre,
            // 2º permite sair com motorista incompleto.
            cancelCountRef.current += 1;
            if (cancelCountRef.current >= 2) {
              toast({
                title: 'Motorista sem carro',
                description:
                  'O motorista de slot ficou sem carro associado. Adiciona o carro mais tarde.',
                variant: 'destructive',
              });
              const m = pendingSlotMotorista;
              setPendingSlotMotorista(null);
              onOpenChange(false);
              onMotoristaCreated?.(m);
            } else {
              toast({
                title: 'Carro obrigatório',
                description: 'Um motorista de slot precisa de um carro próprio associado.',
                variant: 'destructive',
              });
              // Mantém pendingSlotMotorista → ViaturaDialog reabre (open={true}).
            }
          }}
          onSuccess={() => {
            /* fecho tratado em onCreated */
          }}
          onCreated={() => {
            const m = pendingSlotMotorista;
            setPendingSlotMotorista(null);
            onOpenChange(false);
            if (m) onMotoristaCreated?.(m);
          }}
        />
      )}
    </>
  );
}
