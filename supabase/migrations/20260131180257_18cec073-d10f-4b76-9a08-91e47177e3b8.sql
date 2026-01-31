-- Allow anon users to read bot_settings
CREATE POLICY "Allow read bot_settings for all"
ON public.bot_settings
FOR SELECT
USING (true);

-- Allow anon users to update bot_settings
CREATE POLICY "Allow update bot_settings for all"
ON public.bot_settings
FOR UPDATE
USING (true)
WITH CHECK (true);