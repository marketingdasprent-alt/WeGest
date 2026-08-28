-- Adicionar recurso para exportação do calendário
INSERT INTO public.recursos (nome, descricao, categoria)
VALUES ('calendario_exportar', 'Exportar dados do calendário (Relatórios)', 'Calendário')
ON CONFLICT (nome) DO NOTHING;

-- Garantir que o recurso existe na tabela (caso o ON CONFLICT tenha saltado)
DO $$
DECLARE
    v_recurso_id UUID;
    v_supervisor_cargo_id UUID := '0cf27801-80ff-4480-857e-e90bfb75d5a6';
    v_admin_cargo_id UUID;
BEGIN
    SELECT id INTO v_recurso_id FROM public.recursos WHERE nome = 'calendario_exportar';
    
    -- Dar acesso à Supervisão de Gestor TVDE
    INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, tem_acesso, pode_editar)
    VALUES (v_supervisor_cargo_id, v_recurso_id, true, true)
    ON CONFLICT (cargo_id, recurso_id) DO UPDATE SET tem_acesso = true, pode_editar = true;

    -- Dar acesso aos Administradores
    -- Buscar o cargo de Administrador pelo nome
    SELECT id INTO v_admin_cargo_id FROM public.cargos WHERE nome = 'Administrador';
    
    IF v_admin_cargo_id IS NOT NULL THEN
        INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, tem_acesso, pode_editar)
        VALUES (v_admin_cargo_id, v_recurso_id, true, true)
        ON CONFLICT (cargo_id, recurso_id) DO UPDATE SET tem_acesso = true, pode_editar = true;
    END IF;
END $$;
