import 'package:firebase_core/firebase_core.dart';

/// Firebase configuration, supplied at build time.
///
/// The same five values the website already reads from
/// `NEXT_PUBLIC_FIREBASE_*` — one project, one set of accounts, whether a
/// devotee signs in on the site or an operator signs in here.
///
/// Passing them explicitly (rather than shipping `google-services.json` and a
/// `GoogleService-Info.plist`) means one configuration path for web *and*
/// native, and nothing secret in the repository. These values are public by
/// design — a Firebase web config is visible in any browser's dev tools; what
/// protects the data is the token verification on the backend, not secrecy
/// here.
///
///   flutter build web \
///     --dart-define=FIREBASE_API_KEY=… \
///     --dart-define=FIREBASE_AUTH_DOMAIN=… \
///     --dart-define=FIREBASE_PROJECT_ID=… \
///     --dart-define=FIREBASE_APP_ID=… \
///     --dart-define=FIREBASE_MESSAGING_SENDER_ID=…
class FirebaseConfig {
  const FirebaseConfig._();

  static const String apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const String authDomain = String.fromEnvironment('FIREBASE_AUTH_DOMAIN');
  static const String projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const String appId = String.fromEnvironment('FIREBASE_APP_ID');
  static const String messagingSenderId =
      String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');

  /// Same test the website applies: an api key and an auth domain are the two
  /// without which nothing can work.
  static bool get isConfigured => apiKey.isNotEmpty && authDomain.isNotEmpty;

  static FirebaseOptions get options => const FirebaseOptions(
        apiKey: apiKey,
        authDomain: authDomain,
        projectId: projectId,
        appId: appId,
        messagingSenderId: messagingSenderId,
      );
}
