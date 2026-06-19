import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { qcWrapper } from '../../../test/query-wrapper';
import { useVendors, useVendor, useVendorSpend, useCreateVendor } from '../useVendors';

describe('useVendors (list)', () => {
  it('fetches the vendor catalog', async () => {
    const { result } = renderHook(() => useVendors(), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data[0].name).toBe('Acme Training');
  });
});

describe('useVendor (detail)', () => {
  it('is disabled without an id', () => {
    const { result } = renderHook(() => useVendor(undefined), { wrapper: qcWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches one vendor when an id is given', async () => {
    const { result } = renderHook(() => useVendor('v1'), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data._id).toBe('v1');
  });
});

describe('useVendorSpend', () => {
  it('fetches per-vendor spend', async () => {
    const { result } = renderHook(() => useVendorSpend('v1'), { wrapper: qcWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.total).toBe(1000);
  });
});

describe('useCreateVendor', () => {
  it('creates a vendor', async () => {
    const { result } = renderHook(() => useCreateVendor(), { wrapper: qcWrapper() });
    result.current.mutate({ name: 'New Vendor' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
