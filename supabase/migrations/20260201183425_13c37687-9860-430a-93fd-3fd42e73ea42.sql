-- Kalit so'z statistikasi uchun jadval
CREATE TABLE public.keyword_hits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID REFERENCES public.keywords(id) ON DELETE CASCADE,
  group_id BIGINT NOT NULL,
  group_name TEXT,
  phone_number TEXT,
  message_preview TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS yoqish
ALTER TABLE public.keyword_hits ENABLE ROW LEVEL SECURITY;

-- Service role uchun policy
CREATE POLICY "Service role full access keyword_hits" ON public.keyword_hits
  FOR ALL USING (true) WITH CHECK (true);

-- Akkaunt-guruh bog'liqligi uchun jadval
CREATE TABLE public.account_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  group_id BIGINT NOT NULL,
  group_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(phone_number, group_id)
);

-- RLS yoqish
ALTER TABLE public.account_groups ENABLE ROW LEVEL SECURITY;

-- Service role uchun policy
CREATE POLICY "Service role full access account_groups" ON public.account_groups
  FOR ALL USING (true) WITH CHECK (true);