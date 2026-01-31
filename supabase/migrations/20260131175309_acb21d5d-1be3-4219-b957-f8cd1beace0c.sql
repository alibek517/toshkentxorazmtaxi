-- Update timestamp funksiyasi
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Admin sozlamalari uchun jadval
CREATE TABLE public.bot_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS enable
ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

-- Service role policy
CREATE POLICY "Service role full access bot_settings"
ON public.bot_settings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Default sozlamalar
INSERT INTO public.bot_settings (setting_key, setting_value) VALUES 
('driver_registration_enabled', 'true');

-- Updated_at trigger
CREATE TRIGGER update_bot_settings_updated_at
BEFORE UPDATE ON public.bot_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();