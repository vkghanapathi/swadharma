import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/auth.dart';
import 'core/brand.dart';
import 'core/firebase_options.dart';
import 'core/router.dart';
import 'core/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Guarded so the app still boots (and says why sign-in is off) when the
  // config has not been supplied — see `firebaseReadyProvider`.
  var firebaseReady = false;
  if (FirebaseConfig.isConfigured) {
    try {
      await Firebase.initializeApp(options: FirebaseConfig.options);
      firebaseReady = true;

      // An emailed sign-in link opens the app with the credential in the
      // address bar. Completing it before the first frame means the router
      // sees a signed-in user and goes straight to the queue, rather than
      // flashing the login screen at someone who just signed in.
      if (kIsWeb) {
        await completeEmailLinkFromUrl(Uri.base.toString());
      }
    } catch (e) {
      debugPrint('Firebase init failed — sign-in disabled: $e');
    }
  } else {
    debugPrint('Firebase config not supplied — sign-in disabled.');
  }

  runApp(
    ProviderScope(
      overrides: [
        firebaseReadyProvider.overrideWithValue(firebaseReady),
      ],
      child: const OperatorApp(),
    ),
  );
}

class OperatorApp extends ConsumerWidget {
  const OperatorApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: Brand.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
