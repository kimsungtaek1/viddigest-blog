import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:viddigest_mobile/models/viddigest_post.dart';
import 'package:viddigest_mobile/services/viddigest_repository.dart';

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

  test('VidDigestRepository sorts posts by newest date first', () async {
    SharedPreferences.setMockInitialValues({});
    final repository = VidDigestRepository(
      client: MockClient((request) async {
        return http.Response('''
          [
            {"title":"Old","slug":"old","date":"2026-01-01","excerpt":"old"},
            {"title":"New","slug":"new","date":"2026-06-15","excerpt":"new"}
          ]
          ''', 200);
      }),
    );

    final posts = await repository.loadPosts();

    expect(posts.map((post) => post.slug), ['new', 'old']);
  });

  test('VidDigestRepository keeps article images from post HTML', () async {
    final post = VidDigestPost.fromJson({
      'title': 'Article with images',
      'slug': 'article-with-images',
      'date': '2026-06-15',
      'excerpt': 'excerpt',
    });
    final repository = VidDigestRepository(
      client: MockClient((request) async {
        return http.Response(
          '''
          <article>
            <p>첫 문단입니다.</p>
            <div class="screenshot-container">
              <img src="images/segment_000.jpg" alt="도입 장면">
              <div class="caption">도입 장면</div>
            </div>
            <p>둘째 문단입니다.</p>
          </article>
          ''',
          200,
          headers: {'content-type': 'text/html; charset=utf-8'},
        );
      }),
    );

    final article = await repository.loadArticle(post);

    expect(article.body, contains('첫 문단입니다.'));
    expect(article.images, hasLength(1));
    expect(
      article.images.single.url,
      'https://viddigest-blog.pages.dev/posts/article-with-images/images/segment_000.jpg',
    );
    expect(article.images.single.label, '도입 장면');
    expect(article.blocks.whereType<ArticleImageBlock>(), hasLength(1));
  });
}
