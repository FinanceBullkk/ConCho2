const dto = require('../../domains/english-training/dto');
const { issueCodeParams } = require('../../domains/english-training/schemas');

describe('English-training data-quality issue DTO', () => {
  test('maps enriched issue detail rows to the camelCase API contract', () => {
    expect(dto.issueDetails([{
      id: 'dq1', issue_code: 'missing_bu', entity_type: 'employee', entity_key: '267040',
      emp_code: '267040', full_name: 'Test Employee', class_code: null,
      business_unit: null, job_role: null,
      source_sheet: 'STUDENTS', source_row: 303, detail: { field: 'BU' },
    }])).toEqual([{
      id: 'dq1', code: 'missing_bu', entityType: 'employee', entityKey: '267040',
      employeeCode: '267040', employeeName: 'Test Employee', classCode: null,
      businessUnit: null, jobRole: null,
      sourceSheet: 'STUDENTS', sourceRow: 303, detail: { field: 'BU' },
    }]);
  });

  test('issue code validation rejects path-like input', () => {
    expect(issueCodeParams.safeParse({ code: '../employees' }).success).toBe(false);
    expect(issueCodeParams.safeParse({ code: 'missing_bu' }).success).toBe(true);
  });
});
