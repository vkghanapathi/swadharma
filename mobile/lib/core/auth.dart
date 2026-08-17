import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Whether Firebase initialised. Overridden in `main()` — the default of false
/// means a build without Firebase config shows an honest message on the login
/// screen instead of hanging on a tap.
final firebaseReadyProvider = Provider<bool>((ref) => false);

/// The signed-in operator, or null. Drives the router's auth redirect.
final authStateProvider = StreamProvider<User?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return Stream.value(null);
  return FirebaseAuth.instance.authStateChanges();
});

/// How this app signs its operators in.
///
/// Not a preference — a constraint. Dravya keys staff access on an email
/// address (`staff_users.email`, resolved in `app/security.py`), and a
/// phone-OTP token carries no email claim, so a phone sign-in can never satisfy
/// that lookup. The web app draws the same line in `components/PhoneSignIn.tsx`.
enum SignInMethod {
  /// Firebase email-link. Yields an email claim, so staff roles resolve.
  emailLink,

  /// Firebase phone OTP. No email claim.
  phoneOtp,
}

/// Where the phone-OTP flow currently is.
enum PhoneAuthStage { idle, sendingCode, codeSent, verifying, failed }

@immutable
class PhoneAuthState {
  final PhoneAuthStage stage;
  final String? verificationId;
  final String? error;

  const PhoneAuthState({
    this.stage = PhoneAuthStage.idle,
    this.verificationId,
    this.error,
  });

  bool get busy =>
      stage == PhoneAuthStage.sendingCode || stage == PhoneAuthStage.verifying;

  PhoneAuthState copyWith({
    PhoneAuthStage? stage,
    String? verificationId,
    String? error,
  }) =>
      PhoneAuthState(
        stage: stage ?? this.stage,
        verificationId: verificationId ?? this.verificationId,
        // Deliberately not `??` — omitting `error` clears it, so a retry does
        // not carry the previous failure's message forward.
        error: error,
      );
}

/// Phone-OTP sign-in, the primary login for operators per the platform spec.
///
/// Firebase issues the ID token; both backends verify it. Nothing app-specific
/// lives here, so this file is shared verbatim between the two operator apps.
class PhoneAuthController extends Notifier<PhoneAuthState> {
  /// Web returns a confirmation handle instead of a verification id; the code
  /// is confirmed through it rather than through a credential.
  ConfirmationResult? _webConfirmation;

  @override
  PhoneAuthState build() => const PhoneAuthState();

  /// [phone] must be in E.164 form, e.g. +919845012345.
  Future<void> sendCode(String phone) async {
    // `verifyPhoneNumber` is not implemented on the web, where Firebase runs
    // its own reCAPTCHA and hands back a confirmation object instead.
    if (kIsWeb) return _sendCodeWeb(phone);

    state = state.copyWith(stage: PhoneAuthStage.sendingCode);
    final settled = Completer<void>();
    void finish() {
      if (!settled.isCompleted) settled.complete();
    }

    try {
      await FirebaseAuth.instance.verifyPhoneNumber(
        phoneNumber: phone,
        // Android can auto-retrieve the SMS and sign in without the operator
        // typing anything.
        verificationCompleted: (credential) async {
          try {
            await FirebaseAuth.instance.signInWithCredential(credential);
          } catch (_) {
            // Auto-retrieval failed; the manual code path still works.
          }
        },
        verificationFailed: (e) {
          state = state.copyWith(
            stage: PhoneAuthStage.failed,
            error: e.message ?? 'Could not send the code.',
          );
          finish();
        },
        codeSent: (verificationId, _) {
          state = PhoneAuthState(
            stage: PhoneAuthStage.codeSent,
            verificationId: verificationId,
          );
          finish();
        },
        codeAutoRetrievalTimeout: (verificationId) {
          // Keep the id so a late manual entry still verifies.
          state = state.copyWith(
            stage: PhoneAuthStage.codeSent,
            verificationId: verificationId,
          );
          finish();
        },
      );
      await settled.future;
    } catch (e) {
      state = state.copyWith(
        stage: PhoneAuthStage.failed,
        error: e.toString(),
      );
    }
  }

  Future<void> _sendCodeWeb(String phone) async {
    state = state.copyWith(stage: PhoneAuthStage.sendingCode);
    try {
      _webConfirmation = await FirebaseAuth.instance.signInWithPhoneNumber(phone);
      state = PhoneAuthState(
        stage: PhoneAuthStage.codeSent,
        // Not a real verification id, but the login screen keys "has a code
        // been sent" off this being non-null, and the two paths should look
        // the same to it.
        verificationId: _webConfirmation!.verificationId,
      );
    } on FirebaseAuthException catch (e) {
      state = state.copyWith(
        stage: PhoneAuthStage.failed,
        error: e.message ?? 'Could not send the code.',
      );
    }
  }

  Future<void> verifyCode(String smsCode) async {
    if (kIsWeb) return _verifyCodeWeb(smsCode);

    final id = state.verificationId;
    if (id == null) {
      state = state.copyWith(
        stage: PhoneAuthStage.failed,
        error: 'Request a code first.',
      );
      return;
    }
    state = state.copyWith(stage: PhoneAuthStage.verifying);
    try {
      final credential = PhoneAuthProvider.credential(
        verificationId: id,
        smsCode: smsCode.trim(),
      );
      await FirebaseAuth.instance.signInWithCredential(credential);
      state = const PhoneAuthState();
    } on FirebaseAuthException catch (e) {
      state = state.copyWith(
        stage: PhoneAuthStage.codeSent,
        error: e.code == 'invalid-verification-code'
            ? 'That code is not right. Check and try again.'
            : (e.message ?? 'Verification failed.'),
      );
    }
  }

  Future<void> _verifyCodeWeb(String smsCode) async {
    final confirmation = _webConfirmation;
    if (confirmation == null) {
      state = state.copyWith(
        stage: PhoneAuthStage.failed,
        error: 'Request a code first.',
      );
      return;
    }
    state = state.copyWith(stage: PhoneAuthStage.verifying);
    try {
      await confirmation.confirm(smsCode.trim());
      _webConfirmation = null;
      state = const PhoneAuthState();
    } on FirebaseAuthException catch (e) {
      state = state.copyWith(
        stage: PhoneAuthStage.codeSent,
        error: e.code == 'invalid-verification-code'
            ? 'That code is not right. Check and try again.'
            : (e.message ?? 'Verification failed.'),
      );
    }
  }

  void reset() {
    _webConfirmation = null;
    state = const PhoneAuthState();
  }
}

final phoneAuthProvider =
    NotifierProvider<PhoneAuthController, PhoneAuthState>(
  PhoneAuthController.new,
);

// ───────────────────────────────────────────────────────────────────────────
// Email link
// ───────────────────────────────────────────────────────────────────────────

/// Where the email-link flow currently is.
enum EmailAuthStage { idle, sending, sent, verifying, failed }

@immutable
class EmailAuthState {
  final EmailAuthStage stage;
  final String? address;
  final String? error;

  const EmailAuthState({
    this.stage = EmailAuthStage.idle,
    this.address,
    this.error,
  });

  bool get busy =>
      stage == EmailAuthStage.sending || stage == EmailAuthStage.verifying;

  EmailAuthState copyWith({
    EmailAuthStage? stage,
    String? address,
    String? error,
  }) =>
      EmailAuthState(
        stage: stage ?? this.stage,
        address: address ?? this.address,
        // Omitting `error` clears it, so a retry does not carry the previous
        // failure forward.
        error: error,
      );
}

/// Passwordless email-link sign-in — the only method that yields an email
/// claim, and therefore the only one that can resolve a staff role.
///
/// Two halves, and they run in different app launches: [sendLink] emails a
/// link, and [completeFromLink] finishes once the device opens it. The address
/// is persisted between the two because Firebase requires the same address to
/// complete, and the link may well be opened after the app was killed.
/// Where the address awaiting an email link is kept between the two halves of
/// the flow, which may run in different app launches.
const String pendingEmailKey = 'pending_sign_in_email';

/// Finish an email-link sign-in that arrived as a URL.
///
/// On the web the link simply loads the app with the credential in the address
/// bar, so this runs at startup. (On native the same link needs App Links /
/// Universal Links to reach the app at all — which is the main reason the web
/// build is the quicker way to a working sign-in.)
Future<bool> completeEmailLinkFromUrl(String link) async {
  if (!FirebaseAuth.instance.isSignInWithEmailLink(link)) return false;

  final prefs = await SharedPreferences.getInstance();
  final address = prefs.getString(pendingEmailKey);
  if (address == null) return false;

  try {
    await FirebaseAuth.instance
        .signInWithEmailLink(email: address, emailLink: link);
    await prefs.remove(pendingEmailKey);
    return true;
  } catch (_) {
    // A used or expired link. The login screen asks for a new one; failing
    // loudly at startup would only show an error nobody asked for.
    return false;
  }
}

class EmailAuthController extends Notifier<EmailAuthState> {
  @override
  EmailAuthState build() => const EmailAuthState();

  Future<void> sendLink(String email, ActionCodeSettings settings) async {
    final address = email.trim().toLowerCase();
    state = state.copyWith(stage: EmailAuthStage.sending, address: address);
    try {
      await FirebaseAuth.instance.sendSignInLinkToEmail(
        email: address,
        actionCodeSettings: settings,
      );
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(pendingEmailKey, address);
      state = EmailAuthState(stage: EmailAuthStage.sent, address: address);
    } on FirebaseAuthException catch (e) {
      state = state.copyWith(
        stage: EmailAuthStage.failed,
        error: e.message ?? 'Could not send the link.',
      );
    }
  }

  /// Finish sign-in from an opened link. Returns true when signed in.
  Future<bool> completeFromLink(String link) async {
    if (!FirebaseAuth.instance.isSignInWithEmailLink(link)) return false;

    final prefs = await SharedPreferences.getInstance();
    final address = state.address ?? prefs.getString(pendingEmailKey);
    if (address == null) {
      // The link was opened on a device that never requested it. Firebase
      // cannot complete without the address, and guessing it would be the
      // whole point of the check.
      state = state.copyWith(
        stage: EmailAuthStage.failed,
        error: 'Open the link on the device where you asked for it, '
            'or request a new one here.',
      );
      return false;
    }

    state = state.copyWith(stage: EmailAuthStage.verifying, address: address);
    try {
      await FirebaseAuth.instance
          .signInWithEmailLink(email: address, emailLink: link);
      await prefs.remove(pendingEmailKey);
      state = const EmailAuthState();
      return true;
    } on FirebaseAuthException catch (e) {
      state = state.copyWith(
        stage: EmailAuthStage.failed,
        error: e.code == 'invalid-action-code'
            ? 'That link has already been used or has expired. '
                'Request a new one.'
            : (e.message ?? 'Could not complete sign-in.'),
      );
      return false;
    }
  }

  void reset() => state = const EmailAuthState();
}

final emailAuthProvider =
    NotifierProvider<EmailAuthController, EmailAuthState>(
  EmailAuthController.new,
);

Future<void> signOut() => FirebaseAuth.instance.signOut();
