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
PHONE_NUMBER = os.getenv("PHONE_NUMBER")

# Supabase client
supabase: SupabaseClient = None

# Cache for keywords and blocked groups
keywords_cache = []
keywords_map = {}  # keyword -> id mapping
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


def update_account_status(phone: str, status: str, groups_count: int = None):
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
                
        print(f"📊 [{phone}] {len(groups)} ta guruh saqlandi")
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


async def sync_all_groups(client: Client, phone: str):
    """Barcha guruhlarni topib, Supabase ga qo'shish"""
    global supabase
    
    if not supabase:
        return []
    
    try:
        print(f"🔍 Barcha guruhlarni qidiryapman...")
        
        groups_found = []
        async for dialog in client.get_dialogs():
            chat = dialog.chat
            if chat.type in [ChatType.GROUP, ChatType.SUPERGROUP]:
                groups_found.append({
                    "group_id": chat.id,
                    "group_name": chat.title or f"Guruh {chat.id}"
                })
        
        print(f"📊 {len(groups_found)} ta guruh topildi")
        
        # Akkaunt guruhlarini saqlash
        await sync_account_groups(phone, groups_found)
        
        # Mavjud guruhlarni olish
        existing = supabase.table("watched_groups").select("group_id").execute()
        existing_ids = {g["group_id"] for g in existing.data}
        
        # Yangi guruhlarni qo'shish (bloklanmagan holda)
        new_groups = [g for g in groups_found if g["group_id"] not in existing_ids]
        
        for group in new_groups:
            try:
                # Haydovchilar guruhini bloklash
                is_blocked = normalize_chat_id(group["group_id"]) == normalize_chat_id(DRIVERS_GROUP_ID)
                supabase.table("watched_groups").insert({
                    "group_id": group["group_id"],
                    "group_name": group["group_name"],
                    "is_blocked": is_blocked
                }).execute()
                status = "🚫 Bloklandi" if is_blocked else "➕ Qo'shildi"
                print(f"  {status}: {group['group_name']}")
            except Exception as e:
                if "duplicate" not in str(e).lower():
                    print(f"  ⚠️ Qo'shishda xato ({group['group_name']}): {e}")
        
        # Faol guruhlar sonini hisoblash
        active_result = supabase.table("watched_groups").select("id", count="exact").eq("is_blocked", False).execute()
        active_count = active_result.count if hasattr(active_result, 'count') else len(active_result.data)
        
        print(f"✅ Jami {len(groups_found)} ta guruh, {active_count} ta faol kuzatilmoqda")
        
        return groups_found
        
    except Exception as e:
        print(f"❌ Guruhlarni sinxronlashda xato: {e}")
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
        return blocked
    except Exception as e:
        print(f"❌ Bloklangan guruhlarni olishda xato: {e}")
        return {normalize_chat_id(DRIVERS_GROUP_ID)}


async def refresh_keywords():
    """Kalit so'zlarni yangilash"""
    global keywords_cache, keywords_map, last_cache_update, supabase
    
    if not supabase:
        return
    
    try:
        result = supabase.table("keywords").select("id, keyword").execute()
        keywords_cache = [k["keyword"].lower() for k in result.data]
        keywords_map = {k["keyword"].lower(): k["id"] for k in result.data}
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
        print(f"🚫 {len(blocked_groups_cache)} ta guruh bloklangan")
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


async def handle_message(client: Client, message: Message):
    """Guruh xabarlarini qayta ishlash"""
    global last_cache_update, blocked_groups_cache, last_blocked_cache_update
    
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
    
    # ===== STATISTIKANI SAQLASH =====
    await save_keyword_hit(matched_keyword, chat_id, group_name, PHONE_NUMBER, text)
    
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
    print(f"📨 Topildi: '{matched_keyword}' - {group_name}")


async def periodic_sync(client: Client, phone: str):
    """Har 30 daqiqada guruhlarni sinxronlash"""
    while True:
        await asyncio.sleep(1800)  # 30 daqiqa
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


async def main():
    """Asosiy funksiya"""
    global blocked_groups_cache, last_blocked_cache_update, PHONE_NUMBER
    
    print("🚀 UserBot ishga tushmoqda...")
    
    if not PHONE_NUMBER:
        print("❌ PHONE_NUMBER o'rnatilmagan!")
        sys.exit(1)
    
    print(f"📱 Raqam: {PHONE_NUMBER}")
    
    # Supabase ni boshlash
    if not init_supabase():
        print("❌ Supabase'ga ulanib bo'lmadi. Chiqish...")
        sys.exit(1)
    
    # Statusni yangilash
    update_account_status(PHONE_NUMBER, "connecting")
    
    # Pyrogram clientni yaratish
    session_name = f"userbot_session_{PHONE_NUMBER.replace('+', '').replace(' ', '')}"
    
    client = Client(
        session_name,
        api_id=API_ID,
        api_hash=API_HASH,
        phone_number=PHONE_NUMBER
    )
    
    # Handler qo'shish
    client.on_message(filters.group | filters.channel)(handle_message)
    
    try:
        await client.start()
        print(f"✅ UserBot tayyor! {PHONE_NUMBER} bilan ulangan")
        update_account_status(PHONE_NUMBER, "active")
        
        # Bloklangan guruhlarni yuklash
        blocked_groups_cache = await get_blocked_group_ids()
        last_blocked_cache_update = asyncio.get_event_loop().time()
        print(f"🚫 {len(blocked_groups_cache)} ta guruh bloklangan")
        
        # Guruhlarni sinxronlash
        my_groups = await sync_all_groups(client, PHONE_NUMBER)
        
        # Kalit so'zlarni yuklash
        await refresh_keywords()
        
        # Faol kuzatiladigan guruhlar (bloklangan guruhlarni chiqarib)
        active_groups = [g for g in my_groups if normalize_chat_id(g["group_id"]) not in blocked_groups_cache]
        print(f"📡 {len(active_groups)} ta guruhni kuzatish boshlandi")
        
        print("=" * 50)
        print("💡 Kalit so'zlar topilganda haydovchilar guruhiga yuboriladi")
        print("🚫 Bloklangan guruhlar va haydovchilar guruhi kuzatilmaydi")
        print("=" * 50)
        
        # Periodic tasks
        asyncio.create_task(periodic_sync(client, PHONE_NUMBER))
        asyncio.create_task(periodic_keywords_refresh())
        asyncio.create_task(periodic_blocked_refresh())
        
        # Keep running
        await asyncio.Event().wait()
        
    except Exception as e:
        print(f"❌ Xato: {e}")
        update_account_status(PHONE_NUMBER, "error")
        raise


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 UserBot to'xtatildi")
        if PHONE_NUMBER:
            update_account_status(PHONE_NUMBER, "stopped")
    except Exception as e:
        print(f"❌ Kritik xato: {e}")
        if PHONE_NUMBER:
            update_account_status(PHONE_NUMBER, "error")
