import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ReaderSettingsController extends ChangeNotifier {
  static const String _textScaleKey = 'viddigest.reader.textScale.v1';
  static const double defaultTextScale = 1.0;
  static const List<ReaderTextScaleOption> textScaleOptions = [
    ReaderTextScaleOption(label: '작게', value: 0.9),
    ReaderTextScaleOption(label: '보통', value: 1.0),
    ReaderTextScaleOption(label: '크게', value: 1.15),
    ReaderTextScaleOption(label: '아주 크게', value: 1.3),
  ];

  double _textScale = defaultTextScale;

  double get textScale => _textScale;

  ReaderTextScaleOption get selectedTextScaleOption {
    return textScaleOptions.reduce((current, candidate) {
      final currentDistance = (current.value - _textScale).abs();
      final candidateDistance = (candidate.value - _textScale).abs();
      return candidateDistance < currentDistance ? candidate : current;
    });
  }

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getDouble(_textScaleKey);
    if (saved == null) {
      return;
    }
    _textScale = _normalizeTextScale(saved);
    notifyListeners();
  }

  Future<void> setTextScale(double value) async {
    final normalized = _normalizeTextScale(value);
    if (normalized == _textScale) {
      return;
    }
    _textScale = normalized;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_textScaleKey, normalized);
  }

  double _normalizeTextScale(double value) {
    for (final option in textScaleOptions) {
      if ((option.value - value).abs() < 0.001) {
        return option.value;
      }
    }
    return value.clamp(0.85, 1.35).toDouble();
  }
}

class ReaderTextScaleOption {
  const ReaderTextScaleOption({required this.label, required this.value});

  final String label;
  final double value;
}
