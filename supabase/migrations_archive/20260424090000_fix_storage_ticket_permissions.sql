-- Atualização das políticas de storage para permitir acesso baseado na tabela de anexos e acessos do ticket
-- Esta versão é mais robusta pois não depende da estrutura de pastas, mas sim do mapeamento na base de dados.

-- 1. Política de Visualização
DROP POLICY IF EXISTS "Ver anexos de assistência" ON storage.objects;
CREATE POLICY "Ver anexos de assistência"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'assistencia-anexos'
    AND (
        is_current_user_admin()
        OR (auth.uid() IS NOT NULL AND (
            EXISTS (
                SELECT 1 FROM public.assistencia_anexos a
                JOIN public.assistencia_tickets t ON t.id = a.ticket_id
                WHERE a.ficheiro_url = name
                AND (
                    t.criado_por = auth.uid()
                    OR t.atribuido_a = auth.uid()
                    OR has_permission(auth.uid(), 'assistencia_tickets')
                    OR EXISTS (
                        SELECT 1 FROM public.assistencia_ticket_acessos acc
                        WHERE acc.ticket_id = t.id
                        AND acc.profile_id = auth.uid()
                    )
                )
            )
            OR 
            -- Permitir que o próprio utilizador veja o que acabou de carregar (pasta temporária por user_id)
            (storage.foldername(name))[1] = 'assistencia' AND (storage.foldername(name))[2] = auth.uid()::text
        ))
    )
);

-- 2. Política de Upload
DROP POLICY IF EXISTS "Upload anexos de assistência" ON storage.objects;
CREATE POLICY "Upload anexos de assistência"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'assistencia-anexos'
    AND (
        is_current_user_admin()
        OR (auth.uid() IS NOT NULL AND (
            -- Permitir upload para a sua própria pasta
            (storage.foldername(name))[1] = 'assistencia' AND (storage.foldername(name))[2] = auth.uid()::text
            OR
            -- Permitir upload se for para uma pasta de ticket onde tem acesso (usado no chat)
            EXISTS (
                SELECT 1 FROM public.assistencia_tickets t
                WHERE t.id::text = (storage.foldername(name))[1]
                AND (
                    t.criado_por = auth.uid()
                    OR t.atribuido_a = auth.uid()
                    OR has_permission(auth.uid(), 'assistencia_tickets')
                    OR EXISTS (
                        SELECT 1 FROM public.assistencia_ticket_acessos acc
                        WHERE acc.ticket_id = t.id
                        AND acc.profile_id = auth.uid()
                    )
                )
            )
        ))
    )
);

-- 3. Política de Deleção (Apenas Admins ou o próprio criador do anexo)
DROP POLICY IF EXISTS "Deletar anexos de assistência" ON storage.objects;
CREATE POLICY "Deletar anexos de assistência"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'assistencia-anexos'
    AND (
        is_current_user_admin()
        OR (auth.uid() IS NOT NULL AND (storage.foldername(name))[2] = auth.uid()::text)
    )
);
