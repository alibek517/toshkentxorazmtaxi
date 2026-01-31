import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DRIVERS_GROUP_ID = -1003784903860;
const ADMIN_ID = 7748145808;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Telefon raqamini yashirish
function hidePhoneNumber(text: string): string {
  // 7+ raqamli sonlarni topib, o'rtadagi 5 tasini yashirish
  return text.replace(/(\d{2,3})[\s-]?(\d{2,3})[\s-]?(\d{2,3})[\s-]?(\d{2,4})/g, (match) => {
    const digits = match.replace(/[\s-]/g, "");
    if (digits.length >= 7) {
      const start = digits.slice(0, 2);
      const end = digits.slice(-2);
      return start + "*****" + end;
    }
    return match;
  });
}

// Text olish
async function getText(key: string): Promise<string> {
  const { data } = await supabase
    .from("bot_texts")
    .select("text_value")
    .eq("text_key", key)
    .single();
  return data?.text_value || "";
}

// Setting olish
async function getSetting(key: string): Promise<string> {
  const { data } = await supabase
    .from("bot_settings")
    .select("setting_value")
    .eq("setting_key", key)
    .single();
  return data?.setting_value || "";
}

// Telegram API chaqirish
async function callTelegram(method: string, data: any) {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return response.json();
}

// Foydalanuvchi olish/yaratish
async function getOrCreateUser(telegramUser: any) {
  const { data: existingUser } = await supabase
    .from("bot_users")
    .select("*")
    .eq("telegram_id", telegramUser.id)
    .single();

  if (existingUser) {
    return existingUser;
  }

  const { data: newUser } = await supabase
    .from("bot_users")
    .insert({
      telegram_id: telegramUser.id,
      full_name: telegramUser.first_name + (telegramUser.last_name ? " " + telegramUser.last_name : ""),
      username: telegramUser.username,
      user_state: "",
    })
    .select()
    .single();

  return newUser;
}

// User state olish
async function getUserState(telegramId: number): Promise<string> {
  const { data } = await supabase
    .from("bot_users")
    .select("user_state")
    .eq("telegram_id", telegramId)
    .single();
  return data?.user_state || "";
}

// User state saqlash
async function setUserState(telegramId: number, state: string) {
  await supabase
    .from("bot_users")
    .update({ user_state: state })
    .eq("telegram_id", telegramId);
}

// Asosiy menyu yuborish
async function sendMainMenu(chatId: number, fullName: string) {
  const text = (await getText("main_menu")).replace("{fullname}", fullName);
  const driverEnabled = await getSetting("driver_registration_enabled");
  
  const keyboard = driverEnabled === "true" 
    ? [
        [{ text: "🚕 Taxi zakaz qilish" }],
        [{ text: "🚖 Haydovchi Bo'lish" }],
        [{ text: "📦 Pochta yuborish" }],
      ]
    : [
        [{ text: "🚕 Taxi zakaz qilish" }],
        [{ text: "📦 Pochta yuborish" }],
      ];
  
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: {
      keyboard,
      resize_keyboard: true,
    },
  });
}

// Telefon so'rash
async function askForPhone(chatId: number) {
  const text = await getText("welcome_phone");
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: {
      keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

// Buyurtmani grupaga yuborish
async function sendOrderToGroup(user: any, orderText: string, orderType: string) {
  const hiddenText = hidePhoneNumber(orderText);
  const userInfo = user.phone_number 
    ? `📞 Mijoz: ${hidePhoneNumber(user.phone_number)}\n👤 ${user.full_name}` 
    : `👤 ${user.full_name}`;
  
  const typeEmoji = orderType === "taxi" ? "🚕" : "📦";
  const message = `${typeEmoji} Yangi ${orderType === "taxi" ? "Taxi zakaz" : "Pochta"}\n\n${hiddenText}\n\n${userInfo}`;

  const result = await callTelegram("sendMessage", {
    chat_id: DRIVERS_GROUP_ID,
    text: message,
    reply_markup: {
      inline_keyboard: [[{ text: "🙋 Men gaplashib ko'ray", callback_data: `claim_${orderType}` }]],
    },
  });

  // Buyurtmani saqlash
  if (result.ok) {
    await supabase.from("orders").insert({
      telegram_id: user.telegram_id,
      order_type: orderType,
      message_text: orderText,
      group_message_id: result.result.message_id,
    });
  }

  return result;
}

// Admin menuini ko'rsatish
async function showAdminMenu(chatId: number) {
  const text = await getText("admin_welcome");
  const driverEnabled = await getSetting("driver_registration_enabled");
  const toggleText = driverEnabled === "true" ? "🚖❌ Haydovchi Bo'lishni O'chirish" : "🚖✅ Haydovchi Bo'lishni Yoqish";
  
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: {
      keyboard: [
        [{ text: "➕ Guruh qo'shish" }, { text: "➕ Kalit so'zlar" }],
        [{ text: "👥 Foydalanuvchilar" }, { text: "📝 Textlarni tahrirlash" }],
        [{ text: "🚫 Foydalanuvchini bloklash" }, { text: "➕ Admin qo'shish" }],
        [{ text: toggleText }],
        [{ text: "🔙 Asosiy menyu" }],
      ],
      resize_keyboard: true,
    },
  });
}

// Haydovchi menyu
async function showDriverMenu(chatId: number) {
  const text = await getText("driver_menu");
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: {
      keyboard: [
        [{ text: "ℹ️ VIP haqida" }, { text: "⭐ VIPga qo'shilish" }],
        [{ text: "🔙 Orqaga" }],
      ],
      resize_keyboard: true,
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const update = await req.json();
    console.log("Telegram update:", JSON.stringify(update));

    // Callback query (inline button bosilganda)
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const callbackData = callbackQuery.data;
      const driverId = callbackQuery.from.id;
      const messageId = callbackQuery.message?.message_id;
      const chatId = callbackQuery.message?.chat?.id;

      if (callbackData.startsWith("claim_")) {
        // O'chert olish
        const { data: order } = await supabase
          .from("orders")
          .select("*")
          .eq("group_message_id", messageId)
          .single();

        if (order) {
          // Allaqachon o'chert olganmi?
          const { data: existingQueue } = await supabase
            .from("order_queue")
            .select("*")
            .eq("order_id", order.id)
            .eq("driver_telegram_id", driverId)
            .single();

          if (existingQueue) {
            await callTelegram("answerCallbackQuery", {
              callback_query_id: callbackQuery.id,
              text: "Siz allaqachon o'chert olgansiz!",
              show_alert: true,
            });
          } else {
            // Navbatni aniqlash
            const { count } = await supabase
              .from("order_queue")
              .select("*", { count: "exact", head: true })
              .eq("order_id", order.id);

            const position = (count || 0) + 1;

            // Maksimum 3 ta o'chert
            if (position > 3) {
              await callTelegram("answerCallbackQuery", {
                callback_query_id: callbackQuery.id,
                text: "❌ O'chert to'lgan! Maksimum 3 ta haydovchi navbatga turishi mumkin.",
                show_alert: true,
              });
            } else {
              await supabase.from("order_queue").insert({
                order_id: order.id,
                driver_telegram_id: driverId,
                queue_position: position,
              });

              // Barcha navbatdagilarni olish
              const { data: allQueue } = await supabase
                .from("order_queue")
                .select("*")
                .eq("order_id", order.id)
                .order("queue_position", { ascending: true });

              // Xabar textini yangilash - navbatni ko'rsatish
              const originalText = callbackQuery.message?.text?.split("\n\n📋")[0] || callbackQuery.message?.text || "";
              let queueText = "\n\n📋 Navbat:";
              
              for (const q of allQueue || []) {
                const isCurrentTurn = q.queue_position === 1 && q.status === "notified";
                const statusIcon = isCurrentTurn ? "🔔" : (q.status === "waiting" ? "⏳" : "");
                // Get driver info
                const { data: driverInfo } = await supabase
                  .from("bot_users")
                  .select("username, full_name")
                  .eq("telegram_id", q.driver_telegram_id)
                  .single();
                const driverName = driverInfo?.username ? `@${driverInfo.username}` : driverInfo?.full_name || "Haydovchi";
                queueText += `\n${q.queue_position}. ${driverName} ${statusIcon}`;
              }

              const newText = `${originalText}${queueText}`;

              // Tugmani o'chirish agar 3 ta bo'lsa
              const replyMarkup = position < 3 
                ? { inline_keyboard: [[{ text: "🙋 Men gaplashib ko'ray", callback_data: callbackData }]] }
                : { inline_keyboard: [] };

              await callTelegram("editMessageText", {
                chat_id: chatId,
                message_id: messageId,
                text: newText,
                reply_markup: replyMarkup,
              });

              // 1-o'chertga darhol yuborish
              if (position === 1) {
                await sendToDriver(order, driverId);
              }

              await callTelegram("answerCallbackQuery", {
                callback_query_id: callbackQuery.id,
                text: `Siz ${position}-o'chertda turibsiz!`,
              });
            }
          }
        }
      } else if (callbackData.startsWith("accept_")) {
        const orderId = callbackData.replace("accept_", "");
        
        await supabase.from("orders").update({ status: "accepted", accepted_by_telegram_id: driverId }).eq("id", orderId);
        await supabase.from("order_queue").update({ status: "accepted" }).eq("order_id", orderId).eq("driver_telegram_id", driverId);

        await callTelegram("editMessageText", {
          chat_id: driverId,
          message_id: messageId,
          text: callbackQuery.message?.text + "\n\n✅ Qabul qilindi!",
        });

        await callTelegram("answerCallbackQuery", {
          callback_query_id: callbackQuery.id,
          text: "Buyurtma qabul qilindi!",
        });
      } else if (callbackData.startsWith("cancel_")) {
        const orderId = callbackData.replace("cancel_", "");

        // Haydovchi rad qildi
        await supabase.from("order_queue").update({ status: "cancelled" }).eq("order_id", orderId).eq("driver_telegram_id", driverId);

        // Xabarni o'chirish
        await callTelegram("deleteMessage", { chat_id: driverId, message_id: messageId });

        // Keyingi navbatdagiga yuborish
        const { data: nextDriver } = await supabase
          .from("order_queue")
          .select("*")
          .eq("order_id", orderId)
          .eq("status", "waiting")
          .order("queue_position", { ascending: true })
          .limit(1)
          .single();

        if (nextDriver) {
          const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).single();
          if (order) {
            await sendToDriver(order, nextDriver.driver_telegram_id);
            
            // Guruhdagi xabarni yangilash - kim navbatda ekanini ko'rsatish
            await updateGroupMessageQueue(order);
          }
        } else {
          // Hech kim qolmadi - grupaga to'liq ma'lumot bilan qaytarish (tugmasiz)
          const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).single();
          if (order) {
            // Eski navbatni tozalash
            await supabase.from("order_queue").delete().eq("order_id", orderId);
            
            // Mijoz ma'lumotlarini olish
            const { data: customer } = await supabase
              .from("bot_users")
              .select("*")
              .eq("telegram_id", order.telegram_id)
              .single();
            
            const typeEmoji = order.order_type === "taxi" ? "🚕" : "📦";
            const customerInfo = customer?.phone_number 
              ? `📞 Telefon: ${customer.phone_number}\n👤 Ism: ${customer.full_name || "Noma'lum"}` 
              : `👤 ${customer?.full_name || "Noma'lum"}`;
            
            // To'liq ma'lumot bilan, tugmasiz yuborish
            await callTelegram("sendMessage", {
              chat_id: DRIVERS_GROUP_ID,
              text: `⚠️ ${typeEmoji} Buyurtma qaytarildi!\n\n3 ta haydovchi ham qabul qilmadi\n\n📍 ${order.message_text}\n\n${customerInfo}`,
            });
            
            // Buyurtma statusini yangilash
            await supabase.from("orders").update({ status: "rejected" }).eq("id", orderId);
          }
        }

        await callTelegram("answerCallbackQuery", {
          callback_query_id: callbackQuery.id,
          text: "Bekor qilindi",
        });
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Oddiy xabar
    const message = update.message;
    if (!message) {
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const chatId = message.chat.id;
    const text = message.text || "";
    const telegramUser = message.from;
    const chatType = message.chat.type;

    // Guruhda oddiy xabarlarni e'tiborsiz qoldirish (faqat private chatda javob berish)
    if (chatType === "group" || chatType === "supergroup") {
      // Guruhda faqat inline button callback'larga javob beramiz (yuqorida)
      // Oddiy text xabarlarni e'tiborsiz qoldiramiz
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Kontakt yuborilganda
    if (message.contact) {
      const phone = message.contact.phone_number;
      await supabase
        .from("bot_users")
        .update({ phone_number: phone })
        .eq("telegram_id", telegramUser.id);

      const user = await getOrCreateUser(telegramUser);
      await sendMainMenu(chatId, user.full_name || telegramUser.first_name);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Foydalanuvchini olish
    const user = await getOrCreateUser(telegramUser);

    // Bloklangan foydalanuvchi
    if (user.is_blocked) {
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: "⛔ Siz bloklangansiz. Admin bilan bog'laning: @Sherzod_2086",
      });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Komandalar
    if (text === "/start") {
      if (user.is_admin) {
        await showAdminMenu(chatId);
      } else if (!user.phone_number) {
        await askForPhone(chatId);
      } else {
        await sendMainMenu(chatId, user.full_name || telegramUser.first_name);
      }
    } else if (text === "/aloqa") {
      const contactText = await getText("contact_admin");
      await callTelegram("sendMessage", { chat_id: chatId, text: contactText });
    } else if (text === "/malumot") {
      const infoText = await getText("bot_info");
      await callTelegram("sendMessage", { chat_id: chatId, text: infoText });
    } else if (text === "🚕 Taxi zakaz qilish") {
      await setUserState(telegramUser.id, "waiting_taxi_order");
      const taxiText = await getText("taxi_order");
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: taxiText,
        reply_markup: {
          keyboard: [[{ text: "🔙 Orqaga" }]],
          resize_keyboard: true,
        },
      });
    } else if (text === "📦 Pochta yuborish") {
      await setUserState(telegramUser.id, "waiting_parcel_order");
      const parcelText = await getText("parcel_order");
      await callTelegram("sendMessage", {
        chat_id: chatId,
        text: parcelText,
        reply_markup: {
          keyboard: [[{ text: "🔙 Orqaga" }]],
          resize_keyboard: true,
        },
      });
    } else if (text === "🚖 Haydovchi Bo'lish") {
      const driverEnabled = await getSetting("driver_registration_enabled");
      if (driverEnabled === "true") {
        await showDriverMenu(chatId);
      } else {
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: "⚠️ Haydovchi ro'yxatdan o'tish hozircha yopiq.",
        });
        await sendMainMenu(chatId, user.full_name || telegramUser.first_name);
      }
    } else if (text === "ℹ️ VIP haqida" || text === "⭐ VIPga qo'shilish") {
      const vipText = await getText("vip_info");
      await callTelegram("sendMessage", { chat_id: chatId, text: vipText });
    } else if (text === "🔙 Orqaga" || text === "🔙 Asosiy menyu") {
      await setUserState(telegramUser.id, "");
      if (user.is_admin) {
        await sendMainMenu(chatId, user.full_name || telegramUser.first_name);
      } else {
        await sendMainMenu(chatId, user.full_name || telegramUser.first_name);
      }
    }
    // Admin komandalar
    else if (user.is_admin) {
      const currentState = await getUserState(telegramUser.id);
      
      if (text === "🚖❌ Haydovchi Bo'lishni O'chirish") {
        await supabase
          .from("bot_settings")
          .update({ setting_value: "false" })
          .eq("setting_key", "driver_registration_enabled");
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: "✅ Haydovchi bo'lish o'chirildi!",
        });
        await showAdminMenu(chatId);
      } else if (text === "🚖✅ Haydovchi Bo'lishni Yoqish") {
        await supabase
          .from("bot_settings")
          .update({ setting_value: "true" })
          .eq("setting_key", "driver_registration_enabled");
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: "✅ Haydovchi bo'lish yoqildi!",
        });
        await showAdminMenu(chatId);
      } else if (text === "➕ Guruh qo'shish") {
        await setUserState(telegramUser.id, "waiting_group_id");
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: "Guruh ID sini yuboring (masalan: -1001234567890):",
          reply_markup: {
            keyboard: [[{ text: "🔙 Orqaga" }]],
            resize_keyboard: true,
          },
        });
      } else if (text === "➕ Kalit so'zlar") {
        await setUserState(telegramUser.id, "waiting_keywords");
        const { data: keywords } = await supabase.from("keywords").select("keyword");
        const currentKeywords = keywords?.map((k) => k.keyword).join(", ") || "Yo'q";
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `Mavjud kalit so'zlar: ${currentKeywords}\n\nYangi kalit so'zlarni vergul bilan yuboring:`,
          reply_markup: {
            keyboard: [[{ text: "🔙 Orqaga" }]],
            resize_keyboard: true,
          },
        });
      } else if (text === "👥 Foydalanuvchilar") {
        const { count } = await supabase.from("bot_users").select("*", { count: "exact", head: true });
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `👥 Jami foydalanuvchilar: ${count || 0}`,
        });
      } else if (text === "🚫 Foydalanuvchini bloklash") {
        await setUserState(telegramUser.id, "waiting_block_phone");
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: "Qaysi telefon raqamni bloklaysiz? (masalan: +998901234567):",
          reply_markup: {
            keyboard: [[{ text: "🔙 Orqaga" }]],
            resize_keyboard: true,
          },
        });
      } else if (text === "➕ Admin qo'shish") {
        await setUserState(telegramUser.id, "waiting_admin_id");
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: "Admin qo'shish uchun Telegram ID yuboring:",
          reply_markup: {
            keyboard: [[{ text: "🔙 Orqaga" }]],
            resize_keyboard: true,
          },
        });
      } else if (text === "📝 Textlarni tahrirlash") {
        const { data: texts } = await supabase.from("bot_texts").select("text_key");
        const textList = texts?.map((t, i) => `${i + 1}. ${t.text_key}`).join("\n") || "";
        await setUserState(telegramUser.id, "waiting_text_key");
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `Qaysi textni tahrirlamoqchisiz?\n\n${textList}\n\nText nomini yozing:`,
          reply_markup: {
            keyboard: [[{ text: "🔙 Orqaga" }]],
            resize_keyboard: true,
          },
        });
      }
      // Admin state handlers
      else if (currentState === "waiting_group_id") {
        const groupId = parseInt(text);
        if (!isNaN(groupId)) {
          await supabase.from("watched_groups").upsert({ group_id: groupId });
          await callTelegram("sendMessage", { chat_id: chatId, text: "✅ Guruh qo'shildi!" });
        } else {
          await callTelegram("sendMessage", { chat_id: chatId, text: "❌ Noto'g'ri ID!" });
        }
        await setUserState(telegramUser.id, "");
        await showAdminMenu(chatId);
      } else if (currentState === "waiting_keywords") {
        const keywords = text.split(",").map((k: string) => k.trim()).filter((k: string) => k);
        for (const keyword of keywords) {
          await supabase.from("keywords").upsert({ keyword });
        }
        await callTelegram("sendMessage", { chat_id: chatId, text: `✅ ${keywords.length} ta kalit so'z qo'shildi!` });
        await setUserState(telegramUser.id, "");
        await showAdminMenu(chatId);
      } else if (currentState === "waiting_block_phone") {
        await supabase.from("bot_users").update({ is_blocked: true }).ilike("phone_number", `%${text.replace(/\D/g, "")}%`);
        await callTelegram("sendMessage", { chat_id: chatId, text: "✅ Foydalanuvchi bloklandi!" });
        await setUserState(telegramUser.id, "");
        await showAdminMenu(chatId);
      } else if (currentState === "waiting_admin_id") {
        const adminId = parseInt(text);
        if (!isNaN(adminId)) {
          await supabase.from("bot_users").update({ is_admin: true }).eq("telegram_id", adminId);
          await callTelegram("sendMessage", { chat_id: chatId, text: "✅ Admin qo'shildi!" });
        } else {
          await callTelegram("sendMessage", { chat_id: chatId, text: "❌ Noto'g'ri ID!" });
        }
        await setUserState(telegramUser.id, "");
        await showAdminMenu(chatId);
      } else if (currentState === "waiting_text_key") {
        await setUserState(telegramUser.id, `editing_text_${text}`);
        const { data: textData } = await supabase.from("bot_texts").select("text_value").eq("text_key", text).single();
        await callTelegram("sendMessage", {
          chat_id: chatId,
          text: `Hozirgi text:\n\n${textData?.text_value || "Topilmadi"}\n\nYangi textni yozing:`,
        });
      } else if (currentState?.startsWith("editing_text_")) {
        const textKey = currentState.replace("editing_text_", "");
        await supabase.from("bot_texts").update({ text_value: text }).eq("text_key", textKey);
        await callTelegram("sendMessage", { chat_id: chatId, text: "✅ Text yangilandi!" });
        await setUserState(telegramUser.id, "");
        await showAdminMenu(chatId);
      }
    }
    // Buyurtma yozish
    else {
      const currentState = await getUserState(telegramUser.id);
      
      if (currentState === "waiting_taxi_order") {
        await sendOrderToGroup(user, text, "taxi");
        const sentText = await getText("order_sent");
        await callTelegram("sendMessage", { chat_id: chatId, text: sentText });
        await setUserState(telegramUser.id, "");
        await sendMainMenu(chatId, user.full_name || telegramUser.first_name);
      } else if (currentState === "waiting_parcel_order") {
        await sendOrderToGroup(user, text, "parcel");
        const sentText = await getText("order_sent");
        await callTelegram("sendMessage", { chat_id: chatId, text: sentText });
        await setUserState(telegramUser.id, "");
        await sendMainMenu(chatId, user.full_name || telegramUser.first_name);
      } else {
        // Noma'lum xabar - asosiy menyu yuborish
        await sendMainMenu(chatId, user.full_name || telegramUser.first_name);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Haydovchiga to'liq ma'lumot yuborish
async function sendToDriver(order: any, driverTelegramId: number) {
  const { data: user } = await supabase
    .from("bot_users")
    .select("*")
    .eq("telegram_id", order.telegram_id)
    .single();

  const fullMessage = `🚕 Sizga buyurtma keldi!\n\n📍 ${order.message_text}\n\n📞 Telefon: ${user?.phone_number || "Yo'q"}\n👤 Ism: ${user?.full_name || "Noma'lum"}`;

  const result = await callTelegram("sendMessage", {
    chat_id: driverTelegramId,
    text: fullMessage,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "❌ Bekor qilish", callback_data: `cancel_${order.id}` },
          { text: "✅ Qabul qilish", callback_data: `accept_${order.id}` },
        ],
      ],
    },
  });

  if (result.ok) {
    await supabase
      .from("order_queue")
      .update({ status: "notified", driver_message_id: result.result.message_id })
      .eq("order_id", order.id)
      .eq("driver_telegram_id", driverTelegramId);
  }
}

// Guruhdagi xabarni navbat holati bilan yangilash
async function updateGroupMessageQueue(order: any) {
  const { data: allQueue } = await supabase
    .from("order_queue")
    .select("*")
    .eq("order_id", order.id)
    .order("queue_position", { ascending: true });

  let queueText = "\n\n📋 Navbat:";
  
  for (const q of allQueue || []) {
    const isCurrentTurn = q.status === "notified";
    const isCancelled = q.status === "cancelled";
    const statusIcon = isCurrentTurn ? "🔔 (navbati)" : (isCancelled ? "❌" : "⏳");
    
    const { data: driverInfo } = await supabase
      .from("bot_users")
      .select("username, full_name")
      .eq("telegram_id", q.driver_telegram_id)
      .single();
    const driverName = driverInfo?.username ? `@${driverInfo.username}` : driverInfo?.full_name || "Haydovchi";
    queueText += `\n${q.queue_position}. ${driverName} ${statusIcon}`;
  }

  const typeEmoji = order.order_type === "taxi" ? "🚕" : "📦";
  const baseText = `${typeEmoji} Yangi ${order.order_type === "taxi" ? "Taxi zakaz" : "Pochta"}\n\n${hidePhoneNumber(order.message_text)}`;

  // Agar hamma cancelled bo'lsa, tugmani ko'rsatmaslik
  const activeQueue = (allQueue || []).filter(q => q.status !== "cancelled");
  const replyMarkup = activeQueue.length > 0 && activeQueue.length < 3
    ? { inline_keyboard: [[{ text: "🙋 Men gaplashib ko'ray", callback_data: `claim_${order.order_type}` }]] }
    : { inline_keyboard: [] };

  await callTelegram("editMessageText", {
    chat_id: DRIVERS_GROUP_ID,
    message_id: order.group_message_id,
    text: baseText + queueText,
    reply_markup: replyMarkup,
  });
}
