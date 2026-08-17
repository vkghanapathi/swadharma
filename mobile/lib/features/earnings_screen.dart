import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../core/api_client.dart';
import '../core/brand.dart';
import '../core/ui.dart';

/// Operator payout history.
///
/// CONTRACT — `GET /operator/earnings` -> {settled_minor, pending_minor,
/// currency, payouts:[{id, period, amount_minor, status, paid_at}]}.
/// Not yet implemented on either backend. Payouts are batched and settled
/// offline per platform policy, so this screen is read-only by design — an
/// operator can see what they are owed, never trigger a transfer.
class EarningsScreen extends ConsumerWidget {
  const EarningsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(earningsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Earnings')),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(earningsProvider.future),
        child: AsyncView<Earnings>(
          value: summary,
          onRetry: () async => ref.refresh(earningsProvider.future),
          builder: (data) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  Expanded(
                    child: _Tile(
                      label: 'Settled',
                      amountMinor: data.settledMinor,
                      currency: data.currency,
                      color: const Color(0xFF1F5F1F),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _Tile(
                      label: 'Pending',
                      amountMinor: data.pendingMinor,
                      currency: data.currency,
                      color: Brand.gold,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              const Text(
                'Payouts',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              if (data.payouts.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Text(
                    'No payouts yet.',
                    style: TextStyle(color: Colors.black54),
                  ),
                ),
              for (final p in data.payouts)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(p.period),
                  subtitle: Text(p.status),
                  trailing: Text(
                    _money(p.amountMinor, data.currency),
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

String _money(int minor, String currency) => NumberFormat.currency(
      locale: currency == 'INR' ? 'en_IN' : 'en_US',
      symbol: currency == 'INR' ? '₹' : '$currency ',
      decimalDigits: 2,
    ).format(minor / 100);

class _Tile extends StatelessWidget {
  final String label;
  final int amountMinor;
  final String currency;
  final Color color;

  const _Tile({
    required this.label,
    required this.amountMinor,
    required this.currency,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Brand.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 13, color: Colors.black54),
          ),
          const SizedBox(height: 6),
          Text(
            _money(amountMinor, currency),
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

@immutable
class Payout {
  final String id;
  final String period;
  final int amountMinor;
  final String status;

  const Payout({
    required this.id,
    required this.period,
    required this.amountMinor,
    required this.status,
  });

  factory Payout.fromJson(Map<String, dynamic> j) => Payout(
        id: (j['id'] ?? '').toString(),
        period: (j['period'] ?? '—').toString(),
        amountMinor: (j['amount_minor'] as num?)?.toInt() ?? 0,
        status: (j['status'] ?? 'pending').toString(),
      );
}

@immutable
class Earnings {
  final int settledMinor;
  final int pendingMinor;
  final String currency;
  final List<Payout> payouts;

  const Earnings({
    required this.settledMinor,
    required this.pendingMinor,
    required this.currency,
    required this.payouts,
  });

  factory Earnings.fromJson(Map<String, dynamic> j) => Earnings(
        settledMinor: (j['settled_minor'] as num?)?.toInt() ?? 0,
        pendingMinor: (j['pending_minor'] as num?)?.toInt() ?? 0,
        currency: (j['currency'] ?? 'INR').toString(),
        payouts: ((j['payouts'] as List?) ?? const [])
            .map((p) => Payout.fromJson(p as Map<String, dynamic>))
            .toList(growable: false),
      );
}

final earningsProvider = FutureProvider.autoDispose<Earnings>((ref) async {
  final data =
      await ref.watch(apiClientProvider).get<Map<String, dynamic>>('/operator/earnings');
  return Earnings.fromJson(data);
});
