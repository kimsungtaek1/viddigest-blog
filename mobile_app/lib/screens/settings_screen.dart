import 'package:flutter/material.dart';

import '../services/reader_settings_controller.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({required this.settingsController, super.key});

  final ReaderSettingsController settingsController;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: settingsController,
      builder: (context, _) {
        final theme = Theme.of(context);
        final selected = settingsController.selectedTextScaleOption;
        return Scaffold(
          appBar: AppBar(title: const Text('설정')),
          body: SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
              children: [
                Text('글자 크기', style: theme.textTheme.headlineMedium),
                const SizedBox(height: 10),
                Text(
                  '목록, 본문, 요약 화면에 같은 크기를 적용합니다.',
                  style: theme.textTheme.bodyMedium,
                ),
                const SizedBox(height: 18),
                SegmentedButton<double>(
                  showSelectedIcon: false,
                  segments: [
                    for (final option
                        in ReaderSettingsController.textScaleOptions)
                      ButtonSegment<double>(
                        value: option.value,
                        label: Text(option.label),
                      ),
                  ],
                  selected: {selected.value},
                  onSelectionChanged: (selection) {
                    settingsController.setTextScale(selection.single);
                  },
                ),
                const SizedBox(height: 22),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('미리보기', style: theme.textTheme.labelMedium),
                        const SizedBox(height: 10),
                        Text(
                          '이미지와 글을 같이 읽을 때 눈이 편한 크기로 맞춰두세요.',
                          style: theme.textTheme.bodyLarge,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
