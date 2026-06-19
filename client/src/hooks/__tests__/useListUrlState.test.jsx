import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useListUrlState } from '../useListUrlState';

// Wrapper that seeds the URL so we can assert URL ↔ state round-tripping.
const wrapperFor = (initialEntry = '/users') =>
  function Wrapper({ children }) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };

const renderList = (opts, initialEntry) =>
  renderHook(() => useListUrlState(opts), { wrapper: wrapperFor(initialEntry) });

describe('useListUrlState', () => {
  describe('reading state', () => {
    it('applies defaults when the URL is empty', () => {
      const { result } = renderList({ defaults: { sortBy: 'updatedAt', sortOrder: 'desc' } });
      expect(result.current.search).toBe('');
      expect(result.current.status).toBe('');
      expect(result.current.sortBy).toBe('updatedAt');
      expect(result.current.sortOrder).toBe('desc');
      expect(result.current.page).toBe(1);
      expect(result.current.hasActiveFilters).toBe(false);
    });

    it('hydrates state from existing URL params', () => {
      const { result } = renderList(
        { facets: ['role'] },
        '/users?search=anna&status=Active&page=3&role=Admin&sortBy=name&sortOrder=asc',
      );
      expect(result.current.search).toBe('anna');
      expect(result.current.status).toBe('Active');
      expect(result.current.page).toBe(3);
      expect(result.current.facets.role).toBe('Admin');
      expect(result.current.sortBy).toBe('name');
      expect(result.current.sortOrder).toBe('asc');
      expect(result.current.hasActiveFilters).toBe(true);
    });

    it('falls back to page 1 for a malformed page param', () => {
      const { result } = renderList({}, '/users?page=not-a-number');
      expect(result.current.page).toBe(1);
    });
  });

  describe('writing state', () => {
    it('setStatus sets the status and resets page to 1', () => {
      const { result } = renderList({}, '/users?page=4');
      expect(result.current.page).toBe(4);
      act(() => result.current.setStatus('Active'));
      expect(result.current.status).toBe('Active');
      expect(result.current.page).toBe(1);
    });

    it('setStatus toggles the filter off when re-selecting the active value', () => {
      const { result } = renderList({}, '/users?status=Active');
      act(() => result.current.setStatus('Active'));
      expect(result.current.status).toBe('');
    });

    it('setSort selects a new column ascending, then toggles its direction', () => {
      const { result } = renderList({ defaults: { sortBy: 'updatedAt', sortOrder: 'desc' } });
      act(() => result.current.setSort('name'));
      expect(result.current.sortBy).toBe('name');
      expect(result.current.sortOrder).toBe('asc');
      act(() => result.current.setSort('name'));
      expect(result.current.sortOrder).toBe('desc');
    });

    it('setSort resets the page', () => {
      const { result } = renderList({}, '/users?page=5');
      act(() => result.current.setSort('name'));
      expect(result.current.page).toBe(1);
    });

    it('setPage updates the page and drops the param when back on page 1', () => {
      const { result } = renderList();
      act(() => result.current.setPage(3));
      expect(result.current.page).toBe(3);
      act(() => result.current.setPage(1));
      expect(result.current.page).toBe(1);
    });

    it('setFacet sets a facet value and resets the page', () => {
      const { result } = renderList({ facets: ['role'] }, '/users?page=2');
      act(() => result.current.setFacet('role', 'Admin'));
      expect(result.current.facets.role).toBe('Admin');
      expect(result.current.page).toBe(1);
    });

    it('clearAll removes search, status and facet params', () => {
      const { result } = renderList(
        { facets: ['role'] },
        '/users?search=x&status=Active&role=Admin',
      );
      expect(result.current.hasActiveFilters).toBe(true);
      act(() => result.current.clearAll());
      expect(result.current.search).toBe('');
      expect(result.current.status).toBe('');
      expect(result.current.facets.role).toBe('');
      expect(result.current.hasActiveFilters).toBe(false);
    });
  });

  describe('derived queryParams', () => {
    it('always carries page, sortBy and sortOrder', () => {
      const { result } = renderList({ defaults: { sortBy: 'updatedAt', sortOrder: 'desc' } });
      expect(result.current.queryParams).toMatchObject({
        page: 1,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });
      expect(result.current.queryParams.search).toBeUndefined();
    });

    it('includes status and facet values once set', () => {
      const { result } = renderList(
        { facets: ['role'] },
        '/users?status=Active&role=Admin',
      );
      expect(result.current.queryParams.status).toBe('Active');
      expect(result.current.queryParams.role).toBe('Admin');
    });

    describe('with debounced search', () => {
      beforeEach(() => vi.useFakeTimers());
      afterEach(() => vi.useRealTimers());

      it('feeds search into queryParams only after the debounce elapses', () => {
        const { result } = renderList();
        act(() => result.current.setSearch('hello'));
        // raw search updates immediately; debounced query input lags
        expect(result.current.search).toBe('hello');
        expect(result.current.queryParams.search).toBeUndefined();

        act(() => vi.advanceTimersByTime(300));
        expect(result.current.debouncedSearch).toBe('hello');
        expect(result.current.queryParams.search).toBe('hello');
      });

      it('trims whitespace-only search out of the query input', () => {
        const { result } = renderList();
        act(() => result.current.setSearch('   '));
        act(() => vi.advanceTimersByTime(300));
        expect(result.current.queryParams.search).toBeUndefined();
      });
    });
  });
});
