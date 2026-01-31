-- Foydalanuvchilar jadvali
CREATE TABLE public.bot_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  phone_number TEXT,
  full_name TEXT,
  username TEXT,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Buyurtmalar jadvali
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  order_type TEXT NOT NULL, -- 'taxi' yoki 'parcel'
  message_text TEXT NOT NULL,
  group_message_id BIGINT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, cancelled
  accepted_by_telegram_id BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Navbat jadvali (ochert)
CREATE TABLE public.order_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_telegram_id BIGINT NOT NULL,
  queue_position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting, notified, accepted, cancelled
  driver_message_id BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(order_id, driver_telegram_id)
);

-- Kalit so'zlar jadvali
CREATE TABLE public.keywords (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Kuzatiladigan guruhlar
CREATE TABLE public.watched_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id BIGINT NOT NULL UNIQUE,
  group_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Bot textlari (admin o'zgartirishi uchun)
CREATE TABLE public.bot_texts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  text_key TEXT NOT NULL UNIQUE,
  text_value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Default textlarni qo'shish
INSERT INTO public.bot_texts (text_key, text_value) VALUES
  ('welcome_phone', '📲 Botdan ro''yxatdan o''tish uchun quyidagi tugma orqali telefon raqamingizni yuboring:'),
  ('main_menu', 'Assalomu alaykum, {fullname}! Quyidagi menyulardan birini tanlang.\nIshonchli haydovchilarimiz sizni kutmoqda 🚕'),
  ('taxi_order', '📍 Qaysi yo''nalishda yo''lga chiqmoqchisiz?\n\nIltimos, manzilingizni yozing.\n\n🔹 Namuna: Toshkent → Xorazm (Toshkentdan Buxoroga)'),
  ('order_sent', '✅ Zakazingiz haydovchilar guruhiga yuborildi!\n\nTez orada haydovchi siz bilan bog''lanadi.'),
  ('driver_menu', 'Quyidagilardan birini tanlang⤵️'),
  ('vip_info', '✅👇 Quyidagi anketani to''ldirib yuboring\n\n👋 Assalomu alaykum!\nSiz Toshkent ↔️ Xorazm (Nukus, Urganch, Xiva va boshqa yo''nalishlar) bo''yicha faol ishlaydigan\neng yirik VIP haydovchilar guruhiga a''zo bo''lishingiz mumkin.\n\n⚠️ Guruhimizga faqat haydovchilar qabul qilinadi.\n\n🎯 Guruhimizda ishlashning afzalliklari:\n✅ Doimiy yo''lovchilar oqimi\n✅ Odam kutib "petak"da turish shart emas\n✅ Maxsus botlar orqali yo''lovchilar bevosita sizga tushadi\n✅ Elonsiz, oson va tez ishlash imkoniyati\n\n🌍 Guruhimiz qidiruv tizimlarida yuqori o''rinda turadi,\nshuning uchun mijozlar birinchi bo''lib bizga murojaat qiladi.\n\n\n💰 Guruhda ishlash uchun oylik to''lov: 100 000 so''m\n\n💳 Karta: 5440 8103 1750 8850\n📩 To''lov chekini: @Sherzod_2086 ga yuboring'),
  ('parcel_order', '📝 Pochta haqida qisqacha malumot bering:\n\nMasalan Тошкентдан - Самаркандга Битта сумкада кийимлар бор, Велосипедни олиб кетиш керак, Илтимос фақат томида багажи борлар алоқага чиқсин'),
  ('contact_admin', '👨‍💼 Admin bilan bog''lanish\n\nAgar bot ishlashi bo''yicha savollar, takliflar yoki muammolar bo''lsa, admin bilan bog''laning.\n\n📲 Telegram: @Sherzod_2086\n📞 Telefon: +998 97 500 20 86\n⏰ Ish vaqti: 24/7\n\nXabaringiz tez orada ko''rib chiqiladi.'),
  ('bot_info', '🚕 Toshkent Xorazm Taxi bot\n\nUshbu bot Toshkent ↔️ Xorazm yo''nalishida yo''lovchilar va haydovchilarni tez va qulay bog''lash uchun yaratilgan.\n\nBot imkoniyatlari:\n✅ Toshkent – Xorazm yo''nalishida taksi topish\n✅ Yo''lovchi va haydovchi uchun alohida bo''limlar\n✅ Tez va oson buyurtma berish\n✅ Bevosita aloqa va kelishuv\n\nBotdan foydalanish mutlaqo bepul.\nXizmat sifatini oshirish maqsadida bot doimiy ravishda yangilanib boriladi.\n\n📍 Yo''nalishlar:\nToshkent – Urganch – Beruniy – To''rtko''l – Gurlan – Yangi Bozor – Shovot'),
  ('admin_welcome', '🎛 Admin Dashboard\n\nXush kelibsiz! Siz admin sifatida kiritilgansiz.');

-- Admin user qo'shish (7748145808)
INSERT INTO public.bot_users (telegram_id, full_name, is_admin) VALUES (7748145808, 'Admin', true)
ON CONFLICT (telegram_id) DO UPDATE SET is_admin = true;

-- Enable RLS
ALTER TABLE public.bot_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watched_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_texts ENABLE ROW LEVEL SECURITY;

-- Public select for edge functions (service role will bypass RLS)
CREATE POLICY "Service role full access bot_users" ON public.bot_users FOR ALL USING (true);
CREATE POLICY "Service role full access orders" ON public.orders FOR ALL USING (true);
CREATE POLICY "Service role full access order_queue" ON public.order_queue FOR ALL USING (true);
CREATE POLICY "Service role full access keywords" ON public.keywords FOR ALL USING (true);
CREATE POLICY "Service role full access watched_groups" ON public.watched_groups FOR ALL USING (true);
CREATE POLICY "Service role full access bot_texts" ON public.bot_texts FOR ALL USING (true);