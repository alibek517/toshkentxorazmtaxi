import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TelegramClient } from "https://esm.sh/telegram@2.19.10";
import { StringSession } from "https://esm.sh/telegram@2.19.10/sessions/index.js";

const TELEGRAM_API_ID = parseInt(Deno.env.get("TELEGRAM_API_ID") || "0");
const TELEGRAM_API_HASH = Deno.env.get("TELEGRAM_API_HASH")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DRIVERS_GROUP_ID = -1003784903860;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Bot orqali xabar yuborish
async function sendToDriversGroup(text: string, messageLink: string | null) {
  const fullText = messageLink 
    ? `${text}\n\n🔗 Xabarga o'tish: ${messageLink}`
    : text;

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: DRIVERS_GROUP_ID,
      text: fullText,
      disable_web_page_preview: false,
    }),
  });
}

// Xabar havolasini yaratish
function createMessageLink(chatId: number | string | bigint, messageId: number, username: string | null): string | null {
  if (username) {
    return `https://t.me/${username}/${messageId}`;
  }
  
  // Private group - channel ID format
  const chatIdStr = String(chatId);
  // Remove -100 prefix for supergroups
  const cleanId = chatIdStr.startsWith("-100") ? chatIdStr.slice(4) : chatIdStr.replace("-", "");
  return `https://t.me/c/${cleanId}/${messageId}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, account_id } = await req.json();

    if (action === "start_listening") {
      // Bitta akkaunt uchun listening boshlash
      const { data: account } = await supabase
        .from("userbot_accounts")
        .select("*")
        .eq("id", account_id)
        .eq("status", "active")
        .single();

      if (!account) {
        return new Response(
          JSON.stringify({ ok: false, error: "Aktiv akkaunt topilmadi" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Kalit so'zlarni olish
      const { data: keywords } = await supabase.from("keywords").select("keyword");
      const keywordList = keywords?.map((k) => k.keyword.toLowerCase()) || [];

      if (keywordList.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: "Kalit so'zlar topilmadi" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const stringSession = new StringSession(account.session_string);
      const client = new TelegramClient(stringSession, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
        connectionRetries: 5,
      });

      await client.connect();

      // Akkautdagi barcha guruhlarni olish
      const dialogs = await client.getDialogs({ limit: 100 });
      const groups = dialogs.filter((d: any) => d.isGroup || d.isChannel);

      console.log(`Found ${groups.length} groups for account ${account.phone_number}`);

      // So'nggi xabarlarni tekshirish (ohirgi 10ta)
      let foundMessages = 0;

      for (const dialog of groups) {
        try {
          const messages = await client.getMessages(dialog.entity, { limit: 10 });

          for (const msg of messages) {
            if (!msg.text) continue;

            const lowerText = msg.text.toLowerCase();
            const hasKeyword = keywordList.some((keyword) => lowerText.includes(keyword));

            if (hasKeyword) {
              const chatEntity = dialog.entity as any;
              const username = chatEntity?.username || null;
              const chatTitle = dialog.title || "Noma'lum guruh";
              const senderName = msg.sender ? 
                ((msg.sender as any).firstName || "") + " " + ((msg.sender as any).lastName || "") : 
                "Noma'lum";

              // Get chat ID safely
              const dialogId = dialog.id ? Number(dialog.id) : 0;
              const messageLink = dialogId ? createMessageLink(dialogId, msg.id, username) : null;

              const forwardText = `🔔 Topildi: ${chatTitle}\n\n${msg.text}\n\n👤 ${senderName.trim()}`;

              await sendToDriversGroup(forwardText, messageLink);
              foundMessages++;
            }
          }
        } catch (err) {
          console.error(`Error checking group ${dialog.title}:`, err);
        }
      }

      await client.disconnect();

      return new Response(
        JSON.stringify({ 
          ok: true, 
          message: `${foundMessages} ta xabar topildi va yuborildi`,
          groups_count: groups.length 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "check_all_accounts") {
      // Barcha aktiv akkauntlarni tekshirish
      const { data: accounts } = await supabase
        .from("userbot_accounts")
        .select("*")
        .eq("status", "active");

      if (!accounts || accounts.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: "Aktiv akkauntlar topilmadi" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Kalit so'zlarni olish
      const { data: keywords } = await supabase.from("keywords").select("keyword");
      const keywordList = keywords?.map((k) => k.keyword.toLowerCase()) || [];

      if (keywordList.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: "Kalit so'zlar topilmadi" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let totalFound = 0;

      for (const account of accounts) {
        try {
          const stringSession = new StringSession(account.session_string);
          const client = new TelegramClient(stringSession, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
            connectionRetries: 5,
          });

          await client.connect();

          const dialogs = await client.getDialogs({ limit: 100 });
          const groups = dialogs.filter((d: any) => d.isGroup || d.isChannel);

          for (const dialog of groups) {
            try {
              const messages = await client.getMessages(dialog.entity, { limit: 5 });

              for (const msg of messages) {
                if (!msg.text) continue;

                const lowerText = msg.text.toLowerCase();
                const hasKeyword = keywordList.some((keyword) => lowerText.includes(keyword));

                if (hasKeyword) {
                  const chatEntity = dialog.entity as any;
                  const username = chatEntity?.username || null;
                  const chatTitle = dialog.title || "Noma'lum guruh";
                  const senderName = msg.sender ? 
                    ((msg.sender as any).firstName || "") + " " + ((msg.sender as any).lastName || "") : 
                    "Noma'lum";

                  // Get chat ID safely
                  const dialogId = dialog.id ? Number(dialog.id) : 0;
                  const messageLink = dialogId ? createMessageLink(dialogId, msg.id, username) : null;

                  const forwardText = `🔔 Topildi: ${chatTitle}\n\n${msg.text}\n\n👤 ${senderName.trim()}`;

                  await sendToDriversGroup(forwardText, messageLink);
                  totalFound++;
                }
              }
            } catch (err) {
              console.error(`Error checking group:`, err);
            }
          }

          await client.disconnect();
        } catch (err) {
          console.error(`Error with account ${account.phone_number}:`, err);
        }
      }

      return new Response(
        JSON.stringify({ ok: true, message: `${totalFound} ta xabar topildi`, accounts_checked: accounts.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: "Noma'lum action" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("UserBot Listener Error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message || String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
