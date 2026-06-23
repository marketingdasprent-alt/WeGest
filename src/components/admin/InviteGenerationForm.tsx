import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, UserPlus } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';

interface Cargo {
  id: string;
  nome: string;
}

interface InviteGenerationFormProps {
  onInviteGenerated: (link: string) => void;
}

export const InviteGenerationForm = ({ onInviteGenerated }: InviteGenerationFormProps) => {
  const [email, setEmail] = useState('');
  const [cargoId, setCargoId] = useState('');
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { orgId } = useTenant();

  useEffect(() => {
    fetchCargos();
  }, []);

  const fetchCargos = async () => {
    const { data, error } = await supabase.from('cargos').select('id, nome').order('nome');

    if (!error && data) {
      setCargos(data);
    }
  };

  const generateInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast({
        title: 'Erro',
        description: 'Email é obrigatório',
        variant: 'destructive',
      });
      return;
    }

    if (!cargoId) {
      toast({
        title: 'Erro',
        description: 'Selecione um grupo para o utilizador',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      // Gerar token único
      const token = crypto.randomUUID().replace(/-/g, '');

      // Data de expiração (7 dias)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Remover convites antigos para este email
      await supabase.from('convites').delete().eq('email', email.toLowerCase().trim());

      // Inserir novo convite COM cargo_id e org_id
      const { data, error } = await supabase
        .from('convites')
        .insert({
          email: email.toLowerCase().trim(),
          token,
          expires_at: expiresAt.toISOString(),
          usado: false,
          cargo_id: cargoId,
          org_id: orgId,
        })
        .select()
        .single();

      if (error) {
        console.error('Erro ao inserir convite:', error);
        throw error;
      }

      // Gerar link
      const baseUrl = window.location.origin;
      const inviteLink = `${baseUrl}/register?token=${token}`;

      onInviteGenerated(inviteLink);
      setEmail('');
      setCargoId('');

      toast({
        title: 'Convite gerado!',
        description: 'Link de convite para usuário normal criado com sucesso',
      });
    } catch (error: any) {
      console.error('Erro ao gerar convite:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao gerar convite',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 border-gray-700/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <UserPlus className="h-5 w-5 text-primary" />
          Gerar Convite para Utilizador
        </CardTitle>
        <p className="text-gray-400 text-sm">
          Crie um convite para uma nova pessoa se registrar com permissões específicas
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={generateInvite} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-gray-300">
              Email da pessoa a convidar
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-gray-800/50 border-gray-600 text-white placeholder:text-gray-400 focus:border-primary"
              placeholder="exemplo@email.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cargo" className="text-gray-300">
              Grupo de Permissões
            </Label>
            <Select value={cargoId} onValueChange={setCargoId}>
              <SelectTrigger className="bg-gray-800/50 border-gray-600 text-white focus:border-primary">
                <SelectValue placeholder="Selecione um grupo" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                {cargos.map((cargo) => (
                  <SelectItem
                    key={cargo.id}
                    value={cargo.id}
                    className="text-white hover:bg-gray-700"
                  >
                    {cargo.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            disabled={loading || !cargoId}
            className="w-full bg-primary hover:bg-primary/90 text-white font-semibold"
          >
            <Plus className="h-4 w-4 mr-2" />
            {loading ? 'Gerando...' : 'Gerar Convite'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
