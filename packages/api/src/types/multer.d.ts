declare module 'multer' {
  import type { RequestHandler } from 'express';

  interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
    destination?: string;
    filename?: string;
    path?: string;
  }

  interface StorageEngine {
    _handleFile(req: unknown, file: File, callback: (error?: Error | null, info?: Partial<File>) => void): void;
    _removeFile(req: unknown, file: File, callback: (error: Error | null) => void): void;
  }

  interface Options {
    storage?: StorageEngine;
    limits?: {
      fieldNameSize?: number;
      fieldSize?: number;
      fields?: number;
      fileSize?: number;
      files?: number;
      parts?: number;
      headerPairs?: number;
    };
    fileFilter?(req: unknown, file: File, callback: (error: Error | null, acceptFile: boolean) => void): void;
  }

  interface Instance {
    single(fieldName: string): RequestHandler;
    array(fieldName: string, maxCount?: number): RequestHandler;
    fields(fields: Array<{ name: string; maxCount?: number }>): RequestHandler;
    none(): RequestHandler;
    any(): RequestHandler;
  }

  interface Multer {
    (options?: Options): Instance;
    memoryStorage(): StorageEngine;
    diskStorage(options: { destination?: string | ((req: unknown, file: File, cb: (error: Error | null, destination: string) => void) => void); filename?: (req: unknown, file: File, cb: (error: Error | null, filename: string) => void) => void }): StorageEngine;
  }

  const multer: Multer;
  export = multer;
}
