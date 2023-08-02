import type { Readable } from "stream";
export interface MultipartFormPart extends Readable {
  headers: Record<string, any>;
  name: string;
  filename?: string;
  byteOffset: number;
  byteCount: number;
}
