import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'brand.dart';
import 'connectivity.dart';

/// One bottom-nav destination. Declared once and consumed by both the shell
/// and the router, so a tab cannot appear in the bar without a route behind it.
class OperatorTab {
  final String path;
  final String label;
  final IconData icon;
  final IconData selectedIcon;

  const OperatorTab({
    required this.path,
    required this.label,
    required this.icon,
    required this.selectedIcon,
  });
}

/// The tabs this app shows. Earnings is brand-gated: an operator who is staff
/// on a fulfilment queue has no payout ledger, and an always-erroring tab is
/// worse than no tab.
final List<OperatorTab> operatorTabs = [
  const OperatorTab(
    path: '/jobs',
    label: 'Jobs',
    icon: Icons.assignment_outlined,
    selectedIcon: Icons.assignment,
  ),
  if (Brand.showEarnings)
    const OperatorTab(
      path: '/earnings',
      label: 'Earnings',
      icon: Icons.payments_outlined,
      selectedIcon: Icons.payments,
    ),
  const OperatorTab(
    path: '/profile',
    label: 'Profile',
    icon: Icons.person_outline,
    selectedIcon: Icons.person,
  ),
];

/// Bottom-nav shell wrapping every signed-in screen.
class OperatorScaffold extends ConsumerWidget {
  final Widget child;
  final int index;
  final ValueChanged<int> onSelect;

  const OperatorScaffold({
    super.key,
    required this.child,
    required this.index,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final online = ref.watch(isOnlineProvider).value ?? true;

    return Scaffold(
      body: Column(
        children: [
          if (!online) const _OfflineBanner(),
          Expanded(child: child),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: onSelect,
        destinations: [
          for (final tab in operatorTabs)
            NavigationDestination(
              icon: Icon(tab.icon),
              selectedIcon: Icon(tab.selectedIcon),
              label: tab.label,
            ),
        ],
      ),
    );
  }
}

/// Persistent strip shown while the device has no connection. Operators work
/// in temple basements and delivery vans, so this is a normal state to be
/// informed about — not an error to be alarmed by.
class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner();

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Brand.gold,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: const [
              Icon(Icons.cloud_off, size: 18, color: Colors.white),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Offline — your changes are saved and will sync automatically.',
                  style: TextStyle(color: Colors.white, fontSize: 13),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Renders an [AsyncValue] with consistent loading, error and empty states so
/// every screen in both apps fails the same way.
class AsyncView<T> extends StatelessWidget {
  final AsyncValue<T> value;
  final Widget Function(T data) builder;
  final Future<void> Function()? onRetry;
  final String? emptyMessage;
  final bool Function(T data)? isEmpty;

  const AsyncView({
    super.key,
    required this.value,
    required this.builder,
    this.onRetry,
    this.emptyMessage,
    this.isEmpty,
  });

  @override
  Widget build(BuildContext context) {
    return value.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => _ErrorState(
        message: e is ApiException ? e.message : 'Something went wrong.',
        onRetry: onRetry,
      ),
      data: (data) {
        if (isEmpty?.call(data) == true) {
          return _EmptyState(message: emptyMessage ?? 'Nothing here yet.');
        }
        return builder(data);
      },
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final Future<void> Function()? onRetry;

  const _ErrorState({required this.message, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 40, color: Brand.maroon),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 15),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 20),
              OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
            ],
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final String message;

  const _EmptyState({required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 15, color: Colors.black54),
        ),
      ),
    );
  }
}
