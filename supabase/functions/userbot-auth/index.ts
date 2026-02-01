import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TelegramClient } from "https://esm.sh/telegram@2.19.10";
import { StringSession } from "https://esm.sh/telegram@2.19.10/sessions/index.js";

const TELEGRAM_API_ID = parseInt(Deno.env.get("TELEGRAM_API_ID") || "0");
const TELEGRAM_API_HASH = Deno.env.get("TELEGRAM_API_HASH")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, phone_number, code, password, account_id, phone_code_hash } = body;

    if (action === "send_code") {
      // Telefon raqamga kod yuborish
      const stringSession = new StringSession("");
      const client = new TelegramClient(stringSession, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
        connectionRetries: 5,
      });

      await client.connect();

      const result = await client.sendCode(
        { apiId: TELEGRAM_API_ID, apiHash: TELEGRAM_API_HASH },
        phone_number
      );

      const sessionStr = client.session.save() as unknown as string;

      // Akkauntni bazaga qo'shish
      const { data: account, error } = await supabase
        .from("userbot_accounts")
        .upsert({
          phone_number,
          status: "awaiting_code",
          session_string: sessionStr,
        }, { onConflict: "phone_number" })
        .select()
        .single();

      await client.disconnect();

      if (error) throw error;

      return new Response(
        JSON.stringify({ 
          ok: true, 
          message: "Kod yuborildi", 
          phone_code_hash: result.phoneCodeHash,
          account_id: account.id 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "verify_code") {
      // Kodni tasdiqlash (1.2.3.4.5 formatidan oddiy raqamga)
      const cleanCode = code.replace(/\./g, "");

      const { data: account } = await supabase
        .from("userbot_accounts")
        .select("*")
        .eq("id", account_id)
        .single();

      if (!account) {
        return new Response(
          JSON.stringify({ ok: false, error: "Akkaunt topilmadi" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const stringSession = new StringSession(account.session_string || "");
      const client = new TelegramClient(stringSession, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
        connectionRetries: 5,
      });

      await client.connect();

      try {
        // Use start method with callbacks for full auth flow
        await client.start({
          phoneNumber: async () => account.phone_number,
          phoneCode: async () => cleanCode,
          password: async () => password || "",
          onError: (err) => { throw err; },
        });

        // Muvaffaqiyatli - sessiyani saqlash
        const sessionString = client.session.save() as unknown as string;

        await supabase
          .from("userbot_accounts")
          .update({
            session_string: sessionString,
            status: "active",
            two_fa_required: false,
          })
          .eq("id", account_id);

        // Botga /start yuborish
        await startBotFromAccount(client);

        await client.disconnect();

        return new Response(
          JSON.stringify({ ok: true, message: "Akkaunt muvaffaqiyatli ulandi!" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        const errMsg = err.message || String(err);
        
        if (errMsg.includes("SESSION_PASSWORD_NEEDED") || errMsg.includes("2FA")) {
          // 2FA kerak
          const sessionStr = client.session.save() as unknown as string;
          
          await supabase
            .from("userbot_accounts")
            .update({
              session_string: sessionStr,
              status: "awaiting_2fa",
              two_fa_required: true,
            })
            .eq("id", account_id);

          await client.disconnect();

          return new Response(
            JSON.stringify({ ok: false, requires_2fa: true, message: "2FA parol kerak" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw err;
      }
    }

    if (action === "verify_2fa") {
      const { data: account } = await supabase
        .from("userbot_accounts")
        .select("*")
        .eq("id", account_id)
        .single();

      if (!account) {
        return new Response(
          JSON.stringify({ ok: false, error: "Akkaunt topilmadi" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const stringSession = new StringSession(account.session_string || "");
      const client = new TelegramClient(stringSession, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
        connectionRetries: 5,
      });

      await client.connect();

      try {
        await client.start({
          phoneNumber: async () => account.phone_number,
          phoneCode: async () => "", // Already verified
          password: async () => password,
          onError: (err) => { throw err; },
        });

        const sessionString = client.session.save() as unknown as string;

        await supabase
          .from("userbot_accounts")
          .update({
            session_string: sessionString,
            status: "active",
          })
          .eq("id", account_id);

        // Botga /start yuborish
        await startBotFromAccount(client);

        await client.disconnect();

        return new Response(
          JSON.stringify({ ok: true, message: "Akkaunt muvaffaqiyatli ulandi!" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        await client.disconnect();
        throw err;
      }
    }

    if (action === "delete_account") {
      await supabase
        .from("userbot_accounts")
        .delete()
        .eq("id", account_id);

      return new Response(
        JSON.stringify({ ok: true, message: "Akkaunt o'chirildi" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: "Noma'lum action" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("UserBot Auth Error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message || String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

// Akkauntdan botga /start yuborish
async function startBotFromAccount(client: TelegramClient) {
  try {
    // Bot username ni olish
    const botInfo = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
    const { result } = await botInfo.json();
    const botUsername = result.username;

    // Botga /start yuborish
    await client.sendMessage(botUsername, { message: "/start" });
    console.log(`Sent /start to @${botUsername}`);
  } catch (err) {
    console.error("Error sending /start to bot:", err);
  }
}
