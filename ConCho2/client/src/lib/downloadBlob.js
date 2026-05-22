// ──────────────────────────────────────────────────────────
// downloadBlob — Phase 4 Surface 8 §F (Q8F)
//
// Shared util that turns an axios response carrying a binary blob into
// a browser download. Extracted from HRExportPage's inline duplicated
// logic (attendance + evaluation exports). Reusable for any future
// "fetch → download" surface (e.g. audit-log export, evaluation export,
// CSV reports).
//
// Reads filename from the Content-Disposition header when present and
// falls back to the caller-supplied name otherwise. Returns the final
// filename so callers can show it in a toast ("Downloaded foo.xlsx").
//
// Usage:
//   const res = await downloadMutation.mutateAsync();  // axios response w/ blob
//   const filename = downloadBlob(res, 'attendance.xlsx');
//   toast.success(`Downloaded ${filename}`);
// ──────────────────────────────────────────────────────────

export function downloadBlob(response, fallbackFilename = 'download') {
  const headers = response?.headers ?? {};
  const disposition = headers['content-disposition'];
  let filename = fallbackFilename;
  if (disposition) {
    const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    if (match) filename = decodeURIComponent(match[1].trim());
  }

  const blob = new Blob([response.data], {
    type: headers['content-type'] || 'application/octet-stream',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so the click has a tick to register the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return filename;
}
