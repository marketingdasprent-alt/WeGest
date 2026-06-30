import React, { useState } from 'react';
import { InviteGenerationForm } from '@/components/admin/InviteGenerationForm';
import { GeneratedInviteDisplay } from '@/components/admin/GeneratedInviteDisplay';
import { MotoristaInviteLink } from '@/components/admin/MotoristaInviteLink';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

/**
 * Aba "Convites" das Configurações: convite de colaborador (email + grupo)
 * e link de registo de motorista (por código da org ativa).
 *
 * Acesso à aba é gateado em AdminSettings por hasAccessToResource(ADMIN_CONVITES).
 * Aqui, o nível Editar (canEdit) controla a geração/envio: sem ele, a aba é
 * só de leitura (mostra o link de motorista, esconde a geração de convites).
 */
export const ConvitesTab = () => {
  const { canEdit } = usePermissions();
  const podeGerir = canEdit(RECURSOS.ADMIN_CONVITES);
  const [generatedLink, setGeneratedLink] = useState('');

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      <div className="space-y-6">
        {podeGerir ? (
          <>
            <InviteGenerationForm onInviteGenerated={setGeneratedLink} />
            {generatedLink && <GeneratedInviteDisplay inviteLink={generatedLink} />}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Não tem permissão para gerar convites de colaborador. Contacte um administrador.
          </p>
        )}
      </div>

      <div className="space-y-6">
        <MotoristaInviteLink />
      </div>
    </div>
  );
};
