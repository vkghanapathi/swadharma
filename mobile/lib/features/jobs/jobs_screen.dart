import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/brand.dart';
import '../../core/ui.dart';
import 'job.dart';
import 'jobs_repository.dart';

/// The operator's work queue — the primary screen of both apps, and the reason
/// these apps exist: the person doing the job is on the move and cannot reach
/// a desktop admin panel.
class JobsScreen extends ConsumerWidget {
  const JobsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final jobs = ref.watch(jobsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('${Brand.operatorNoun} jobs')),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(jobsProvider.future),
        child: AsyncView<List<Job>>(
          value: jobs,
          isEmpty: (list) => list.isEmpty,
          emptyMessage: 'No open jobs right now.\nPull down to refresh.',
          onRetry: () async => ref.refresh(jobsProvider.future),
          builder: (list) => ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: list.length,
            itemBuilder: (context, i) => _JobCard(job: list[i]),
          ),
        ),
      ),
    );
  }
}

class _JobCard extends ConsumerStatefulWidget {
  final Job job;

  const _JobCard({required this.job});

  @override
  ConsumerState<_JobCard> createState() => _JobCardState();
}

class _JobCardState extends ConsumerState<_JobCard> {
  bool _busy = false;

  Future<void> _move(JobStatus next) async {
    setState(() => _busy = true);
    try {
      await ref
          .read(jobsRepositoryProvider)
          .updateStatus(widget.job.id, next);
      ref.invalidate(jobsProvider);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message)),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final job = widget.job;
    final when = job.scheduledAt;

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    job.title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                _StatusChip(status: job.status),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              job.reference,
              style: const TextStyle(fontSize: 12, color: Colors.black54),
            ),
            const SizedBox(height: 10),
            if (job.customerName != null)
              _MetaRow(icon: Icons.person_outline, text: job.customerName!),
            if (job.locality != null)
              _MetaRow(icon: Icons.place_outlined, text: job.locality!),
            if (when != null)
              _MetaRow(
                icon: Icons.schedule,
                text: DateFormat('d MMM, h:mm a').format(when.toLocal()),
              ),
            if (job.amountMinor != null)
              _MetaRow(
                icon: Icons.currency_rupee,
                text: NumberFormat.currency(
                  locale: 'en_IN',
                  symbol: job.currency == 'INR' ? '₹' : '${job.currency} ',
                  decimalDigits: 2,
                ).format(job.amountMinor! / 100),
              ),
            if (job.status.nextStates.isNotEmpty) ...[
              const Divider(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  for (final next in job.status.nextStates)
                    Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: next == JobStatus.cancelled
                          ? TextButton(
                              onPressed: _busy ? null : () => _move(next),
                              child: const Text('Decline'),
                            )
                          : FilledButton(
                              onPressed: _busy ? null : () => _move(next),
                              style: FilledButton.styleFrom(
                                backgroundColor: Brand.primary,
                                minimumSize: const Size(0, 40),
                              ),
                              child: Text(_actionLabel(next)),
                            ),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// The app's own word for this transition, falling back to a generic one so
  /// a brand that adds a lifecycle state cannot ship a blank button.
  String _actionLabel(JobStatus next) =>
      Brand.jobActions[next.wire] ??
      switch (next) {
        JobStatus.accepted => 'Accept',
        JobStatus.inProgress => 'Start',
        JobStatus.completed => 'Mark done',
        _ => next.label,
      };
}

class _StatusChip extends StatelessWidget {
  final JobStatus status;

  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: status.color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: status.color.withValues(alpha: 0.4)),
      ),
      child: Text(
        status.label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: status.color,
        ),
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  final IconData icon;
  final String text;

  const _MetaRow({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Icon(icon, size: 16, color: Colors.black45),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 14))),
        ],
      ),
    );
  }
}
