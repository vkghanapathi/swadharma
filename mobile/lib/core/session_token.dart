import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'brand.dart';

/// Which credential this app puts in the `Authorization` header.
enum TokenStrategy {
  /// Send the Firebase ID token straight through. The backend verifies it
  /// itself — what Dravya's FastAPI does in `app/auth/firebase.py`.
  firebaseIdToken,

  /// Trade the Firebase token for the backend's own session token, once, and
  /// send that.
  ///
  /// Swadharma needs this: every guard there reads `clientId` off the token to
  /// resolve the institution, and a Firebase token cannot carry one — Google
  /// knows nothing of institutions. `POST /auth/firebase` performs the swap.
  exchangedSession,
}

/// Holds the backend session token obtained by exchanging a Firebase ID token.
///
/// Cached across launches because the exchange costs a round trip, and an
/// operator opening the app in a temple basement should not need connectivity
/// to see the queue they already loaded.
class SessionTokenStore {
  static const _key = 'backend_session_token';

  /// A bare client — deliberately not the app's [ApiClient], whose interceptor
  /// would call back into this store and recurse.
  final Dio _bare;

  String? _cached;

  SessionTokenStore({Dio? client})
      : _bare = client ??
            Dio(BaseOptions(
              baseUrl: Brand.apiBaseUrl,
              connectTimeout: const Duration(seconds: 15),
              receiveTimeout: const Duration(seconds: 30),
              headers: {'Content-Type': 'application/json'},
            ));

  /// The current session token, exchanging for one if there is none.
  Future<String?> current() async {
    if (_cached != null) return _cached;

    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_key);
    if (stored != null) {
      _cached = stored;
      return stored;
    }
    return exchange();
  }

  /// Swap the signed-in user's Firebase token for a backend session token.
  /// Returns null when nobody is signed in or the backend refuses.
  Future<String?> exchange() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return null;

    final String idToken;
    try {
      idToken = (await user.getIdToken(true)) ?? '';
    } catch (_) {
      return null; // Usually offline; the caller surfaces a normal error.
    }
    if (idToken.isEmpty) return null;

    try {
      final resp = await _bare.post<Map<String, dynamic>>(
        Brand.sessionExchangePath,
        options: Options(headers: {'Authorization': 'Bearer $idToken'}),
      );
      final token = (resp.data?['data'] as Map?)?['accessToken'] as String?;
      if (token == null || token.isEmpty) return null;

      _cached = token;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, token);
      return token;
    } on DioException {
      return null;
    }
  }

  /// Drop the stored token — on sign-out, or after the backend rejects it.
  Future<void> clear() async {
    _cached = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
