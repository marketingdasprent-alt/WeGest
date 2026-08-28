-- 1. Remover a foreign key existente de lead_status_history
ALTER TABLE public.lead_status_history 
DROP CONSTRAINT IF EXISTS lead_status_history_alterado_por_fkey;

ALTER TABLE public.lead_status_history 
DROP CONSTRAINT IF EXISTS fk_lead_status_history_alterado_por;

-- 2. Recriar com ON DELETE SET NULL
ALTER TABLE public.lead_status_history 
ADD CONSTRAINT lead_status_history_alterado_por_fkey 
FOREIGN KEY (alterado_por) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Remover a foreign key existente de user_roles (created_by)
ALTER TABLE public.user_roles 
DROP CONSTRAINT IF EXISTS user_roles_created_by_fkey;

-- 4. Recriar com ON DELETE SET NULL
ALTER TABLE public.user_roles 
ADD CONSTRAINT user_roles_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5. Remover a foreign key existente de document_templates
ALTER TABLE public.document_templates 
DROP CONSTRAINT IF EXISTS document_templates_criado_por_fkey;

-- 6. Recriar com ON DELETE SET NULL
ALTER TABLE public.document_templates 
ADD CONSTRAINT document_templates_criado_por_fkey 
FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;