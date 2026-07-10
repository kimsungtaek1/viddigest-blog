import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("collect-newsletters.py")
SPEC = importlib.util.spec_from_file_location("collect_newsletters", SCRIPT)
collector = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(collector)


class NewsletterCollectorTests(unittest.TestCase):
    def test_parses_rss_and_strips_html(self):
        xml = b"""<?xml version="1.0"?><rss version="2.0"><channel>
        <title>Example</title><link>https://example.com/</link><item>
        <title>First &amp; Best</title><link>https://example.com/post?utm_source=test</link>
        <guid>post-1</guid><pubDate>Fri, 10 Jul 2026 01:00:00 GMT</pubDate>
        <description><![CDATA[<p>Hello <strong>reader</strong>.</p><script>bad()</script>]]></description>
        </item></channel></rss>"""
        parsed = collector.parse_feed(
            xml,
            {
                "id": "example",
                "title": "Example",
                "category": "AI",
                "language": "en",
                "siteUrl": "https://example.com/",
            },
            "2026-07-10T02:00:00Z",
            320,
        )
        self.assertEqual(len(parsed["items"]), 1)
        item = parsed["items"][0]
        self.assertEqual(item["title"], "First & Best")
        self.assertEqual(item["url"], "https://example.com/post")
        self.assertEqual(item["summary"], "Hello reader .")
        self.assertEqual(item["publishedAt"], "2026-07-10T01:00:00Z")
        self.assertEqual(item["language"], "en")

    def test_parses_atom_link_and_summary(self):
        xml = b"""<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
        <title>Atom Example</title><link href="https://example.com/"/><entry>
        <title>Atom item</title><link rel="alternate" href="https://example.com/atom"/>
        <id>tag:example,2026:1</id><updated>2026-07-10T03:00:00Z</updated>
        <summary type="html">A concise update</summary></entry></feed>"""
        parsed = collector.parse_feed(
            xml,
            {"id": "atom", "title": "Atom", "category": "개발", "siteUrl": "https://example.com/"},
            "2026-07-10T04:00:00Z",
            320,
        )
        self.assertEqual(parsed["items"][0]["url"], "https://example.com/atom")
        self.assertEqual(parsed["items"][0]["publishedAt"], "2026-07-10T03:00:00Z")

    def test_parses_rss_one_rdf_sibling_item(self):
        xml = b"""<?xml version="1.0"?><rdf:RDF
        xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
        xmlns="http://purl.org/rss/1.0/"><channel><title>RDF Feed</title>
        <link>https://example.com/</link></channel><item><title>RDF item</title>
        <link>https://example.com/rdf-item</link><description>RDF summary</description>
        </item></rdf:RDF>"""
        parsed = collector.parse_feed(
            xml,
            {"id": "rdf", "title": "RDF", "category": "개발", "siteUrl": "https://example.com/"},
            "2026-07-10T04:00:00Z",
            320,
        )
        self.assertEqual(len(parsed["items"]), 1)
        self.assertEqual(parsed["items"][0]["title"], "RDF item")

    def test_second_identical_collection_is_a_noop(self):
        xml = b"""<rss version="2.0"><channel><title>Example</title><item>
        <title>Stable item</title><link>https://example.com/stable</link><guid>stable</guid>
        </item></channel></rss>"""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "feeds.json"
            output = root / "newsletters.json"
            config.write_text(
                '{"feeds":[{"id":"example","title":"Example","url":"https://example.com/feed","siteUrl":"https://example.com/","category":"AI","language":"en"}]}',
                encoding="utf-8",
            )
            _, first_changed = collector.collect(config, output, fetcher=lambda _: xml)
            first_content = output.read_text(encoding="utf-8")
            _, second_changed = collector.collect(config, output, fetcher=lambda _: xml)
            self.assertTrue(first_changed)
            self.assertFalse(second_changed)
            self.assertEqual(output.read_text(encoding="utf-8"), first_content)

    def test_all_feed_outage_preserves_existing_snapshot(self):
        xml = b"""<rss version="2.0"><channel><title>Example</title><item>
        <title>Saved item</title><link>https://example.com/saved</link><guid>saved</guid>
        </item></channel></rss>"""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "feeds.json"
            output = root / "newsletters.json"
            config.write_text(
                '{"feeds":[{"id":"example","title":"Example","url":"https://example.com/feed","siteUrl":"https://example.com/","category":"AI","language":"en"}]}',
                encoding="utf-8",
            )
            collector.collect(config, output, fetcher=lambda _: xml)
            previous = output.read_text(encoding="utf-8")

            def fail_fetch(_):
                raise OSError("network down")

            with self.assertRaisesRegex(RuntimeError, "모든 RSS 수집이 실패"):
                collector.collect(config, output, fetcher=fail_fetch)
            self.assertEqual(output.read_text(encoding="utf-8"), previous)

    def test_retention_removes_expired_items(self):
        xml = b"""<rss version="2.0"><channel><title>Example</title><item>
        <title>Old item</title><link>https://example.com/old</link><guid>old</guid>
        <pubDate>Wed, 01 Jan 2020 00:00:00 GMT</pubDate></item></channel></rss>"""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "feeds.json"
            output = root / "newsletters.json"
            config.write_text(
                '{"retentionDays":30,"feeds":[{"id":"example","title":"Example","url":"https://example.com/feed","siteUrl":"https://example.com/","category":"AI","language":"en"}]}',
                encoding="utf-8",
            )
            snapshot, changed = collector.collect(config, output, fetcher=lambda _: xml)
            self.assertTrue(changed)
            self.assertEqual(snapshot["items"], [])

    def test_title_filters_prune_existing_items_before_feed_limit(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
        <title>한국어 뉴스</title>
        <item><title>[인사] 회사 임원</title><link>https://example.com/personnel</link>
        <guid>personnel</guid><pubDate>Fri, 10 Jul 2026 04:00:00 GMT</pubDate></item>
        <item><title>태풍 북상 소식</title><link>https://example.com/weather</link>
        <guid>weather</guid><pubDate>Fri, 10 Jul 2026 03:00:00 GMT</pubDate></item>
        <item><title>AI 도구 활용법</title><link>https://example.com/ai</link>
        <guid>ai</guid><pubDate>Fri, 10 Jul 2026 02:00:00 GMT</pubDate></item>
        <item><title>스타트업 성장 전략</title><link>https://example.com/business</link>
        <guid>business</guid><pubDate>Fri, 10 Jul 2026 01:00:00 GMT</pubDate></item>
        </channel></rss>""".encode("utf-8")
        empty_xml = b"""<rss version="2.0"><channel><title>Empty</title></channel></rss>"""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "feeds.json"
            output = root / "newsletters.json"
            config_data = {
                "maxItemsPerFeed": 4,
                "maxTotalItems": 4,
                "feeds": [
                    {
                        "id": "korean",
                        "title": "한국어 뉴스",
                        "url": "https://example.com/feed",
                        "siteUrl": "https://example.com/",
                        "category": "한국 뉴스",
                        "language": "ko",
                    }
                ],
            }
            config.write_text(json.dumps(config_data, ensure_ascii=False), encoding="utf-8")
            first_snapshot, _ = collector.collect(config, output, fetcher=lambda _: xml)
            self.assertEqual(len(first_snapshot["items"]), 4)

            config_data["maxItemsPerFeed"] = 2
            config_data["maxTotalItems"] = 2
            config_data["excludeTitlePrefixes"] = ["[인사]"]
            config_data["excludeTitleKeywords"] = ["태풍"]
            config.write_text(json.dumps(config_data, ensure_ascii=False), encoding="utf-8")
            filtered_snapshot, changed = collector.collect(config, output, fetcher=lambda _: empty_xml)

            self.assertTrue(changed)
            self.assertEqual(
                [item["title"] for item in filtered_snapshot["items"]],
                ["AI 도구 활용법", "스타트업 성장 전략"],
            )

            self.assertTrue(collector.title_is_excluded("기업 MOU 체결", (), ("mou",)))
            self.assertTrue(collector.title_is_excluded("기업 ＭｏＵ 체결", (), ("mou",)))
            self.assertFalse(collector.title_is_excluded("Mouse 입력 장치 활용법", (), ("mou",)))
            self.assertFalse(collector.title_is_excluded("Run autonomous coding agents", (), ("mou",)))

    def test_korean_text_and_language_metadata_are_preserved(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
        <title>한국어 뉴스</title><item><title>새로운 인공지능 소식</title>
        <link>https://example.com/korean</link><guid>korean</guid>
        <description>한국어 설명입니다.</description></item></channel></rss>""".encode("utf-8")
        empty_xml = b"""<rss version="2.0"><channel><title>Empty</title></channel></rss>"""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "feeds.json"
            output = root / "newsletters.json"
            config.write_text(
                '{"feeds":[{"id":"korean","title":"한국어 뉴스","url":"https://example.com/feed",'
                '"siteUrl":"https://example.com/","category":"한국 뉴스","language":"ko"}]}',
                encoding="utf-8",
            )
            first_snapshot, _ = collector.collect(config, output, fetcher=lambda _: xml)
            self.assertEqual(first_snapshot["feeds"][0]["language"], "ko")
            self.assertEqual(first_snapshot["items"][0]["title"], "새로운 인공지능 소식")
            self.assertEqual(first_snapshot["items"][0]["language"], "ko")

            config.write_text(
                '{"feeds":[{"id":"korean","title":"Korean News","url":"https://example.com/feed",'
                '"siteUrl":"https://example.com/","category":"Global","language":"en"}]}',
                encoding="utf-8",
            )
            migrated_snapshot, changed = collector.collect(config, output, fetcher=lambda _: empty_xml)
            self.assertTrue(changed)
            self.assertEqual(migrated_snapshot["items"][0]["language"], "en")
            self.assertEqual(migrated_snapshot["items"][0]["source"], "Korean News")
            self.assertEqual(migrated_snapshot["items"][0]["category"], "Global")

    def test_feed_limits_and_cross_feed_url_deduplication(self):
        first_xml = b"""<rss version="2.0"><channel><title>First</title>
        <item><title>Shared from first</title><link>https://example.com/shared</link><guid>first-shared</guid>
        <pubDate>Fri, 10 Jul 2026 04:00:00 GMT</pubDate></item>
        <item><title>First unique</title><link>https://example.com/first</link><guid>first-unique</guid>
        <pubDate>Fri, 10 Jul 2026 02:00:00 GMT</pubDate></item></channel></rss>"""
        second_xml = b"""<rss version="2.0"><channel><title>Second</title>
        <item><title>Shared from second</title><link>https://example.com/shared</link><guid>second-shared</guid>
        <pubDate>Fri, 10 Jul 2026 04:00:00 GMT</pubDate></item>
        <item><title>Second unique</title><link>https://example.com/second</link><guid>second-unique</guid>
        <pubDate>Fri, 10 Jul 2026 03:00:00 GMT</pubDate></item>
        <item><title>Second extra</title><link>https://example.com/extra</link><guid>second-extra</guid>
        <pubDate>Fri, 10 Jul 2026 01:00:00 GMT</pubDate></item></channel></rss>"""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "feeds.json"
            output = root / "newsletters.json"
            config_data = {
                "maxItemsPerFeed": 3,
                "maxTotalItems": 4,
                "feeds": [
                    {
                        "id": "first",
                        "title": "First",
                        "url": "https://example.com/first-feed",
                        "siteUrl": "https://example.com/",
                        "category": "사업",
                        "language": "en",
                    },
                    {
                        "id": "second",
                        "title": "Second",
                        "url": "https://example.com/second-feed",
                        "siteUrl": "https://example.com/",
                        "category": "법률",
                        "language": "en",
                        "maxItems": 1,
                    },
                ],
            }
            config.write_text(json.dumps(config_data), encoding="utf-8")
            feed_data = {
                "https://example.com/first-feed": first_xml,
                "https://example.com/second-feed": second_xml,
            }
            snapshot, changed = collector.collect(config, output, fetcher=feed_data.__getitem__)

            self.assertTrue(changed)
            self.assertEqual(
                [item["url"] for item in snapshot["items"]],
                ["https://example.com/shared", "https://example.com/second", "https://example.com/first"],
            )
            self.assertEqual(len({item["url"] for item in snapshot["items"]}), 3)
            self.assertEqual({feed["id"]: feed["itemCount"] for feed in snapshot["feeds"]}, {"first": 2, "second": 1})


if __name__ == "__main__":
    unittest.main()
