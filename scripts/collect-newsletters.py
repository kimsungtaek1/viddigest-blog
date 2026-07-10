#!/usr/bin/env python3
"""Collect public RSS/Atom metadata into the isolated newsletter snapshot."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
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
TRACKING_QUERY_KEYS = {
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "ref",
    "source",
}


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


def normalize_url(value: str) -> str:
    try:
        parsed = urllib.parse.urlsplit(value.strip())
    except ValueError:
        return ""
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        return ""
    query = []
    for key, item_value in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True):
        lowered = key.lower()
        if lowered.startswith("utm_") or lowered in TRACKING_QUERY_KEYS:
            continue
        query.append((key, item_value))
    path = parsed.path or "/"
    return urllib.parse.urlunsplit(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower(),
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


def parse_feed(xml_data: bytes, feed: dict[str, Any], collected_at: str, summary_limit: int) -> dict[str, Any]:
    root = ET.fromstring(xml_data)
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
    items: list[dict[str, str]] = []

    for entry in entries:
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
                "title": title,
                "url": url,
                "publishedAt": published_at,
                "collectedAt": collected_at,
                "summary": plain_text(summary_html, summary_limit),
            }
        )

    return {
        "title": parsed_title,
        "siteUrl": parsed_site_url,
        "items": items,
    }


def fetch_feed_bytes(url: str) -> bytes:
    normalized = normalize_url(url)
    if not normalized:
        raise ValueError("공개 http/https RSS 주소만 사용할 수 있습니다.")
    request = urllib.request.Request(
        normalized,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
        },
    )
    with urllib.request.urlopen(request, timeout=35) as response:
        final_url = normalize_url(response.geturl())
        if not final_url:
            raise ValueError("RSS 주소가 안전하지 않은 위치로 이동했습니다.")
        data = response.read(MAX_FEED_BYTES + 1)
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


def collect(
    config_path: Path,
    output_path: Path,
    fetcher: Callable[[str], bytes] = fetch_feed_bytes,
) -> tuple[dict[str, Any], bool]:
    config = load_json(config_path, {})
    feeds = config.get("feeds") or []
    if not feeds:
        raise ValueError("newsletter-feeds.json에 공개 RSS가 하나 이상 필요합니다.")

    max_per_feed = max(1, int(config.get("maxItemsPerFeed", 24)))
    max_total = max(max_per_feed, int(config.get("maxTotalItems", 96)))
    retention_days = max(1, int(config.get("retentionDays", 180)))
    summary_limit = max(80, int(config.get("summaryMaxCharacters", 320)))
    checked_at = utc_now()
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    previous = load_json(output_path, {"version": 1, "generatedAt": "", "feeds": [], "items": []})
    existing_items = {str(item.get("id")): item for item in previous.get("items", []) if item.get("id")}
    previous_by_feed: dict[str, list[dict[str, Any]]] = {}
    for item in existing_items.values():
        previous_by_feed.setdefault(str(item.get("feedId") or ""), []).append(item)

    feed_states: list[dict[str, Any]] = []
    collected_items: list[dict[str, Any]] = []
    successful_feeds = 0

    for feed in feeds:
        feed_id = str(feed.get("id") or "").strip()
        feed_title = str(feed.get("title") or feed_id).strip()
        feed_url = str(feed.get("url") or "").strip()
        if not feed_id or not feed_title or not feed_url:
            raise ValueError("각 RSS 설정에는 id, title, url이 필요합니다.")

        error = ""
        parsed_items: list[dict[str, Any]] = []
        site_url = str(feed.get("siteUrl") or "")
        try:
            parsed = parse_feed(fetcher(feed_url), feed, checked_at, summary_limit)
            parsed_items = parsed["items"]
            site_url = parsed.get("siteUrl") or site_url
            successful_feeds += 1
        except Exception as exc:  # Keep the last good items when one public feed is temporarily unavailable.
            error = plain_text(str(exc), 180) or exc.__class__.__name__

        merged: dict[str, dict[str, Any]] = {
            str(item["id"]): item for item in previous_by_feed.get(feed_id, []) if item.get("id")
        }
        for item in parsed_items:
            old_item = existing_items.get(item["id"])
            if old_item and old_item.get("collectedAt"):
                item["collectedAt"] = old_item["collectedAt"]
            merged[item["id"]] = item

        feed_items = sorted(
            (item for item in merged.values() if within_retention(item, cutoff)),
            key=lambda item: (item.get("publishedAt") or item.get("collectedAt") or "", item.get("id") or ""),
            reverse=True,
        )[:max_per_feed]
        collected_items.extend(feed_items)
        feed_states.append(
            {
                "id": feed_id,
                "title": feed_title,
                "url": feed_url,
                "siteUrl": normalize_url(site_url),
                "category": str(feed.get("category") or "기타"),
                "itemCount": len(feed_items),
                "lastCheckedAt": checked_at,
                "error": error,
            }
        )

    if successful_feeds == 0:
        raise RuntimeError("모든 RSS 수집이 실패했습니다. 기존 뉴스레터 데이터는 그대로 유지합니다.")

    collected_items.sort(
        key=lambda item: (item.get("publishedAt") or item.get("collectedAt") or "", item.get("id") or ""),
        reverse=True,
    )
    snapshot = {
        "version": 1,
        "generatedAt": checked_at,
        "feeds": feed_states,
        "items": collected_items[:max_total],
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
