import { addDocumentSchema } from '../src/validators/project.validators';

it('Bug SEC-014 — project documents reject executable and local URL schemes while allowing web-hosted files', () => {
  expect(addDocumentSchema.safeParse({ label: 'Blueprint', fileUrl: 'https://files.example.test/blueprint.pdf', docType: 'blueprint' }).success).toBe(true);
  expect(addDocumentSchema.safeParse({ label: 'Trap', fileUrl: 'javascript:alert(document.domain)' }).success).toBe(false);
  expect(addDocumentSchema.safeParse({ label: 'Local file', fileUrl: 'file:///etc/passwd' }).success).toBe(false);
  expect(addDocumentSchema.safeParse({ label: 'Custom scheme', fileUrl: 'intent://malicious-app' }).success).toBe(false);
});
