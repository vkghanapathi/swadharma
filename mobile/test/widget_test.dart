import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:swadharma_operator/core/auth.dart';
import 'package:swadharma_operator/core/brand.dart';
import 'package:swadharma_operator/core/theme.dart';
import 'package:swadharma_operator/core/ui.dart';
import 'package:swadharma_operator/features/jobs/job.dart';
import 'package:swadharma_operator/features/login_screen.dart';

void main() {
  group('JobStatus', () {
    test('parses the wire values both backends emit', () {
      expect(JobStatus.parse('in_progress'), JobStatus.inProgress);
      expect(JobStatus.parse('out for delivery'), JobStatus.inProgress);
      expect(JobStatus.parse('CANCELLED'), JobStatus.cancelled);
      expect(JobStatus.parse('delivered'), JobStatus.completed);
      // Unknown/absent falls back to the queue's entry state rather than
      // throwing — a new backend status must never blank an operator's list.
      expect(JobStatus.parse(null), JobStatus.requested);
      expect(JobStatus.parse('something_new'), JobStatus.requested);
    });

    test('offers only transitions the backend would accept', () {
      expect(JobStatus.requested.nextStates,
          [JobStatus.accepted, JobStatus.cancelled]);
      expect(JobStatus.inProgress.nextStates, [JobStatus.completed]);
      expect(JobStatus.completed.nextStates, isEmpty);
      expect(JobStatus.cancelled.nextStates, isEmpty);
    });

    test('round-trips through the wire value', () {
      for (final s in JobStatus.values) {
        expect(JobStatus.parse(s.wire), s);
      }
    });
  });

  group('Job.fromJson', () {
    test('reads the snake_case and camelCase shapes both APIs use', () {
      final job = Job.fromJson({
        'id': '42',
        'order_code': 'SWD-1001',
        'title': 'Satyanarayana vratam',
        'customer_name': 'S. Rao',
        'city': 'Mysore',
        'scheduled_at': '2026-08-20T09:30:00Z',
        'amount_minor': 125000,
        'currency': 'INR',
        'status': 'accepted',
      });

      expect(job.reference, 'SWD-1001');
      expect(job.customerName, 'S. Rao');
      expect(job.locality, 'Mysore');
      expect(job.amountMinor, 125000);
      expect(job.status, JobStatus.accepted);
      expect(job.scheduledAt?.toUtc().hour, 9);
    });

    test('survives a sparse payload', () {
      final job = Job.fromJson({'id': '1'});
      expect(job.reference, '—');
      expect(job.status, JobStatus.requested);
      expect(job.scheduledAt, isNull);
    });
  });

  group('Navigation', () {
    test('every tab has a route behind it, and Jobs is first', () {
      const known = {'/jobs', '/earnings', '/profile'};
      for (final tab in operatorTabs) {
        expect(known, contains(tab.path));
      }
      // The router's initialLocation is /jobs, so it must always be present.
      expect(operatorTabs.first.path, '/jobs');
    });

    test('brand action labels name only real transitions', () {
      final wires = {for (final s in JobStatus.values) s.wire};
      for (final key in Brand.jobActions.keys) {
        expect(wires, contains(key),
            reason: '"$key" is not a JobStatus wire value');
      }
    });
  });

  group('Jobs endpoint', () {
    test('every transition the UI offers is one the backend accepts', () {
      // A button that leads to "this backend does not accept…" is worse than
      // no button. Every forward move the state machine offers must map.
      for (final status in JobStatus.values) {
        for (final next in status.nextStates) {
          final reachable = Brand.jobs.wireFor(next) != null ||
              (next == JobStatus.cancelled && Brand.jobs.declinePath != null);
          expect(reachable, isTrue,
              reason: '$status -> $next has no route on this backend');
        }
      }
    });

    test('every status the backend can return parses to a known state', () {
      for (final wire in Brand.jobs.statusWire.values) {
        expect(JobStatus.parse(wire), isNot(JobStatus.requested),
            reason: '"$wire" falls back to New, so the queue would look stuck');
      }
    });

    test('paths are rooted, not accidentally relative', () {
      expect(Brand.jobs.listPath, startsWith('/'));
      expect(Brand.jobs.statusPath('abc'), startsWith('/'));
      expect(Brand.jobs.statusPath('abc'), contains('abc'));
    });
  });

  group('Job.fromJson reads the provider-portal shape', () {
    test('services, venue and split date/time', () {
      final job = Job.fromJson({
        'id': 'r-9',
        'reservationNumber': 'SWD-2210',
        'devoteeName': 'K. Sharma',
        'scheduledDate': '2026-08-20',
        'scheduledTime': '09:30:00',
        'status': 'en_route',
        'services': ['Satyanarayana Vratam', 'Punyahavachanam'],
        'venue': {'type': 'home', 'label': 'Home visit', 'address': 'Jayanagar'},
      });

      expect(job.reference, 'SWD-2210');
      expect(job.customerName, 'K. Sharma');
      expect(job.title, 'Satyanarayana Vratam +1 more');
      expect(job.locality, 'Home visit');
      expect(job.scheduledAt?.hour, 9);
      expect(job.scheduledAt?.day, 20);
      // A purohita who has set out has accepted the job.
      expect(job.status, JobStatus.accepted);
    });

    test('a date with no time still yields a day', () {
      final job = Job.fromJson({'id': 'r-1', 'scheduledDate': '2026-08-20'});
      expect(job.scheduledAt?.day, 20);
    });

    test('a single service is not suffixed', () {
      final job = Job.fromJson({'id': 'r-1', 'services': ['Ganapati Homam']});
      expect(job.title, 'Ganapati Homam');
    });

    test('an empty service list falls back rather than showing nothing', () {
      final job = Job.fromJson({'id': 'r-1', 'services': []});
      expect(job.title, 'Job');
    });

    test('a declined booking reads as cancelled', () {
      expect(JobStatus.parse('rejected'), JobStatus.cancelled);
      expect(JobStatus.parse('declined'), JobStatus.cancelled);
    });
  });

  group('PhoneAuthState', () {
    test('copyWith clears a stale error instead of carrying it forward', () {
      const failed = PhoneAuthState(
        stage: PhoneAuthStage.failed,
        error: 'bad code',
      );
      final retry = failed.copyWith(stage: PhoneAuthStage.verifying);
      expect(retry.error, isNull);
      expect(retry.busy, isTrue);
    });
  });

  Widget login(bool ready) => ProviderScope(
        overrides: [firebaseReadyProvider.overrideWithValue(ready)],
        child: MaterialApp(theme: AppTheme.light, home: const LoginScreen()),
      );

  testWidgets('unconfigured build says so instead of offering a dead form',
      (tester) async {
    await tester.pumpWidget(login(false));

    expect(find.textContaining('Firebase is not configured'), findsOneWidget);
    // No control that would fail at the first tap.
    expect(find.byType(ElevatedButton), findsNothing);
  });

  testWidgets('configured build shows the sign-in this brand actually uses',
      (tester) async {
    await tester.pumpWidget(login(true));

    expect(find.textContaining('Firebase is not configured'), findsNothing);
    expect(
      find.text(
        Brand.signInMethod == SignInMethod.emailLink
            ? 'Email me a link'
            : 'Send code',
      ),
      findsOneWidget,
    );
  });

  test('the sign-in method can actually resolve a role', () {
    // A backend that decides access by email address cannot resolve a phone
    // sign-in, which carries no email claim — the app would authenticate and
    // then be refused by every endpoint.
    if (Brand.accessKeyedByEmail) {
      expect(
        Brand.signInMethod,
        SignInMethod.emailLink,
        reason: 'access is keyed by email, so the token must carry one',
      );
    }
  });

  test('the earnings tab is only offered when a ledger exists behind it', () {
    // Neither backend has a payout ledger: Dravya's operators are the owners,
    // and Swadharma never holds a professional's service money (settled
    // 2026-08-09). Turning this on before a ledger exists ships a tab that can
    // only ever error.
    expect(Brand.showEarnings, isFalse);
  });
}
