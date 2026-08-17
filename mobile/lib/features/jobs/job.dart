import 'package:flutter/material.dart';

/// The shared booking/order lifecycle from the platform spec:
/// requested → accepted → in progress → completed, with cancellation
/// reachable from any pre-completion state.
///
/// Both operator apps run this same machine — a Dravya vendor fulfilling a
/// supply order and a Swadharma purohita performing a seva move through
/// identical states, which is why it lives in the shared layer.
enum JobStatus {
  requested,
  accepted,
  inProgress,
  completed,
  cancelled;

  static JobStatus parse(String? raw) {
    switch (raw?.toLowerCase().replaceAll(RegExp(r'[_\s-]'), '')) {
      case 'accepted':
      // Swadharma: a purohita who has set out has accepted the job — there is
      // no separate acknowledgement step in that portal.
      case 'enroute':
        return JobStatus.accepted;
      case 'inprogress':
      case 'outfordelivery':
        return JobStatus.inProgress;
      case 'completed':
      case 'delivered':
      case 'fulfilled':
        return JobStatus.completed;
      case 'cancelled':
      case 'canceled':
      case 'rejected':
      case 'declined':
        return JobStatus.cancelled;
      default:
        return JobStatus.requested;
    }
  }

  String get label => switch (this) {
        JobStatus.requested => 'New',
        JobStatus.accepted => 'Accepted',
        JobStatus.inProgress => 'In progress',
        JobStatus.completed => 'Completed',
        JobStatus.cancelled => 'Cancelled',
      };

  Color get color => switch (this) {
        JobStatus.requested => const Color(0xFFE87722),
        JobStatus.accepted => const Color(0xFF1F5F1F),
        JobStatus.inProgress => const Color(0xFFB8860B),
        JobStatus.completed => const Color(0xFF4A4A4A),
        JobStatus.cancelled => const Color(0xFFB3261E),
      };

  /// The states an operator may move this job to from here. Transitions the
  /// backend would reject are never offered in the UI.
  List<JobStatus> get nextStates => switch (this) {
        JobStatus.requested => const [JobStatus.accepted, JobStatus.cancelled],
        JobStatus.accepted => const [JobStatus.inProgress, JobStatus.cancelled],
        JobStatus.inProgress => const [JobStatus.completed],
        JobStatus.completed || JobStatus.cancelled => const [],
      };

  bool get isOpen => this != JobStatus.completed && this != JobStatus.cancelled;

  /// Wire value sent back to the backend.
  String get wire => switch (this) {
        JobStatus.requested => 'requested',
        JobStatus.accepted => 'accepted',
        JobStatus.inProgress => 'in_progress',
        JobStatus.completed => 'completed',
        JobStatus.cancelled => 'cancelled',
      };
}

/// One unit of operator work — a Dravya supply order or a Swadharma seva
/// booking, normalised to the fields the queue screen needs.
@immutable
class Job {
  final String id;
  final String reference;
  final String title;
  final String? customerName;
  final String? locality;
  final DateTime? scheduledAt;
  final int? amountMinor;
  final String currency;
  final JobStatus status;

  const Job({
    required this.id,
    required this.reference,
    required this.title,
    required this.status,
    this.customerName,
    this.locality,
    this.scheduledAt,
    this.amountMinor,
    this.currency = 'INR',
  });

  /// Reads either backend's payload.
  ///
  /// Dravya's `/operator/jobs` is snake_case and purpose-built for this app.
  /// Swadharma's `/provider/appointments` is an established portal API in
  /// camelCase, with the date and time in separate fields, the work described
  /// as a list of services, and the place as a nested `venue`. Absorbing both
  /// here is what lets every screen below stay shared.
  factory Job.fromJson(Map<String, dynamic> j) {
    final venue = j['venue'];

    return Job(
      id: (j['id'] ?? '').toString(),
      reference: (j['reference'] ??
              j['order_code'] ??
              j['reservationNumber'] ??
              j['code'] ??
              '—')
          .toString(),
      title: _title(j),
      customerName: (j['customer_name'] ??
              j['customerName'] ??
              j['devoteeName'])
          ?.toString(),
      locality: (j['locality'] ?? j['city'])?.toString() ??
          (venue is Map ? (venue['label'] ?? venue['address'])?.toString() : null),
      scheduledAt: _when(j),
      amountMinor: j['amount_minor'] is int
          ? j['amount_minor'] as int
          : int.tryParse('${j['amount_minor'] ?? j['amountMinor'] ?? ''}'),
      currency: (j['currency'] ?? 'INR').toString(),
      status: JobStatus.parse(j['status']?.toString()),
    );
  }

  static String _title(Map<String, dynamic> j) {
    final services = j['services'];
    if (services is List && services.isNotEmpty) {
      final names = services.map((s) => s.toString()).where((s) => s.isNotEmpty);
      if (names.isNotEmpty) {
        return names.length > 1
            ? '${names.first} +${names.length - 1} more'
            : names.first;
      }
    }
    return (j['title'] ?? j['summary'] ?? j['kit_name'] ?? 'Job').toString();
  }

  static DateTime? _when(Map<String, dynamic> j) {
    final combined = j['scheduled_at'] ?? j['scheduledAt'];
    if (combined is String) {
      final parsed = DateTime.tryParse(combined);
      if (parsed != null) return parsed;
    }

    // Swadharma keeps the date and the time apart. A date with no time is
    // still worth showing — a purohita needs to know it is today.
    final date = j['scheduledDate']?.toString();
    if (date != null && date.isNotEmpty) {
      final time = (j['scheduledTime'] ?? '').toString();
      final parsed = DateTime.tryParse(
        time.isEmpty ? date : '${date.split('T').first}T$time',
      );
      if (parsed != null) return parsed;
      final dateOnly = DateTime.tryParse(date);
      if (dateOnly != null) return dateOnly;
    }

    final created = j['created_at'];
    return created is String ? DateTime.tryParse(created) : null;
  }

  Job copyWith({JobStatus? status}) => Job(
        id: id,
        reference: reference,
        title: title,
        customerName: customerName,
        locality: locality,
        scheduledAt: scheduledAt,
        amountMinor: amountMinor,
        currency: currency,
        status: status ?? this.status,
      );
}
