-- Add is_blocked column to watched_groups table
ALTER TABLE public.watched_groups 
ADD COLUMN is_blocked boolean NOT NULL DEFAULT false;

-- Block the drivers group by default (it should not be monitored)
UPDATE public.watched_groups 
SET is_blocked = true 
WHERE group_id = -1003784903860;