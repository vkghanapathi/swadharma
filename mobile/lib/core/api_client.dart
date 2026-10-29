import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'brand.dart';
import 'session_token.dart';

/// A backend error surfaced to the UI with a message worth showing a user.
class ApiException implements Exception {
  final String message;
  final int? statusCode;

  const ApiException(this.message, {this.statusCode});

  /// True when the failure is a lost/absent network rather than a server
  /// refusal — the operator apps treat these differently, since a vendor on
  /// the road drops signal constantly and that is not an error worth alarming
  /// them about.
  bool get isOffline => statusCode == null;

  @override
  String toString() => message;
}

/// Dio client for the app's own backend.
///
/// Lifted from the proven `sdv_global` storefront client, with two changes:
/// the vitta-api org-scoped route prefixes are gone (each operator app talks
/// to its own backend directly), and error normalisation handles FastAPI's
/// `detail` shape alongside Express's `error`/`message`.
class ApiClient {
  final Dio _dio;

  ApiClient._(this._dio);

  factory ApiClient.create({SessionTokenStore? sessions}) {
    final dio = Dio(
      BaseOptions(
        baseUrl: Brand.apiBaseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
        headers: {'Content-Type': 'application/json'},
      ),
    );
    final store = sessions ?? SessionTokenStore();

    Future<String?> bearer() async {
      switch (Brand.tokenStrategy) {
        case TokenStrategy.firebaseIdToken:
          final user = FirebaseAuth.instance.currentUser;
          if (user == null) return null;
          try {
            return await user.getIdToken();
          } catch (_) {
            // Usually offline. Let the request go out unauthenticated and fail
            // with a 401 the UI can explain, rather than throwing here where
            // there is no context.
            return null;
          }
        case TokenStrategy.exchangedSession:
          return store.current();
      }
    }

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await bearer();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (e, handler) async {
          // An exchanged session token expires on the backend's own schedule,
          // independently of Firebase. One silent re-exchange and retry keeps
          // that invisible to the operator; a second failure is a real refusal
          // and is surfaced.
          final retriable =
              Brand.tokenStrategy == TokenStrategy.exchangedSession &&
                  e.response?.statusCode == 401 &&
                  e.requestOptions.extra['retried'] != true;

          if (!retriable) {
            handler.next(e);
            return;
          }

          await store.clear();
          final fresh = await store.exchange();
          if (fresh == null) {
            handler.next(e);
            return;
          }

          final retry = e.requestOptions
            ..headers['Authorization'] = 'Bearer $fresh'
            ..extra['retried'] = true;
          try {
            handler.resolve(await dio.fetch(retry));
          } on DioException catch (again) {
            handler.next(again);
          }
        },
      ),
    );

    return ApiClient._(dio);
  }

  Dio get raw => _dio;

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) =>
      _send<T>(() => _dio.get(path, queryParameters: query));

  Future<T> post<T>(String path, {Object? body}) =>
      _send<T>(() => _dio.post(path, data: body));

  Future<T> patch<T>(String path, {Object? body}) =>
      _send<T>(() => _dio.patch(path, data: body));

  Future<T> _send<T>(Future<Response> Function() call) async {
    try {
      final resp = await call();
      return resp.data as T;
    } on DioException catch (e) {
      throw _normalise(e);
    }
  }

  ApiException _normalise(DioException e) {
    final resp = e.response;
    if (resp == null) {
      return ApiException(
        'No connection. This will be retried when you are back online.',
      );
    }
    final data = resp.data;
    String? msg;
    if (data is Map) {
      // FastAPI -> {"detail": "..."} | Express -> {"error": "..."} / {"message": "..."}
      final detail = data['detail'] ?? data['error'] ?? data['message'];
      if (detail is String) {
        msg = detail;
      } else if (detail is List && detail.isNotEmpty) {
        // FastAPI validation errors are a list of {loc, msg, type}.
        final first = detail.first;
        if (first is Map && first['msg'] != null) msg = first['msg'].toString();
      }
    }
    return ApiException(
      msg ?? 'Request failed (${resp.statusCode}).',
      statusCode: resp.statusCode,
    );
  }
}

final sessionTokenStoreProvider =
    Provider<SessionTokenStore>((ref) => SessionTokenStore());

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient.create(sessions: ref.watch(sessionTokenStoreProvider)),
);
