"""Telegram UserBot - Multi-Account Parallel Monitoring

Muhim:
- Endi raqamlar ro'yxati asosan bazadan olinadi (userbot_accounts).
- .env dagi PHONE_NUMBER faqat fallback sifatida ishlatiladi.
- DRIVERS_GROUP_ID hech qachon kuzatilmaydi (loop oldini olish).
- Guruhlar bazada bo'lsa qayta tekshirilmaydi (optimizatsiya).
"""

import os
import sys
import asyncio
import aiohttp
import time
import html
from dotenv import load_dotenv
from pyrogram import Client, filters
from pyrogram.types import Message
from pyrogram.enums import ChatType
from supabase import create_client, Client as SupabaseClient

load_dotenv()

# Environment variables
API_ID = int(os.getenv("TELEGRAM_API_ID", "0") or "0")
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
DRIVERS_GROUP_ID = int(os.getenv("DRIVERS_GROUP_ID", "-1003784903860"))
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

# Parse multiple phone numbers from env (fallback)
PHONE_NUMBERS_RAW = os.getenv("PHONE_NUMBER", "")
PHONE_NUMBERS_ENV_FALLBACK = [
    p.strip().strip('"').strip("'") for p in PHONE_NUMBERS_RAW.split(",") if p.strip()
]

# Supabase client
supabase: SupabaseClient = None

# Cache for keywords
keywords_cache = []
keywords_map = {}  # keyword -> id mapping
last_cache_update = 0
CACHE_TTL = 300  # 5 minutes

# ===== GURUHLAR KESHI (qayta tekshirmaslik uchun) =====
watched_groups_cache = set()  # group_id lar to'plami
account_groups_cache = {}  # phone -> set of group_ids
groups_cache_loaded = False  # Kesh yuklangan yoki yo'q

# Per-account stats
account_stats = {}  # phone -> {"groups_count": N, "active_count": N}

# Running tasks by phone
running_clients = {}  # phone -> asyncio.Task

# ===== DUPLIKAT OLDINI OLISH =====
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


async def load_groups_cache():
    """Bazadan mavjud guruhlarni keshga yuklash (bir marta)"""
    global watched_groups_cache, account_groups_cache, groups_cache_loaded, supabase
    
    if groups_cache_loaded or not supabase:
        return
    
    try:
        # watched_groups dan barcha group_id larni olish
        result = supabase.table("watched_groups").select("group_id").execute()
        watched_groups_cache = {row["group_id"] for row in (result.data or [])}
        print(f"✅ Kesh yuklandi: {len(watched_groups_cache)} ta guruh bazada mavjud")
        
        # account_groups dan ham yuklash
        acc_result = supabase.table("account_groups").select("phone_number, group_id").execute()
        for row in (acc_result.data or []):
            phone = row.get("phone_number")
            gid = row.get("group_id")
            if phone and gid:
                if phone not in account_groups_cache:
                    account_groups_cache[phone] = set()
                account_groups_cache[phone].add(gid)
        
        groups_cache_loaded = True
    except Exception as e:
        print(f"⚠️ Kesh yuklashda xato: {e}")


def fetch_phone_numbers_from_db() -> list:
    """Bazadan telefon raqamlarni olish (pending/active/error/connecting)."""
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
    """.env dagi barcha raqamlarni bazaga qo'shish (agar mavjud bo'lmasa)."""
    global supabase
    if not supabase:
        return
    if not PHONE_NUMBERS_ENV_FALLBACK:
        return

    try:
        # Bazadagi mavjud raqamlarni olish
        existing = supabase.table("userbot_accounts").select("phone_number").execute()
        existing_phones = {_normalize_phone(row.get("phone_number", "")) for row in (existing.data or [])}
        
        added_count = 0
        for phone in PHONE_NUMBERS_ENV_FALLBACK:
            phone = _normalize_phone(phone)
            if not phone:
                continue
            
            # Agar bu raqam bazada yo'q bo'lsa, qo'shish
            if phone not in existing_phones:
                try:
                    supabase.table("userbot_accounts").insert({
                        "phone_number": phone,
                        "status": "pending",
                        "two_fa_required": False,
                    }).execute()
                    added_count += 1
                    print(f"✅ Yangi raqam qo'shildi: {phone}")
                except Exception as e:
                    if "duplicate" not in str(e).lower():
                        print(f"⚠️ Raqam qo'shishda xato: {phone} - {e}")
        
        if added_count > 0:
            print(f"✅ .env dan bazaga {added_count} ta yangi raqam qo'shildi")
    except Exception as e:
        print(f"⚠️ .env seed'da xato: {e}")


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
    """Akkaunt guruhlarini bazaga saqlash (faqat yangilarini)"""
    global supabase, account_groups_cache
    if not supabase:
        return

    try:
        # Keshdan mavjud guruhlarni olish
        existing_ids = account_groups_cache.get(phone, set())
        
        # Faqat yangi guruhlarni qo'shish
        new_groups = [g for g in groups if g["group_id"] not in existing_ids]
        
        if not new_groups:
            return  # Yangi guruh yo'q, hech narsa qilmaymiz
        
        for group in new_groups:
            try:
                supabase.table("account_groups").insert({
                    "phone_number": phone,
                    "group_id": group["group_id"],
                    "group_name": group["group_name"],
                }).execute()
                
                # Keshni yangilash
                if phone not in account_groups_cache:
                    account_groups_cache[phone] = set()
                account_groups_cache[phone].add(group["group_id"])
                
            except Exception as e:
                if "duplicate" not in str(e).lower():
                    pass
        
        if new_groups:
            print(f"📝 [{phone}] {len(new_groups)} ta yangi guruh qo'shildi")

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
            "message_preview": preview,
        }).execute()
    except Exception as e:
        print(f"⚠️ Statistika saqlashda xato: {e}")


async def sync_all_groups(client: Client, phone: str) -> list:
    """Barcha guruhlarni topib, Supabase ga qo'shish (faqat yangilarini)"""
    global supabase, account_stats, watched_groups_cache

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

        # Akkaunt guruhlarini saqlash (faqat yangilarini)
        await sync_account_groups(phone, groups_found)

        # Faqat yangi guruhlarni watched_groups ga qo'shish
        new_groups = [g for g in groups_found if g["group_id"] not in watched_groups_cache]

        added_count = 0
        for group in new_groups:
            try:
                is_blocked = normalize_chat_id(group["group_id"]) == normalize_chat_id(DRIVERS_GROUP_ID)
                supabase.table("watched_groups").insert({
                    "group_id": group["group_id"],
                    "group_name": group["group_name"],
                    "is_blocked": is_blocked,
                }).execute()
                
                # Keshni yangilash
                watched_groups_cache.add(group["group_id"])
                added_count += 1
                
            except Exception as e:
                if "duplicate" not in str(e).lower():
                    pass

        if added_count > 0:
            print(f"🆕 [{phone}] {added_count} ta yangi guruh bazaga qo'shildi")

        # Faol guruhlar - faqat DRIVERS_GROUP_ID tashqari hammasi
        active_groups = [
            g for g in groups_found
            if normalize_chat_id(g["group_id"]) != normalize_chat_id(DRIVERS_GROUP_ID)
        ]

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
        keywords_cache = [k["keyword"].lower() for k in (result.data or [])]
        keywords_map = {k["keyword"].lower(): k["id"] for k in (result.data or [])}
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

        if key in processed_messages:
            return True

        processed_messages[key] = current_time
        return False


# ====== USER LINK HELPERS (DM uchun) ======
def build_user_dm_url(user) -> str | None:
    """Username bo'lsa t.me, bo'lmasa tg://user?id=... qaytaradi."""
    if not user:
        return None
    if getattr(user, "username", None):
        return f"https://t.me/{user.username}"
    uid = getattr(user, "id", None)
    if uid:
        return f"tg://user?id={uid}"
    return None


def build_user_mention_html(user, fallback_name="Клент личкаси") -> str:
    """HTML ichida bosilganda DM ochiladigan link."""
    url = build_user_dm_url(user)
    if url:
        return f'<a href="{url}">{html.escape(fallback_name)}</a>'
    return html.escape(fallback_name)


async def send_to_drivers_group(text: str, message_link: str, client_dm_url: str | None = None):
    """Haydovchilar guruhiga xabar yuborish (Bot orqali)"""
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"

    keyboard = [[{"text": "🔗 Xabarga o'tish", "url": message_link}]]

    if client_dm_url:
        keyboard[0].append({"text": "👤 Klentga yozish", "url": client_dm_url})

    payload = {
        "chat_id": DRIVERS_GROUP_ID,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
        "reply_markup": {"inline_keyboard": keyboard},
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
        if chat_id_normalized == normalize_chat_id(DRIVERS_GROUP_ID):
            return

        if getattr(message, "outgoing", False):
            return

        if message.from_user and getattr(message.from_user, "is_bot", False):
            return

        # ===== DUPLIKAT TEKSHIRISH =====
        if await is_duplicate_message(chat_id, message.id):
            return

        # ===== KALIT SO'ZLARNI TEKSHIRISH =====
        current_time = time.time()
        if current_time - last_cache_update > CACHE_TTL:
            await refresh_keywords()

        raw_text = message.text or message.caption or ""
        if not raw_text:
            return

        lower_text = raw_text.lower()
        matched_keyword = None
        for keyword in keywords_cache:
            if keyword in lower_text:
                matched_keyword = keyword
                break

        if not matched_keyword:
            return

        # ===== STATISTIKANI SAQLASH =====
        await save_keyword_hit(matched_keyword, chat_id, group_name, phone, raw_text)

        # ===== XABAR FORMATLASH =====
        client_label = "Клент личкаси"
        client_html = build_user_mention_html(message.from_user, client_label)

        username_text = "@Yo'q"
        if message.from_user and getattr(message.from_user, "username", None):
            username_text = f"@{message.from_user.username}"

        from_line = f"From: {client_html} ({html.escape(username_text)})"
        safe_text = html.escape(raw_text)

        message_link = get_message_link(message)
        client_dm_url = build_user_dm_url(message.from_user)

        forward_text = f"""{from_line}

{safe_text}"""

        await send_to_drivers_group(forward_text, message_link, client_dm_url=client_dm_url)
        print(f"📨 [{phone}] Topildi: '{matched_keyword}' - {group_name}")

    return handle_message


async def run_client(phone: str, retry_count: int = 0):
    """Bitta akkaunt uchun client ishga tushirish"""
    MAX_RETRIES = 2

    print(f"\n📱 [{phone}] Ishga tushmoqda..." + (f" (qayta urinish {retry_count})" if retry_count > 0 else ""))

    update_account_status(phone, "connecting")

    session_name = f"userbot_session_{phone.replace('+', '').replace(' ', '')}"

    client = Client(session_name, api_id=API_ID, api_hash=API_HASH, phone_number=phone)
    client.on_message(filters.group | filters.channel)(create_message_handler(phone))

    try:
        await client.start()
        print(f"✅ [{phone}] Ulandi!")
        update_account_status(phone, "active")

        # Guruhlarni sinxronlash
        my_groups = await sync_all_groups(client, phone)

        active_groups = [
            g for g in my_groups
            if normalize_chat_id(g["group_id"]) != normalize_chat_id(DRIVERS_GROUP_ID)
        ]

        print(f"📊 [{phone}] {len(my_groups)} ta guruh, {len(active_groups)} ta faol kuzatilmoqda")
        print_statistics()

        # Periodic sync (30 daqiqada bir)
        async def periodic_sync():
            while True:
                await asyncio.sleep(1800)
                if client and client.is_connected:
                    await sync_all_groups(client, phone)

        asyncio.create_task(periodic_sync())

        await asyncio.Event().wait()

    except Exception as e:
        msg = str(e)
        print(f"❌ [{phone}] Xato: {msg}")

        if "AUTH_KEY_UNREGISTERED" in msg:
            try:
                for suffix in [".session", ".session-journal"]:
                    path = f"{session_name}{suffix}"
                    if os.path.exists(path):
                        os.remove(path)
                        print(f"🧹 [{phone}] Session o'chirildi: {path}")
            except Exception as cleanup_err:
                print(f"⚠️ [{phone}] Session tozalashda xato: {cleanup_err}")

            if retry_count < MAX_RETRIES:
                print(f"🔄 [{phone}] Qayta login qilish...")
                await asyncio.sleep(2)
                await run_client(phone, retry_count + 1)
                return

        update_account_status(phone, "error")
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
    print(f"💾 Keshda: {len(watched_groups_cache)} ta guruh")
    print("=" * 60)
    print("💡 Kalit so'zlar topilganda haydovchilar guruhiga yuboriladi")
    print("=" * 60 + "\n")


async def main():
    """Asosiy funksiya - barcha akkauntlarni parallel ishga tushirish"""
    print("🚀 UserBot Multi-Account ishga tushmoqda...")

    if not init_supabase():
        print("❌ Supabase'ga ulanib bo'lmadi. Chiqish...")
        sys.exit(1)

    # ===== MUHIM: Guruhlar keshini yuklash (bir marta) =====
    await load_groups_cache()

    await ensure_accounts_seeded_from_env()

    phones = fetch_phone_numbers_from_db() or PHONE_NUMBERS_ENV_FALLBACK
    print(f"📱 Raqamlar soni: {len(phones)}")
    if not phones:
        print("❌ Bazada ham, .env fallback'da ham raqam yo'q!")
        sys.exit(1)

    for i, phone in enumerate(phones, 1):
        print(f"  {i}. {phone}")

    print(f"\n🚫 Bloklangan: Faqat DRIVERS_GROUP_ID ({DRIVERS_GROUP_ID})")

    await refresh_keywords()
    asyncio.create_task(periodic_keywords_refresh())

    async def start_phone(phone: str):
        if phone in running_clients:
            return
        running_clients[phone] = asyncio.create_task(run_client(phone))

    print("\n🔄 Akkauntlar ishga tushirilmoqda...")
    for phone in phones:
        await start_phone(phone)

    async def watch_new_accounts():
        while True:
            await asyncio.sleep(30)
            latest = fetch_phone_numbers_from_db()
            for p in latest:
                await start_phone(p)

    asyncio.create_task(watch_new_accounts())

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
        for phone in list(running_clients.keys()):
            update_account_status(phone, "error")
