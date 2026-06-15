import 'dart:convert';

import 'package:html/dom.dart' as dom;
import 'package:html/parser.dart' as html_parser;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/viddigest_post.dart';

class VidDigestRepository {
  VidDigestRepository({http.Client? client})
    : _client = client ?? http.Client();

  static const String postsEndpoint =
      'https://viddigest-blog.pages.dev/posts.json';
  static const String _postsCacheKey = 'viddigest.posts.cache.v1';

  final http.Client _client;

  Future<List<VidDigestPost>> loadPosts() async {
    final prefs = await SharedPreferences.getInstance();
    try {
      final response = await _client
          .get(Uri.parse(postsEndpoint))
          .timeout(const Duration(seconds: 12));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw const FormatException('posts.json response was not successful');
      }
      await prefs.setString(_postsCacheKey, response.body);
      return _parsePosts(response.body);
    } catch (_) {
      final cached = prefs.getString(_postsCacheKey);
      if (cached == null || cached.isEmpty) {
        rethrow;
      }
      return _parsePosts(cached);
    }
  }

  Future<ArticleText> loadArticle(VidDigestPost post) async {
    final loaded = await _loadArticleResponse(post);

    final document = html_parser.parse(loaded.body);
    final title = document.querySelector('h1')?.text.trim() ?? post.title;
    final blocks = _extractArticleBlocks(document, loaded.url);
    final body = blocks
        .whereType<ArticleParagraphBlock>()
        .map((block) => block.text)
        .join('\n\n')
        .trim();
    final images = blocks
        .whereType<ArticleImageBlock>()
        .map((block) => block.image)
        .toList(growable: false);
    return ArticleText(
      title: title.isEmpty ? post.title : title,
      body: body,
      blocks: blocks,
      images: images,
      loadedFromNetwork: true,
      sourceUrl: loaded.url,
    );
  }

  List<VidDigestPost> _parsePosts(String body) {
    final decoded = jsonDecode(body);
    if (decoded is! List<dynamic>) {
      throw const FormatException('posts.json must be a list');
    }
    return decoded
        .whereType<Map<String, dynamic>>()
        .map(VidDigestPost.fromJson)
        .where((post) => post.title.isNotEmpty && post.slug.isNotEmpty)
        .toList(growable: false)
      ..sort((a, b) {
        final dateCompare = b.date.compareTo(a.date);
        if (dateCompare != 0) {
          return dateCompare;
        }
        return b.title.compareTo(a.title);
      });
  }

  Future<_LoadedArticle> _loadArticleResponse(VidDigestPost post) async {
    final candidates = <String>[
      post.postUrl,
      'https://viddigest-blog.pages.dev/md/${post.slug}/',
    ];
    Object? lastError;
    for (final url in candidates) {
      try {
        final response = await _client
            .get(Uri.parse(url))
            .timeout(const Duration(seconds: 12));
        if (response.statusCode >= 200 && response.statusCode < 300) {
          return _LoadedArticle(url: url, body: response.body);
        }
        lastError = FormatException('article response failed for $url');
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError != null) {
      throw lastError;
    }
    throw const FormatException('article response was not successful');
  }

  List<ArticleBlock> _extractArticleBlocks(dom.Document document, String url) {
    final root =
        document.querySelector('article') ??
        document.querySelector('.post-content') ??
        document.querySelector('.content') ??
        document.querySelector('main') ??
        document.body;
    if (root == null) {
      return const [];
    }

    final blocks = <ArticleBlock>[];
    final seenImages = <String>{};
    final nodes = root.querySelectorAll(
      'h1, h2, h3, p, li, blockquote, .screenshot-container, img',
    );
    for (final node in nodes) {
      if (_hasAncestor(node, 'screenshot-container') &&
          !node.classes.contains('screenshot-container')) {
        continue;
      }
      if (node.classes.contains('screenshot-container')) {
        final image = _extractImage(node, url);
        if (image != null && seenImages.add(image.url)) {
          blocks.add(ArticleImageBlock(image));
        }
        continue;
      }
      if (node.localName == 'img') {
        final image = _extractImage(node, url);
        if (image != null && seenImages.add(image.url)) {
          blocks.add(ArticleImageBlock(image));
        }
        continue;
      }

      final text = _normalizeWhitespace(node.text);
      if (text.length < 2) {
        continue;
      }
      if (_isBoilerplate(text)) {
        continue;
      }
      blocks.add(ArticleParagraphBlock(text));
    }
    return blocks;
  }

  ArticleImage? _extractImage(dom.Element node, String articleUrl) {
    final img = node.localName == 'img' ? node : node.querySelector('img');
    if (img == null) {
      return null;
    }
    final src = img.attributes['src']?.trim() ?? '';
    if (src.isEmpty) {
      return null;
    }
    final caption = _normalizeWhitespace(
      node.querySelector('.caption')?.text ?? '',
    );
    return ArticleImage(
      url: _absoluteUrl(articleUrl, src),
      alt: _normalizeWhitespace(img.attributes['alt'] ?? ''),
      caption: caption,
    );
  }

  String _absoluteUrl(String articleUrl, String value) {
    if (value.startsWith('//')) {
      return 'https:$value';
    }
    return Uri.parse(articleUrl).resolve(value).toString();
  }

  bool _hasAncestor(dom.Element node, String className) {
    var parent = node.parent;
    while (parent != null) {
      if (parent.classes.contains(className)) {
        return true;
      }
      parent = parent.parent;
    }
    return false;
  }

  String _normalizeWhitespace(String value) {
    return value.replaceAll(RegExp(r'\s+'), ' ').trim();
  }

  bool _isBoilerplate(String value) {
    final lower = value.toLowerCase();
    return lower == 'viddigest' ||
        lower == '블로그' ||
        lower == 'md' ||
        lower.contains('claude + codex workflow') ||
        lower.contains('page 1') ||
        lower.contains('page 2') ||
        lower.contains('page 3');
  }
}

class _LoadedArticle {
  const _LoadedArticle({required this.url, required this.body});

  final String url;
  final String body;
}
