import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const DRIVERS_GROUP_ID = -1003784903860;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callTelegram(method: string, data: any) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return response.json();
}

// This endpoint is for manual triggering - actual monitoring needs external service
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get active accounts
    const { data: accounts } = await supabase
      .from("userbot_accounts")
      .select("*")
      .eq("status", "active");

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, message: "Faol akkauntlar yo'q" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get keywords
    const { data: keywords } = await supabase.from("keywords").select("keyword");
    const keywordList = keywords?.map((k) => k.keyword.toLowerCase()) || [];

    // Get watched groups
    const { data: groups } = await supabase.from("watched_groups").select("*");

    // Note: Actual MTProto monitoring requires a persistent service
    // This endpoint just confirms configuration
    return new Response(
      JSON.stringify({
        ok: true,
        message: "Konfiguratsiya tayyor",
        accounts_count: accounts.length,
        keywords_count: keywordList.length,
        groups_count: groups?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Listener Error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
