import 'package:flutter/material.dart';

import '../models/viddigest_post.dart';
import '../services/local_ai_service.dart';
import '../services/reader_settings_controller.dart';
import '../services/viddigest_repository.dart';
import 'post_detail_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    required this.repository,
    required this.aiService,
    required this.settingsController,
    super.key,
  });

  final VidDigestRepository repository;
  final LocalAiService aiService;
  final ReaderSettingsController settingsController;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<List<VidDigestPost>> _postsFuture;
  String _query = '';
  LocalAiStatus? _aiStatus = const LocalAiStatus(
    initialized: false,
    ready: false,
    installedModels: [],
    message: '로컬 AI 상태는 메모리 버튼을 눌러 확인합니다. 첫 화면은 모델 초기화를 기다리지 않습니다.',
  );

  @override
  void initState() {
    super.initState();
    _postsFuture = widget.repository.loadPosts();
  }

  Future<void> _loadAiStatus() async {
    final status = await widget.aiService.inspect();
    if (!mounted) {
      return;
    }
    setState(() {
      _aiStatus = status;
    });
  }

  Future<void> _refresh() async {
    setState(() {
      _postsFuture = widget.repository.loadPosts();
    });
    await _postsFuture;
  }

  void _openSettings() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            SettingsScreen(settingsController: widget.settingsController),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('VidDigest'),
        actions: [
          IconButton(
            tooltip: '설정',
            icon: const Icon(Icons.settings_rounded),
            onPressed: _openSettings,
          ),
          IconButton(
            tooltip: '새로고침',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _refresh,
          ),
        ],
      ),
      body: SafeArea(
        child: FutureBuilder<List<VidDigestPost>>(
          future: _postsFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return _ErrorState(
                message: '글 목록을 불러오지 못했습니다.',
                onRetry: _refresh,
              );
            }
            final posts = snapshot.data ?? const <VidDigestPost>[];
            final filtered = posts
                .where((post) => post.matches(_query))
                .toList();
            return RefreshIndicator(
              onRefresh: _refresh,
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverToBoxAdapter(
                    child: _Header(
                      postCount: posts.length,
                      aiStatus: _aiStatus,
                      onInspectAi: _loadAiStatus,
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                      child: TextField(
                        onChanged: (value) => setState(() => _query = value),
                        textInputAction: TextInputAction.search,
                        decoration: const InputDecoration(
                          hintText: '제목, 채널, 태그 검색',
                          prefixIcon: Icon(Icons.search_rounded),
                        ),
                      ),
                    ),
                  ),
                  if (filtered.isEmpty)
                    const SliverFillRemaining(
                      hasScrollBody: false,
                      child: Center(child: Text('검색 결과가 없습니다.')),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                      sliver: SliverList.separated(
                        itemCount: filtered.length,
                        separatorBuilder: (context, index) =>
                            const SizedBox(height: 10),
                        itemBuilder: (context, index) {
                          final post = filtered[index];
                          return _PostCard(
                            post: post,
                            onTap: () {
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => PostDetailScreen(
                                    post: post,
                                    repository: widget.repository,
                                    aiService: widget.aiService,
                                  ),
                                ),
                              );
                            },
                          );
                        },
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.postCount,
    required this.aiStatus,
    required this.onInspectAi,
  });

  final int postCount;
  final LocalAiStatus? aiStatus;
  final VoidCallback onInspectAi;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = aiStatus;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('읽고 바로 묻는 요약 아카이브', style: theme.textTheme.headlineMedium),
          const SizedBox(height: 10),
          Text(
            '블로그와 MD 실행 문서를 폰에서 훑고, 로컬 모델이 준비되면 기기 안에서 요약을 생성합니다.',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _Metric(label: '글', value: '$postCount'),
              const SizedBox(width: 8),
              _Metric(
                label: 'AI',
                value: status == null
                    ? '확인 중'
                    : status.ready
                    ? '준비됨'
                    : '대기',
              ),
              const Spacer(),
              IconButton.filledTonal(
                tooltip: '로컬 AI 상태 확인',
                onPressed: onInspectAi,
                icon: const Icon(Icons.memory_rounded),
              ),
            ],
          ),
          if (status != null) ...[
            const SizedBox(height: 10),
            Text(status.message, style: theme.textTheme.bodyMedium),
          ],
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFD8DDD3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: theme.textTheme.labelMedium),
          const SizedBox(width: 8),
          Text(value, style: theme.textTheme.titleMedium),
        ],
      ),
    );
  }
}

class _PostCard extends StatelessWidget {
  const _PostCard({required this.post, required this.onTap});

  final VidDigestPost post;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Thumb(post: post),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      post.title,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      post.excerpt,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 7,
                      runSpacing: 7,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        _Pill(
                          icon: Icons.calendar_today_rounded,
                          text: post.date,
                        ),
                        _Pill(
                          icon: Icons.schedule_rounded,
                          text: post.readLabel,
                        ),
                        if (post.sourceLabel.isNotEmpty)
                          _Pill(
                            icon: Icons.play_circle_rounded,
                            text: post.sourceLabel,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.post});

  final VidDigestPost post;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: Container(
        width: 86,
        height: 86,
        color: const Color(0xFFE8ECE5),
        child: post.thumbnailUrl.isEmpty
            ? const Icon(Icons.article_rounded, size: 32)
            : Image.network(
                post.thumbnailUrl,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) =>
                    const Icon(Icons.article_rounded),
              ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: const Color(0xFFF0F3ED),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13),
          const SizedBox(width: 4),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 150),
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelMedium,
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off_rounded, size: 40),
            const SizedBox(height: 12),
            Text(message),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('다시 시도'),
            ),
          ],
        ),
      ),
    );
  }
}
