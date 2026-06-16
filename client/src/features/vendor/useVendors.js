import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { vendorsAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';

// ──────────────────────────────────────────────────────────
// useVendors — A2 vendor management (Horizon 2). Catalog reads + spend, and
// create / edit / archive / rate mutations. Both read and write need
// vendor.manage (Admin / Coordinator) server-side.
// ──────────────────────────────────────────────────────────

const onErr = (e) => toast.error(e?.response?.data?.message || 'Something went wrong');

export const useVendors = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.vendor.list(params),
    queryFn: async () => (await vendorsAPI.list(params)).data.data,
    staleTime: 60_000,
    ...options,
  });

export const useVendor = (id, options = {}) =>
  useQuery({
    queryKey: qk.vendor.detail(id),
    queryFn: async () => (await vendorsAPI.get(id)).data.data,
    enabled: !!id,
    ...options,
  });

export const useVendorSpend = (id, params = {}, options = {}) =>
  useQuery({
    queryKey: qk.vendor.spend(id, params),
    queryFn: async () => (await vendorsAPI.getSpend(id, params)).data.data,
    enabled: !!id,
    staleTime: 60_000,
    ...options,
  });

const invalidate = (qc) => qc.invalidateQueries({ queryKey: qk.vendor.all });

export const useCreateVendor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => vendorsAPI.create(data).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Vendor created'); },
    onError: onErr,
  });
};

export const useUpdateVendor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => vendorsAPI.update(id, data).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Vendor updated'); },
    onError: onErr,
  });
};

export const useArchiveVendor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => vendorsAPI.archive(id).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Vendor archived'); },
    onError: onErr,
  });
};

export const useRateVendor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value, note }) => vendorsAPI.addRating(id, { value, note }).then((r) => r.data.data),
    onSuccess: () => { invalidate(qc); toast.success('Rating recorded'); },
    onError: onErr,
  });
};
