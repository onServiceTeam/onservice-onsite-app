import { sendMessageSchema, createConversationSchema } from '../src/validators/messaging.validators';

describe('Messaging Validators', () => {
  describe('sendMessageSchema', () => {
    it('should accept a valid text message', () => {
      const result = sendMessageSchema.safeParse({ content: 'Hello po!' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.messageType).toBe('text');
      }
    });

    it('should accept an image message with URL', () => {
      const result = sendMessageSchema.safeParse({
        content: 'Here is the photo',
        messageType: 'image',
        imageUrl: 'https://storage.example.com/photos/job-123.jpg',
      });
      expect(result.success).toBe(true);
    });

    it('should accept a location message', () => {
      const result = sendMessageSchema.safeParse({
        content: 'My location',
        messageType: 'location',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty content', () => {
      const result = sendMessageSchema.safeParse({ content: '' });
      expect(result.success).toBe(false);
    });

    it('should reject content over 2000 characters', () => {
      const result = sendMessageSchema.safeParse({ content: 'a'.repeat(2001) });
      expect(result.success).toBe(false);
    });

    it('should accept content at exactly 2000 characters', () => {
      const result = sendMessageSchema.safeParse({ content: 'a'.repeat(2000) });
      expect(result.success).toBe(true);
    });

    it('should reject invalid messageType', () => {
      const result = sendMessageSchema.safeParse({
        content: 'test',
        messageType: 'video',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid image URL', () => {
      const result = sendMessageSchema.safeParse({
        content: 'photo',
        messageType: 'image',
        imageUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should default messageType to text when omitted', () => {
      const result = sendMessageSchema.safeParse({ content: 'hello' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.messageType).toBe('text');
      }
    });
  });

  describe('createConversationSchema', () => {
    it('should accept a valid booking UUID', () => {
      const result = createConversationSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject a non-UUID booking ID', () => {
      const result = createConversationSchema.safeParse({ bookingId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('should reject missing bookingId', () => {
      const result = createConversationSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
