import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Loader2 } from 'lucide-react';

/**
 * Formulário público de pedidos de informática. Quem preenche pode não ter
 * conta nenhuma: a autorização é o token do link, validado dentro da edge
 * function `ti-ticket-submeter`. As tabelas nunca são tocadas daqui.
 */
export function TiTicketFormulario({ token }: { token: string }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);
  const [numero, setNumero] = useState<number | null>(null);

  const submeter = async () => {
    if (!nome.trim()) return setErro('Indique o seu nome.');
    if (!email.includes('@')) return setErro('Indique um email válido.');
    if (!descricao.trim()) return setErro('Descreva o problema.');

    setErro(null);
    setAEnviar(true);
    const { data, error } = await supabase.functions.invoke('ti-ticket-submeter', {
      body: { token, nome, email, descricao },
    });
    setAEnviar(false);

    if (error || !data?.success) {
      // A mensagem do servidor é a que interessa (link inválido, limite
      // excedido) — não a substituir por uma genérica.
      setErro(data?.error ?? 'Não foi possível registar o pedido.');
      return;
    }
    setNumero(data.numero);
  };

  if (numero !== null) {
    return (
      <Card className="space-y-2 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
        <p className="font-semibold">Pedido #{numero} registado</p>
        <p className="text-sm text-muted-foreground">
          Quando houver uma sugestão de resolução, recebe-a <strong>por email</strong> com um link
          para dizer se ajudou.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="space-y-2">
        <Label htmlFor="ti-nome">Nome</Label>
        <Input id="ti-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ti-email">Email</Label>
        <Input
          id="ti-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          É para aqui que enviamos a sugestão de resolução.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ti-descricao">Qual é o problema?</Label>
        <Textarea
          id="ti-descricao"
          rows={5}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Button onClick={submeter} disabled={aEnviar} className="w-full gap-2">
        {aEnviar && <Loader2 className="h-4 w-4 animate-spin" />}
        Enviar pedido
      </Button>
    </Card>
  );
}
