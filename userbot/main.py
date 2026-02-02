"""Telegram UserBot - Multi-Account Parallel Monitoring

Muhim:
- Endi raqamlar ro'yxati asosan bazadan olinadi (userbot_accounts).
- .env dagi PHONE_NUMBER faqat fallback sifatida ishlatiladi.
- DRIVERS_GROUP_ID hech qachon kuzatilmaydi (loop oldini olish).
"""

import os
import sys
import asyncio
import aiohttp
import time
from dotenv import load_dotenv
from pyrogram import Client, filters
from pyrogram.types import Message
from pyrogram.enums import ChatType
from supabase import create_client, Client as SupabaseClient

load_dotenv()

# Environment variables
API_ID = os.getenv("TELEGRAM_API_ID")
API_HASH = os.getenv("TELEGRAM_API_HASH")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
DRIVERS_GROUP_ID = int(os.getenv("DRIVERS_GROUP_ID", "-1003784903860"))
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

# Parse multiple phone numbers from env (fallback)
PHONE_NUMBERS_RAW = os.getenv("PHONE_NUMBER", "")
PHONE_NUMBERS_ENV_FALLBACK = [p.strip().strip('"').strip("'") for p in PHONE_NUMBERS_RAW.split(",") if p.strip()]

# Supabase client
supabase: SupabaseClient = None

# Cache for keywords
keywords_cache = []
keywords_map = {}  # keyword -> id mapping
last_cache_update = 0
CACHE_TTL = 300  # 5 minutes

# Per-account stats
account_stats = {}  # phone -> {"groups_count": N, "active_count": N}

# Running tasks by phone
running_clients = {}  # phone -> asyncio.Task

# ===== DUPLIKAT OLDINI OLISH =====
# message_id + group_id -> timestamp (5 daqiqa ichida duplikat tekshirish)
processed_messages = {}
DUPLICATE_TTL = 300  # 5 daqiqa
duplicate_lock = asyncio.Lock()


def normalize_chat_id(chat_id: int) -> int:
    """Telegram chat id'ni bir xil formatda solishtirish uchun normalizatsiya."""
    try:
        return int(chat_id)
    except Exception:
        return chat_id


def init_supabase():
    """Supabase clientni yaratish"""
    global supabase
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase ulandi")
        return True
    except Exception as e:
        print(f"❌ Supabase ulanishda xato: {e}")
        return False


def _normalize_phone(p: str) -> str:
    return (p or "").strip().replace(" ", "")


def fetch_phone_numbers_from_db() -> list:
    """Bazadan telefon raqamlarni olish (pending/active/error/connecting).

    Eslatma: bu yerda service key ishlatilgani uchun RLS cheklov emas.
    """
    global supabase
    if not supabase:
        return []

    try:
        res = supabase.table("userbot_accounts").select("phone_number,status").execute()
        phones = []
        for row in (res.data or []):
            status = (row.get("status") or "").lower()
            phone = _normalize_phone(row.get("phone_number"))
            if not phone:
                continue
            if status in ["pending", "active", "error", "connecting"]:
                phones.append(phone)
        # uniq, stable order
        seen = set()
        uniq = []
        for p in phones:
            if p not in seen:
                seen.add(p)
                uniq.append(p)
        return uniq
    except Exception as e:
        print(f"⚠️ Bazadan raqamlarni olishda xato: {e}")
        return []


async def ensure_accounts_seeded_from_env():
    """Agar bazada umuman akkaunt bo'lmasa, .env fallback raqamlarini bazaga yozib qo'yamiz."""
    global supabase
    if not supabase:
        return
    if not PHONE_NUMBERS_ENV_FALLBACK:
        return

    try:
        existing = supabase.table("userbot_accounts").select("id", count="exact").execute()
        count = getattr(existing, "count", None)
        if count is None:
            count = len(existing.data or [])
        if count and count > 0:
            return

        for phone in PHONE_NUMBERS_ENV_FALLBACK:
            phone = _normalize_phone(phone)
            if not phone:
                continue
            try:
                supabase.table("userbot_accounts").upsert({
                    "phone_number": phone,
                    "status": "pending",
                    "two_fa_required": False,
                }).execute()
            except Exception:
                pass
        print(f"✅ .env fallback'dan bazaga {len(PHONE_NUMBERS_ENV_FALLBACK)} ta raqam qo'shildi")
    except Exception as e:
        print(f"⚠️ .env fallback seed'da xato: {e}")


def update_account_status(phone: str, status: str):
    """Akkaunt statusini yangilash"""
    global supabase
    if not supabase:
        return
    
    try:
        update_data = {"status": status, "updated_at": "now()"}
        supabase.table("userbot_accounts").update(update_data).eq("phone_number", phone).execute()
        print(f"📊 Status yangilandi: {phone} -> {status}")
    except Exception as e:
        print(f"⚠️ Status yangilashda xato: {e}")


async def sync_account_groups(phone: str, groups: list):
    """Akkaunt guruhlarini bazaga saqlash"""
    global supabase
    if not supabase:
        return
    
    try:
        # Avval eski yozuvlarni o'chirish
        supabase.table("account_groups").delete().eq("phone_number", phone).execute()
        
        # Yangi guruhlarni qo'shish
        for group in groups:
            try:
                supabase.table("account_groups").insert({
                    "phone_number": phone,
                    "group_id": group["group_id"],
                    "group_name": group["group_name"]
                }).execute()
            except Exception:
                pass  # Duplikat bo'lsa o'tkazib yuborish
                
    except Exception as e:
        print(f"⚠️ Guruhlarni saqlashda xato: {e}")


async def save_keyword_hit(keyword: str, group_id: int, group_name: str, phone: str, message_text: str):
    """Kalit so'z topilganini saqlash"""
    global supabase, keywords_map
    if not supabase:
        return
    
    try:
        keyword_id = keywords_map.get(keyword.lower())
        preview = message_text[:200] if message_text else ""
        
        supabase.table("keyword_hits").insert({
            "keyword_id": keyword_id,
            "group_id": group_id,
            "group_name": group_name,
            "phone_number": phone,
            "message_preview": preview
        }).execute()
    except Exception as e:
        print(f"⚠️ Statistika saqlashda xato: {e}")


async def sync_all_groups(client: Client, phone: str) -> list:
    """Barcha guruhlarni topib, Supabase ga qo'shish"""
    global supabase, account_stats
    
    if not supabase:
        return []
    
    try:
        groups_found = []
        async for dialog in client.get_dialogs():
            chat = dialog.chat
            if chat.type in [ChatType.GROUP, ChatType.SUPERGROUP]:
                groups_found.append({
                    "group_id": chat.id,
                    "group_name": chat.title or f"Guruh {chat.id}"
                })
        
        # Akkaunt guruhlarini saqlash
        await sync_account_groups(phone, groups_found)
        
        # Mavjud guruhlarni olish
        existing = supabase.table("watched_groups").select("group_id").execute()
        existing_ids = {g["group_id"] for g in existing.data}
        
        # Yangi guruhlarni qo'shish (hech biri bloklanmagan - faqat DRIVERS_GROUP_ID)
        new_groups = [g for g in groups_found if g["group_id"] not in existing_ids]
        
        for group in new_groups:
            try:
                # Faqat DRIVERS_GROUP_ID bloklanadi
                is_blocked = normalize_chat_id(group["group_id"]) == normalize_chat_id(DRIVERS_GROUP_ID)
                supabase.table("watched_groups").insert({
                    "group_id": group["group_id"],
                    "group_name": group["group_name"],
                    "is_blocked": is_blocked
                }).execute()
            except Exception as e:
                if "duplicate" not in str(e).lower():
                    pass
        
        # Faol guruhlar - faqat DRIVERS_GROUP_ID tashqari hammasi
        active_groups = [g for g in groups_found if normalize_chat_id(g["group_id"]) != normalize_chat_id(DRIVERS_GROUP_ID)]
        
        # Statistikani saqlash
        account_stats[phone] = {
            "groups_count": len(groups_found),
            "active_count": len(active_groups)
        }
        
        return groups_found
        
    except Exception as e:
        print(f"❌ [{phone}] Guruhlarni sinxronlashda xato: {e}")
        return []


async def refresh_keywords():
    """Kalit so'zlarni yangilash"""
    global keywords_cache, keywords_map, last_cache_update, supabase
    
    if not supabase:
        return
    
    try:
        result = supabase.table("keywords").select("id, keyword").execute()
        keywords_cache = [k["keyword"].lower() for k in result.data]
        keywords_map = {k["keyword"].lower(): k["id"] for k in result.data}
        last_cache_update = time.time()
        print(f"✅ Kalit so'zlar yangilandi: {len(keywords_cache)} ta")
    except Exception as e:
        print(f"❌ Kalit so'zlar yangilashda xato: {e}")


async def is_duplicate_message(group_id: int, message_id: int) -> bool:
    """Xabar allaqachon qayta ishlangan yoki yo'qligini tekshirish"""
    global processed_messages
    
    async with duplicate_lock:
        key = f"{group_id}_{message_id}"
        current_time = time.time()
        
        # Eski yozuvlarni tozalash
        expired_keys = [k for k, v in processed_messages.items() if current_time - v > DUPLICATE_TTL]
        for k in expired_keys:
            del processed_messages[k]
        
        # Tekshirish
        if key in processed_messages:
            return True
        
        # Yangi xabarni qayd qilish
        processed_messages[key] = current_time
        return False


async def send_to_drivers_group(text: str, message_link: str):
    """Haydovchilar guruhiga xabar yuborish (Bot orqali)"""
    
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": DRIVERS_GROUP_ID,
        "text": text,
        "parse_mode": "HTML",
        "reply_markup": {
            "inline_keyboard": [[{"text": "🔗 Xabarga o'tish", "url": message_link}]]
        }
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=30) as resp:
                if resp.status == 200:
                    print(f"✅ Xabar yuborildi: {message_link}")
                else:
                    error_text = await resp.text()
                    print(f"❌ Xabar yuborishda xato: {error_text}")
    except Exception as e:
        print(f"❌ Xabar yuborishda xato: {e}")


def get_message_link(message: Message) -> str:
    """Xabarga havola yaratish"""
    chat = message.chat
    msg_id = message.id
    
    if chat.username:
        return f"https://t.me/{chat.username}/{msg_id}"
    else:
        clean_id = str(chat.id).replace("-100", "")
        return f"https://t.me/c/{clean_id}/{msg_id}"


def create_message_handler(phone: str):
    """Har bir akkaunt uchun message handler yaratish"""
    
    async def handle_message(client: Client, message: Message):
        """Guruh xabarlarini qayta ishlash"""
        global last_cache_update
        
        chat_id = message.chat.id
        chat_id_normalized = normalize_chat_id(chat_id)
        group_name = getattr(message.chat, "title", None) or f"Chat {chat_id}"
        
        # ===== LOOP OLDINI OLISH =====
        
        # 1. Haydovchilar guruhidan kelgan xabarni o'tkazib yuborish
        if chat_id_normalized == normalize_chat_id(DRIVERS_GROUP_ID):
            return
        
        # 2. Outgoing xabarlarni tekshirmaslik
        if getattr(message, "outgoing", False):
            return
        
        # 3. Botlar yuborgan xabarlarni tekshirmaslik
        if message.from_user and getattr(message.from_user, "is_bot", False):
            return
        
        # ===== DUPLIKAT TEKSHIRISH =====
        # Agar boshqa akkaunt allaqachon bu xabarni qayta ishlagan bo'lsa, o'tkazib yuborish
        if await is_duplicate_message(chat_id, message.id):
            return
        
        # ===== KALIT SO'ZLARNI TEKSHIRISH =====
        current_time = time.time()
        if current_time - last_cache_update > CACHE_TTL:
            await refresh_keywords()
        
        text = message.text or message.caption or ""
        if not text:
            return
        
        lower_text = text.lower()
        matched_keyword = None
        for keyword in keywords_cache:
            if keyword in lower_text:
                matched_keyword = keyword
                break
        
        if not matched_keyword:
            return
        
        # ===== STATISTIKANI SAQLASH =====
        await save_keyword_hit(matched_keyword, chat_id, group_name, phone, text)
        
        # ===== XABARNI HAYDOVCHILARGA YUBORISH =====
        
        user_mention = ""
        if message.from_user:
            if message.from_user.username:
                user_mention = f"@{message.from_user.username}"
            else:
                user_mention = message.from_user.first_name or "Foydalanuvchi"
        else:
            user_mention = "Foydalanuvchi"
        
        message_link = get_message_link(message)
        
        forward_text = f"""🔔 <b>Guruhdan topildi!</b>

📍 <b>Guruh:</b> {group_name}
🔑 <b>Kalit so'z:</b> {matched_keyword}

{text}

👤 {user_mention}"""
        
        await send_to_drivers_group(forward_text, message_link)
        print(f"📨 [{phone}] Topildi: '{matched_keyword}' - {group_name}")
    
    return handle_message


async def run_client(phone: str):
    """Bitta akkaunt uchun client ishga tushirish"""
    
    print(f"\n📱 [{phone}] Ishga tushmoqda...")
    
    # Statusni yangilash
    update_account_status(phone, "connecting")
    
    # Pyrogram clientni yaratish
    session_name = f"userbot_session_{phone.replace('+', '').replace(' ', '')}"
    
    client = Client(
        session_name,
        api_id=API_ID,
        api_hash=API_HASH,
        phone_number=phone
    )
    
    # Handler qo'shish (har bir akkaunt uchun alohida)
    client.on_message(filters.group | filters.channel)(create_message_handler(phone))
    
    try:
        await client.start()
        print(f"✅ [{phone}] Ulandi!")
        update_account_status(phone, "active")
        
        # Guruhlarni sinxronlash
        my_groups = await sync_all_groups(client, phone)
        
        # Faqat DRIVERS_GROUP_ID tashqari hammasi faol
        active_groups = [g for g in my_groups if normalize_chat_id(g["group_id"]) != normalize_chat_id(DRIVERS_GROUP_ID)]
        
        print(f"📊 [{phone}] {len(my_groups)} ta guruh, {len(active_groups)} ta faol kuzatilmoqda")
        
        # Har sync'dan keyin statistikani print qil
        print_statistics()
        
        # Periodic sync for this client
        async def periodic_sync():
            while True:
                await asyncio.sleep(1800)  # 30 daqiqa
                if client and client.is_connected:
                    await sync_all_groups(client, phone)
        
        asyncio.create_task(periodic_sync())
        
        # Keep running
        await asyncio.Event().wait()
        
    except Exception as e:
        msg = str(e)
        print(f"❌ [{phone}] Xato: {msg}")

        # AUTH_KEY_UNREGISTERED bo'lsa - session fayl buzilgan bo'ladi.
        # Session'ni o'chirib, keyingi ishga tushirishda qayta login qilish imkonini beramiz.
        if "AUTH_KEY_UNREGISTERED" in msg:
            try:
                # pyrogram session fayllari odatda .session va .session-journal
                for suffix in [".session", ".session-journal"]:
                    path = f"{session_name}{suffix}"
                    if os.path.exists(path):
                        os.remove(path)
                        print(f"🧹 [{phone}] Session o'chirildi: {path}")
            except Exception as cleanup_err:
                print(f"⚠️ [{phone}] Session tozalashda xato: {cleanup_err}")

        update_account_status(phone, "error")
        # MUHIM: raise qilmaymiz — bitta akkaunt xatosi hammasini to'xtatmasin
        return


async def periodic_keywords_refresh():
    """Har 5 daqiqada kalit so'zlarni yangilash"""
    while True:
        await asyncio.sleep(CACHE_TTL)
        await refresh_keywords()


def print_statistics():
    """Statistikani chiqarish"""
    global account_stats
    
    print("\n" + "=" * 60)
    print("📊 USERBOT STATISTIKASI")
    print("=" * 60)
    
    # Har bir akkaunt statistikasi
    total_groups_all = 0
    total_active_all = 0
    
    print(f"\n📱 AKKAUNTLAR ({len(list(running_clients.keys()) or [])} ta):")
    print("-" * 40)
    
    for phone in list(running_clients.keys()) or PHONE_NUMBERS_ENV_FALLBACK:
        stats = account_stats.get(phone, {})
        total = stats.get("groups_count", 0)
        active = stats.get("active_count", 0)
        total_groups_all += total
        total_active_all += active
        print(f"  {phone}: {total} guruh, {active} ta faol kuzatilmoqda")
    
    print("-" * 40)
    print(f"  JAMI: {total_groups_all} guruh, {total_active_all} ta faol kuzatilmoqda")
    print(f"\n🚫 Bloklangan: Faqat DRIVERS_GROUP_ID ({DRIVERS_GROUP_ID})")
    print("=" * 60)
    print("💡 Kalit so'zlar topilganda haydovchilar guruhiga yuboriladi")
    print("=" * 60 + "\n")


async def main():
    """Asosiy funksiya - barcha akkauntlarni parallel ishga tushirish"""
    
    print("🚀 UserBot Multi-Account ishga tushmoqda...")
    
    # Supabase ni boshlash
    if not init_supabase():
        print("❌ Supabase'ga ulanib bo'lmadi. Chiqish...")
        sys.exit(1)
    
    # Agar bazada akkaunt bo'lmasa, .env fallback raqamlarini seed qilamiz
    await ensure_accounts_seeded_from_env()

    # Dastlabki raqamlarni bazadan olish
    phones = fetch_phone_numbers_from_db() or PHONE_NUMBERS_ENV_FALLBACK
    print(f"📱 Raqamlar soni: {len(phones)}")
    if not phones:
        print("❌ Bazada ham, .env fallback'da ham raqam yo'q!")
        sys.exit(1)

    for i, phone in enumerate(phones, 1):
        print(f"  {i}. {phone}")
    
    print(f"\n🚫 Bloklangan: Faqat DRIVERS_GROUP_ID ({DRIVERS_GROUP_ID})")
    
    # Kalit so'zlarni yuklash
    await refresh_keywords()
    
    # Periodic tasks - faqat kalit so'zlarni yangilash
    asyncio.create_task(periodic_keywords_refresh())
    
    async def start_phone(phone: str):
        if phone in running_clients:
            return
        running_clients[phone] = asyncio.create_task(run_client(phone))

    # Barcha akkauntlarni parallel ishga tushirish
    print("\n🔄 Akkauntlar ishga tushirilmoqda...")
    for phone in phones:
        await start_phone(phone)

    # Bazadan yangi raqamlar qo'shilsa — restart qilmasdan ishga tushirish
    async def watch_new_accounts():
        while True:
            await asyncio.sleep(30)
            latest = fetch_phone_numbers_from_db()
            for p in latest:
                await start_phone(p)

    asyncio.create_task(watch_new_accounts())

    # Client task'lar hech qachon raise qilib hammasini yiqitmasin
    await asyncio.Event().wait()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 UserBot to'xtatildi")
        for phone in list(running_clients.keys()) or PHONE_NUMBERS_ENV_FALLBACK:
            update_account_status(phone, "stopped")
    except Exception as e:
        print(f"❌ Kritik xato: {e}")
        for phone in PHONE_NUMBERS:
            update_account_status(phone, "error")
