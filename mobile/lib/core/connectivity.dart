import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Whether the device currently has a network path.
///
/// This is deliberately a *connectivity* check, not a reachability check — it
/// answers "is there a radio link", which is what the offline banner and the
/// sync queue need. A live-but-useless link (captive portal, dead backend)
/// still surfaces as a normal request error.
final isOnlineProvider = StreamProvider<bool>((ref) async* {
  final connectivity = Connectivity();

  bool hasPath(List<ConnectivityResult> results) =>
      results.any((r) => r != ConnectivityResult.none);

  yield hasPath(await connectivity.checkConnectivity());
  yield* connectivity.onConnectivityChanged.map(hasPath);
});
