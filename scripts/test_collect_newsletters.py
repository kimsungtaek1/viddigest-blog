import importlib.util
import json
import tempfile
import threading
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("collect-newsletters.py")
SPEC = importlib.util.spec_from_file_location("collect_newsletters", SCRIPT)
collector = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(collector)


class NewsletterCollectorTests(unittest.TestCase):
    def test_normalize_url_removes_tracking_and_normalizes_equivalent_urls(self):
        self.assertEqual(
            collector.normalize_url("HTTPS://Example.COM:443/feed/?b=2&utm_source=test&a=1#fragment"),
            "https://example.com/feed?a=1&b=2",
        )
        self.assertEqual(
            collector.normalize_url("https://example.com/feed/", preserve_trailing_slash=True),
            "https://example.com/feed/",
        )
        self.assertEqual(collector.normalize_url("https://user:secret@example.com/feed"), "")

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

    def test_normalizes_euc_kr_and_invalid_xml_control_bytes(self):
        xml = """<?xml version='1.0' encoding='euc-kr'?><rss version='2.0'><channel>
        <item><title>보안 뉴스</title><link>https://example.com/security</link><guid>security</guid>
        <description>안전\b한 설명</description></item></channel></rss>""".encode("cp949")
        parsed = collector.parse_feed(
            xml,
            {"id": "security", "title": "보안뉴스", "category": "컴퓨터 사이언스", "language": "ko"},
            "2026-07-10T04:00:00Z",
            320,
        )
        self.assertEqual(parsed["items"][0]["title"], "보안 뉴스")
        self.assertEqual(parsed["items"][0]["summary"], "안전한 설명")

    def test_normalizes_utf_16_little_and_big_endian_feeds(self):
        text = """<?xml version='1.0' encoding='utf-16'?><rss version='2.0'><channel>
        <item><title>양방향 인코딩</title><link>https://example.com/utf16</link><guid>utf16</guid>
        <description>UTF-16 설명</description></item></channel></rss>"""
        for encoding, bom in (("utf-16-le", b"\xff\xfe"), ("utf-16-be", b"\xfe\xff")):
            with self.subTest(encoding=encoding):
                parsed = collector.parse_feed(
                    bom + text.encode(encoding),
                    {"id": encoding, "title": "UTF-16", "category": "컴퓨터 사이언스", "language": "ko"},
                    "2026-07-10T04:00:00Z",
                    320,
                )
                self.assertEqual(parsed["items"][0]["title"], "양방향 인코딩")
                self.assertEqual(parsed["items"][0]["summary"], "UTF-16 설명")

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

    def test_partial_outage_and_recovery_update_the_saved_error_state(self):
        xml = b"""<rss version="2.0"><channel><item><title>Stable useful item</title>
        <link>https://example.com/stable</link><guid>stable</guid></item></channel></rss>"""
        state = {"first_fails": False}

        def fetch(url):
            if state["first_fails"] and url.endswith("/first"):
                raise OSError("temporary outage")
            return xml

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "feeds.json"
            output = root / "newsletters.json"
            config.write_text(
                json.dumps(
                    {
                        "feeds": [
                            {
                                "id": "first",
                                "title": "First",
                                "url": "https://example.com/first",
                                "category": "AI",
                                "language": "en",
                            },
                            {
                                "id": "second",
                                "title": "Second",
                                "url": "https://example.com/second",
                                "category": "AI",
                                "language": "en",
                            },
                        ]
                    }
                ),
                encoding="utf-8",
            )
            collector.collect(config, output, fetcher=fetch)
            state["first_fails"] = True
            failed_snapshot, failed_changed = collector.collect(config, output, fetcher=fetch)
            self.assertTrue(failed_changed)
            self.assertEqual(failed_snapshot["feeds"][0]["error"], "temporary outage")
            _, repeated_changed = collector.collect(config, output, fetcher=fetch)
            self.assertFalse(repeated_changed)

            state["first_fails"] = False
            recovered_snapshot, recovered_changed = collector.collect(config, output, fetcher=fetch)
            self.assertTrue(recovered_changed)
            self.assertEqual(recovered_snapshot["feeds"][0]["error"], "")

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

    def test_duplicate_normalized_feed_urls_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "feeds.json"
            output = root / "newsletters.json"
            config.write_text(
                json.dumps(
                    {
                        "feeds": [
                            {
                                "id": "first",
                                "title": "First",
                                "url": "https://example.com/feed/?b=2&a=1",
                                "category": "AI",
                                "language": "en",
                            },
                            {
                                "id": "second",
                                "title": "Second",
                                "url": "https://EXAMPLE.com:443/feed?a=1&b=2&utm_source=test",
                                "category": "AI",
                                "language": "en",
                            },
                        ]
                    }
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "중복 RSS 주소"):
                collector.collect(config, output, fetcher=lambda _: b"")

    def test_auto_category_and_feed_specific_filters(self):
        xml = """<rss version="1.0"><channel><title>General</title>
        <item><title>AI 서비스의 생산성 향상 전략</title><link>https://example.com/ai</link><guid>ai</guid></item>
        <item><title>[홍보] AI 서비스 출시 행사</title><link>https://example.com/ad</link><guid>ad</guid></item>
        <item><title>주말 축구 경기 결과</title><link>https://example.com/sports</link><guid>sports</guid></item>
        </channel></rss>""".encode("utf-8")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "feeds.json"
            output = root / "newsletters.json"
            config.write_text(
                json.dumps(
                    {
                        "categoryRules": [{"category": "AI", "keywords": ["AI", "인공지능"]}],
                        "feeds": [
                            {
                                "id": "general",
                                "title": "General",
                                "url": "https://example.com/feed",
                                "category": "종합·해설",
                                "language": "ko",
                                "autoCategorize": True,
                                "requireCategoryMatch": True,
                                "excludeTitlePrefixes": ["[홍보]"],
                            }
                        ],
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            snapshot, _ = collector.collect(config, output, fetcher=lambda _: xml)
            self.assertEqual([item["title"] for item in snapshot["items"]], ["AI 서비스의 생산성 향상 전략"])
            self.assertEqual(snapshot["items"][0]["category"], "AI")
            self.assertEqual(snapshot["feeds"][0]["categories"], ["AI"])

    def test_priority_wins_cross_feed_title_deduplication(self):
        lower_xml = """<rss version="2.0"><channel><item>
        <title>인공지능 산업의 새로운 성장 전략을 깊이 분석합니다</title>
        <link>https://example.com/lower</link><guid>lower</guid>
        <pubDate>Fri, 10 Jul 2026 04:00:00 GMT</pubDate></item></channel></rss>""".encode("utf-8")
        higher_xml = """<rss version="2.0"><channel><item>
        <title>인공지능 산업의 새로운 성장 전략을 깊이 분석합니다</title>
        <link>https://example.com/higher</link><guid>higher</guid>
        <pubDate>Fri, 10 Jul 2026 01:00:00 GMT</pubDate></item></channel></rss>""".encode("utf-8")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "feeds.json"
            output = root / "newsletters.json"
            config_data = {
                "feeds": [
                    {
                        "id": "lower",
                        "title": "Lower",
                        "url": "https://example.com/lower-feed",
                        "category": "AI",
                        "language": "ko",
                        "priority": 40,
                    },
                    {
                        "id": "higher",
                        "title": "Higher",
                        "url": "https://example.com/higher-feed",
                        "category": "AI",
                        "language": "ko",
                        "priority": 90,
                    },
                ]
            }
            config.write_text(json.dumps(config_data), encoding="utf-8")
            data = {
                "https://example.com/lower-feed": lower_xml,
                "https://example.com/higher-feed": higher_xml,
            }
            snapshot, _ = collector.collect(config, output, fetcher=data.__getitem__)
            self.assertEqual([item["feedId"] for item in snapshot["items"]], ["higher"])

    def test_category_cap_and_parallel_fetching(self):
        barrier = threading.Barrier(2)
        xml_by_url = {
            "https://example.com/first": b"""<rss version="2.0"><channel><item><title>AI model architecture</title>
            <link>https://example.com/a</link><guid>a</guid></item></channel></rss>""",
            "https://example.com/second": b"""<rss version="2.0"><channel><item><title>AI coding assistant</title>
            <link>https://example.com/b</link><guid>b</guid></item></channel></rss>""",
        }

        def parallel_fetch(url):
            barrier.wait(timeout=2)
            return xml_by_url[url]

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "feeds.json"
            output = root / "newsletters.json"
            config.write_text(
                json.dumps(
                    {
                        "fetchConcurrency": 2,
                        "categoryCaps": {"AI": 1},
                        "feeds": [
                            {
                                "id": "first",
                                "title": "First",
                                "url": "https://example.com/first",
                                "category": "AI",
                                "language": "en",
                                "priority": 90,
                            },
                            {
                                "id": "second",
                                "title": "Second",
                                "url": "https://example.com/second",
                                "category": "AI",
                                "language": "en",
                                "priority": 50,
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )
            snapshot, _ = collector.collect(config, output, fetcher=parallel_fetch)
            self.assertEqual(len(snapshot["items"]), 1)
            self.assertEqual(snapshot["items"][0]["feedId"], "first")

    def test_undated_feed_keeps_the_feed_order_when_capped(self):
        xml = b"""<rss version="2.0"><channel>
        <item><title>Newest undated article</title><link>https://example.com/1</link><guid>1</guid></item>
        <item><title>Second undated article</title><link>https://example.com/2</link><guid>2</guid></item>
        <item><title>Third undated article</title><link>https://example.com/3</link><guid>3</guid></item>
        </channel></rss>"""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "feeds.json"
            output = root / "newsletters.json"
            config.write_text(
                json.dumps(
                    {
                        "feeds": [
                            {
                                "id": "undated",
                                "title": "Undated",
                                "url": "https://example.com/feed",
                                "category": "컴퓨터 사이언스",
                                "language": "en",
                                "maxItems": 2,
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            snapshot, _ = collector.collect(config, output, fetcher=lambda _: xml)
            self.assertEqual(
                [item["title"] for item in snapshot["items"]],
                ["Newest undated article", "Second undated article"],
            )

    def test_current_undated_item_is_not_expired_by_its_first_collection_date(self):
        xml = b"""<rss version="2.0"><channel><item><title>Still in the current feed</title>
        <link>https://example.com/current</link><guid>current</guid></item></channel></rss>"""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / "feeds.json"
            output = root / "newsletters.json"
            config.write_text(
                json.dumps(
                    {
                        "retentionDays": 1,
                        "feeds": [
                            {
                                "id": "undated",
                                "title": "Undated",
                                "url": "https://example.com/feed/",
                                "category": "컴퓨터 사이언스",
                                "language": "en",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            collector.collect(config, output, fetcher=lambda _: xml)
            previous = json.loads(output.read_text(encoding="utf-8"))
            previous["items"][0]["collectedAt"] = "2020-01-01T00:00:00Z"
            output.write_text(json.dumps(previous), encoding="utf-8")

            snapshot, _ = collector.collect(config, output, fetcher=lambda _: xml)
            self.assertEqual([item["title"] for item in snapshot["items"]], ["Still in the current feed"])


if __name__ == "__main__":
    unittest.main()
