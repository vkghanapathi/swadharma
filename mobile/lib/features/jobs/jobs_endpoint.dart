import 'job.dart';

/// How this app's backend exposes the operator's work queue.
///
/// The two backends are genuinely different surfaces, and neither should be
/// bent to match the other: Dravya's `/operator/jobs` was written for this app,
/// while Swadharma's `/provider/appointments` is an established portal API that
/// the web already uses and that carries its own ownership checks. Describing
/// the difference here keeps every screen, model and state machine shared.
class JobsEndpoint {
  /// Where the queue is fetched from.
  final String listPath;

  /// Query sent with the list request, if the backend wants one.
  final Map<String, dynamic>? listQuery;

  /// True when the payload is wrapped as `{success, data: [...]}` rather than
  /// being a bare array.
  final bool enveloped;

  /// Where a status change is sent for a given job id.
  final String Function(String id) statusPath;

  /// Translates the shared lifecycle into the words this backend accepts.
  ///
  /// Dravya's `/operator/jobs` already speaks the shared vocabulary, so its map
  /// is an identity. Swadharma's provider API speaks its own
  /// (`en_route | in_progress | completed`), and a purohita's "accepted" is
  /// their setting out — there is no separate acknowledgement step.
  final Map<String, String> statusWire;

  /// Where a refusal is sent, when the backend treats declining as its own
  /// action rather than a status. Swadharma does — declining hands the booking
  /// back to the office to reassign, which is not the same event as a devotee
  /// cancelling. Null means "a decline is just another status change".
  final String Function(String id)? declinePath;

  const JobsEndpoint({
    required this.listPath,
    required this.statusPath,
    required this.statusWire,
    this.listQuery,
    this.enveloped = false,
    this.declinePath,
  });

  /// The backend's word for a transition, or null if it does not accept it.
  String? wireFor(JobStatus status) => statusWire[status.wire];
}
