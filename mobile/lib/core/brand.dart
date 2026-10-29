import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import '../features/jobs/jobs_endpoint.dart';
import 'auth.dart' show SignInMethod;
import 'session_token.dart' show TokenStrategy;

/// Per-app identity. This is the ONLY file in `core/` that differs between the
/// Swadharma and Dravya operator apps — everything else is copied verbatim, so
/// keep app-specific values here rather than sprinkling them through the core.
///
/// Palette is the Vedic-Premium set already used by the website
/// (`swadharma-service-management/frontend/tailwind.config.js`) so the app and
/// the site read as one product.
class Brand {
  const Brand._();

  static const String appName = 'Swadharma Operator';
  static const String operatorNoun = 'Purohita';

  static const String _configuredApiBaseUrl =
      String.fromEnvironment('API_BASE_URL');

  /// Base URL of the Swadharma SSM Express backend (`PORT` defaults to 3000,
  /// routes mounted under `/api/v1`).
  ///
  /// The dev default differs by platform on purpose: in a browser the host
  /// machine is `localhost`, but on an Android emulator that resolves to the
  /// emulator itself, where 10.0.2.2 is the alias for the host.
  ///
  /// **This URL also selects the institution.** Tenant is resolved from the
  /// hostname the request arrives on, so an app built against an institution's
  /// API host signs its purohitas into that institution. Do not add a tenant
  /// parameter to make this configurable at runtime — letting a caller name
  /// their own tenant is the hole closed on 2026-08-07.
  ///
  ///   flutter build web --dart-define=API_BASE_URL=https://api.swadharmaservices.in/api/v1
  static String get apiBaseUrl => _configuredApiBaseUrl.isNotEmpty
      ? _configuredApiBaseUrl
      : (kIsWeb
          ? 'http://localhost:3000/api/v1'
          : 'http://10.0.2.2:3000/api/v1');

  /// Swadharma's guards read `clientId` off the token to resolve the
  /// institution, and a Firebase token cannot carry one. `POST /auth/firebase`
  /// swaps it for a session token that can — see FirebaseAuthService.
  static const TokenStrategy tokenStrategy = TokenStrategy.exchangedSession;
  static const String sessionExchangePath = '/auth/firebase';

  // ── Palette (Vedic-Premium tokens from the website's Tailwind config) ────
  static const Color maroon = Color(0xFF9A3412); // Temple Maroon
  static const Color saffron = Color(0xFFF59E0B); // Deep Saffron
  static const Color gold = Color(0xFFD97706); // Antique Gold
  static const Color cream = Color(0xFFFAF6EE); // Warm Ivory
  static const Color ink = Color(0xFF1F2937); // Deep Charcoal Blue
  static const Color soft = Color(0xFFF5E6B0); // Muted Temple Gold

  /// Derived: the web palette carries no border token, so this is Muted Temple
  /// Gold dropped to a hairline weight that reads correctly on Warm Ivory.
  static const Color border = Color(0xFFE5D9B8);

  /// Drives the app bar, primary buttons and the selected nav item.
  static const Color primary = maroon;
  static const Color accent = saffron;

  /// What each forward transition is *called* here.
  ///
  /// The provider portal has no separate acknowledgement step — a purohita
  /// setting out *is* their acceptance — so the first action says what it
  /// actually does rather than the generic "Accept".
  /// Keyed by `JobStatus.wire`.
  static const Map<String, String> jobActions = {
    'accepted': 'On my way',
    'in_progress': 'Start seva',
    'completed': 'Mark done',
  };

  /// Swadharma already had an operator surface before this app existed: the
  /// provider portal the web uses, with its own ownership checks
  /// (`requireProvider` resolves the caller to their own ACTIVE staff record,
  /// and no route accepts a staffId). Pointing at it beats adding a parallel
  /// `/operator/*` family that would have to be guarded all over again.
  static final JobsEndpoint jobs = JobsEndpoint(
    listPath: '/provider/appointments',
    enveloped: true,
    statusPath: (id) => '/provider/appointments/$id/status',
    // The portal accepts only these three; 'accepted' is a purohita setting out.
    statusWire: const {
      'accepted': 'en_route',
      'in_progress': 'in_progress',
      'completed': 'completed',
    },
    declinePath: (id) => '/provider/appointments/$id/decline',
  );

  /// Swadharma matches a caller to their own `users` row by phone or email
  /// within the institution, then resolves their role from
  /// `user_institution_roles` — no email-keyed allow-list. So phone sign-in
  /// resolves a role perfectly well here, unlike in Dravya.
  static const bool accessKeyedByEmail = false;

  /// Purohitas are service providers, not staff on an allow-list, so a phone
  /// code is both sufficient and the right answer for someone who may well
  /// have no email address.
  static const SignInMethod signInMethod = SignInMethod.phoneOtp;

  /// Unused under [SignInMethod.phoneOtp]; kept so the shared login screen
  /// compiles against one Brand shape.
  static const String emailLinkUrl = String.fromEnvironment(
    'EMAIL_LINK_URL',
    defaultValue: 'https://swadharmaservices.in/login',
  );
  static const String androidPackage = 'in.swadharmaservices.swadharma_operator';

  /// Off, and not an oversight: Swadharma never holds a professional's service
  /// money. That commercial model was settled on 2026-08-09 and is why the
  /// professionals migration (20260812000001) deliberately creates no payments,
  /// payouts, fee-schedule or credit-ledger tables. With no ledger there are no
  /// earnings to show, and a tab that could only ever error is worse than none.
  ///
  /// If the commercial model changes, this flips on *after* a ledger exists —
  /// not before.
  static const bool showEarnings = false;
}
