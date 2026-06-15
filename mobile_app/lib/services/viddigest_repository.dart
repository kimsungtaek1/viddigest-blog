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
    final response = await _client
        .get(Uri.parse(post.postUrl))
        .timeout(const Duration(seconds: 12));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw const FormatException('article response was not successful');
    }

    final document = html_parser.parse(response.body);
    final title = document.querySelector('h1')?.text.trim() ?? post.title;
    final body = _extractArticleBody(document);
    return ArticleText(
      title: title.isEmpty ? post.title : title,
      body: body,
      loadedFromNetwork: true,
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
        .toList(growable: false);
  }

  String _extractArticleBody(dom.Document document) {
    final root =
        document.querySelector('article') ??
        document.querySelector('.post-content') ??
        document.querySelector('.content') ??
        document.querySelector('main') ??
        document.body;
    if (root == null) {
      return '';
    }

    final buffer = StringBuffer();
    final nodes = root.querySelectorAll('h1, h2, h3, p, li, blockquote');
    for (final node in nodes) {
      final text = _normalizeWhitespace(node.text);
      if (text.length < 2) {
        continue;
      }
      if (_isBoilerplate(text)) {
        continue;
      }
      buffer.writeln(text);
      buffer.writeln();
    }
    return buffer.toString().trim();
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
