import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import JSZip from 'jszip';
import { track } from './analytics';
import { newId } from './ids';
import { insertBook } from './repo';
import type { BookFormat } from './types';

type EpubMeta = { title?: string; author?: string; cover?: { bytes: Uint8Array; ext: string } };

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<(?:dc:)?${name}[^>]*>([\\s\\S]*?)</(?:dc:)?${name}>`, 'i'));
  return m ? decodeXml(m[1].replace(/<[^>]+>/g, '').trim()) : undefined;
};

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const attr = (el: string, name: string) => el.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];

function resolvePath(base: string, rel: string) {
  const parts = (base ? base.split('/') : []).concat(decodeURIComponent(rel).split('/'));
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
}

/** Reads title, author and cover image out of an EPUB without rendering it. */
export async function readEpubMetadata(bytes: ArrayBuffer): Promise<EpubMeta> {
  const zip = await JSZip.loadAsync(bytes);
  const container = await zip.file('META-INF/container.xml')?.async('string');
  const opfPath = container && attr(container.match(/<rootfile\s[^>]*>/i)?.[0] ?? '', 'full-path');
  if (!opfPath) throw new Error('Not a valid EPUB: missing package document');
  const opf = await zip.file(opfPath)?.async('string');
  if (!opf) throw new Error('Not a valid EPUB: package document unreadable');
  const baseDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';

  const meta: EpubMeta = { title: tag(opf, 'title'), author: tag(opf, 'creator') };

  const items = [...opf.matchAll(/<item\b[^>]*>/gi)].map((m) => m[0]);
  let coverItem = items.find((i) => /properties\s*=\s*["'][^"']*cover-image/i.test(i));
  if (!coverItem) {
    const coverId = [...opf.matchAll(/<meta\b[^>]*>/gi)]
      .map((m) => m[0])
      .find((m) => attr(m, 'name') === 'cover');
    const id = coverId && attr(coverId, 'content');
    if (id) coverItem = items.find((i) => attr(i, 'id') === id);
  }
  const href = coverItem && attr(coverItem, 'href');
  if (href && /image\//i.test(attr(coverItem!, 'media-type') ?? 'image/')) {
    const entry = zip.file(resolvePath(baseDir, href));
    if (entry) {
      const ext = (href.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      meta.cover = { bytes: await entry.async('uint8array'), ext };
    }
  }
  return meta;
}

export type ImportResult = { status: 'imported'; id: string } | { status: 'canceled' };

function detectFormat(name: string, mime?: string | null): BookFormat | null {
  if (/\.pdf$/i.test(name) || mime === 'application/pdf') return 'pdf';
  if (/\.epub$/i.test(name) || mime === 'application/epub+zip') return 'epub';
  return null;
}

/** Lets the user pick an .epub or .pdf, stores it in app storage and registers it in the library. */
export async function pickAndImportBook(): Promise<ImportResult> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/epub+zip', 'application/pdf', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.[0]) return { status: 'canceled' };
  const asset = res.assets[0];
  const format = detectFormat(asset.name, asset.mimeType);
  if (!format) throw new Error('Please choose an .epub or .pdf file.');

  const source = new File(asset.uri);
  const id = newId();
  const dir = new Directory(Paths.document, 'books', id);
  dir.create({ intermediates: true });
  const dest = new File(dir, `book.${format}`);
  await source.copy(dest);
  if (!dest.exists) {
    dir.delete();
    throw new Error('Could not copy the file into the app. Please try again.');
  }

  try {
    if (format === 'pdf') {
      // PDF title/author/cover are read from the file the first time it is opened.
      await insertBook({ id, title: asset.name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim() || 'PDF', filePath: dest.uri, format });
      track('book_added', { bookId: id, format });
      return { status: 'imported', id };
    }
    const meta = await readEpubMetadata(await dest.arrayBuffer());
    let coverPath: string | null = null;
    if (meta.cover) {
      const cover = new File(dir, `cover.${meta.cover.ext}`);
      cover.create({ overwrite: true });
      cover.write(meta.cover.bytes);
      coverPath = cover.uri;
    }
    await insertBook({
      id,
      title: meta.title || asset.name.replace(/\.epub$/i, ''),
      author: meta.author,
      coverPath,
      filePath: dest.uri,
      format,
    });
    track('book_added', { bookId: id, format });
    return { status: 'imported', id };
  } catch (e) {
    dir.delete();
    throw e instanceof Error ? e : new Error('Could not import this EPUB.');
  } finally {
    try {
      source.delete();
    } catch {
      /* cache file may already be gone */
    }
  }
}

export function deleteBookFiles(filePath: string) {
  try {
    const file = new File(filePath);
    const dir = file.parentDirectory;
    if (dir.exists) dir.delete();
  } catch {
    /* ignore */
  }
}
