import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/earnings_screen.dart';
import '../features/jobs/jobs_screen.dart';
import '../features/login_screen.dart';
import '../features/profile_screen.dart';
import 'auth.dart';
import 'ui.dart';

/// Bridges the Riverpod auth stream to something GoRouter can listen to.
///
/// Rebuilding the whole GoRouter on every auth change (the obvious
/// `ref.watch` approach) throws away navigation state, so the router is built
/// once and merely *refreshed* when sign-in status flips.
class _AuthRefresh extends ChangeNotifier {
  late final ProviderSubscription<AsyncValue<User?>> _sub;

  _AuthRefresh(Ref ref) {
    _sub = ref.listen<AsyncValue<User?>>(
      authStateProvider,
      (_, _) => notifyListeners(),
    );
  }

  @override
  void dispose() {
    _sub.close();
    super.dispose();
  }
}

Widget _screenFor(String path) => switch (path) {
      '/earnings' => const EarningsScreen(),
      '/profile' => const ProfileScreen(),
      _ => const JobsScreen(),
    };

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _AuthRefresh(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/jobs',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authStateProvider);

      // Hold on the current route until Firebase reports its first value —
      // redirecting during the unknown window flashes the login screen at an
      // operator who is already signed in.
      if (auth.isLoading) return null;

      final signedIn = auth.value != null;
      final atLogin = state.matchedLocation == '/login';

      if (!signedIn) return atLogin ? null : '/login';
      if (atLogin) return '/jobs';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => OperatorScaffold(
          index: navigationShell.currentIndex,
          onSelect: (i) => navigationShell.goBranch(
            i,
            initialLocation: i == navigationShell.currentIndex,
          ),
          child: navigationShell,
        ),
        // Driven by the same list the nav bar renders, so a brand that hides a
        // tab cannot leave an orphan branch behind it.
        branches: [
          for (final tab in operatorTabs)
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: tab.path,
                  builder: (context, state) => _screenFor(tab.path),
                ),
              ],
            ),
        ],
      ),
    ],
  );
});
