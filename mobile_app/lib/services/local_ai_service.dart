import 'package:flutter_gemma/core/api/flutter_gemma.dart';
import 'package:flutter_gemma/core/message.dart';

import '../models/viddigest_post.dart';

class LocalAiStatus {
  const LocalAiStatus({
    required this.initialized,
    required this.ready,
    required this.installedModels,
    required this.message,
  });

  final bool initialized;
  final bool ready;
  final List<String> installedModels;
  final String message;
}

class AiDraft {
  const AiDraft({
    required this.title,
    required this.body,
    required this.generatedByModel,
  });

  final String title;
  final String body;
  final bool generatedByModel;
}

class LocalAiService {
  bool _initialized = false;

  Future<LocalAiStatus> inspect() async {
    try {
      await _ensureInitialized();
      final models = await FlutterGemma.listInstalledModels();
      return LocalAiStatus(
        initialized: true,
        ready: models.isNotEmpty,
        installedModels: models,
        message: models.isEmpty
            ? '로컬 모델이 아직 설치되지 않았습니다. Gemma 4 E2B급 .litertlm 또는 .task 모델을 설치하면 기기 안에서 답변을 생성합니다.'
            : '설치된 로컬 모델 ${models.length}개를 찾았습니다.',
      );
    } catch (error) {
      return LocalAiStatus(
        initialized: false,
        ready: false,
        installedModels: const [],
        message: '로컬 AI 초기화가 아직 준비되지 않았습니다: $error',
      );
    }
  }

  Future<AiDraft> summarize({
    required VidDigestPost post,
    required ArticleText article,
  }) async {
    final prompt = _buildPrompt(post: post, article: article);
    try {
      await _ensureInitialized();
      final model = await FlutterGemma.getActiveModel(maxTokens: 4096);
      final session = await model.createSession();
      await session.addQueryChunk(Message.text(text: prompt, isUser: true));
      final response = await session.getResponse();
      await session.close();
      return AiDraft(
        title: '로컬 AI 요약',
        body: response.trim().isEmpty
            ? _fallbackSummary(post, article)
            : response,
        generatedByModel: response.trim().isNotEmpty,
      );
    } catch (_) {
      return AiDraft(
        title: '모델 준비 전 요약',
        body: _fallbackSummary(post, article),
        generatedByModel: false,
      );
    }
  }

  Future<void> _ensureInitialized() async {
    if (_initialized) {
      return;
    }
    await FlutterGemma.initialize(maxDownloadRetries: 3);
    _initialized = true;
  }

  String _buildPrompt({
    required VidDigestPost post,
    required ArticleText article,
  }) {
    final source = article.body.isEmpty ? post.excerpt : article.body;
    final clipped = source.length > 7000 ? source.substring(0, 7000) : source;
    return '''
다음 VidDigest 글을 한국어로 압축해줘.

제목: ${post.title}
출처: ${post.sourceLabel}
날짜: ${post.date}

요구 형식:
1. 핵심 요약 3줄
2. 실행 체크리스트 5개
3. 다시 읽어야 할 포인트 3개

본문:
$clipped
''';
  }

  String _fallbackSummary(VidDigestPost post, ArticleText article) {
    final source = article.body.isEmpty ? post.excerpt : article.body;
    final sentences = source
        .split(RegExp(r'(?<=[.!?。]|다\.|요\.)\s+'))
        .map((value) => value.trim())
        .where((value) => value.length > 20)
        .take(5)
        .toList();
    final tags = post.tags.take(5).join(', ');
    final bullets = sentences.isEmpty
        ? [post.excerpt.isEmpty ? post.title : post.excerpt]
        : sentences;

    return [
      '로컬 모델이 설치되면 이 영역은 기기 안에서 생성된 답변으로 바뀝니다.',
      '',
      '핵심 후보',
      for (final item in bullets) '- $item',
      if (tags.isNotEmpty) '',
      if (tags.isNotEmpty) '관련 태그: $tags',
    ].join('\n');
  }
}
