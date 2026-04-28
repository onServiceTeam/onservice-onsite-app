import React, { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { DataTable, Badge, Pagination, type Column } from '@/components/ui';
import { adminConfig } from '@/config/admin.config';

interface Customer {
  id: string;
  phone: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string;
  totalBookings: number;
  totalSpent: number;
  totalDisputes: number;
  createdAt: string;
}

interface PaginatedResult {
  success: boolean;
  data: Customer[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export default function CustomersPage(): React.ReactElement {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminCustomers', page, search, statusFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: adminConfig.defaultPageSize };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get<PaginatedResult>('/api/v1/admin/customers', { params });
      return res.data;
    },
  });

  const handleSearch = (e: FormEvent): void => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      render: (r) => (
        <div>
          <Link
            to={`/customers/${r.id}`}
            className="font-medium text-[var(--color-secondary)] hover:underline"
          >
            {[r.firstName, r.lastName].filter(Boolean).join(' ') || '(no name)'}
          </Link>
          <p className="text-xs text-[var(--color-text-secondary)]">{r.phone}</p>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (r) => (
        <span className="text-[var(--color-text-secondary)] text-sm">{r.email ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge label={r.status ?? 'active'} variant={r.status === 'active' || !r.status ? 'success' : 'danger'} />
      ),
    },
    {
      key: 'bookings',
      header: 'Bookings',
      render: (r) => <span className="text-[var(--color-text)]">{r.totalBookings}</span>,
    },
    {
      key: 'spent',
      header: 'Total Spent',
      render: (r) => (
        <span className="text-[var(--color-text)]">
          {r.totalSpent > 0 ? formatCurrency(r.totalSpent) : '—'}
        </span>
      ),
    },
    {
      key: 'joined',
      header: 'Joined',
      render: (r) => (
        <span className="text-[var(--color-text-secondary)]">
          {new Date(r.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Customer Management</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
          View and manage platform customers
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, phone, or email..."
            aria-label="Search customers by name, phone, or email"
            className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm w-72 focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
          />
          <button type="submit" className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-lg hover:opacity-90 transition-opacity">
            Search
          </button>
        </form>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          aria-label="Filter customers by status"
          className="px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)]"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {isError && <p className="text-sm text-red-500 mb-4">Failed to load customers. Please try again.</p>}

      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading} emptyMessage="No customers found." />

      {data && data.pagination.totalPages > 1 && (
        <Pagination {...data.pagination} onPageChange={setPage} />
      )}
    </div>
  );
}
