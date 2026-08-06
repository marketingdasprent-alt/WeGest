import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import {
  type BoltAuthMode,
  decidirFormularioBolt,
  type EstadoCredenciaisBolt,
  type EstadoTesteBolt,
  etiquetaEmpresaBolt,
  normalizarEmpresasBolt,
} from './boltIntegracao';
import type { BoltCompanyOption } from './types';

/**
 * Credenciais da API oficial Bolt Fleet — o mesmo bloco no wizard de criação e
 * na edição de uma integração existente.
 *
 * Regras que este componente garante (e que estavam espalhadas pelo wizard):
 *   · não se gravam credenciais sem um teste de ligação com sucesso;
 *   · a empresa escolhe-se da lista devolvida pelo getCompanies, nunca a
 *     escrever um ID à mão — um ID que a conta não tenha só dá erro no
 *     primeiro sync;
 *   · qualquer alteração às credenciais invalida o teste anterior E a lista de
 *     empresas que veio com ele, senão gravava-se um company_id de outra conta;
 *   · o Client Secret nunca é reapresentado depois de gravado. Em edição o
 *     campo nasce vazio: para trocar credenciais cola-se o par outra vez.
 */

interface BoltApiCredenciaisProps {
  contexto: 'criar' | 'editar';
  /** auth_mode gravado na BD. Em 'criar' é sempre 'password' (não há linha ainda). */
  modoGravado: BoltAuthMode;
  /** Já existe um Client Secret gravado (mostra-se que existe, nunca o valor). */
  segredoGravado?: boolean;
  companyIdGravado?: number | null;
  companyNameGravado?: string | null;
  onEstado: (estado: EstadoCredenciaisBolt) => void;
}

export const BoltApiCredenciais: React.FC<BoltApiCredenciaisProps> = ({
  contexto,
  modoGravado,
  segredoGravado = false,
  companyIdGravado = null,
  companyNameGravado = null,
  onEstado,
}) => {
  const { toast } = useToast();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [mostrarSegredo, setMostrarSegredo] = useState(false);
  const [estadoTeste, setEstadoTeste] = useState<EstadoTesteBolt>('idle');
  const [erroTeste, setErroTeste] = useState('');
  // Diagnóstico devolvido pela função em caso de sucesso (empresa, nº de
  // viagens no período de sondagem) — vale a pena mostrar tal e qual.
  const [mensagemTeste, setMensagemTeste] = useState('');
  const [empresas, setEmpresas] = useState<BoltCompanyOption[]>([]);

  const decisao = decidirFormularioBolt({
    contexto,
    modoGravado,
    clientId,
    clientSecret,
    companyId,
    estadoTeste,
    empresas,
  });

  const empresaEscolhida = empresas.find((e) => String(e.company_id) === companyId) ?? null;

  // Reportar o estado ao pai sem o meter nas dependências: o pai guarda-o em
  // useState e voltaria a criar o callback a cada render (ciclo infinito).
  const onEstadoRef = useRef(onEstado);
  onEstadoRef.current = onEstado;
  useEffect(() => {
    onEstadoRef.current({
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      companyId,
      companyName: empresaEscolhida?.company_name ?? null,
      preenchido: decisao.preenchido,
      completo: decisao.completo,
      motivo: decisao.motivo,
    });
  }, [
    clientId,
    clientSecret,
    companyId,
    empresaEscolhida?.company_name,
    decisao.preenchido,
    decisao.completo,
    decisao.motivo,
  ]);

  const alterarCredencial = (campo: 'clientId' | 'clientSecret', valor: string) => {
    if (campo === 'clientId') setClientId(valor);
    else setClientSecret(valor);
    setCompanyId('');
    setEstadoTeste('idle');
    setErroTeste('');
    setMensagemTeste('');
    setEmpresas([]);
  };

  /**
   * Segundo passo do teste: confirmar a empresa escolhida.
   *
   * Estar na lista do getCompanies não garante permissão para ler as viagens
   * (COMPANY_NOT_ACTIVE / COMPANY_NOT_ALLOWED só aparecem ao pedir mesmo os
   * dados), e o getCompanies devolve apenas IDs — o nome da empresa vem da
   * sondagem ao getFleetOrders que a edge function faz quando lhe passamos o
   * company_id. É daqui que sai o company_name que se grava.
   */
  const confirmarEmpresa = async (idEmpresa: string) => {
    setEstadoTeste('testing');
    setErroTeste('');
    setMensagemTeste('');
    try {
      const { data, error } = await supabase.functions.invoke('bolt-test-connection', {
        body: {
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
          company_id: idEmpresa,
        },
      });
      if (error || !data?.success) {
        setEstadoTeste('error');
        setErroTeste(data?.error || error?.message || 'Não foi possível validar a empresa na Bolt');
        return;
      }

      const nome = data.company?.company_name;
      if (typeof nome === 'string' && nome.trim()) {
        setEmpresas((prev) =>
          prev.map((empresa) =>
            String(empresa.company_id) === idEmpresa
              ? { ...empresa, company_name: nome.trim() }
              : empresa
          )
        );
      }
      setEstadoTeste('success');
      setMensagemTeste(typeof data.message === 'string' ? data.message : '');
    } catch (err: unknown) {
      setEstadoTeste('error');
      setErroTeste(
        err instanceof Error ? err.message : 'Não foi possível validar a empresa na Bolt'
      );
    }
  };

  const escolherEmpresa = (valor: string) => {
    setCompanyId(valor);
    void confirmarEmpresa(valor);
  };

  const testarLigacao = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast({ title: 'Preencha o Client ID e o Client Secret', variant: 'destructive' });
      return;
    }
    setEstadoTeste('testing');
    setErroTeste('');
    setMensagemTeste('');
    setEmpresas([]);
    setCompanyId('');
    try {
      // bolt-test-connection recebe as credenciais no corpo do pedido (não lê a
      // BD), portanto valida-se ANTES de gravar seja o que for. Sem company_id,
      // a função pede o token OAuth e chama o getCompanies — é de lá que sai a
      // lista de empresas a que estas credenciais dão acesso.
      const { data, error } = await supabase.functions.invoke('bolt-test-connection', {
        body: { client_id: clientId.trim(), client_secret: clientSecret.trim() },
      });
      if (error || !data?.success) {
        setEstadoTeste('error');
        setErroTeste(data?.error || error?.message || 'Não foi possível ligar à Bolt');
        return;
      }

      const lista = normalizarEmpresasBolt(data);
      if (lista.length === 0) {
        // A função já devolve success=false com o código SEM_EMPRESAS neste
        // caso; esta rede de segurança é para a lista vir vazia por outra via.
        setEstadoTeste('error');
        setErroTeste(
          'As credenciais são válidas mas a Bolt não devolveu nenhuma empresa associada. Peça à Bolt para associar as frotas a estas credenciais.'
        );
        return;
      }

      setEmpresas(lista);
      setEstadoTeste('success');
      setMensagemTeste(typeof data.message === 'string' ? data.message : '');
      toast({
        title: 'Ligação confirmada',
        description:
          lista.length === 1
            ? 'Credenciais válidas — uma empresa disponível.'
            : `Credenciais válidas — ${lista.length} empresas disponíveis. Escolha a desta integração.`,
      });

      // Uma só empresa (o caso normal): escolhe-se sozinha e confirma-se já.
      if (lista.length === 1) {
        const unica = String(lista[0].company_id);
        setCompanyId(unica);
        await confirmarEmpresa(unica);
      }
    } catch (err: unknown) {
      setEstadoTeste('error');
      setErroTeste(err instanceof Error ? err.message : 'Não foi possível ligar à Bolt');
    }
  };

  return (
    <div className="space-y-4">
      {decisao.mostrarAvisoConversao && (
        <div
          className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"
          data-testid="bolt-aviso-conversao"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Esta conta ainda usa o robô — vai ser convertida para a API
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              A integração é a <strong>mesma</strong>: o histórico de resumos semanais já importado
              continua ligado a ela.
            </li>
            <li>
              O <strong>robô deixa de correr</strong> nesta conta — as credenciais da API ocupam o
              lugar do login do portal, e o agendamento semanal é desligado.
            </li>
            <li>
              A <strong>importação manual do CSV mantém-se</strong>: continua a corrigir campanhas e
              reembolsos, que a API não tem.
            </li>
          </ul>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Credenciais da <strong>API oficial Bolt Fleet</strong>, geradas em{' '}
        <em>fleets.bolt.eu › Definições › API</em> (botão "Generate credentials"). Se essa secção
        não existir, peça à Bolt para activar o Fleet Integration API.
      </p>

      <div className="space-y-2">
        <Label htmlFor="bolt-client-id">
          Client ID <span className="text-destructive">*</span>
        </Label>
        <Input
          id="bolt-client-id"
          autoComplete="off"
          placeholder="Client ID gerado no portal Bolt"
          value={clientId}
          onChange={(e) => alterarCredencial('clientId', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bolt-client-secret">
          Client Secret <span className="text-destructive">*</span>
        </Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="bolt-client-secret"
              type={mostrarSegredo ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={segredoGravado ? 'Gravado — cole de novo para substituir' : '••••••••'}
              value={clientSecret}
              onChange={(e) => alterarCredencial('clientSecret', e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
              onClick={() => setMostrarSegredo(!mostrarSegredo)}
              aria-label={mostrarSegredo ? 'Ocultar Client Secret' : 'Mostrar Client Secret'}
            >
              {mostrarSegredo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={testarLigacao}
            disabled={!decisao.podeTestar}
          >
            {estadoTeste === 'testing' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />A testar...
              </>
            ) : (
              'Testar ligação'
            )}
          </Button>
        </div>

        {/* Estados: por testar / a testar / válido / inválido. */}
        {estadoTeste === 'idle' && (
          <p className="text-xs text-muted-foreground">
            Por testar — a lista de empresas só aparece depois de a ligação ser confirmada.
          </p>
        )}
        {estadoTeste === 'testing' && (
          <p className="text-xs text-muted-foreground">A contactar a Bolt...</p>
        )}
        {estadoTeste === 'success' && (
          <p className="flex items-center gap-1 text-xs text-emerald-600">
            <Check className="h-3 w-3" />
            {mensagemTeste || 'Ligação confirmada'}
          </p>
        )}
        {estadoTeste === 'error' && <p className="text-xs text-destructive">{erroTeste}</p>}
      </div>

      {/* A empresa escolhe-se da lista devolvida pelo getCompanies. Fica visível
          mesmo enquanto a empresa escolhida está a ser validada, ou se essa
          validação falhar, para se poder escolher outra. */}
      {decisao.mostrarEmpresas && (
        <div className="space-y-2">
          <Label htmlFor="bolt-company">
            Empresa <span className="text-destructive">*</span>
          </Label>
          <Select
            value={companyId}
            onValueChange={escolherEmpresa}
            disabled={estadoTeste === 'testing'}
          >
            <SelectTrigger id="bolt-company">
              <SelectValue placeholder="Escolha a empresa desta integração" />
            </SelectTrigger>
            <SelectContent>
              {empresas.map((empresa) => (
                <SelectItem key={empresa.company_id} value={String(empresa.company_id)}>
                  {etiquetaEmpresaBolt(empresa)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {empresas.length === 1
              ? 'Estas credenciais só dão acesso a uma empresa.'
              : `${empresas.length} empresas acessíveis com estas credenciais. O nome aparece depois de a empresa ser escolhida (o getCompanies só devolve IDs).`}
          </p>
          {empresaEscolhida && estadoTeste === 'success' && (
            <p className="text-xs text-emerald-600" data-testid="bolt-empresa-escolhida">
              Vai gravar: {etiquetaEmpresaBolt(empresaEscolhida)}
            </p>
          )}
        </div>
      )}

      {/* Em edição, o que já lá está gravado — o segredo nunca reaparece. */}
      {contexto === 'editar' && modoGravado === 'oauth' && !decisao.preenchido && (
        <p className="text-xs text-muted-foreground" data-testid="bolt-credenciais-gravadas">
          Credenciais da API gravadas
          {companyIdGravado
            ? ` · empresa ${companyNameGravado ? `${companyNameGravado} (${companyIdGravado})` : `#${companyIdGravado}`}`
            : ''}
          . O Client Secret não é mostrado; para o substituir, cole o par novo e teste a ligação.
        </p>
      )}
    </div>
  );
};
