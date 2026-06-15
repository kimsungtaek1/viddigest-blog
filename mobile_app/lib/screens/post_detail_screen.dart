import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/viddigest_post.dart';
import '../services/local_ai_service.dart';
import '../services/viddigest_repository.dart';

class PostDetailScreen extends StatefulWidget {
  const PostDetailScreen({
    required this.post,
    required this.repository,
    required this.aiService,
    super.key,
  });

  final VidDigestPost post;
  final VidDigestRepository repository;
  final LocalAiService aiService;

  @override
  State<PostDetailScreen> createState() => _PostDetailScreenState();
}

class _PostDetailScreenState extends State<PostDetailScreen> {
  late Future<ArticleText> _articleFuture;
  Future<AiDraft>? _draftFuture;

  @override
  void initState() {
    super.initState();
    _articleFuture = widget.repository.loadArticle(widget.post);
  }

  Future<void> _openOriginal() async {
    final uri = Uri.parse(widget.post.postUrl);
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _summarize(ArticleText article) {
    setState(() {
      _draftFuture = widget.aiService.summarize(
        post: widget.post,
        article: article,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('글 읽기'),
        actions: [
          IconButton(
            tooltip: '원문 열기',
            onPressed: _openOriginal,
            icon: const Icon(Icons.open_in_new_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: FutureBuilder<ArticleText>(
          future: _articleFuture,
          builder: (context, snapshot) {
            final article = snapshot.data;
            final loading = snapshot.connectionState == ConnectionState.waiting;
            final body = article?.body.trim().isNotEmpty == true
                ? article!.body
                : widget.post.excerpt;

            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              children: [
                Text(widget.post.category, style: theme.textTheme.labelMedium),
                const SizedBox(height: 8),
                Text(widget.post.title, style: theme.textTheme.headlineMedium),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _MetaChip(
                      icon: Icons.calendar_today_rounded,
                      text: widget.post.date,
                    ),
                    _MetaChip(
                      icon: Icons.schedule_rounded,
                      text: widget.post.readLabel,
                    ),
                    if (widget.post.sourceLabel.isNotEmpty)
                      _MetaChip(
                        icon: Icons.play_circle_rounded,
                        text: widget.post.sourceLabel,
                      ),
                  ],
                ),
                const SizedBox(height: 18),
                _AiPanel(
                  loadingArticle: loading,
                  article: article,
                  draftFuture: _draftFuture,
                  onSummarize: article == null
                      ? null
                      : () => _summarize(article),
                ),
                const SizedBox(height: 18),
                if (loading)
                  const LinearProgressIndicator()
                else if (snapshot.hasError)
                  _ArticleNotice(
                    message: '본문을 가져오지 못해 목록 요약을 표시합니다.',
                    onOpenOriginal: _openOriginal,
                  ),
                const SizedBox(height: 14),
                Text(body, style: theme.textTheme.bodyLarge),
                if (widget.post.tags.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final tag in widget.post.tags.take(12))
                        Chip(label: Text(tag)),
                    ],
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _AiPanel extends StatelessWidget {
  const _AiPanel({
    required this.loadingArticle,
    required this.article,
    required this.draftFuture,
    required this.onSummarize,
  });

  final bool loadingArticle;
  final ArticleText? article;
  final Future<AiDraft>? draftFuture;
  final VoidCallback? onSummarize;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.memory_rounded),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('로컬 AI', style: theme.textTheme.titleMedium),
                ),
                IconButton.filledTonal(
                  tooltip: '요약 생성',
                  onPressed: loadingArticle ? null : onSummarize,
                  icon: const Icon(Icons.auto_awesome_rounded),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              '모델이 설치되어 있으면 기기 안에서 답변을 만들고, 없으면 임시 추출 요약을 보여줍니다.',
              style: theme.textTheme.bodyMedium,
            ),
            if (draftFuture != null) ...[
              const SizedBox(height: 12),
              FutureBuilder<AiDraft>(
                future: draftFuture,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const LinearProgressIndicator();
                  }
                  if (snapshot.hasError) {
                    return const Text('요약을 만들지 못했습니다.');
                  }
                  final draft = snapshot.data;
                  if (draft == null) {
                    return const SizedBox.shrink();
                  }
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(draft.title, style: theme.textTheme.titleMedium),
                      const SizedBox(height: 8),
                      Text(draft.body, style: theme.textTheme.bodyMedium),
                    ],
                  );
                },
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Chip(
      avatar: Icon(icon, size: 16),
      label: Text(text),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    );
  }
}

class _ArticleNotice extends StatelessWidget {
  const _ArticleNotice({required this.message, required this.onOpenOriginal});

  final String message;
  final VoidCallback onOpenOriginal;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF4EF),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFF0C8B8)),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline_rounded),
          const SizedBox(width: 8),
          Expanded(child: Text(message)),
          IconButton(
            tooltip: '원문 열기',
            onPressed: onOpenOriginal,
            icon: const Icon(Icons.open_in_new_rounded),
          ),
        ],
      ),
    );
  }
}
