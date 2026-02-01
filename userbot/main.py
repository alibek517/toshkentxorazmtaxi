"""
Telegram UserBot - Multi-Account Parallel Monitoring
Barcha ulangan akkauntlarni bir vaqtda ishga tushiradi

Ishga tushirish:
1. .env faylini sozlang (env.example dan nusxa oling)
2. Admin paneldan raqamlarni qo'shing
3. python main.py
"""

import os
import sys
import asyncio
import aiohttp
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

# Supabase client
supabase: SupabaseClient = None

# Active clients dictionary
active_clients = {}

# Cache for keywords and blocked groups (shared between all clients)
keywords_cache = []
last_cache_update = 0
CACHE_TTL = 300  # 5 minutes
blocked_groups_cache = set()
last_blocked_cache_update = 0


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


def update_account_status(phone: str, status: str, session_string: str = None):
    """Akkaunt statusini yangilash"""
    global supabase
    if not supabase:
        return
    
    try:
        update_data = {"status": status, "updated_at": "now()"}
        if session_string:
            update_data["session_string"] = session_string
        
        supabase.table("userbot_accounts").update(update_data).eq("phone_number", phone).execute()
        print(f"📊 Status yangilandi: {phone} -> {status}")
    except Exception as e:
        print(f"⚠️ Status yangilashda xato: {e}")


def get_session_name(phone: str) -> str:
    """Telefon raqamiga asoslangan session nomi"""
    clean_phone = phone.replace("+", "").replace(" ", "")
    return f"userbot_session_{clean_phone}"


async def get_all_accounts():
    """Barcha faol akkauntlarni olish"""
    global supabase
    
    if not supabase:
        return []
    
    try:
        # Barcha akkauntlarni olish (stopped va error ham qayta urinish uchun)
        result = supabase.table("userbot_accounts").select("*").neq("status", "deleted").execute()
        return result.data
    except Exception as e:
        print(f"❌ Akkauntlarni olishda xato: {e}")
        return []


async def sync_all_groups(client: Client, phone: str):
    """Barcha guruhlarni topib, Supabase ga qo'shish"""
    global supabase
    
    if not supabase:
        return []
    
    try:
        print(f"🔍 [{phone}] Barcha guruhlarni qidiryapman...")
        
        groups_found = []
        async for dialog in client.get_dialogs():
            chat = dialog.chat
            if chat.type in [ChatType.GROUP, ChatType.SUPERGROUP]:
                groups_found.append({
                    "group_id": chat.id,
                    "group_name": chat.title or f"Guruh {chat.id}"
                })
        
        print(f"📊 [{phone}] {len(groups_found)} ta guruh topildi")
        
        # Mavjud guruhlarni olish
        existing = supabase.table("watched_groups").select("group_id, is_blocked").execute()
        existing_ids = {g["group_id"] for g in existing.data}
        
        # Yangi guruhlarni qo'shish
        new_groups = [g for g in groups_found if g["group_id"] not in existing_ids]
        
        if new_groups:
            for group in new_groups:
                try:
                    is_blocked = normalize_chat_id(group["group_id"]) == normalize_chat_id(DRIVERS_GROUP_ID)
                    supabase.table("watched_groups").insert({
                        "group_id": group["group_id"],
                        "group_name": group["group_name"],
                        "is_blocked": is_blocked
                    }).execute()
                    status = "🚫 Bloklandi" if is_blocked else "➕ Qo'shildi"
                    print(f"  [{phone}] {status}: {group['group_name']}")
                except Exception as e:
                    if "duplicate" not in str(e).lower():
                        print(f"  [{phone}] ⚠️ Qo'shishda xato ({group['group_name']}): {e}")
        
        return groups_found
        
    except Exception as e:
        print(f"❌ [{phone}] Guruhlarni sinxronlashda xato: {e}")
        return []


async def get_blocked_group_ids():
    """Bloklangan guruh ID larini olish"""
    global supabase
    
    if not supabase:
        return set()
    
    try:
        result = supabase.table("watched_groups").select("group_id").eq("is_blocked", True).execute()
        blocked = {normalize_chat_id(g["group_id"]) for g in result.data}
        # Haydovchilar guruhini har doim bloklash
        blocked.add(normalize_chat_id(DRIVERS_GROUP_ID))
        print(f"🔒 Bloklangan guruhlar: {len(blocked)} ta (ID lar: {blocked})")
        return blocked
    except Exception as e:
        print(f"❌ Bloklangan guruhlarni olishda xato: {e}")
        return {normalize_chat_id(DRIVERS_GROUP_ID)}


async def get_active_group_ids():
    """Faol (bloklanmagan) guruh ID larini olish"""
    global supabase
    
    if not supabase:
        return set()
    
    try:
        result = supabase.table("watched_groups").select("group_id, group_name").eq("is_blocked", False).execute()
        active = {normalize_chat_id(g["group_id"]) for g in result.data}
        print(f"✅ Faol guruhlar: {len(active)} ta")
        for g in result.data:
            print(f"   📍 {g['group_name']} ({g['group_id']})")
        return active
    except Exception as e:
        print(f"❌ Faol guruhlarni olishda xato: {e}")
        return set()


async def refresh_keywords():
    """Kalit so'zlarni yangilash"""
    global keywords_cache, last_cache_update, supabase
    
    if not supabase:
        return
    
    try:
        result = supabase.table("keywords").select("keyword").execute()
        keywords_cache = [k["keyword"].lower() for k in result.data]
        last_cache_update = asyncio.get_event_loop().time()
        print(f"✅ Kalit so'zlar yangilandi: {len(keywords_cache)} ta")
    except Exception as e:
        print(f"❌ Kalit so'zlar yangilashda xato: {e}")


async def refresh_blocked_groups():
    """Bloklangan guruhlar keshini yangilash"""
    global blocked_groups_cache, last_blocked_cache_update
    
    try:
        blocked_groups_cache = await get_blocked_group_ids()
        last_blocked_cache_update = asyncio.get_event_loop().time()
        print(f"✅ Bloklangan guruhlar yangilandi: {len(blocked_groups_cache)} ta")
    except Exception as e:
        print(f"❌ Bloklangan guruhlar yangilashda xato: {e}")


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
        global last_cache_update, blocked_groups_cache, last_blocked_cache_update
        
        chat_id_normalized = normalize_chat_id(message.chat.id)
        group_name = getattr(message.chat, "title", None) or f"Chat {message.chat.id}"
        
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
        
        # ===== BLOKLANGAN GURUHLARNI TEKSHIRISH =====
        
        current_time = asyncio.get_event_loop().time()
        
        # Keshni yangilash
        if current_time - last_blocked_cache_update > CACHE_TTL:
            await refresh_blocked_groups()
        
        # Bloklangan guruhlarni o'tkazib yuborish
        if chat_id_normalized in blocked_groups_cache:
            return
        
        # ===== KALIT SO'ZLARNI TEKSHIRISH =====
        
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
    """Bitta akkauntni ishga tushirish"""
    global active_clients
    
    print(f"🚀 [{phone}] Ishga tushirilmoqda...")
    update_account_status(phone, "connecting")
    
    try:
        client = Client(
            get_session_name(phone),
            api_id=API_ID,
            api_hash=API_HASH,
            phone_number=phone
        )
        
        # Message handler qo'shish
        handler = create_message_handler(phone)
        client.on_message(filters.group | filters.channel)(handler)
        
        await client.start()
        print(f"✅ [{phone}] Ulandi!")
        
        active_clients[phone] = client
        update_account_status(phone, "active")
        
        # Guruhlarni sinxronlash
        await sync_all_groups(client, phone)
        
        # Client ishlashda qolsin
        return client
        
    except Exception as e:
        print(f"❌ [{phone}] Xato: {e}")
        update_account_status(phone, "error")
        return None


async def periodic_sync():
    """Har 30 daqiqada guruhlarni sinxronlash"""
    global active_clients
    
    while True:
        await asyncio.sleep(1800)  # 30 daqiqa
        for phone, client in active_clients.items():
            if client and client.is_connected:
                await sync_all_groups(client, phone)


async def periodic_keywords_refresh():
    """Har 5 daqiqada kalit so'zlarni yangilash"""
    while True:
        await asyncio.sleep(CACHE_TTL)
        await refresh_keywords()


async def periodic_blocked_refresh():
    """Har 2 daqiqada bloklangan guruhlarni yangilash"""
    while True:
        await asyncio.sleep(120)
        await refresh_blocked_groups()


async def check_new_accounts():
    """Har 1 daqiqada yangi qo'shilgan akkauntlarni tekshirish"""
    global active_clients
    
    while True:
        await asyncio.sleep(60)  # 1 daqiqa
        
        try:
            accounts = await get_all_accounts()
            for account in accounts:
                phone = account["phone_number"]
                if phone not in active_clients:
                    print(f"🆕 Yangi akkaunt topildi: {phone}")
                    client = await run_client(phone)
                    if client:
                        print(f"✅ [{phone}] Yangi akkaunt qo'shildi!")
        except Exception as e:
            print(f"⚠️ Yangi akkauntlarni tekshirishda xato: {e}")


async def main():
    """Asosiy funksiya - Barcha akkauntlarni parallel ishga tushirish"""
    global blocked_groups_cache, last_blocked_cache_update
    
    print("=" * 60)
    print("🚀 MULTI-ACCOUNT USERBOT ISHGA TUSHMOQDA")
    print("=" * 60)
    
    # Supabase ni boshlash
    if not init_supabase():
        print("❌ Supabase'ga ulanib bo'lmadi. Chiqish...")
        sys.exit(1)
    
    # Bloklangan va faol guruhlarni yuklash
    blocked_groups_cache = await get_blocked_group_ids()
    last_blocked_cache_update = asyncio.get_event_loop().time()
    
    # Faol guruhlarni ham ko'rsatish
    await get_active_group_ids()
    
    # Kalit so'zlarni yuklash
    await refresh_keywords()
    
    # Barcha akkauntlarni olish
    accounts = await get_all_accounts()
    
    if not accounts:
        print("⚠️ Hech qanday akkaunt topilmadi!")
        print("📱 Admin paneldan raqam qo'shing va qayta ishga tushiring")
        print("🔄 Yangi akkauntlar avtomatik qo'shiladi...")
    else:
        print(f"📱 {len(accounts)} ta akkaunt topildi")
        
        # Barcha akkauntlarni parallel ishga tushirish
        tasks = [run_client(acc["phone_number"]) for acc in accounts]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Muvaffaqiyatli ulanganlarni sanash
        connected = sum(1 for r in results if r and not isinstance(r, Exception))
        print(f"✅ {connected}/{len(accounts)} ta akkaunt ulandi")
    
    print("=" * 60)
    print("💡 Kalit so'zlar topilganda haydovchilar guruhiga yuboriladi")
    print("🚫 Bloklangan guruhlar kuzatilmaydi")
    print("🔄 Yangi akkauntlar avtomatik qo'shiladi (har 1 daqiqada)")
    print("=" * 60)
    
    # Periodic tasks
    asyncio.create_task(periodic_sync())
    asyncio.create_task(periodic_keywords_refresh())
    asyncio.create_task(periodic_blocked_refresh())
    asyncio.create_task(check_new_accounts())
    
    # Keep running
    await asyncio.Event().wait()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 UserBot to'xtatildi")
        for phone in active_clients:
            update_account_status(phone, "stopped")
    except Exception as e:
        print(f"❌ Kritik xato: {e}")
        for phone in active_clients:
            update_account_status(phone, "error")
