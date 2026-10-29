import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/auth.dart';
import '../core/brand.dart';

/// Sign-in. Which form appears is decided by [Brand.signInMethod], and that is
/// a constraint rather than a preference — see the note on [SignInMethod].
class LoginScreen extends ConsumerWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ready = ref.watch(firebaseReadyProvider);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // The logo already carries the wordmark, so the name is not
                // repeated beneath it.
                Center(
                  child: Image.asset(
                    'assets/logo.png',
                    height: 132,
                    semanticLabel: Brand.appName,
                    // A missing or corrupt asset must not leave a blank screen
                    // with no way to sign in.
                    errorBuilder: (context, _, _) => Text(
                      Brand.appName,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w700,
                        color: Brand.primary,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Sign in to see your jobs',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 15, color: Colors.black54),
                ),
                const SizedBox(height: 32),

                if (!ready)
                  const Notice(
                    'Sign-in is unavailable — Firebase is not configured for '
                    'this build yet.',
                  ),

                if (ready)
                  switch (Brand.signInMethod) {
                    SignInMethod.emailLink => const _EmailLinkForm(),
                    SignInMethod.phoneOtp => const _PhoneForm(),
                  },
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Email link
// ───────────────────────────────────────────────────────────────────────────
class _EmailLinkForm extends ConsumerStatefulWidget {
  const _EmailLinkForm();

  @override
  ConsumerState<_EmailLinkForm> createState() => _EmailLinkFormState();
}

class _EmailLinkFormState extends ConsumerState<_EmailLinkForm> {
  final _email = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  bool get _looksLikeAnAddress {
    final v = _email.text.trim();
    return v.contains('@') && v.indexOf('@') < v.length - 3;
  }

  void _send() {
    ref.read(emailAuthProvider.notifier).sendLink(
          _email.text,
          ActionCodeSettings(
            url: Brand.emailLinkUrl,
            // The link must reopen the app rather than a browser tab, which is
            // the whole point of signing in on a phone in the field.
            handleCodeInApp: true,
            androidPackageName: Brand.androidPackage,
            androidInstallApp: false,
            iOSBundleId: Brand.androidPackage,
          ),
        );
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(emailAuthProvider);

    if (auth.stage == EmailAuthStage.sent) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.mark_email_read_outlined,
              size: 44, color: Brand.primary),
          const SizedBox(height: 16),
          Text(
            'Link sent to ${auth.address}',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          const Text(
            'Open it on this device to finish signing in. '
            'The link works once, and expires.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, color: Colors.black54),
          ),
          const SizedBox(height: 24),
          TextButton(
            onPressed: () => ref.read(emailAuthProvider.notifier).reset(),
            child: const Text('Use a different address'),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          autofillHints: const [AutofillHints.email],
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(hintText: 'you@example.com'),
        ),
        const SizedBox(height: 20),
        ElevatedButton(
          onPressed: (auth.busy || !_looksLikeAnAddress) ? null : _send,
          child: auth.busy
              ? const ButtonSpinner()
              : const Text('Email me a link'),
        ),
        const SizedBox(height: 10),
        const Text(
          'No password to remember. Your access is tied to this address.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: Colors.black54),
        ),
        if (auth.error != null) ...[
          const SizedBox(height: 16),
          Notice(auth.error!, isError: true),
        ],
      ],
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Phone OTP
// ───────────────────────────────────────────────────────────────────────────
class _PhoneForm extends ConsumerStatefulWidget {
  const _PhoneForm();

  @override
  ConsumerState<_PhoneForm> createState() => _PhoneFormState();
}

class _PhoneFormState extends ConsumerState<_PhoneForm> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  String _dialCode = '+91';

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(phoneAuthProvider);
    final sent = auth.verificationId != null &&
        auth.stage != PhoneAuthStage.idle &&
        auth.stage != PhoneAuthStage.sendingCode;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!sent) ...[
          Row(
            children: [
              SizedBox(
                // Wide enough for the dial code plus the dropdown chevron —
                // the theme's 16px field padding otherwise squeezes the two
                // into an overflowing row.
                width: 112,
                child: DropdownButtonFormField<String>(
                  initialValue: _dialCode,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    contentPadding:
                        EdgeInsets.symmetric(horizontal: 10, vertical: 14),
                  ),
                  items: const [
                    DropdownMenuItem(value: '+91', child: Text('+91')),
                    DropdownMenuItem(value: '+1', child: Text('+1')),
                    DropdownMenuItem(value: '+44', child: Text('+44')),
                  ],
                  onChanged: (v) => setState(() => _dialCode = v ?? '+91'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  autofillHints: const [AutofillHints.telephoneNumber],
                  onChanged: (_) => setState(() {}),
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(12),
                  ],
                  decoration: const InputDecoration(hintText: 'Mobile number'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: (auth.busy || _phone.text.length < 6)
                ? null
                : () => ref
                    .read(phoneAuthProvider.notifier)
                    .sendCode('$_dialCode${_phone.text.trim()}'),
            child:
                auth.busy ? const ButtonSpinner() : const Text('Send code'),
          ),
        ] else ...[
          Text(
            'Code sent to $_dialCode${_phone.text}',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, color: Colors.black54),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _code,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.center,
            autofillHints: const [AutofillHints.oneTimeCode],
            onChanged: (_) => setState(() {}),
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(6),
            ],
            style: const TextStyle(
              fontSize: 24,
              letterSpacing: 8,
              fontWeight: FontWeight.w600,
            ),
            decoration: const InputDecoration(hintText: '······'),
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: auth.busy
                ? null
                : () =>
                    ref.read(phoneAuthProvider.notifier).verifyCode(_code.text),
            child: auth.busy
                ? const ButtonSpinner()
                : const Text('Verify & sign in'),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: auth.busy
                ? null
                : () {
                    _code.clear();
                    ref.read(phoneAuthProvider.notifier).reset();
                  },
            child: const Text('Use a different number'),
          ),
        ],
        if (auth.error != null) ...[
          const SizedBox(height: 16),
          Notice(auth.error!, isError: true),
        ],
      ],
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
class ButtonSpinner extends StatelessWidget {
  const ButtonSpinner({super.key});

  @override
  Widget build(BuildContext context) => const SizedBox(
        height: 20,
        width: 20,
        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
      );
}

class Notice extends StatelessWidget {
  final String message;
  final bool isError;

  const Notice(this.message, {super.key, this.isError = false});

  @override
  Widget build(BuildContext context) {
    final color = isError ? const Color(0xFFB3261E) : Brand.gold;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        border: Border.all(color: color.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        message,
        style: TextStyle(fontSize: 13, color: color),
        textAlign: TextAlign.center,
      ),
    );
  }
}
