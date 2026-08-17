import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/brand.dart';
import 'job.dart';

/// The operator's job queue, against whichever surface this app's backend
/// exposes — see [Brand.jobs] for the two shapes and why they differ.
///
/// Both are scoped server-side to the signed-in caller: Dravya by the token's
/// staff identity, Swadharma by `requireProvider` resolving the caller to their
/// own ACTIVE staff record. Neither accepts an operator id from the client, so
/// a tampered app cannot read another person's queue.
class JobsRepository {
  final ApiClient _api;

  const JobsRepository(this._api);

  Future<List<Job>> fetchJobs() async {
    final endpoint = Brand.jobs;

    final raw = endpoint.enveloped
        ? ((await _api.get<Map<String, dynamic>>(
              endpoint.listPath,
              query: endpoint.listQuery,
            ))['data'] as List? ??
            const [])
        : await _api.get<List<dynamic>>(
            endpoint.listPath,
            query: endpoint.listQuery,
          );

    return raw
        .map((j) => Job.fromJson(j as Map<String, dynamic>))
        .toList(growable: false);
  }

  Future<void> updateStatus(String jobId, JobStatus next) async {
    final endpoint = Brand.jobs;

    if (next == JobStatus.cancelled && endpoint.declinePath != null) {
      await _api.post<dynamic>(endpoint.declinePath!(jobId));
      return;
    }

    final wire = endpoint.wireFor(next);
    if (wire == null) {
      throw ApiException('This backend does not accept "${next.label}".');
    }
    await _api.patch<dynamic>(
      endpoint.statusPath(jobId),
      body: {'status': wire},
    );
  }
}

final jobsRepositoryProvider = Provider<JobsRepository>(
  (ref) => JobsRepository(ref.watch(apiClientProvider)),
);

/// The operator's open queue. `autoDispose` is deliberate: returning to the
/// Jobs tab refetches, which is what someone in the field expects after being
/// out of signal.
final jobsProvider = FutureProvider.autoDispose<List<Job>>(
  (ref) => ref.watch(jobsRepositoryProvider).fetchJobs(),
);
