import 'package:flutter/material.dart';

ThemeData buildVidDigestTheme() {
  const paper = Color(0xFFF5F6F1);
  const ink = Color(0xFF181B20);
  const graphite = Color(0xFF343941);
  const rule = Color(0xFFD8DDD3);
  const signal = Color(0xFF0E7C86);
  const ember = Color(0xFFC8553D);

  final scheme = ColorScheme.fromSeed(
    seedColor: signal,
    brightness: Brightness.light,
    surface: paper,
    primary: signal,
    secondary: ember,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: paper,
    fontFamily: 'Roboto',
    appBarTheme: const AppBarTheme(
      elevation: 0,
      backgroundColor: paper,
      foregroundColor: ink,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: rule),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: rule),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: rule),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: signal, width: 1.4),
      ),
    ),
    textTheme: const TextTheme(
      headlineMedium: TextStyle(
        color: ink,
        fontSize: 28,
        fontWeight: FontWeight.w800,
        height: 1.08,
        letterSpacing: 0,
      ),
      titleLarge: TextStyle(
        color: ink,
        fontSize: 19,
        fontWeight: FontWeight.w800,
        height: 1.2,
        letterSpacing: 0,
      ),
      titleMedium: TextStyle(
        color: ink,
        fontSize: 16,
        fontWeight: FontWeight.w700,
        height: 1.25,
        letterSpacing: 0,
      ),
      bodyLarge: TextStyle(
        color: graphite,
        fontSize: 16,
        height: 1.55,
        letterSpacing: 0,
      ),
      bodyMedium: TextStyle(
        color: graphite,
        fontSize: 14,
        height: 1.45,
        letterSpacing: 0,
      ),
      labelMedium: TextStyle(
        color: graphite,
        fontSize: 12,
        fontWeight: FontWeight.w700,
        height: 1.2,
        letterSpacing: 0,
      ),
    ),
  );
}
