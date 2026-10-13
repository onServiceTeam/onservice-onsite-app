// HA-M2-369 (W3-B review findings 2/3, applied by the orchestrator in job-media.service canViewRow):
// the person who uploaded the photo can still view their own upload after the redaction.
// Overflow number: 367-369 were free when written.
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from "./helpers/booking-participant-postgres";
import {
  adminHttp, quoteFromA, requestBooking, seedQuoteRequest, threadHttp,
} from "./helpers/request-thread-postgres";
import { fetchSigned, mediaHttp } from "./helpers/job-media-postgres";
import { uploadThreadPhoto, withThreadMediaDatabase } from "./helpers/thread-media-postgres";
import { ensureRequestThread } from "../src/services/request-thread.service";

jest.mock("../src/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

/** A provider sends a photo in the request thread, the customer gets a link, then an admin redacts the message. */
async function sendPhotoThenRedact(database: Parameters<Parameters<typeof withThreadMediaDatabase>[0]>[0]["database"]) {
  await seedQuoteRequest(database);
  const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
  const photoId = await uploadThreadPhoto(providerUserA, "provider", threadA);
  const sent = await threadHttp(providerUserA, "provider").send(threadA, { messageType: "image", mediaId: photoId, content: "call me" });
  expect(sent.status).toBe(201);
  const before = await mediaHttp(customerA, "customer").url(photoId);
  expect(before.status).toBe(200);
  const heldLink = before.body.data.url as string;
  expect((await adminHttp().post(`/conversations/messages/${sent.body.data.id}/redact`, { reason: "phone number" })).status).toBe(200);
  return { photoId, heldLink };
}

it("HA-M2-369: the uploader can still open their own redacted photo", async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    const { photoId } = await sendPhotoThenRedact(database);
    expect((await mediaHttp(providerUserA, "provider").url(photoId)).status).toBe(200);
  });
}, 90000);
