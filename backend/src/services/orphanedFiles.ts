// ============================================
// Files in the uploads folder that no asset names
// ============================================
//
// Every uploaded file is named by an asset row, as its file or its thumbnail.
// A file can still be left with no row: an asset delete whose file could not
// be removed, a restore that copied back files the restored database does not
// know, a crash between writing a file and recording it. Nothing else would
// ever find such a file, so an admin can list them here and then delete them.
//
// Listing changes nothing. Deleting takes the files the admin saw by name and
// removes each one only if it still has no row at that moment.
//
// Only the folders uploads are written to are looked at. `temp/` holds
// campaign imports still in progress, and anything else in the uploads folder
// is not CozyVTT's to judge. A file changed in the last hour is left out, since
// an upload or campaign import writes its file before its row.
//
// A file counts as named when its file name matches the file name of any
// row's file or thumbnail. Stored names are generated and unique, and matching
// on the name alone still recognises a row written on another machine or
// under another uploads path, as a restored backup's rows can be.

import path from 'path';
import fs from 'fs/promises';
import type { Dirent } from 'fs';
import { prisma } from '../config/database';
import { deleteFile, getUploadsDirectory } from '../utils/fileUtils';
import logger from '../utils/logger';
import { errorCode } from '../utils/errors';

/** The folders under the uploads folder that asset files are written to. */
export const ASSET_FOLDERS = ['maps', 'tokens', 'audio', 'avatars', 'documents'] as const;

/** A file changed more recently than this is not judged; its upload may be finishing. */
export const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

/** The most files one report lists, or one delete accepts. The rest are counted. */
export const MAX_ORPHANS_PER_REQUEST = 5000;

export interface OrphanedFile {
  /** Relative to the uploads folder, with forward slashes. */
  path: string;
  size: number;
  modifiedAt: string;
}

export interface OrphanReport {
  /** Sorted by path, at most MAX_ORPHANS_PER_REQUEST. */
  files: OrphanedFile[];
  /** All of them, listed or not. */
  total: number;
  totalBytes: number;
  /** Files no row names that changed too recently to judge. */
  recent: number;
}

export interface OrphanDeletion {
  deleted: string[];
  /** Named in the request but not a leftover file now: named by a row, too recent, gone, or never one. */
  skipped: string[];
  /** Leftover files that could not be removed. */
  failed: string[];
}

interface FoundFile {
  relative: string;
  absolute: string;
  size: number;
  modifiedMs: number;
}

/** Every regular file under the asset folders. Links are not followed or listed. */
async function filesInAssetFolders(): Promise<FoundFile[]> {
  const root = getUploadsDirectory();
  const found: FoundFile[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      // A folder no upload has needed yet does not exist.
      if (errorCode(error) === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        const stat = await fs.lstat(absolute).catch(() => null);
        if (!stat?.isFile()) continue;
        found.push({
          relative: path.relative(root, absolute).split(path.sep).join('/'),
          absolute,
          size: stat.size,
          modifiedMs: stat.mtimeMs,
        });
      }
    }
  };
  for (const folder of ASSET_FOLDERS) await walk(path.join(root, folder));
  return found;
}

/** The file name of every file and thumbnail an asset row names. */
async function namedFileNames(): Promise<Set<string>> {
  const rows = await prisma.asset.findMany({ select: { filePath: true, thumbnailPath: true } });
  const names = new Set<string>();
  const add = (stored: string | null) => {
    if (stored) names.add(path.posix.basename(stored.replace(/\\/g, '/')));
  };
  for (const row of rows) {
    add(row.filePath);
    add(row.thumbnailPath);
  }
  return names;
}

/** Files no row names, split into those old enough to judge and the count of those that are not. */
async function scan(now: number): Promise<{ orphans: FoundFile[]; recent: number }> {
  // Files first: a row written after this read is then seen by the read below.
  const files = await filesInAssetFolders();
  const named = await namedFileNames();
  const unnamed = files.filter((f) => !named.has(path.basename(f.absolute)));
  const orphans = unnamed.filter((f) => now - f.modifiedMs >= ORPHAN_MIN_AGE_MS);
  orphans.sort((a, b) => (a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0));
  return { orphans, recent: unnamed.length - orphans.length };
}

/** The leftover files, for an admin to look over. Changes nothing. */
export async function findOrphanedFiles(now: number = Date.now()): Promise<OrphanReport> {
  const { orphans, recent } = await scan(now);
  return {
    files: orphans.slice(0, MAX_ORPHANS_PER_REQUEST).map((f) => ({
      path: f.relative,
      size: f.size,
      modifiedAt: new Date(Math.floor(f.modifiedMs / 1000) * 1000).toISOString(),
    })),
    total: orphans.length,
    totalBytes: orphans.reduce((sum, f) => sum + f.size, 0),
    recent,
  };
}

/**
 * Delete the named files that are leftover files now. The names are only
 * looked up in a fresh scan, so nothing outside the asset folders, and
 * nothing a row names, can be reached through them.
 */
export async function deleteOrphanedFiles(paths: string[], now: number = Date.now()): Promise<OrphanDeletion> {
  const { orphans } = await scan(now);
  const byPath = new Map(orphans.map((f) => [f.relative, f]));
  const result: OrphanDeletion = { deleted: [], skipped: [], failed: [] };
  for (const requested of new Set(paths)) {
    const file = byPath.get(requested);
    if (!file) {
      result.skipped.push(requested);
      continue;
    }
    try {
      if (await deleteFile(file.absolute)) result.deleted.push(requested);
      else result.skipped.push(requested);
    } catch (error) {
      logger.error('Could not delete a leftover upload', { file: requested, err: error });
      result.failed.push(requested);
    }
  }
  return result;
}
