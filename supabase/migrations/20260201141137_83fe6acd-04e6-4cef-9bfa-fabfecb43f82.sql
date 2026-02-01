-- Ulangan akkauntlar jadvali
CREATE TABLE public.userbot_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL UNIQUE,
  session_string TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  two_fa_required BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS yoqish
ALTER TABLE public.userbot_accounts ENABLE ROW LEVEL SECURITY;

-- Service role uchun to'liq kirish
CREATE POLICY "Service role full access userbot_accounts" 
ON public.userbot_accounts 
FOR ALL 
TO service_role
USING (true) 
WITH CHECK (true);

-- Timestamp trigger
CREATE TRIGGER update_userbot_accounts_updated_at
BEFORE UPDATE ON public.userbot_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();