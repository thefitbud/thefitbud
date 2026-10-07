/** In-memory R2 bucket for API route tests. */
export function createMemoryR2Bucket(): R2Bucket {
  const objects = new Map<
    string,
    {
      body: Uint8Array;
      httpMetadata?: R2HTTPMetadata;
      customMetadata?: Record<string, string>;
      etag: string;
      uploaded: Date;
      size: number;
    }
  >();

  async function toBytes(
    value:
      | ArrayBuffer
      | ArrayBufferView
      | string
      | ReadableStream
      | Blob
      | null,
  ): Promise<Uint8Array> {
    if (value == null) return new Uint8Array();
    if (typeof value === "string") return new TextEncoder().encode(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (typeof Blob !== "undefined" && value instanceof Blob) {
      return new Uint8Array(await value.arrayBuffer());
    }
    const reader = (value as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      if (chunk) chunks.push(chunk);
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  }

  const bucket = {
    async head(key: string): Promise<R2Object | null> {
      const object = objects.get(key);
      if (!object) return null;
      return {
        key,
        size: object.size,
        etag: object.etag,
        httpEtag: `"${object.etag}"`,
        uploaded: object.uploaded,
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata,
        checksums: {},
        storageClass: "Standard",
        writeHttpMetadata(headers: Headers) {
          if (object.httpMetadata?.contentType) {
            headers.set("content-type", object.httpMetadata.contentType);
          }
        },
      } as R2Object;
    },
    async get(key: string): Promise<R2ObjectBody | null> {
      const object = objects.get(key);
      if (!object) return null;
      const copy = object.body.slice();
      return {
        key,
        size: object.size,
        etag: object.etag,
        httpEtag: `"${object.etag}"`,
        uploaded: object.uploaded,
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata,
        checksums: {},
        storageClass: "Standard",
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(copy);
            controller.close();
          },
        }),
        bodyUsed: false,
        arrayBuffer: async () => copy.buffer.slice(
          copy.byteOffset,
          copy.byteOffset + copy.byteLength,
        ),
        text: async () => new TextDecoder().decode(copy),
        json: async () => JSON.parse(new TextDecoder().decode(copy)),
        blob: async () => new Blob([copy]),
        writeHttpMetadata(headers: Headers) {
          if (object.httpMetadata?.contentType) {
            headers.set("content-type", object.httpMetadata.contentType);
          }
        },
      } as R2ObjectBody;
    },
    async put(
      key: string,
      value:
        | ArrayBuffer
        | ArrayBufferView
        | string
        | ReadableStream
        | Blob
        | null,
      options?: R2PutOptions,
    ): Promise<R2Object> {
      const body = await toBytes(value);
      const etag = crypto.randomUUID().replaceAll("-", "");
      const httpMetadata =
        options?.httpMetadata && !(options.httpMetadata instanceof Headers)
          ? options.httpMetadata
          : options?.httpMetadata instanceof Headers
            ? {
                contentType:
                  options.httpMetadata.get("content-type") ?? undefined,
              }
            : undefined;
      objects.set(key, {
        body,
        httpMetadata,
        customMetadata: options?.customMetadata,
        etag,
        uploaded: new Date(),
        size: body.byteLength,
      });
      return (await bucket.head(key))!;
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        objects.delete(key);
      }
    },
    async list() {
      return {
        objects: [],
        truncated: false,
        delimitedPrefixes: [],
      };
    },
    createMultipartUpload() {
      throw new Error("multipart not implemented in memory R2");
    },
    resumeMultipartUpload() {
      throw new Error("multipart not implemented in memory R2");
    },
  };

  return bucket as unknown as R2Bucket;
}
