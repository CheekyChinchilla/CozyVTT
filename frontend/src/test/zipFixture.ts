/**
 * A ZIP archive built in a test, packed the ways a campaign export packs its
 * files: stored as they are, or DEFLATE-compressed. The checksum is left at
 * zero, which nothing under test reads.
 */

export interface ZipFixtureEntry {
  name: string;
  data: string | Uint8Array<ArrayBuffer>;
  /** 0 stores the file as it is; 8 compresses it. */
  method?: 0 | 8;
  /** General purpose flags; bit 0 marks the file encrypted. */
  flags?: number;
}

async function deflate(data: BufferSource): Promise<Uint8Array> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  return new Uint8Array(await new Response(source.pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
}

export async function zipFixture(entries: ZipFixtureEntry[], comment = ''): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const raw = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    const method = entry.method ?? 8;
    const body = method === 8 ? await deflate(raw) : raw;

    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, entry.flags ?? 0, true);
    header.setUint16(8, method, true);
    header.setUint32(18, body.byteLength, true);
    header.setUint32(22, raw.byteLength, true);
    header.setUint16(26, name.byteLength, true);
    local.push(new Uint8Array(header.buffer), name, body);

    const listed = new DataView(new ArrayBuffer(46));
    listed.setUint32(0, 0x02014b50, true);
    listed.setUint16(4, 20, true);
    listed.setUint16(6, 20, true);
    listed.setUint16(8, entry.flags ?? 0, true);
    listed.setUint16(10, method, true);
    listed.setUint32(20, body.byteLength, true);
    listed.setUint32(24, raw.byteLength, true);
    listed.setUint16(28, name.byteLength, true);
    listed.setUint32(42, offset, true);
    directory.push(new Uint8Array(listed.buffer), name);

    offset += 30 + name.byteLength + body.byteLength;
  }
  const directorySize = directory.reduce((n, part) => n + part.byteLength, 0);
  const commentBytes = encoder.encode(comment);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, commentBytes.byteLength, true);

  const parts = [...local, ...directory, new Uint8Array(end.buffer), commentBytes];
  const out = new Uint8Array(parts.reduce((n, part) => n + part.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}
