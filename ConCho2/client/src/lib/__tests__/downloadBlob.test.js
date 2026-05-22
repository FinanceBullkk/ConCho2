import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { downloadBlob } from '../downloadBlob';

describe('downloadBlob', () => {
  let createdUrl;
  let appendedNode;
  let clickedNode;
  let revokedUrl;

  beforeEach(() => {
    createdUrl = 'blob:mock-url';
    appendedNode = null;
    clickedNode = null;
    revokedUrl = null;

    globalThis.URL.createObjectURL = vi.fn(() => createdUrl);
    globalThis.URL.revokeObjectURL = vi.fn((url) => { revokedUrl = url; });

    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      appendedNode = node;
      return node;
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      clickedNode = this;
    });
    vi.spyOn(HTMLElement.prototype, 'remove').mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const mockResponse = (overrides = {}) => ({
    data: new Uint8Array([0x50, 0x4b]),
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ...overrides.headers,
    },
    ...overrides,
  });

  it('returns filename from Content-Disposition header when present', () => {
    const res = mockResponse({
      headers: { 'content-disposition': 'attachment; filename="attendance.xlsx"' },
    });
    const filename = downloadBlob(res, 'fallback.xlsx');
    expect(filename).toBe('attendance.xlsx');
  });

  it('returns fallback when Content-Disposition missing', () => {
    const res = mockResponse();
    const filename = downloadBlob(res, 'fallback.xlsx');
    expect(filename).toBe('fallback.xlsx');
  });

  it('decodes UTF-8 filename* per RFC 5987', () => {
    const res = mockResponse({
      headers: { 'content-disposition': "attachment; filename*=UTF-8''b%C3%A1o-c%C3%A1o.xlsx" },
    });
    const filename = downloadBlob(res, 'fallback.xlsx');
    expect(filename).toBe('báo-cáo.xlsx');
  });

  it('creates blob URL, clicks anchor, then revokes URL after tick', () => {
    const res = mockResponse({
      headers: { 'content-disposition': 'attachment; filename="x.xlsx"' },
    });
    downloadBlob(res, 'fallback.xlsx');

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(appendedNode).toBeInstanceOf(HTMLAnchorElement);
    expect(clickedNode).toBe(appendedNode);
    expect(appendedNode.download).toBe('x.xlsx');
    expect(appendedNode.href).toBe(createdUrl);

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(createdUrl);
    expect(revokedUrl).toBe(createdUrl);
  });

  it('uses octet-stream when content-type header missing', () => {
    const res = { data: new Uint8Array([0]), headers: {} };
    downloadBlob(res, 'fallback.bin');
    // Just assert it doesn't throw and the anchor gets the fallback name.
    expect(appendedNode.download).toBe('fallback.bin');
  });
});
