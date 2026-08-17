import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/auth.dart';
import '../core/brand.dart';

/// Operator profile: who is signed in, KYC standing, and sign-out.
///
/// KYC is a hard gate in the platform spec — an operator cannot self-activate,
/// so this screen reports status and never offers to change it.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authStateProvider).value;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        children: [
          const SizedBox(height: 8),
          ListTile(
            leading: const CircleAvatar(
              backgroundColor: Brand.soft,
              child: Icon(Icons.person, color: Brand.primary),
            ),
            title: Text(
              user?.displayName?.isNotEmpty == true
                  ? user!.displayName!
                  : (user?.phoneNumber ?? 'Signed in'),
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            subtitle: Text(Brand.operatorNoun),
          ),
          const Divider(),
          const ListTile(
            leading: Icon(Icons.verified_user_outlined),
            title: Text('KYC status'),
            subtitle: Text('Reviewed and approved by the ${Brand.appName} team'),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout, color: Color(0xFFB3261E)),
            title: const Text(
              'Sign out',
              style: TextStyle(color: Color(0xFFB3261E)),
            ),
            onTap: () => _confirmSignOut(context, ref),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text(
          'You will need your mobile number and a new code to sign back in.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    // Order matters: drop the backend session first. Signing out of Firebase
    // first would leave a usable session token behind with no way to mint a
    // replacement, and the next launch would silently reuse it.
    await ref.read(sessionTokenStoreProvider).clear();
    await signOut();
  }
}
