const ExcelJS = require('exceljs');
const { buildComplianceWorkbookBuffer } = require('../../domains/learning/reports/export');

const reportWithPayloads = () => ({
  generatedAt: '2026-06-05T00:00:00.000Z',
  summary: {
    rows: 1,
    learners: 1,
    assignments: 1,
    complete: 0,
    overdue: 1,
    issued: 0,
    missing: 1,
  },
  rows: [
    {
      learner: {
        empCode: '=2+2',
        name: '=HYPERLINK("http://attacker.tld","Click")',
        email: '@evil.example',
      },
      org: {
        departmentName: '+SUM(1,1)',
        managerName: '-Manager Payload',
      },
      assignment: {
        title: '=Assignment Payload',
        targetType: 'program',
        targetName: '+Target Payload',
        dueDate: '2026-06-30T00:00:00.000Z',
        status: 'overdue',
      },
      completion: { complete: false },
      certificate: {
        number: '-CERT-EVIL',
        status: null,
        issuedAt: null,
        validUntil: null,
        state: 'missing',
      },
    },
  ],
});

const loadFirstSheet = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer));
  return workbook.worksheets[0];
};

describe('buildComplianceWorkbookBuffer — formula guard', () => {
  test('escapes every user/admin-controlled string column', async () => {
    const sheet = await loadFirstSheet(await buildComplianceWorkbookBuffer(reportWithPayloads()));
    const header = sheet.getRow(4).values;
    const row = sheet.getRow(5);

    [
      'Emp Code',
      'Learner Name',
      'Email',
      'Department',
      'Manager',
      'Assignment',
      'Target Name',
      'Certificate Number',
    ].forEach((label) => {
      expect(String(row.getCell(header.indexOf(label)).value)).toMatch(/^'/);
    });

    sheet.eachRow((r) => {
      r.eachCell((cell) => {
        if (typeof cell.value === 'string') {
          expect(/^[=+\-@\t\r]/.test(cell.value)).toBe(false);
        }
      });
    });
  });
});
