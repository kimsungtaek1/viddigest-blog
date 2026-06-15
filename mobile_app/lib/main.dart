import 'package:flutter/material.dart';

import 'screens/home_screen.dart';
import 'services/local_ai_service.dart';
import 'services/viddigest_repository.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const VidDigestApp());
}

class VidDigestApp extends StatelessWidget {
  const VidDigestApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'VidDigest',
      debugShowCheckedModeBanner: false,
      theme: buildVidDigestTheme(),
      home: HomeScreen(
        repository: VidDigestRepository(),
        aiService: LocalAiService(),
      ),
    );
  }
}
