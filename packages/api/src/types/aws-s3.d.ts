/**
 * Type stub for @aws-sdk/client-s3.
 * The actual SDK is loaded lazily via dynamic import at runtime only when S3_BUCKET is configured.
 * This stub satisfies TypeScript without requiring the package installed locally.
 */
declare module '@aws-sdk/client-s3' {
  interface S3ClientConfig {
    region?: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    credentials?: {
      accessKeyId: string;
      secretAccessKey: string;
    };
  }

  class S3Client {
    constructor(config: S3ClientConfig);
    send(command: unknown): Promise<unknown>;
  }

  class PutObjectCommand {
    constructor(params: Record<string, unknown>);
  }

  class DeleteObjectCommand {
    constructor(params: Record<string, unknown>);
  }

  class GetObjectCommand {
    constructor(params: Record<string, unknown>);
  }
}
