/**
 * Hand the browser a file to save. The address is revoked a little later:
 * some browsers start the download only after the click handler has returned.
 */
export function saveBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Hand the browser a file to save, made from text in the page. */
export function downloadTextFile(filename: string, text: string, type: string): void {
  saveBlob(filename, new Blob([text], { type }));
}
