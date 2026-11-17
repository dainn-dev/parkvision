import React, { useEffect, useState } from 'react';
import { AlertTriangle, Banknote, Car, Gift, QrCode, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../../context/PlatformContext';
import { Pagination } from '../../components/ui';
import { tenantApi } from '../../services/api';
import type { WalkInSessionOut, WalkInSummaryOut } from '../../services/api';

const pad = (n: number) => String(n).padStart(2, '0');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// Date inputs hold local calendar days; the API filters on exit instants.
const dayStart = (ymd: string) => new Date(`${ymd}T00:00:00`).toISOString();
const dayEnd = (ymd: string) => new Date(`${ymd}T23:59:59.999`).toISOString();

const vnd = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('vi-VN')} ₫`);
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

const inputCls =
  'bg-[#0d0e12] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-hidden';

export const TenantWalkInsPage: React.FC = () => {
  const { t } = useTranslation('tenant');
  const { activeTenantId, tenantSites } = usePlatform();

  const [siteId, setSiteId] = useState('');
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rows, setRows] = useState<WalkInSessionOut[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<WalkInSummaryOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const from = fromDate ? dayStart(fromDate) : undefined;
  const to = toDate ? dayEnd(toDate) : undefined;

  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;
    const filters = { siteId: siteId || undefined, from, to };
    setError(null);
    tenantApi
      .walkIns(activeTenantId, { ...filters, page, limit: pageSize })
      .then((r) => {
        if (cancelled) return;
        setRows(r.data);
        setTotal(r.meta.total);
      })
      .catch(() => !cancelled && setError(t('Could not load walk-in vehicles.')));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId, siteId, from, to, page, pageSize, reloadKey]);

  // Totals do not depend on the page, so page changes must not refetch them.
  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;
    tenantApi
      .walkInSummary(activeTenantId, { siteId: siteId || undefined, from, to })
      .then((s) => !cancelled && setSummary(s))
      .catch(() => !cancelled && setError(t('Could not load walk-in vehicles.')));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId, siteId, from, to, reloadKey]);

  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const methodLabel = (r: WalkInSessionOut) => {
    if (r.status === 'waived') return t('Waived');
    if (r.status === 'open') return t('In lot');
    if (r.method === 'cash') return t('Cash');
    if (r.method === 'bank_qr') return t('Bank transfer');
    return '—';
  };

  const tiles: { id: string; label: string; value: string; sub?: string; icon: React.ReactNode }[] = [
    {
      id: 'cash',
      label: t('Cash'),
      value: String(summary?.cashCount ?? 0),
      sub: vnd(summary?.cashTotalVnd ?? 0),
      icon: <Banknote className="w-4 h-4 text-[#3fb950]" />,
    },
    {
      id: 'bank',
      label: t('Bank transfer'),
      value: String(summary?.bankQrCount ?? 0),
      sub: vnd(summary?.bankQrTotalVnd ?? 0),
      icon: <QrCode className="w-4 h-4 text-[#58a6ff]" />,
    },
    { id: 'waived', label: t('Waived'), value: String(summary?.waivedCount ?? 0), icon: <Gift className="w-4 h-4 text-[#e3b341]" /> },
    { id: 'open', label: t('In lot'), value: String(summary?.openCount ?? 0), icon: <Car className="w-4 h-4 text-[#c9d1d9]" /> },
    {
      id: 'mismatch',
      label: t('Price mismatch'),
      value: String(summary?.mismatchCount ?? 0),
      icon: <AlertTriangle className="w-4 h-4 text-[#f85149]" />,
    },
  ];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#161b22]/70 p-5 rounded-2xl border border-[#30363d]">
        <div>
          <div className="flex items-center gap-2.5">
            <Banknote className="w-6 h-6 text-[#58a6ff]" />
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">{t('Walk-in vehicles')}</h1>
          </div>
          <p className="text-xs text-[#8b949e] mt-1">
            {t('Fees collected at the gate from vehicles without an account, by cash or bank transfer')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#0d0e12] border border-[#30363d] text-white hover:border-[#58a6ff] cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t('Refresh')}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-[#161b22] p-4 rounded-xl border border-[#30363d]">
        <div className="space-y-1">
          <label htmlFor="walkin-site" className="block text-[11px] text-[#8b949e]">{t('Facility Site')}</label>
          <select id="walkin-site" value={siteId} onChange={(e) => resetPage(setSiteId)(e.target.value)} className={inputCls}>
            <option value="">{t('All Facilities')}</option>
            {tenantSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="walkin-from" className="block text-[11px] text-[#8b949e]">{t('From date')}</label>
          <input id="walkin-from" type="date" value={fromDate} max={toDate || undefined} onChange={(e) => resetPage(setFromDate)(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label htmlFor="walkin-to" className="block text-[11px] text-[#8b949e]">{t('To date')}</label>
          <input id="walkin-to" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => resetPage(setToDate)(e.target.value)} className={inputCls} />
        </div>
      </div>

      {error && <p className="text-xs text-[#f85149]">{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {tiles.map((tile) => (
          <div key={tile.id} data-testid={`tile-${tile.id}`} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
            <div className="flex items-center gap-2 text-[11px] text-[#8b949e]">
              {tile.icon}
              <span>{tile.label}</span>
            </div>
            <div className="mt-2 text-2xl font-bold text-white font-mono">{tile.value}</div>
            {tile.sub && <div className="text-xs text-[#8b949e] font-mono">{tile.sub}</div>}
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-[#161b22] border border-[#30363d] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0d0e12] text-[#8b949e] border-b border-[#30363d] uppercase font-semibold text-[10px]">
              <tr>
                <th className="py-3 px-4">{t('Plate')}</th>
                <th className="py-3 px-4">{t('Entry time')}</th>
                <th className="py-3 px-4">{t('Exit time')}</th>
                <th className="py-3 px-4 text-right">{t('Amount')}</th>
                <th className="py-3 px-4">{t('Payment method')}</th>
                <th className="py-3 px-4">{t('Waive reason')}</th>
                <th className="py-3 px-4">{t('Price mismatch warning')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]/60 font-medium">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#8b949e]">
                    {t('No walk-in vehicles in this period')}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className={r.amountMismatch ? 'bg-[#da3633]/5' : undefined}>
                    <td className="py-3 px-4 font-mono font-bold text-white tracking-wider">{r.plateNumber}</td>
                    <td className="py-3 px-4 text-[#8b949e] whitespace-nowrap">{dt(r.enteredAt)}</td>
                    <td className="py-3 px-4 text-[#8b949e] whitespace-nowrap">{dt(r.exitedAt)}</td>
                    <td className="py-3 px-4 text-right font-mono text-white whitespace-nowrap">
                      {r.status === 'open' ? '—' : vnd(r.amountVnd)}
                    </td>
                    <td className="py-3 px-4 text-[#c9d1d9] whitespace-nowrap">{methodLabel(r)}</td>
                    <td className="py-3 px-4 text-[#c9d1d9]">{r.status === 'waived' ? r.waiveReason || '—' : ''}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {r.amountMismatch && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-[#da3633]/15 text-[#f85149] border border-[#da3633]/30">
                          <AlertTriangle className="w-3 h-3" />
                          {t('Price mismatch')}: {t('expected')} {vnd(r.expectedAmountVnd)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={page}
          totalPages={Math.ceil(total / pageSize) || 1}
          totalItems={total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </div>
    </div>
  );
};
