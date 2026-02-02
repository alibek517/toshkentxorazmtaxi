-- watched_groups jadvaliga bot a'zoligi ustuni qo'shish
ALTER TABLE public.watched_groups 
ADD COLUMN IF NOT EXISTS bot_joined boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS bot_joined_at timestamp with time zone;