import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const update = await req.json();
    const message = update.message;

    if (!message || !message.chat || message.chat.type === "private") {
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const chatId = message.chat.id;
    const text = message.text || "";

    // Kuzatiladigan guruhmi?
    const { data: watchedGroup } = await supabase
      .from("watched_groups")
      .select("*")
      .eq("group_id", chatId)
      .single();

    if (!watchedGroup) {
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Kalit so'zlarni tekshirish
    const { data: keywords } = await supabase.from("keywords").select("keyword");
    const keywordList = keywords?.map((k) => k.keyword.toLowerCase()) || [];

    const lowerText = text.toLowerCase();
    const hasKeyword = keywordList.some((keyword) => lowerText.includes(keyword));

    if (hasKeyword) {
      // Xabarni haydovchilar guruhiga yuborish
      const userMention = message.from?.username 
        ? `@${message.from.username}` 
        : message.from?.first_name || "Foydalanuvchi";

      const forwardText = `🔔 Guruhdan topildi!\n\n${text}\n\n👤 ${userMention}`;

      await callTelegram("sendMessage", {
        chat_id: DRIVERS_GROUP_ID,
        text: forwardText,
        reply_markup: {
          inline_keyboard: [[{ text: "🙋 Men gaplashib ko'ray", callback_data: "claim_keyword" }]],
        },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
