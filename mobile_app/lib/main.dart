import 'package:flutter/material.dart';

import 'screens/home_screen.dart';
import 'services/local_ai_service.dart';
import 'services/reader_settings_controller.dart';
import 'services/viddigest_repository.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const VidDigestApp());
}

class VidDigestApp extends StatefulWidget {
  const VidDigestApp({super.key});

  @override
  State<VidDigestApp> createState() => _VidDigestAppState();
}

class _VidDigestAppState extends State<VidDigestApp> {
  final _settingsController = ReaderSettingsController();
  final _repository = VidDigestRepository();
  final _aiService = LocalAiService();

  @override
  void initState() {
    super.initState();
    _settingsController.load();
  }

  @override
  void dispose() {
    _settingsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _settingsController,
      builder: (context, _) {
        return MaterialApp(
          title: 'VidDigest',
          debugShowCheckedModeBanner: false,
          theme: buildVidDigestTheme(),
          builder: (context, child) {
            final media = MediaQuery.of(context);
            final systemScale = media.textScaler.scale(1);
            final effectiveScale = systemScale * _settingsController.textScale;
            return MediaQuery(
              data: media.copyWith(
                textScaler: TextScaler.linear(
                  effectiveScale.clamp(0.85, 1.8).toDouble(),
                ),
              ),
              child: child ?? const SizedBox.shrink(),
            );
          },
          home: HomeScreen(
            repository: _repository,
            aiService: _aiService,
            settingsController: _settingsController,
          ),
        );
      },
    );
  }
}
