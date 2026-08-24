import api from './api';

export interface BookingProofSummary {
  booking: {
    id: string;
    status: string;
    description: string;
    workStartedAt: string | null;
    workCompletedAt: string | null;
    completedAt: string | null;
    confirmedAt: string | null;
    completionNotes: string | null;
  };
  readiness: {
    stage: string;
    readyForProviderCompletion: boolean;
    minimumTimeOnSiteMinutes: number;
    afterPhotosRequired: number;
    blockers: Array<{ code: string; message: string }>;
    qualityFlags: Array<{ code: string; message: string }>;
  };
  checklist: null | {
    templateVersion: number;
    shownAt: string;
    totalItems: number;
    requiredItems: number;
    completedRequiredItems: number;
    complete: boolean;
    items: Array<{
      id: string;
      title: string;
      required: boolean;
      photoRequired: boolean;
      completed: boolean;
      completedAt: string | null;
      photoId: string | null;
      notes: string | null;
    }>;
  };
  photos: Array<{
    id: string;
    photoType: string;
    uploadedByRole: 'customer' | 'provider' | 'admin' | 'unknown';
    source: 'legacy' | 'canonical';
    uploadedAt: string;
  }>;
  signatures: {
    identityCaveat: string;
    records: Array<{
      id: string;
      signatureType: string;
      signedByRole: 'customer' | 'provider' | 'admin' | 'unknown';
      signedAt: string;
      attribution: string;
    }>;
  };
  changeOrders: Array<{ id: string; status: string; photos: string[] }>;
  communications: { chatMessageCount: number; supportTickets: [] };
  dispute: null | { id: string; type: string; status: string };
}

function isBookingProofSummary(value: unknown): value is BookingProofSummary {
  if (!value || typeof value !== 'object') return false;
  const summary = value as Partial<BookingProofSummary>;
  return !!summary.booking &&
    !!summary.readiness &&
    typeof summary.readiness.stage === 'string' &&
    typeof summary.readiness.readyForProviderCompletion === 'boolean' &&
    typeof summary.readiness.afterPhotosRequired === 'number' &&
    Array.isArray(summary.readiness.blockers) &&
    Array.isArray(summary.photos) &&
    Array.isArray(summary.signatures?.records) &&
    Array.isArray(summary.changeOrders) &&
    !!summary.communications;
}

export async function getBookingProofSummary(bookingId: string): Promise<BookingProofSummary> {
  const response = await api.get<{ success: boolean; data: unknown }>(
    `/api/v1/bookings/${bookingId}/proof-summary`,
  );
  if (!isBookingProofSummary(response.data.data)) {
    throw new Error('The booking work record response is incomplete.');
  }
  return response.data.data;
}
