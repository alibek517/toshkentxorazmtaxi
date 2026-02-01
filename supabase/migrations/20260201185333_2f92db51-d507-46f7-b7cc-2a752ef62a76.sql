-- Allow anon/authenticated users to manage userbot_accounts
DROP POLICY IF EXISTS "Service role full access userbot_accounts" ON public.userbot_accounts;

CREATE POLICY "Allow all operations on userbot_accounts"
ON public.userbot_accounts
FOR ALL
USING (true)
WITH CHECK (true);

-- Also fix account_groups policy
DROP POLICY IF EXISTS "Service role full access account_groups" ON public.account_groups;

CREATE POLICY "Allow all operations on account_groups"
ON public.account_groups
FOR ALL
USING (true)
WITH CHECK (true);

-- Also fix keyword_hits policy
DROP POLICY IF EXISTS "Service role full access keyword_hits" ON public.keyword_hits;

CREATE POLICY "Allow all operations on keyword_hits"
ON public.keyword_hits
FOR ALL
USING (true)
WITH CHECK (true);