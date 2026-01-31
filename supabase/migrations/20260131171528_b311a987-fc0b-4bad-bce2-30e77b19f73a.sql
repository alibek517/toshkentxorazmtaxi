-- Add user_state column to bot_users table for persistent state management
ALTER TABLE public.bot_users 
ADD COLUMN IF NOT EXISTS user_state TEXT DEFAULT '';