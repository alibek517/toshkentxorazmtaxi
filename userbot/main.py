"""
Telegram UserBot - Guruhlarni monitoring qilish
Barcha guruhlarni avtomatik topib, kuzatuvga qo'shadi

Sozlash:
1. .env faylini yarating (env.example dan nusxa oling)
2. pip install -r requirements.txt
3. python main.py
"""

import os
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
PHONE_NUMBER = os.getenv("PHONE_NUMBER")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
DRIVERS_GROUP_ID = int(os.getenv("DRIVERS_GROUP_ID", "-1003784903860"))
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

# Supabase client
supabase: SupabaseClient = None

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

# Pyrogram client - UserBot
app = Client(
    "userbot_session",
    api_id=API_ID,
    api_hash=API_HASH,
    phone_number=PHONE_NUMBER
)

# Cache for keywords
keywords_cache = []
last_cache_update = 0
CACHE_TTL = 300  # 5 minutes


async def sync_all_groups():
    """Barcha guruhlarni topib, Supabase ga qo'shish"""
    global supabase
    
    if not supabase:
        if not init_supabase():
            return
    
    try:
        print("🔍 Barcha guruhlarni qidiryapman...")
        
        groups_found = []
        async for dialog in app.get_dialogs():
            chat = dialog.chat
            # Faqat guruh va superguruhlarni olish
            if chat.type in [ChatType.GROUP, ChatType.SUPERGROUP]:
                groups_found.append({
                    "group_id": chat.id,
                    "group_name": chat.title or f"Guruh {chat.id}"
                })
        
        print(f"📊 {len(groups_found)} ta guruh topildi")
        
        # Mavjud guruhlarni olish (bloklangan va bloklanmaganlar)
        existing = supabase.table("watched_groups").select("group_id, is_blocked").execute()
        existing_ids = {g["group_id"] for g in existing.data}
        
        # Yangi guruhlarni qo'shish (haydovchilar guruhini avtomatik bloklash)
        new_groups = [g for g in groups_found if g["group_id"] not in existing_ids]
        
        if new_groups:
            for group in new_groups:
                try:
                    # Haydovchilar guruhini avtomatik bloklash
                    is_blocked = group["group_id"] == DRIVERS_GROUP_ID
                    supabase.table("watched_groups").insert({
                        "group_id": group["group_id"],
                        "group_name": group["group_name"],
                        "is_blocked": is_blocked
                    }).execute()
                    status = "🚫 Bloklandi" if is_blocked else "➕ Qo'shildi"
                    print(f"  {status}: {group['group_name']}")
                except Exception as e:
                    print(f"  ⚠️ Qo'shishda xato ({group['group_name']}): {e}")
        
        # Faol guruhlar sonini hisoblash
        active_groups = [g for g in existing.data if not g.get("is_blocked", False)]
        print(f"✅ Jami {len(groups_found)} ta guruh, {len(active_groups)} ta faol kuzatilmoqda")
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
        return {g["group_id"] for g in result.data}
    except Exception as e:
        print(f"❌ Bloklangan guruhlarni olishda xato: {e}")
        return set()


# Cache for blocked groups
blocked_groups_cache = set()
last_blocked_cache_update = 0


async def refresh_keywords():
    """Kalit so'zlarni yangilash"""
    global keywords_cache, last_cache_update, supabase
    
    if not supabase:
        if not init_supabase():
            return
    
    try:
        result = supabase.table("keywords").select("keyword").execute()
        keywords_cache = [k["keyword"].lower() for k in result.data]
        last_cache_update = asyncio.get_event_loop().time()
        print(f"✅ Kalit so'zlar yangilandi: {len(keywords_cache)} ta")
    except Exception as e:
        print(f"❌ Kalit so'zlar yangilashda xato: {e}")


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
        # Private group/channel
        clean_id = str(chat.id).replace("-100", "")
        return f"https://t.me/c/{clean_id}/{msg_id}"


@app.on_message(filters.group | filters.channel)
async def handle_message(client: Client, message: Message):
    """Guruh xabarlarini qayta ishlash"""
    global last_cache_update, blocked_groups_cache, last_blocked_cache_update
    
    # Bloklangan guruhlarni tekshirish
    current_time = asyncio.get_event_loop().time()
    if current_time - last_blocked_cache_update > CACHE_TTL:
        blocked_groups_cache = await get_blocked_group_ids()
        last_blocked_cache_update = current_time
    
    # Agar guruh bloklangan bo'lsa, o'tkazib yuborish
    if message.chat.id in blocked_groups_cache:
        return
    
    # Cache ni yangilash kerakmi?
    if current_time - last_cache_update > CACHE_TTL:
        await refresh_keywords()
    
    # Xabar textini olish
    text = message.text or message.caption or ""
    if not text:
        return
    
    # Kalit so'z bormi?
    lower_text = text.lower()
    matched_keyword = None
    for keyword in keywords_cache:
        if keyword in lower_text:
            matched_keyword = keyword
            break
    
    if not matched_keyword:
        return
    
    # Xabarni haydovchilar guruhiga yuborish
    group_name = message.chat.title or "Guruh"
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


async def periodic_sync():
    """Har 30 daqiqada guruhlarni sinxronlash"""
    while True:
        await asyncio.sleep(1800)  # 30 daqiqa
        await sync_all_groups()


async def periodic_keywords_refresh():
    """Har 5 daqiqada kalit so'zlarni yangilash"""
    while True:
        await asyncio.sleep(CACHE_TTL)
        await refresh_keywords()


async def main():
    """Asosiy funksiya"""
    print("🚀 UserBot ishga tushmoqda...")
    
    # Supabase ni boshlash
    init_supabase()
    
    # Telegram ga ulash
    await app.start()
    print(f"✅ UserBot tayyor! {PHONE_NUMBER} bilan ulangan")
    
    # Barcha guruhlarni topib, sync qilish
    groups = await sync_all_groups()
    
    # Kalit so'zlarni yuklash
    await refresh_keywords()
    
    print(f"📡 {len(groups)} ta guruhni kuzatish boshlandi")
    print("=" * 50)
    print("💡 Kalit so'zlar topilganda haydovchilar guruhiga yuboriladi")
    print("=" * 50)
    
    # Periodic tasks
    asyncio.create_task(periodic_sync())
    asyncio.create_task(periodic_keywords_refresh())
    
    # Keep running
    await asyncio.Event().wait()


if __name__ == "__main__":
    app.run(main())
