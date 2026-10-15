/**
 * Files in the uploads folder that no asset names, for an admin to find and
 * delete. Such a file is left when an asset's file could not be removed with
 * it, or when a restored backup brings back files its database does not know.
 * Nothing in CozyVTT can show or reach one, so without this it stays on disk
 * until someone looks through the folder by hand.
 *
 * Checking lists them and changes nothing. Deleting asks first and sends the
 * files listed; the server deletes each one only if no asset names it then.
 */
import { useState } from 'react';
import { FileX, Loader2, Search } from 'lucide-react';
import { api } from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import { formatDateTime, formatFileSize } from '@/utils/format';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import type { OrphanedFilesDeletion, OrphanedFilesReport } from '@/types';

const plural = (count: number, one: string, many: string) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

function deletionSummary(result: OrphanedFilesDeletion): string {
  const parts = [`Deleted ${plural(result.deleted.length, 'file', 'files')}.`];
  if (result.skipped.length > 0) {
    parts.push(
      `${result.skipped.length.toLocaleString()} ${result.skipped.length === 1 ? 'was' : 'were'} kept because ${result.skipped.length === 1 ? 'it is' : 'they are'} no longer a leftover file.`
    );
  }
  if (result.failed.length > 0) {
    parts.push(
      `${plural(result.failed.length, 'file', 'files')} could not be deleted; the server log says why.`
    );
  }
  return parts.join(' ');
}

export default function OrphanedFilesPanel() {
  const [report, setReport] = useState<OrphanedFilesReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const check = async () => {
    setChecking(true);
    setError('');
    setResult('');
    try {
      setReport(await api.listOrphanedFiles());
    } catch (err: unknown) {
      setError(apiErrorMessage(err) ?? 'Failed to check the uploads folder');
    } finally {
      setChecking(false);
    }
  };

  const remove = async () => {
    if (!report) return;
    setDeleting(true);
    setError('');
    try {
      const outcome = await api.deleteOrphanedFiles(report.files.map((f) => f.path));
      // Deleted, or no longer leftover files: either way not listed any more.
      const gone = new Set([...outcome.deleted, ...outcome.skipped]);
      const removed = report.files.filter((f) => gone.has(f.path));
      setReport({
        ...report,
        files: report.files.filter((f) => !gone.has(f.path)),
        total: report.total - removed.length,
        totalBytes: report.totalBytes - removed.reduce((sum, f) => sum + f.size, 0),
      });
      setResult(deletionSummary(outcome));
    } catch (err: unknown) {
      setError(apiErrorMessage(err) ?? 'Failed to delete the files');
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  const listed = report?.files.length ?? 0;

  return (
    <section className="glass-panel p-5 mt-6" aria-labelledby="orphaned-files-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div className="max-w-2xl">
          <h3 id="orphaned-files-heading" className="text-base font-semibold text-brand-ink flex items-center gap-2">
            <FileX className="w-4 h-4" aria-hidden="true" />
            Leftover Files
          </h3>
          <p className="text-xs text-warm-gray mt-1">
            Files in the uploads folder that no asset names, such as a file that could not be removed when its asset
            was deleted, or one a restored backup brought back. Nothing in CozyVTT uses them. Checking only lists
            them; nothing is deleted until you confirm.
          </p>
        </div>
        <Button onClick={check} disabled={checking || deleting} variant="secondary" className="flex items-center gap-2 text-sm py-1.5 px-3">
          {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Search className="w-3.5 h-3.5" aria-hidden="true" />}
          Check for Leftover Files
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger-ink bg-danger/10 border border-danger/30 rounded-lg p-3 mt-3">{error}</p>
      )}
      {result && (
        <p role="status" className="text-sm text-brand-ink bg-moss-green/10 border border-moss-green/30 rounded-lg p-3 mt-3">{result}</p>
      )}

      {report && (
        <div className="mt-3 space-y-3 text-sm">
          {report.total === 0 ? (
            <p className="text-warm-gray">No leftover files. Every file in the uploads folder belongs to an asset.</p>
          ) : (
            <>
              <p className="text-stone-gray">
                {plural(report.total, 'leftover file', 'leftover files')}, {formatFileSize(report.totalBytes)} in all.
                {report.total > listed && ` The first ${listed.toLocaleString()} are listed; delete them, then check again for the rest.`}
              </p>
              {listed > 0 && (
                <div className="max-h-72 overflow-auto rounded-lg border border-warm-gray/20">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-warm-gray/20 bg-moss-green/5 text-left text-warm-gray uppercase tracking-wide">
                        <th className="px-3 py-2 font-semibold">File</th>
                        <th className="px-3 py-2 font-semibold whitespace-nowrap">Size</th>
                        <th className="px-3 py-2 font-semibold whitespace-nowrap">Last changed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.files.map((f) => (
                        <tr key={f.path} className="border-b border-warm-gray/10 last:border-0">
                          <td className="px-3 py-1.5 font-mono break-all text-stone-gray">{f.path}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-warm-gray">{formatFileSize(f.size)}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-warm-gray">{formatDateTime(f.modifiedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {listed > 0 && (
                <Button onClick={() => setConfirming(true)} disabled={deleting} variant="danger" className="text-sm py-1.5 px-3">
                  {`Delete ${plural(listed, 'File', 'Files')}`}
                </Button>
              )}
            </>
          )}
          {report.recent > 0 && (
            <p className="text-xs text-warm-gray">
              {report.recent.toLocaleString()} more changed in the last {report.minimumAgeMinutes} minutes and{' '}
              {report.recent === 1 ? 'is' : 'are'} not listed, since an upload may still be finishing. Check again later.
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirming}
        title="Delete Leftover Files"
        message={`Delete the ${plural(listed, 'listed file', 'listed files')} from the server? No asset names them, so nothing in CozyVTT uses them, but a deleted file cannot be brought back without a backup of the uploads folder. Each file is checked again first, and kept if an asset names it by then.`}
        confirmLabel="Delete Files"
        variant="danger"
        isLoading={deleting}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
