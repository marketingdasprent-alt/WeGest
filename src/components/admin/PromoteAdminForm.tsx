import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/useAdmin';
import { useOrgId } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, UserPlus } from 'lucide-react';

export const PromoteAdminForm = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { isAdmin } = useAdmin();
  const orgId = useOrgId();

  if (!isAdmin) {
    return null; // Não mostrar o componente se não for admin
  }

  const promoteToAdmin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast({
        title: 'Erro',
        description: 'Email é obrigatório',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('promote-admin', {
        body: { email, org_id: orgId },
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Sucesso!',
        description: 'Usuário promovido a administrador com sucesso',
      });

      setEmail('');
    } catch (error: any) {
      console.error('Error promoting user:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao promover usuário',
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
          <Shield className="h-5 w-5 text-primary" />
          Promover Usuário a Admin
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={promoteToAdmin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adminEmail" className="text-gray-300">
              Email do usuário a promover
            </Label>
            <Input
              id="adminEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-gray-800/50 border-gray-600 text-white placeholder:text-gray-400 focus:border-primary"
              placeholder="usuario@email.com"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 text-white font-semibold"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            {loading ? 'Promovendo...' : 'Promover a Admin'}
          </Button>
        </form>

        <div className="mt-4 text-gray-400 text-sm">
          <p>• O usuário deve já estar registrado no sistema</p>
          <p>• Após promover, o usuário poderá gerar convites</p>
        </div>
      </CardContent>
    </Card>
  );
};
