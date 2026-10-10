import type { DataExportEntry } from '@/services/data-management.service';

/** Explain the server state without exposing private storage/processing errors. */
export function getDataExportStatusText(entry: Pick<DataExportEntry, 'status' | 'downloadAvailable'>): string {
  switch (entry.status) {
    case 'pending': return 'Queued';
    case 'processing': return 'Preparing';
    case 'failed': return 'Failed. Request a new export.';
    case 'expired': return 'Expired — request again';
    case 'completed': return entry.downloadAvailable
      ? 'Ready to download'
      : 'Download unavailable. Request a new export.';
    default: return 'Status unavailable. Reload this page to check again.';
  }
}
