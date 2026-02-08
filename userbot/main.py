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
import re
from typing import Optional, List, Tuple, Dict

from dotenv import load_dotenv
from pyrogram import Client, filters
from pyrogram.types import Message
from pyrogram.enums import ChatType, MessageEntityType
from pyrogram.errors import FloodWait
from supabase import create_client, Client as SupabaseClient

load_dotenv()

# ===================== ENV =====================
API_ID = int(os.getenv("TELEGRAM_API_ID", "0") or "0")
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
DRIVERS_GROUP_ID = int(os.getenv("DRIVERS_GROUP_ID", "-1003784903860"))
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
ADMIN_ID = int(os.getenv("ADMIN_ID", "7748145808") or "7748145808")

PHONE_NUMBERS_RAW = os.getenv("PHONE_NUMBER", "")
PHONE_NUMBERS_ENV_FALLBACK = [
    p.strip().strip('"').strip("'") for p in PHONE_NUMBERS_RAW.split(",") if p.strip()
]

# Perf / scale knobs
SEND_WORKERS = int(os.getenv("SEND_WORKERS", "10") or "10")  # katta guruhlar uchun ko'proq worker
QUEUE_MAX = int(os.getenv("QUEUE_MAX", "15000") or "15000")  # katta guruhlar uchun katta queue

# ===================== SESSION DIR (MUHIM) =====================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SESS_DIR = os.path.join(BASE_DIR, "sessions")
os.makedirs(SESS_DIR, exist_ok=True)

# ===================== GLOBALS =====================
supabase: SupabaseClient = None

keywords_cache: List[str] = []
keywords_map: Dict[str, int] = {}
keywords_regex = None
last_cache_update = 0
CACHE_TTL = 300  # 5 min

watched_groups_cache = set()
account_groups_cache: Dict[str, set] = {}
groups_cache_loaded = False

account_stats = {}          # phone -> {"groups_count": N, "active_count": N}
running_clients = {}        # phone -> asyncio.Task
ALL_PHONES = []             # full phones list for statistics

# ===== DEDUPE (MUHIM!) =====
forwarded_cache: Dict[Tuple[int, int], Dict[str, float]] = {}
FORWARD_TTL = 300
QUEUE_STALE_TTL = 15  # queued bo'lib qolsa 15s dan keyin boshqa akkaunt takeover qiladi
forward_lock = asyncio.Lock()

# ===== OUTBOUND QUEUE =====
send_queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_MAX)
aiohttp_session: aiohttp.ClientSession = None

# ===== ADMIN NOTIFY DEDUPE =====
_admin_last_notify: Dict[str, float] = {}
ADMIN_NOTIFY_TTL = 120  # 2 min


# ===================== HELPERS =====================
def normalize_chat_id(chat_id: int) -> int:
    try:
        return int(chat_id)
    except Exception:
        return chat_id


def _normalize_phone(p: str) -> str:
    return (p or "").strip().replace(" ", "")


def uniq_keep_order(items):
    seen = set()
    out = []
    for x in items:
        if not x:
            continue
        if x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out


def init_supabase() -> bool:
    global supabase
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase ulandi")
        return True
    except Exception as e:
        print(f"❌ Supabase ulanishda xato: {e}")
        return False


async def notify_admin_once(key: str, text: str):
    global aiohttp_session, _admin_last_notify
    if not BOT_TOKEN or not ADMIN_ID or not aiohttp_session:
        return

    now = time.time()
    last = _admin_last_notify.get(key, 0)
    if now - last < ADMIN_NOTIFY_TTL:
        return
    _admin_last_notify[key] = now

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {"chat_id": ADMIN_ID, "text": text}
    try:
        async with aiohttp_session.post(url, json=payload, timeout=20) as resp:
            await resp.text()
    except Exception:
        pass


def session_base_for_phone(phone: str) -> str:
    clean = phone.replace("+", "").replace(" ", "")
    return os.path.join(SESS_DIR, f"userbot_{clean}")


async def safe_delete_session_files(session_base: str, tries: int = 8) -> bool:
    paths = [f"{session_base}.session", f"{session_base}.session-journal"]
    ok_any = False

    for _ in range(tries):
        all_done = True
        for p in paths:
            if os.path.exists(p):
                try:
                    os.remove(p)
                    ok_any = True
                except PermissionError:
                    all_done = False
                except OSError:
                    all_done = False
        if all_done:
            return ok_any
        await asyncio.sleep(0.6)

    return ok_any


# ===================== LINK / TEXT CLEAN =====================
URL_RE = re.compile(r"(https?://\S+|t\.me/\S+|telegram\.me/\S+)", re.IGNORECASE)


def strip_links(text: str) -> str:
    if not text:
        return ""
    text = URL_RE.sub("", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def extract_text_and_urls(message: Message):
    """
    Katta guruhlar uchun MUHIM:
      - post faqat link bo'lsa ham forward bo'lsin
      - post faqat media bo'lsa ham forward bo'lsin
    """
    raw = message.text or message.caption or ""
    urls = []

    # entity urls
    ents = None
    if message.text and message.entities:
        ents = message.entities
    elif message.caption and message.caption_entities:
        ents = message.caption_entities

    if raw and ents:
        for ent in ents:
            try:
                if ent.type == MessageEntityType.URL:
                    urls.append(raw[ent.offset: ent.offset + ent.length])
                elif ent.type == MessageEntityType.TEXT_LINK and getattr(ent, "url", None):
                    urls.append(ent.url)
            except Exception:
                pass

    if raw:
        urls.extend(URL_RE.findall(raw))

    urls = uniq_keep_order([u.strip() for u in urls if u and u.strip()])

    cleaned = strip_links(raw)

    # ✅ agar matn bo'sh qolsa ham forward bo'lsin
    if not cleaned:
        if urls:
            cleaned = "🔗 Linkli post"
        else:
            # media-only post (photo/video/document/voice etc.)
            has_media = bool(
                message.photo or message.video or message.document or message.audio or
                message.voice or message.video_note or message.animation or message.sticker
            )
            cleaned = "📎 Media post" if has_media else (raw.strip() if raw else "📩 Xabar")

    return cleaned, urls, raw


# ===================== TELEGRAM LINKS =====================
def get_message_link(message: Message) -> str:
    chat = message.chat
    msg_id = message.id
    if chat.username:
        return f"https://t.me/{chat.username}/{msg_id}"
    clean_id = str(chat.id).replace("-100", "")
    return f"https://t.me/c/{clean_id}/{msg_id}"


def get_chat_link(message: Message) -> str:
    chat = message.chat
    if chat.username:
        return f"https://t.me/{chat.username}"
    return get_message_link(message)


def build_sender_anchor(message: Message):
    """
    Qaytaradi: (sender_html, sender_url)
    sender_url: inline button uchun (username bo'lsa t.me, bo'lmasa tg://user?id=..)
    """
    if message.from_user:
        u = message.from_user
        title = f"@{u.username}" if u.username else "Клент личкаси"
        if u.username:
            url = f"https://t.me/{u.username}"
        else:
            url = f"tg://user?id={u.id}"
        sender_html = f'<a href="{html.escape(url)}">{html.escape(title)}</a>'
        return sender_html, url

    if getattr(message, "sender_chat", None):
        sc = message.sender_chat
        title = sc.title or "Sender"
        if sc.username:
            url = f"https://t.me/{sc.username}"
            return f'<a href="{html.escape(url)}">{html.escape(title)}</a>', url

        # anonymous/channel bo'lsa user lichka bo'lmaydi
        ml = get_message_link(message)
        return f'<a href="{html.escape(ml)}">{html.escape(title)}</a>', None

    return "Noma'lum", None


# ===================== SEND TO DRIVERS GROUP =====================
async def send_to_drivers_group(
    text: str,
    group_link: str,
    message_link: str,
    extra_urls: Optional[List[str]] = None,
    sender_url: Optional[str] = None,
    session: Optional[aiohttp.ClientSession] = None
) -> bool:
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"

    keyboard = []
    if sender_url:
        keyboard.append([{"text": "👤 Клент личкаси", "url": sender_url}])

    keyboard.append([
        {"text": "👥 Guruhga o'tish", "url": group_link},
        {"text": "🔗 Xabarga o'tish", "url": message_link},
    ])

    extra_urls = uniq_keep_order(extra_urls or [])[:3]
    for i, u in enumerate(extra_urls, 1):
        keyboard.append([{"text": f"🔗 Link {i}", "url": u}])

    payload = {
        "chat_id": DRIVERS_GROUP_ID,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
        "reply_markup": {"inline_keyboard": keyboard},
    }

    own_session = False
    if session is None:
        session = aiohttp.ClientSession()
        own_session = True

    try:
        for _ in range(8):
            async with session.post(url, json=payload, timeout=30) as resp:
                if resp.status == 200:
                    return True

                if resp.status == 429:
                    retry_after = 3
                    try:
                        j = await resp.json()
                        retry_after = int(j.get("parameters", {}).get("retry_after", retry_after))
                    except Exception:
                        pass
                    await asyncio.sleep(retry_after + 1)
                    continue

                body = await resp.text()
                print(f"❌ Xabar yuborishda xato ({resp.status}): {body}")
                return False
    except Exception as e:
        print(f"❌ Xabar yuborishda xato: {e}")
        return False
    finally:
        if own_session:
            await session.close()


async def send_worker(worker_id: int):
    global aiohttp_session, forwarded_cache
    while True:
        item = await send_queue.get()
        try:
            cache_key, forward_text, group_link, message_link, urls, sender_url = item

            ok = await send_to_drivers_group(
                forward_text,
                group_link=group_link,
                message_link=message_link,
                extra_urls=urls,
                sender_url=sender_url,
                session=aiohttp_session
            )

            async with forward_lock:
                if ok:
                    old = forwarded_cache.get(cache_key, {}) or {}
                    forwarded_cache[cache_key] = {"ts": time.time(), "status": "sent", "owner": old.get("owner")}
                else:
                    forwarded_cache.pop(cache_key, None)

                now_ts = time.time()
                for k, st in list(forwarded_cache.items()):
                    if now_ts - float(st.get("ts", 0)) > FORWARD_TTL:
                        forwarded_cache.pop(k, None)

        except Exception as e:
            try:
                cache_key = item[0]
                async with forward_lock:
                    forwarded_cache.pop(cache_key, None)
            except Exception:
                pass
            print(f"⚠️ send_worker[{worker_id}] xato: {e}")
        finally:
            send_queue.task_done()


# ===================== STATISTICS =====================
def print_statistics():
    global account_stats, watched_groups_cache, ALL_PHONES

    print("\n" + "=" * 60)
    print("📊 USERBOT STATISTIKASI")
    print("=" * 60)

    total_groups_all = 0
    total_active_all = 0

    phones_list = ALL_PHONES or list(running_clients.keys()) or PHONE_NUMBERS_ENV_FALLBACK

    print(f"\n📱 AKKAUNTLAR ({len(phones_list)} ta):")
    print("-" * 40)

    for phone in phones_list:
        stats = account_stats.get(phone, {})
        total = int(stats.get("groups_count", 0) or 0)
        active = int(stats.get("active_count", 0) or 0)
        total_groups_all += total
        total_active_all += active
        print(f"  {phone}: {total} guruh, {active} ta faol kuzatilmoqda")

    print("-" * 40)
    print(f"  JAMI: {total_groups_all} guruh, {total_active_all} ta faol kuzatilmoqda")
    print(f"\n🚫 Bloklangan: Faqat DRIVERS_GROUP_ID ({DRIVERS_GROUP_ID})")
    print(f"💾 Keshda: {len(watched_groups_cache)} ta guruh")
    print("=" * 60 + "\n")


# ===================== SUPABASE CACHE LOAD =====================
async def load_groups_cache():
    global watched_groups_cache, account_groups_cache, groups_cache_loaded, supabase

    if groups_cache_loaded or not supabase:
        return

    try:
        result = supabase.table("watched_groups").select("group_id").execute()
        watched_groups_cache = {row["group_id"] for row in (result.data or [])}
        print(f"✅ Kesh yuklandi: {len(watched_groups_cache)} ta guruh bazada mavjud")

        acc_result = supabase.table("account_groups").select("phone_number, group_id").execute()
        for row in (acc_result.data or []):
            phone = row.get("phone_number")
            gid = row.get("group_id")
            if phone and gid:
                account_groups_cache.setdefault(phone, set()).add(gid)

        groups_cache_loaded = True
    except Exception as e:
        print(f"⚠️ Kesh yuklashda xato: {e}")


# ===================== SUPABASE PHONES =====================
def fetch_phone_numbers_from_db() -> list:
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
            if status in ["pending", "active", "connecting"]:
                phones.append(phone)

        return uniq_keep_order(phones)
    except Exception as e:
        print(f"⚠️ Bazadan raqamlarni olishda xato: {e}")
        return []


async def ensure_accounts_seeded_from_env():
    global supabase
    if not supabase or not PHONE_NUMBERS_ENV_FALLBACK:
        return

    try:
        existing = supabase.table("userbot_accounts").select("phone_number").execute()
        existing_phones = {_normalize_phone(row.get("phone_number", "")) for row in (existing.data or [])}

        for phone in PHONE_NUMBERS_ENV_FALLBACK:
            phone = _normalize_phone(phone)
            if not phone or phone in existing_phones:
                continue
            try:
                supabase.table("userbot_accounts").insert({
                    "phone_number": phone,
                    "status": "pending",
                    "two_fa_required": False,
                }).execute()
                print(f"✅ Yangi raqam qo'shildi: {phone}")
            except Exception as e:
                if "duplicate" not in str(e).lower():
                    print(f"⚠️ Raqam qo'shishda xato: {phone} - {e}")
    except Exception as e:
        print(f"⚠️ .env seed'da xato: {e}")


def update_account_status(phone: str, status: str):
    global supabase
    if not supabase:
        return
    try:
        supabase.table("userbot_accounts").update(
            {"status": status, "updated_at": "now()"}
        ).eq("phone_number", phone).execute()
        print(f"📊 Status yangilandi: {phone} -> {status}")
    except Exception as e:
        print(f"⚠️ Status yangilashda xato: {e}")


# ===================== GROUP SYNC =====================
async def sync_account_groups(phone: str, groups: list):
    global supabase, account_groups_cache
    if not supabase:
        return

    try:
        existing_ids = account_groups_cache.get(phone, set())
        new_groups = [g for g in groups if g["group_id"] not in existing_ids]
        if not new_groups:
            return

        for group in new_groups:
            try:
                supabase.table("account_groups").insert({
                    "phone_number": phone,
                    "group_id": group["group_id"],
                    "group_name": group["group_name"],
                }).execute()
                account_groups_cache.setdefault(phone, set()).add(group["group_id"])
            except Exception:
                pass

        print(f"📝 [{phone}] {len(new_groups)} ta yangi guruh qo'shildi")
    except Exception as e:
        print(f"⚠️ Guruhlarni saqlashda xato: {e}")


async def sync_all_groups(client: Client, phone: str) -> list:
    global supabase, account_stats, watched_groups_cache

    if not supabase:
        return []

    try:
        groups_found = []

        try:
            async for dialog in client.get_dialogs():
                chat = dialog.chat
                if chat.type in [ChatType.GROUP, ChatType.SUPERGROUP]:
                    groups_found.append({
                        "group_id": chat.id,
                        "group_name": chat.title or f"Guruh {chat.id}"
                    })
        except FloodWait as fw:
            wait_s = int(getattr(fw, "value", 0) or 0)
            await asyncio.sleep(wait_s + 1)
            async for dialog in client.get_dialogs():
                chat = dialog.chat
                if chat.type in [ChatType.GROUP, ChatType.SUPERGROUP]:
                    groups_found.append({
                        "group_id": chat.id,
                        "group_name": chat.title or f"Guruh {chat.id}"
                    })

        await sync_account_groups(phone, groups_found)

        new_groups = [g for g in groups_found if g["group_id"] not in watched_groups_cache]
        for g in new_groups:
            try:
                is_blocked = normalize_chat_id(g["group_id"]) == normalize_chat_id(DRIVERS_GROUP_ID)
                supabase.table("watched_groups").insert({
                    "group_id": g["group_id"],
                    "group_name": g["group_name"],
                    "is_blocked": is_blocked
                }).execute()
                watched_groups_cache.add(g["group_id"])
            except Exception:
                pass

        active_groups = [
            g for g in groups_found
            if normalize_chat_id(g["group_id"]) != normalize_chat_id(DRIVERS_GROUP_ID)
        ]

        account_stats[phone] = {"groups_count": len(groups_found), "active_count": len(active_groups)}
        return groups_found

    except Exception as e:
        print(f"❌ [{phone}] Guruhlarni sinxronlashda xato: {e}")
        return []


# ===================== KEYWORDS =====================
async def refresh_keywords():
    global keywords_cache, keywords_map, keywords_regex, last_cache_update, supabase
    if not supabase:
        return
    try:
        result = supabase.table("keywords").select("id, keyword").execute()
        keywords_cache = [k["keyword"].lower() for k in (result.data or []) if k.get("keyword")]
        keywords_map = {k["keyword"].lower(): k["id"] for k in (result.data or []) if k.get("keyword")}
        last_cache_update = time.time()

        if keywords_cache:
            keywords_regex = re.compile(
                "|".join(re.escape(k) for k in sorted(keywords_cache, key=len, reverse=True)),
                re.IGNORECASE
            )
        else:
            keywords_regex = None

        print(f"✅ Kalit so'zlar yangilandi: {len(keywords_cache)} ta")
    except Exception as e:
        print(f"❌ Kalit so'zlar yangilashda xato: {e}")


async def periodic_keywords_refresh():
    while True:
        await asyncio.sleep(CACHE_TTL)
        await refresh_keywords()


# ===================== HIT LOG =====================
async def save_keyword_hit(keyword: str, group_id: int, group_name: str, phone: str, message_text: str):
    global supabase, keywords_map
    if not supabase:
        return
    try:
        keyword_id = keywords_map.get(keyword.lower())
        preview = (message_text or "")[:200]
        supabase.table("keyword_hits").insert({
            "keyword_id": keyword_id,
            "group_id": group_id,
            "group_name": group_name,
            "phone_number": phone,
            "message_preview": preview,
        }).execute()
    except Exception:
        pass


# ===================== ADMIN COMMAND POLLER =====================
async def admin_command_poller():
    global aiohttp_session, supabase
    if not BOT_TOKEN or not ADMIN_ID:
        return

    url = f"https://api.telegram.org/bot{BOT_TOKEN}/getUpdates"
    offset = 0

    while True:
        try:
            params = {"timeout": 50, "offset": offset}
            async with aiohttp_session.get(url, params=params, timeout=60) as resp:
                data = await resp.json()
        except Exception:
            await asyncio.sleep(2)
            continue

        for upd in data.get("result", []) or []:
            offset = max(offset, upd.get("update_id", 0) + 1)

            msg = upd.get("message") or upd.get("edited_message")
            if not msg:
                continue

            from_id = (msg.get("from") or {}).get("id")
            if from_id != ADMIN_ID:
                continue

            text = (msg.get("text") or "").strip()
            if not text:
                continue

            if text.startswith("/where"):
                await notify_admin_once(
                    "where",
                    f"📁 BASE_DIR: {BASE_DIR}\n📁 SESS_DIR: {SESS_DIR}\n📁 CWD: {os.getcwd()}"
                )
                continue


# ===================== HANDLER =====================
def create_message_handler(phone: str):
    async def handle_message(client: Client, message: Message):
        global last_cache_update, forwarded_cache, keywords_regex

        chat_id = message.chat.id
        group_name = getattr(message.chat, "title", None) or f"Chat {chat_id}"

        if normalize_chat_id(chat_id) == normalize_chat_id(DRIVERS_GROUP_ID):
            return

        now = time.time()
        if now - last_cache_update > CACHE_TTL:
            await refresh_keywords()

        cleaned_text, urls, raw_text = extract_text_and_urls(message)

        # ✅ MUHIM: keywordni RAW ichidan qidiramiz (katta guruhda link/caption ichida bo'ladi)
        if not keywords_regex:
            return

        blob = (raw_text or cleaned_text or "")
        if not blob:
            return

        m = keywords_regex.search(blob)
        if not m:
            return
        matched_keyword = m.group(0).lower()

        cache_key = (normalize_chat_id(chat_id), int(message.id))

        # ✅ dedupe + takeover
        async with forward_lock:
            st = forwarded_cache.get(cache_key)
            if st:
                status = st.get("status")
                ts = float(st.get("ts", 0) or 0)
                if status == "sent":
                    return
                if status == "queued" and (time.time() - ts) < QUEUE_STALE_TTL:
                    return

        sender_html, sender_url = build_sender_anchor(message)
        message_link = get_message_link(message)
        group_link = get_chat_link(message)

        safe_text = html.escape(cleaned_text)

        extra_links_text = ""
        if urls:
            show = urls[:3]
            extra_links_text = "\n\n" + "\n".join([f"🔗 {html.escape(u)}" for u in show])

        forward_text = (
            f"🔔 <b>Yangi buyurtma</b>\n"
            f"📍 Guruh: <b>{html.escape(group_name)}</b>\n"
            f"👤 Kimdan: {sender_html}\n\n"
            f"{safe_text}"
            f"{extra_links_text}\n\n"
            f"🔗 {message_link}"
        )

        asyncio.create_task(save_keyword_hit(matched_keyword, chat_id, group_name, phone, cleaned_text))

        # ✅ katta guruhda BLOCK bo'lmasin
        try:
            send_queue.put_nowait((cache_key, forward_text, group_link, message_link, urls, sender_url))
        except asyncio.QueueFull:
            await notify_admin_once("queue_full", f"⚠️ send_queue FULL. Xabar drop.\n📍 {group_name}\n📱 {phone}")
            async with forward_lock:
                forwarded_cache.pop(cache_key, None)
            return

        async with forward_lock:
            forwarded_cache[cache_key] = {"ts": time.time(), "status": "queued", "owner": phone}

    return handle_message


# ===================== RUN CLIENT =====================
async def run_client(phone: str):
    print(f"\n📱 [{phone}] Ishga tushmoqda...")
    update_account_status(phone, "connecting")

    session_base = session_base_for_phone(phone)

    client = Client(
        session_base,
        api_id=API_ID,
        api_hash=API_HASH,
        phone_number=phone,
        workers=32,          # katta guruh uchun ko'proq worker
        sleep_threshold=30
    )

    # ✅ incoming group/channel
    client.on_message((filters.group | filters.channel) & filters.incoming)(create_message_handler(phone))

    try:
        await client.start()
        print(f"✅ [{phone}] Ulandi!")
        update_account_status(phone, "active")

        await sync_all_groups(client, phone)
        print_statistics()

        await asyncio.Event().wait()

    except Exception as e:
        msg = str(e)
        print(f"❌ [{phone}] Xato: {msg}")

        try:
            await client.stop()
        except Exception:
            pass

        if "AUTH_KEY_DUPLICATED" in msg:
            update_account_status(phone, "duplicated_running_elsewhere")
            await notify_admin_once(
                f"dup_{phone}",
                "⚠️ AUTH_KEY_DUPLICATED\n"
                f"📱 Raqam: {phone}\n"
                "✅ Session o'chirilmadi.\n"
                "📌 Bu raqam boshqa joyda ishlayapti. O'sha joyni STOP qiling.\n"
                "🔁 Keyin qayta ishga tushiring."
            )
            return

        if "AUTH_KEY_UNREGISTERED" in msg:
            deleted = await safe_delete_session_files(session_base, tries=12)
            update_account_status(phone, "relogin_required")
            await notify_admin_once(
                f"unreg_{phone}",
                "⚠️ AUTH_KEY_UNREGISTERED\n"
                f"📱 Raqam: {phone}\n"
                f"🧹 Session delete: {'✅' if deleted else '❌'}\n"
                "🔁 Qayta login kerak."
            )
            return

        update_account_status(phone, "error")
        await notify_admin_once(f"err_{phone}", f"❌ Userbot error\n📱 {phone}\n🧾 {msg}")
        return


# ===================== MAIN =====================
async def main():
    global ALL_PHONES, aiohttp_session

    print("🚀 UserBot Multi-Account ishga tushmoqda...")
    print(f"📁 BASE_DIR: {BASE_DIR}")
    print(f"📁 SESS_DIR: {SESS_DIR}")
    print(f"📁 CWD: {os.getcwd()}")

    if not init_supabase():
        print("❌ Supabase'ga ulanib bo'lmadi. Chiqish...")
        sys.exit(1)

    connector = aiohttp.TCPConnector(limit=300, ttl_dns_cache=300)
    aiohttp_session = aiohttp.ClientSession(connector=connector)

    for i in range(max(1, SEND_WORKERS)):
        asyncio.create_task(send_worker(i + 1))
    print(f"📤 Yuborish workerlari: {max(1, SEND_WORKERS)} ta | queue={QUEUE_MAX}")

    await load_groups_cache()
    await ensure_accounts_seeded_from_env()

    asyncio.create_task(admin_command_poller())

    phones = fetch_phone_numbers_from_db() or PHONE_NUMBERS_ENV_FALLBACK
    phones = uniq_keep_order(phones)
    ALL_PHONES = phones

    print(f"📱 Raqamlar soni: {len(phones)}")
    if not phones:
        print("❌ Bazada ham, .env fallback'da ham raqam yo'q!")
        sys.exit(1)

    await refresh_keywords()
    asyncio.create_task(periodic_keywords_refresh())

    async def start_phone(p: str):
        if p in running_clients:
            return
        running_clients[p] = asyncio.create_task(run_client(p))

    print("\n🔄 Akkauntlar ishga tushirilmoqda...")
    for p in phones:
        await start_phone(p)

    await notify_admin_once("started", "✅ Userbot ishga tushdi.")
    await asyncio.Event().wait()


# ===================== ENTRY =====================
if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 UserBot to'xtatildi")
        for phone in list(running_clients.keys()) or PHONE_NUMBERS_ENV_FALLBACK:
            update_account_status(phone, "stopped")

        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            if aiohttp_session and not aiohttp_session.closed:
                loop.run_until_complete(aiohttp_session.close())
            loop.close()
        except Exception:
            pass

    except Exception as e:
        print(f"❌ Kritik xato: {e}")
        for phone in list(running_clients.keys()):
            update_account_status(phone, "error")

        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            if aiohttp_session and not aiohttp_session.closed:
                loop.run_until_complete(aiohttp_session.close())
            loop.close()
        except Exception:
            pass
