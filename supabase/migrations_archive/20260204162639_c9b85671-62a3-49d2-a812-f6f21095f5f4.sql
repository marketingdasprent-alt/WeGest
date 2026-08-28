-- Tabela para armazenar motoristas da Bolt
CREATE TABLE IF NOT EXISTS public.bolt_drivers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_uuid TEXT UNIQUE NOT NULL,
  name TEXT,
  phone TEXT,
  email TEXT,
  status TEXT,
  registration_date TIMESTAMP WITH TIME ZONE,
  dados_raw JSONB,
  motorista_id UUID REFERENCES public.motoristas_ativos(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela para armazenar viaturas da Bolt
CREATE TABLE IF NOT EXISTS public.bolt_vehicles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_uuid TEXT UNIQUE NOT NULL,
  license_plate TEXT,
  model TEXT,
  brand TEXT,
  color TEXT,
  year INTEGER,
  status TEXT,
  dados_raw JSONB,
  viatura_id UUID REFERENCES public.viaturas(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_bolt_drivers_driver_uuid ON public.bolt_drivers(driver_uuid);
CREATE INDEX IF NOT EXISTS idx_bolt_drivers_motorista_id ON public.bolt_drivers(motorista_id);
CREATE INDEX IF NOT EXISTS idx_bolt_vehicles_vehicle_uuid ON public.bolt_vehicles(vehicle_uuid);
CREATE INDEX IF NOT EXISTS idx_bolt_vehicles_license_plate ON public.bolt_vehicles(license_plate);
CREATE INDEX IF NOT EXISTS idx_bolt_vehicles_viatura_id ON public.bolt_vehicles(viatura_id);

-- Enable RLS
ALTER TABLE public.bolt_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolt_vehicles ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para bolt_drivers
CREATE POLICY "Admins podem ver motoristas Bolt" 
ON public.bolt_drivers 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

CREATE POLICY "Admins podem gerir motoristas Bolt" 
ON public.bolt_drivers 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- Políticas RLS para bolt_vehicles
CREATE POLICY "Admins podem ver viaturas Bolt" 
ON public.bolt_vehicles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

CREATE POLICY "Admins podem gerir viaturas Bolt" 
ON public.bolt_vehicles 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- Triggers para updated_at
CREATE TRIGGER update_bolt_drivers_updated_at
  BEFORE UPDATE ON public.bolt_drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bolt_vehicles_updated_at
  BEFORE UPDATE ON public.bolt_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
