class VidDigestPost {
  const VidDigestPost({
    required this.title,
    required this.slug,
    required this.date,
    required this.excerpt,
    required this.category,
    required this.channel,
    required this.author,
    required this.tags,
    required this.readingTimeMinutes,
    required this.duration,
    required this.videoId,
    required this.viewCount,
  });

  factory VidDigestPost.fromJson(Map<String, dynamic> json) {
    return VidDigestPost(
      title: _string(json['title']),
      slug: _string(json['slug']),
      date: _string(json['date']),
      excerpt: _string(json['excerpt']),
      category: _string(json['category'], fallback: '기타'),
      channel: _string(json['channel']),
      author: _string(json['author'], fallback: 'VidDigest'),
      tags: (json['tags'] as List<dynamic>? ?? const [])
          .map((value) => value.toString())
          .where((value) => value.trim().isNotEmpty)
          .toList(growable: false),
      readingTimeMinutes: _int(json['readingTimeMinutes']),
      duration: _string(json['duration']),
      videoId: _string(json['videoId']),
      viewCount: _int(json['viewCount']),
    );
  }

  final String title;
  final String slug;
  final String date;
  final String excerpt;
  final String category;
  final String channel;
  final String author;
  final List<String> tags;
  final int readingTimeMinutes;
  final String duration;
  final String videoId;
  final int viewCount;

  String get postUrl => 'https://viddigest-blog.pages.dev/posts/$slug/';

  String get thumbnailUrl {
    if (videoId.isEmpty) {
      return '';
    }
    return 'https://img.youtube.com/vi/$videoId/hqdefault.jpg';
  }

  bool get hasVideo => videoId.isNotEmpty;

  String get sourceLabel {
    if (channel.isNotEmpty) {
      return channel;
    }
    return author;
  }

  String get readLabel {
    if (readingTimeMinutes <= 0) {
      return '읽기';
    }
    return '$readingTimeMinutes분';
  }

  bool matches(String query) {
    final normalized = query.trim().toLowerCase();
    if (normalized.isEmpty) {
      return true;
    }
    return [
      title,
      excerpt,
      category,
      channel,
      author,
      date,
      ...tags,
    ].any((value) => value.toLowerCase().contains(normalized));
  }

  static String _string(dynamic value, {String fallback = ''}) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty ? fallback : text;
  }

  static int _int(dynamic value) {
    if (value is int) {
      return value;
    }
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }
}

class ArticleText {
  const ArticleText({
    required this.title,
    required this.body,
    required this.blocks,
    required this.images,
    required this.loadedFromNetwork,
    required this.sourceUrl,
  });

  final String title;
  final String body;
  final List<ArticleBlock> blocks;
  final List<ArticleImage> images;
  final bool loadedFromNetwork;
  final String sourceUrl;

  bool get isEmpty => body.trim().isEmpty;
}

abstract class ArticleBlock {
  const ArticleBlock();
}

class ArticleParagraphBlock extends ArticleBlock {
  const ArticleParagraphBlock(this.text);

  final String text;
}

class ArticleImageBlock extends ArticleBlock {
  const ArticleImageBlock(this.image);

  final ArticleImage image;
}

class ArticleImage {
  const ArticleImage({
    required this.url,
    required this.alt,
    required this.caption,
  });

  final String url;
  final String alt;
  final String caption;

  String get label {
    if (caption.isNotEmpty) {
      return caption;
    }
    return alt;
  }
}
