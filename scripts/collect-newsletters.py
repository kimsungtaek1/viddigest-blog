#!/usr/bin/env python3
"""Collect public RSS/Atom metadata into the isolated newsletter snapshot."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import html
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "config" / "newsletter-feeds.json"
DEFAULT_OUTPUT = ROOT / "public" / "newsletters" / "newsletters.json"
USER_AGENT = "VidDigest-Newsletter-Collector/1.0 (+https://viddigest-blog.pages.dev/newsletters/)"
MAX_FEED_BYTES = 5_000_000
DEFAULT_FEED_TIMEOUT_SECONDS = 15
MAX_FETCH_CONCURRENCY = 12
RETRYABLE_HTTP_STATUS = {429, 500, 502, 503, 504}
TRACKING_QUERY_KEYS = {
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "ref",
    "source",
}
XML_DECLARATION_ENCODING = re.compile(
    rb"(<\?xml[^>]*?encoding\s*=\s*['\"])([^'\"]+)(['\"])",
    re.IGNORECASE,
)
ILLEGAL_XML_CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F]")


class PlainTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "svg"}:
            self.ignored_depth += 1
        elif not self.ignored_depth and tag in {"br", "p", "div", "li", "blockquote"}:
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "svg"} and self.ignored_depth:
            self.ignored_depth -= 1
        elif not self.ignored_depth and tag in {"p", "div", "li", "blockquote"}:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        if not self.ignored_depth:
            self.parts.append(data)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].rsplit(":", 1)[-1].lower()


def direct_children(element: ET.Element, *names: str) -> list[ET.Element]:
    wanted = {name.lower() for name in names}
    return [child for child in list(element) if local_name(child.tag) in wanted]


def element_text(element: ET.Element | None) -> str:
    if element is None:
        return ""
    return "".join(element.itertext()).strip()


def first_text(element: ET.Element, *names: str) -> str:
    children = direct_children(element, *names)
    return element_text(children[0]) if children else ""


def plain_text(value: str, limit: int) -> str:
    parser = PlainTextExtractor()
    try:
        parser.feed(html.unescape(value or ""))
        text = " ".join(parser.parts)
    except Exception:
        text = re.sub(r"<[^>]+>", " ", value or "")
    text = re.sub(r"\s+", " ", html.unescape(text)).strip()
    if len(text) <= limit:
        return text
    clipped = text[: max(1, limit - 1)].rsplit(" ", 1)[0].strip()
    return f"{clipped or text[: max(1, limit - 1)].strip()}…"


def normalize_url(value: str, preserve_trailing_slash: bool = False) -> str:
    try:
        parsed = urllib.parse.urlsplit(value.strip())
    except ValueError:
        return ""
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
        return ""
    try:
        port = parsed.port
    except ValueError:
        return ""
    hostname = (parsed.hostname or "").lower()
    if not hostname:
        return ""
    is_default_port = (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    netloc = hostname if port is None or is_default_port else f"{hostname}:{port}"
    query = []
    for key, item_value in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True):
        lowered = key.lower()
        if lowered.startswith("utm_") or lowered in TRACKING_QUERY_KEYS:
            continue
        query.append((key, item_value))
    query.sort()
    path = parsed.path or "/"
    if path != "/" and not preserve_trailing_slash:
        path = path.rstrip("/") or "/"
    return urllib.parse.urlunsplit(
        (
            scheme,
            netloc,
            path,
            urllib.parse.urlencode(query, doseq=True),
            "",
        )
    )


def parse_published_at(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    try:
        parsed = parsedate_to_datetime(raw)
    except (TypeError, ValueError, OverflowError):
        parsed = None
    if parsed is None:
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return ""
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def entry_link(entry: ET.Element) -> str:
    for link in direct_children(entry, "link"):
        href = (link.attrib.get("href") or "").strip()
        rel = (link.attrib.get("rel") or "alternate").lower()
        if href and rel in {"alternate", ""}:
            return normalize_url(href)
        text = element_text(link)
        if text:
            return normalize_url(text)
    return ""


def normalized_xml_bytes(xml_data: bytes) -> bytes:
    declaration = XML_DECLARATION_ENCODING.search(xml_data[:300])
    declared_encoding = (
        declaration.group(2).decode("ascii", errors="ignore").strip().lower() if declaration else ""
    )
    if xml_data.startswith((b"\xff\xfe", b"\xfe\xff")):
        decoder = "utf-16"
    elif xml_data.startswith(b"\xef\xbb\xbf"):
        decoder = "utf-8-sig"
    elif xml_data.startswith((b"<\x00?\x00", b"\xff\xfe<\x00")):
        decoder = "utf-16-le"
    elif xml_data.startswith((b"\x00<\x00?", b"\xfe\xff\x00<")):
        decoder = "utf-16-be"
    elif declared_encoding in {"euc-kr", "euckr", "ks_c_5601-1987"}:
        decoder = "cp949"
    else:
        decoder = declared_encoding or "utf-8"
    try:
        decoded = xml_data.decode(decoder, errors="replace")
    except LookupError:
        decoded = xml_data.decode("utf-8", errors="replace")
    decoded = ILLEGAL_XML_CONTROL_CHARACTERS.sub("", decoded)
    decoded = re.sub(
        r"(<\?xml[^>]*?encoding\s*=\s*['\"])([^'\"]+)(['\"])",
        r"\1utf-8\3",
        decoded,
        count=1,
        flags=re.IGNORECASE,
    )
    return decoded.encode("utf-8")


def parse_feed(xml_data: bytes, feed: dict[str, Any], collected_at: str, summary_limit: int) -> dict[str, Any]:
    root = ET.fromstring(normalized_xml_bytes(xml_data))
    root_name = local_name(root.tag)
    is_atom = root_name == "feed"
    container = root
    if not is_atom:
        channels = direct_children(root, "channel")
        if channels:
            container = channels[0]

    parsed_title = first_text(container, "title") or str(feed["title"])
    parsed_site_url = entry_link(container) or str(feed.get("siteUrl") or "")
    entry_name = "entry" if is_atom else "item"
    entry_root = container if is_atom else root
    entries = [node for node in entry_root.iter() if local_name(node.tag) == entry_name]
    items: list[dict[str, Any]] = []

    for feed_position, entry in enumerate(entries):
        title = plain_text(first_text(entry, "title"), 220)
        url = entry_link(entry)
        if not title or not url:
            continue
        guid = first_text(entry, "guid", "id") or url
        published_at = parse_published_at(first_text(entry, "pubdate", "published", "updated", "date"))
        summary_html = first_text(entry, "description", "summary", "content", "encoded")
        stable_source = f"{feed['id']}|{guid.strip() or url}"
        item_id = hashlib.sha256(stable_source.encode("utf-8")).hexdigest()[:24]
        items.append(
            {
                "id": item_id,
                "feedId": str(feed["id"]),
                "source": str(feed["title"]),
                "category": str(feed.get("category") or "기타"),
                "language": str(feed.get("language") or "und").lower(),
                "title": title,
                "url": url,
                "publishedAt": published_at,
                "collectedAt": collected_at,
                "feedPosition": feed_position,
                "summary": "" if feed.get("summaryMode") == "none" else plain_text(summary_html, summary_limit),
            }
        )

    return {
        "title": parsed_title,
        "siteUrl": parsed_site_url,
        "items": items,
    }


def fetch_feed_bytes(url: str, timeout: int = DEFAULT_FEED_TIMEOUT_SECONDS) -> bytes:
    normalized = normalize_url(url, preserve_trailing_slash=True)
    if not normalized:
        raise ValueError("공개 http/https RSS 주소만 사용할 수 있습니다.")
    data = b""
    for attempt in range(2):
        request = urllib.request.Request(
            normalized,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                final_url = normalize_url(response.geturl())
                if not final_url:
                    raise ValueError("RSS 주소가 안전하지 않은 위치로 이동했습니다.")
                data = response.read(MAX_FEED_BYTES + 1)
            break
        except urllib.error.HTTPError as exc:
            if attempt or exc.code not in RETRYABLE_HTTP_STATUS:
                raise
            retry_after = exc.headers.get("Retry-After", "") if exc.headers else ""
            try:
                delay = min(5.0, max(1.0, float(retry_after)))
            except ValueError:
                delay = 1.0
            time.sleep(delay)
    if len(data) > MAX_FEED_BYTES:
        raise ValueError(f"RSS 응답이 {MAX_FEED_BYTES // 1_000_000}MB를 초과했습니다.")
    return data


def load_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return deepcopy(fallback)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return deepcopy(fallback)


def semantic_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    comparable = deepcopy(snapshot)
    comparable["generatedAt"] = ""
    for feed in comparable.get("feeds", []):
        feed["lastCheckedAt"] = ""
        feed["lastSuccessAt"] = ""
    return comparable


def within_retention(item: dict[str, Any], cutoff: datetime) -> bool:
    raw = str(item.get("publishedAt") or item.get("collectedAt") or "").strip()
    if not raw:
        return True
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return True
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc) >= cutoff


def normalized_filter_values(config: dict[str, Any], key: str) -> tuple[str, ...]:
    values = config.get(key) or []
    if not isinstance(values, list):
        raise ValueError(f"{key}는 문자열 배열이어야 합니다.")
    return tuple(
        normalized
        for value in values
        if (normalized := unicodedata.normalize("NFKC", str(value)).strip().casefold())
    )


def normalized_text(value: str) -> str:
    return unicodedata.normalize("NFKC", value or "").strip().casefold()


def text_contains_keyword(text: str, keyword: str) -> bool:
    if keyword.isascii() and keyword.isalnum():
        return bool(re.search(rf"(?<![a-z0-9]){re.escape(keyword)}(?![a-z0-9])", text))
    return keyword in text


def title_is_excluded(title: str, prefixes: tuple[str, ...], keywords: tuple[str, ...]) -> bool:
    normalized = normalized_text(title)
    if not normalized:
        return False
    if any(normalized.startswith(prefix) for prefix in prefixes):
        return True
    for keyword in keywords:
        if text_contains_keyword(normalized, keyword):
            return True
    return False


def title_is_included(title: str, prefixes: tuple[str, ...], keywords: tuple[str, ...]) -> bool:
    if not prefixes and not keywords:
        return True
    normalized = normalized_text(title)
    return any(normalized.startswith(prefix) for prefix in prefixes) or any(
        text_contains_keyword(normalized, keyword) for keyword in keywords
    )


def normalized_title_key(title: str) -> str:
    normalized = normalized_text(title)
    normalized = re.sub(r"\s+[-–—]\s+[^-–—]{1,48}$", "", normalized)
    key = "".join(character for character in normalized if character.isalnum())
    return key if len(key) >= 18 else ""


def prepared_category_rules(config: dict[str, Any]) -> list[tuple[str, tuple[str, ...]]]:
    rules = config.get("categoryRules") or []
    if not isinstance(rules, list):
        raise ValueError("categoryRules는 객체 배열이어야 합니다.")
    prepared: list[tuple[str, tuple[str, ...]]] = []
    for rule in rules:
        if not isinstance(rule, dict):
            raise ValueError("categoryRules 항목은 객체여야 합니다.")
        category = str(rule.get("category") or "").strip()
        keywords = normalized_filter_values(rule, "keywords")
        if not category or not keywords:
            raise ValueError("categoryRules에는 category와 keywords가 필요합니다.")
        prepared.append((category, keywords))
    return prepared


def category_for_item(
    item: dict[str, Any],
    feed: dict[str, Any],
    category_rules: list[tuple[str, tuple[str, ...]]],
) -> str:
    default_category = str(feed.get("category") or "기타").strip() or "기타"
    if not feed.get("autoCategorize"):
        return default_category
    text = normalized_text(f"{item.get('title') or ''} {item.get('summary') or ''}")
    for category, keywords in category_rules:
        if any(text_contains_keyword(text, keyword) for keyword in keywords):
            return category
    return "" if feed.get("requireCategoryMatch") else default_category


def collect(
    config_path: Path,
    output_path: Path,
    fetcher: Callable[[str], bytes] = fetch_feed_bytes,
) -> tuple[dict[str, Any], bool]:
    config = load_json(config_path, {})
    raw_feeds = config.get("feeds") or []
    if not isinstance(raw_feeds, list):
        raise ValueError("feeds는 객체 배열이어야 합니다.")
    feeds = [feed for feed in raw_feeds if isinstance(feed, dict) and feed.get("enabled", True)]
    if not feeds:
        raise ValueError("newsletter-feeds.json에 공개 RSS가 하나 이상 필요합니다.")

    max_per_feed = max(1, int(config.get("maxItemsPerFeed", 8)))
    max_total = max(max_per_feed, int(config.get("maxTotalItems", 96)))
    retention_days = max(1, int(config.get("retentionDays", 180)))
    summary_limit = max(80, int(config.get("summaryMaxCharacters", 320)))
    fetch_timeout = min(35, max(5, int(config.get("fetchTimeoutSeconds", DEFAULT_FEED_TIMEOUT_SECONDS))))
    fetch_concurrency = min(MAX_FETCH_CONCURRENCY, max(1, int(config.get("fetchConcurrency", 6))))
    excluded_title_prefixes = normalized_filter_values(config, "excludeTitlePrefixes")
    excluded_title_keywords = normalized_filter_values(config, "excludeTitleKeywords")
    category_rules = prepared_category_rules(config)
    category_order = config.get("categoryOrder") or []
    if not isinstance(category_order, list) or any(not str(value).strip() for value in category_order):
        raise ValueError("categoryOrder는 비어 있지 않은 문자열 배열이어야 합니다.")
    category_order = list(dict.fromkeys(str(value).strip() for value in category_order))
    raw_category_caps = config.get("categoryCaps") or {}
    if not isinstance(raw_category_caps, dict):
        raise ValueError("categoryCaps는 카테고리별 최대 개수 객체여야 합니다.")
    category_caps = {str(key).strip(): max(1, int(value)) for key, value in raw_category_caps.items()}
    checked_at = utc_now()
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    previous = load_json(output_path, {"version": 1, "generatedAt": "", "feeds": [], "items": []})
    existing_items = {str(item.get("id")): item for item in previous.get("items", []) if item.get("id")}
    previous_by_feed: dict[str, list[dict[str, Any]]] = {}
    for item in existing_items.values():
        previous_by_feed.setdefault(str(item.get("feedId") or ""), []).append(item)

    feed_limits: dict[str, int] = {}
    feed_order: dict[str, int] = {}
    feed_priorities: dict[str, int] = {}
    normalized_feed_urls: set[str] = set()
    prepared_feeds: list[dict[str, Any]] = []

    for feed_index, feed in enumerate(feeds):
        feed_id = str(feed.get("id") or "").strip()
        feed_title = str(feed.get("title") or feed_id).strip()
        feed_url = str(feed.get("url") or "").strip()
        feed_language = str(feed.get("language") or "").strip().lower()
        if not feed_id or not feed_title or not feed_url:
            raise ValueError("각 RSS 설정에는 id, title, url이 필요합니다.")
        if feed_id in feed_limits:
            raise ValueError(f"중복 RSS id는 사용할 수 없습니다: {feed_id}")
        if feed_language not in {"ko", "en"}:
            raise ValueError("RSS language는 ko 또는 en이어야 합니다.")
        normalized_feed_url = normalize_url(feed_url)
        if not normalized_feed_url:
            raise ValueError(f"공개 http/https RSS 주소만 사용할 수 있습니다: {feed_id}")
        if normalized_feed_url in normalized_feed_urls:
            raise ValueError(f"중복 RSS 주소는 사용할 수 없습니다: {feed_url}")
        normalized_feed_urls.add(normalized_feed_url)
        if feed.get("summaryMode") not in {None, "feed", "none"}:
            raise ValueError(f"summaryMode는 feed 또는 none이어야 합니다: {feed_id}")
        feed_limits[feed_id] = max(1, int(feed.get("maxItems", max_per_feed)))
        feed_order[feed_id] = feed_index
        feed_priorities[feed_id] = int(feed.get("priority", 50))
        prepared_feed = dict(feed)
        prepared_feed.update(
            {
                "id": feed_id,
                "title": feed_title,
                "url": normalized_feed_url,
                "_fetchUrl": feed_url,
                "language": feed_language,
            }
        )
        prepared_feeds.append(prepared_feed)

    def fetch_one(feed: dict[str, Any]) -> dict[str, Any]:
        try:
            xml_data = fetcher(feed["url"]) if fetcher is not fetch_feed_bytes else fetch_feed_bytes(
                feed["_fetchUrl"], timeout=fetch_timeout
            )
            return {
                "parsed": parse_feed(xml_data, feed, checked_at, summary_limit),
                "error": "",
            }
        except Exception as exc:  # One unavailable source must not stop the other public feeds.
            return {
                "parsed": {"siteUrl": "", "items": []},
                "error": plain_text(str(exc), 180) or exc.__class__.__name__,
            }

    with concurrent.futures.ThreadPoolExecutor(
        max_workers=min(fetch_concurrency, len(prepared_feeds))
    ) as executor:
        fetched = list(executor.map(fetch_one, prepared_feeds))

    feed_states: list[dict[str, Any]] = []
    collected_items: list[dict[str, Any]] = []
    previous_feed_states = {
        str(feed.get("id") or ""): feed for feed in previous.get("feeds", []) if feed.get("id")
    }
    successful_feeds = 0

    for feed, result in zip(prepared_feeds, fetched):
        feed_id = feed["id"]
        feed_title = feed["title"]
        feed_language = feed["language"]
        error = result["error"]
        parsed = result["parsed"]
        parsed_items = parsed["items"]
        site_url = str(feed.get("siteUrl") or parsed.get("siteUrl") or "")
        if not error:
            successful_feeds += 1

        merged: dict[str, dict[str, Any]] = {}
        for previous_item in previous_by_feed.get(feed_id, []):
            if not previous_item.get("id"):
                continue
            copied_item = dict(previous_item)
            copied_item["_fetchedThisRun"] = False
            merged[str(copied_item["id"])] = copied_item
        for item in parsed_items:
            item = dict(item)
            old_item = existing_items.get(item["id"])
            if old_item and old_item.get("collectedAt"):
                item["collectedAt"] = old_item["collectedAt"]
            item["_fetchedThisRun"] = True
            merged[item["id"]] = item

        for item in merged.values():
            item["source"] = feed_title
            item["language"] = feed_language

        feed_excluded_prefixes = excluded_title_prefixes + normalized_filter_values(feed, "excludeTitlePrefixes")
        feed_excluded_keywords = excluded_title_keywords + normalized_filter_values(feed, "excludeTitleKeywords")
        included_prefixes = normalized_filter_values(feed, "includeTitlePrefixes")
        included_keywords = normalized_filter_values(feed, "includeTitleKeywords")

        feed_items: list[dict[str, Any]] = []
        for item in merged.values():
            title = str(item.get("title") or "")
            if not (item.get("_fetchedThisRun") and not item.get("publishedAt")) and not within_retention(
                item, cutoff
            ):
                continue
            if title_is_excluded(title, feed_excluded_prefixes, feed_excluded_keywords):
                continue
            if not title_is_included(title, included_prefixes, included_keywords):
                continue
            item_category = category_for_item(item, feed, category_rules)
            if not item_category:
                continue
            item["category"] = item_category
            feed_items.append(item)
        collected_items.extend(feed_items)
        last_success_at = checked_at if not error else str(
            previous_feed_states.get(feed_id, {}).get("lastSuccessAt") or ""
        )
        feed_states.append(
            {
                "id": feed_id,
                "title": feed_title,
                "url": feed["url"],
                "siteUrl": normalize_url(site_url),
                "category": str(feed.get("category") or "기타"),
                "language": feed_language,
                "kind": str(feed.get("kind") or "editorial"),
                "priority": feed_priorities[feed_id],
                "featured": bool(feed.get("featured")),
                "categories": [],
                "itemCount": 0,
                "lastCheckedAt": checked_at,
                "lastSuccessAt": last_success_at,
                "error": error,
            }
        )

    if successful_feeds == 0:
        raise RuntimeError("모든 RSS 수집이 실패했습니다. 기존 뉴스레터 데이터는 그대로 유지합니다.")

    collected_items.sort(
        key=lambda item: (
            feed_priorities.get(str(item.get("feedId") or ""), 50),
            item.get("publishedAt")
            or (checked_at if item.get("_fetchedThisRun") else item.get("collectedAt"))
            or "",
            bool(item.get("_fetchedThisRun")),
            -int(item.get("feedPosition") or 0),
            -feed_order.get(str(item.get("feedId") or ""), len(feeds)),
            item.get("id") or "",
        ),
        reverse=True,
    )
    selected_items: list[dict[str, Any]] = []
    selected_by_feed: dict[str, int] = {}
    selected_by_category: dict[str, int] = {}
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()
    for item in collected_items:
        if len(selected_items) >= max_total:
            break
        feed_id = str(item.get("feedId") or "")
        if selected_by_feed.get(feed_id, 0) >= feed_limits.get(feed_id, max_per_feed):
            continue
        item_category = str(item.get("category") or "기타")
        if selected_by_category.get(item_category, 0) >= category_caps.get(item_category, max_total):
            continue
        unique_url = normalize_url(str(item.get("url") or ""))
        unique_key = unique_url or str(item.get("id") or "")
        if not unique_key or unique_key in seen_urls:
            continue
        title_key = normalized_title_key(str(item.get("title") or ""))
        if title_key and title_key in seen_titles:
            continue
        seen_urls.add(unique_key)
        if title_key:
            seen_titles.add(title_key)
        selected_items.append(item)
        selected_by_feed[feed_id] = selected_by_feed.get(feed_id, 0) + 1
        selected_by_category[item_category] = selected_by_category.get(item_category, 0) + 1

    for item in selected_items:
        item.pop("_fetchedThisRun", None)

    selected_items.sort(
        key=lambda item: (
            item.get("publishedAt") or item.get("collectedAt") or "",
            feed_priorities.get(str(item.get("feedId") or ""), 50),
            -int(item.get("feedPosition") or 0),
            item.get("id") or "",
        ),
        reverse=True,
    )

    for feed_state in feed_states:
        feed_id = str(feed_state.get("id") or "")
        feed_state["itemCount"] = selected_by_feed.get(feed_id, 0)
        feed_categories = {
            str(item.get("category") or "기타") for item in selected_items if item.get("feedId") == feed_id
        }
        feed_state["categories"] = sorted(
            feed_categories,
            key=lambda value: (
                category_order.index(value) if value in category_order else len(category_order),
                value,
            ),
        )

    snapshot = {
        "version": 1,
        "generatedAt": checked_at,
        "categoryOrder": category_order,
        "feeds": feed_states,
        "items": selected_items,
    }
    changed = semantic_snapshot(snapshot) != semantic_snapshot(previous)
    if changed:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = output_path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(output_path)
    return snapshot, changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        snapshot, changed = collect(args.config, args.output)
    except Exception as exc:
        print(f"Newsletter collection failed: {exc}", file=sys.stderr)
        return 1
    errors = sum(1 for feed in snapshot["feeds"] if feed.get("error"))
    state = "updated" if changed else "unchanged"
    print(f"Newsletter snapshot {state}: {len(snapshot['items'])} items, {len(snapshot['feeds'])} feeds, {errors} errors")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
