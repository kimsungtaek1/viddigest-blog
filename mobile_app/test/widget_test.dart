import 'package:flutter_test/flutter_test.dart';
import 'package:viddigest_mobile/models/viddigest_post.dart';

void main() {
  test('VidDigestPost parses and searches post metadata', () {
    final post = VidDigestPost.fromJson({
      'title': 'Claude Code Google Ads',
      'slug': 'claude-code-google-ads',
      'date': '2026-06-10',
      'excerpt': '광고 자동화 사례',
      'category': '기타',
      'channel': 'Jono Catliff',
      'tags': ['Claude', 'Ads'],
      'readingTimeMinutes': 32,
      'videoId': '-EInjdpjKy0',
    });

    expect(post.postUrl, endsWith('/posts/claude-code-google-ads/'));
    expect(post.thumbnailUrl, contains('-EInjdpjKy0'));
    expect(post.matches('ads'), isTrue);
    expect(post.matches('없는 검색어'), isFalse);
  });
}
