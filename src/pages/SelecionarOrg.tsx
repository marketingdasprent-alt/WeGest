import React from 'react';
import { Navigate } from 'react-router-dom';
import { Building2, Loader2 } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { useDefaultRoute } from '@/hooks/useDefaultRoute';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthMobileShell } from '@/components/auth/AuthMobileShell';

const SelecionarOrg = () => {
  const { orgId, orgs, switchOrg } = useTenant();
  const { defaultRoute } = useDefaultRoute();

  // switchOrg recarrega a página no mesmo endereço: sem isto, escolher a
  // empresa voltava a mostrar este ecrã para sempre (Inês, 2026-10-20).
  if (orgId) {
    if (defaultRoute) return <Navigate to={defaultRoute} replace />;
    return (
      <div className="auth-screen auth-screen-safe">
        <div className="auth-screen__background" aria-hidden="true" />
        <Loader2 className="relative z-10 h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AuthMobileShell
      title="Selecionar Empresa"
      description="Pertence a várias empresas. Escolha onde pretende trabalhar."
      logoAlt="WeGest"
      headerIcon={<Building2 className="auth-icon-accent" />}
    >
      <div className="space-y-3">
        {orgs.map((org) => (
          <Card
            key={org.id}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => switchOrg(org.id)}
          >
            <CardHeader className="py-4 px-5">
              <div className="flex items-center gap-3">
                {org.logo_url ? (
                  <img
                    src={org.logo_url}
                    alt={org.nome}
                    className="h-10 w-10 rounded-lg object-contain"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div>
                  <CardTitle className="text-base">{org.nome}</CardTitle>
                  <CardDescription className="text-xs">{org.codigo}</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </AuthMobileShell>
  );
};

export default SelecionarOrg;
