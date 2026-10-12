import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  BadgeCheck,
  Car,
  CreditCard,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  XCircle
} from 'lucide-react';
import { Badge, Button, Input, Modal, Pagination, Select } from '../../components/ui';
import {
  MembershipPlanIn,
  MembershipPlanOut,
  TenantMembershipOut,
  TenantPaymentOut,
  tenantApi
} from '../../services/api';
import { useTranslation } from 'react-i18next';

type Tab = 'requests' | 'plans' | 'payments';
type ActionKind = 'activate' | 'reject' | 'revoke';

const MEMBERSHIP_STATUS_VARIANT: Record<TenantMembershipOut['status'], 'emerald' | 'amber' | 'red' | 'slate'> = {
  pending: 'amber',
  active: 'emerald',
  rejected: 'red',
  cancelled: 'slate',
  expired: 'slate',
  revoked: 'red'
};

const PAYMENT_STATUS_VARIANT: Record<string, 'emerald' | 'amber' | 'red' | 'slate' | 'blue'> = {
  created: 'amber',
  paid: 'emerald',
  failed: 'red',
  cancelled: 'slate',
  expired: 'slate',
  refunded: 'blue'
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');
const fmtVnd = (v: number) => `${v.toLocaleString()}đ`;

export const TenantMembershipsPage: React.FC = () => {
  const { t } = useTranslation('tenant');
  const { activeTenantId, tenantSites, addToast } = usePlatform();

  const [tab, setTab] = useState<Tab>('requests');

  // ---------- requests state ----------
  const [memberships, setMemberships] = useState<TenantMembershipOut[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [loadingRows, setLoadingRows] = useState(false);
  const [action, setAction] = useState<{ kind: ActionKind; row: TenantMembershipOut } | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [acting, setActing] = useState(false);

  // ---------- plans state ----------
  const [planSiteId, setPlanSiteId] = useState('');
  const [plans, setPlans] = useState<MembershipPlanOut[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [planModal, setPlanModal] = useState<{ plan: MembershipPlanOut | null } | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planForm, setPlanForm] = useState<MembershipPlanIn>({
    name: '',
    priceVnd: 0,
    durationDays: 30,
    status: 'active'
  });
  const [perksText, setPerksText] = useState('');

  // ---------- payments state ----------
  const [payments, setPayments] = useState<TenantPaymentOut[]>([]);
  const [payTotal, setPayTotal] = useState(0);
  const [payPage, setPayPage] = useState(1);
  const [payStatus, setPayStatus] = useState('');
  const [paySiteId, setPaySiteId] = useState('');
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [refundRow, setRefundRow] = useState<TenantPaymentOut | null>(null);
  const [refunding, setRefunding] = useState(false);

  const pendingCount = useMemo(
    () => memberships.filter((m) => m.status === 'pending').length,
    [memberships]
  );

  const loadMemberships = useCallback(async () => {
    if (!activeTenantId) return;
    setLoadingRows(true);
    try {
      const res = await tenantApi.memberships(activeTenantId, {
        page,
        limit: 20,
        status: statusFilter || undefined,
        siteId: siteFilter || undefined
      });
      setMemberships(res.data);
      setTotal(res.meta.total);
    } catch {
      addToast({ type: 'error', title: t('Failed to load memberships') });
    } finally {
      setLoadingRows(false);
    }
  }, [activeTenantId, page, statusFilter, siteFilter, addToast, t]);

  const loadPlans = useCallback(async () => {
    if (!activeTenantId || !planSiteId) {
      setPlans([]);
      return;
    }
    setLoadingPlans(true);
    try {
      setPlans(await tenantApi.membershipPlans(activeTenantId, planSiteId));
    } catch {
      addToast({ type: 'error', title: t('Failed to load plans') });
    } finally {
      setLoadingPlans(false);
    }
  }, [activeTenantId, planSiteId, addToast, t]);

  useEffect(() => {
    void loadMemberships();
  }, [loadMemberships]);

  useEffect(() => {
    if (tab === 'plans') void loadPlans();
  }, [tab, loadPlans]);

  const loadPayments = useCallback(async () => {
    if (!activeTenantId) return;
    setLoadingPayments(true);
    try {
      const res = await tenantApi.payments(activeTenantId, {
        page: payPage,
        limit: 20,
        status: payStatus || undefined,
        siteId: paySiteId || undefined
      });
      setPayments(res.data);
      setPayTotal(res.meta.total);
    } catch {
      addToast({ type: 'error', title: t('Failed to load payments') });
    } finally {
      setLoadingPayments(false);
    }
  }, [activeTenantId, payPage, payStatus, paySiteId, addToast, t]);

  useEffect(() => {
    if (tab === 'payments') void loadPayments();
  }, [tab, loadPayments]);

  const runRefund = async () => {
    if (!refundRow || !activeTenantId) return;
    setRefunding(true);
    try {
      await tenantApi.refundPayment(activeTenantId, refundRow.id);
      addToast({
        type: 'success',
        title: t('Payment refunded'),
        description: t('{{amount}} returned via {{method}}', {
          amount: fmtVnd(refundRow.amountVnd),
          method: refundRow.method
        })
      });
      setRefundRow(null);
      await loadPayments();
    } catch (e) {
      addToast({ type: 'error', title: t('Refund failed'), description: e instanceof Error ? e.message : undefined });
    } finally {
      setRefunding(false);
    }
  };

  const runAction = async () => {
    if (!action || !activeTenantId) return;
    setActing(true);
    try {
      const fn = {
        activate: tenantApi.activateMembership,
        reject: tenantApi.rejectMembership,
        revoke: tenantApi.revokeMembership
      }[action.kind];
      await fn(activeTenantId, action.row.id, actionNote || undefined);
      addToast({
        type: 'success',
        title: t('Membership {{action}}', { action: t(action.kind) }),
        description: t('{{plate}} — {{site}}', { plate: action.row.plateNumber, site: action.row.siteName })
      });
      setAction(null);
      setActionNote('');
      await loadMemberships();
    } catch (e) {
      addToast({ type: 'error', title: t('Action failed'), description: e instanceof Error ? e.message : undefined });
    } finally {
      setActing(false);
    }
  };

  const openPlanModal = (plan: MembershipPlanOut | null) => {
    setPlanModal({ plan });
    setPlanForm(
      plan
        ? {
            name: plan.name,
            description: plan.description,
            priceVnd: plan.priceVnd,
            durationDays: plan.durationDays,
            perks: plan.perks,
            badge: plan.badge,
            status: plan.status === 'inactive' ? 'inactive' : 'active'
          }
        : { name: '', priceVnd: 0, durationDays: 30, status: 'active' }
    );
    setPerksText(plan ? plan.perks.join(', ') : '');
  };

  const savePlan = async () => {
    if (!activeTenantId || !planModal) return;
    const siteId = planModal.plan ? planModal.plan.siteId : planSiteId;
    if (!siteId || !planForm.name.trim()) return;
    setSavingPlan(true);
    try {
      const body: MembershipPlanIn = {
        ...planForm,
        name: planForm.name.trim(),
        perks: perksText.split(',').map((s) => s.trim()).filter(Boolean)
      };
      if (planModal.plan) {
        await tenantApi.updateMembershipPlan(activeTenantId, planModal.plan.id, body);
      } else {
        await tenantApi.createMembershipPlan(activeTenantId, siteId, body);
      }
      addToast({ type: 'success', title: planModal.plan ? t('Plan updated') : t('Plan created') });
      setPlanModal(null);
      await loadPlans();
    } catch (e) {
      addToast({ type: 'error', title: t('Failed to save plan'), description: e instanceof Error ? e.message : undefined });
    } finally {
      setSavingPlan(false);
    }
  };

  const siteOptions = tenantSites.map((s) => ({ value: s.id, label: s.name }));

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#161b22]/70 p-5 rounded-2xl border border-[#30363d] backdrop-blur-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <BadgeCheck className="w-6 h-6 text-[#58a6ff]" />
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              {t('Driver Memberships')}
            </h1>
            {pendingCount > 0 && (
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#9e6a03]/20 border border-[#d29922]/40 text-[#d29922]">
                {t('{{count}} pending', { count: pendingCount })}
              </span>
            )}
          </div>
          <p className="text-xs text-[#8b949e] mt-1">
            {t('Review driver membership requests and manage monthly pass plans. Activation whitelists the plate for ANPR entry.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void loadMemberships()} className="text-xs h-9 gap-1.5 border-[#30363d] bg-[#161b22] text-[#c9d1d9]">
            <RefreshCw className="w-4 h-4" />
            {t('Refresh')}
          </Button>
          {tab === 'plans' && (
            <Button
              variant="primary"
              onClick={() => openPlanModal(null)}
              disabled={!planSiteId}
              className="text-xs h-9 bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {t('New Plan')}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[#161b22] border border-[#30363d] w-fit">
        {(['requests', 'plans', 'payments'] as Tab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              tab === k ? 'bg-[#388bfd] text-slate-950' : 'text-[#8b949e] hover:text-white'
            }`}
          >
            {k === 'requests' ? t('Requests') : k === 'plans' ? t('Plans') : t('Payments')}
          </button>
        ))}
      </div>

      {tab === 'requests' && (
        <>
          {/* Filters */}
          <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center gap-2 flex-wrap text-xs">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-2 text-xs text-white focus:outline-hidden"
            >
              <option value="">{t('Status: All')}</option>
              {['pending', 'active', 'rejected', 'cancelled', 'expired', 'revoked'].map((s) => (
                <option key={s} value={s}>{t(s)}</option>
              ))}
            </select>
            <select
              value={siteFilter}
              onChange={(e) => { setSiteFilter(e.target.value); setPage(1); }}
              className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-2 text-xs text-white focus:outline-hidden"
            >
              <option value="">{t('Site: All')}</option>
              {siteOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="rounded-2xl bg-[#161b22] border border-[#30363d] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0d0e12] text-[#8b949e] border-b border-[#30363d] uppercase font-semibold text-[10px]">
                  <tr>
                    <th className="py-3 px-4">{t('Driver')}</th>
                    <th className="py-3 px-4">{t('Plate')}</th>
                    <th className="py-3 px-4">{t('Plan')}</th>
                    <th className="py-3 px-4">{t('Site')}</th>
                    <th className="py-3 px-4">{t('Status')}</th>
                    <th className="py-3 px-4">{t('Valid Period')}</th>
                    <th className="py-3 px-4">{t('Requested')}</th>
                    <th className="py-3 px-4 text-right">{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]/60 font-medium">
                  {loadingRows ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[#8b949e]">{t('Loading…')}</td>
                    </tr>
                  ) : memberships.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[#8b949e]">
                        <CreditCard className="w-8 h-8 mx-auto mb-2 text-[#8b949e]/50" />
                        <p className="font-semibold text-white">{t('No membership requests')}</p>
                        <p className="text-xs mt-1">{t('Driver requests submitted from the mobile app will appear here.')}</p>
                      </td>
                    </tr>
                  ) : (
                    memberships.map((m) => (
                      <tr key={m.id} className="hover:bg-[#21262d]/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{m.driverName}</div>
                          <div className="text-[11px] text-[#8b949e]">{m.driverEmail}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-mono font-bold text-white px-2.5 py-1 rounded bg-[#0d0e12] border border-[#30363d] text-xs tracking-wider">
                            {m.plateNumber}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-white">{m.planName}</td>
                        <td className="py-3.5 px-4 text-[#8b949e]">{m.siteName}</td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <Badge variant={MEMBERSHIP_STATUS_VARIANT[m.status]}>{t(m.status)}</Badge>
                          {m.adminNote && (
                            <div className="text-[10px] text-[#8b949e] mt-1 max-w-[160px] truncate" title={m.adminNote}>
                              {m.adminNote}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-[#8b949e] whitespace-nowrap">
                          {m.startsAt ? `${fmtDate(m.startsAt)} → ${fmtDate(m.endsAt)}` : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-[#8b949e] whitespace-nowrap">{fmtDate(m.createdAt)}</td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {m.status === 'pending' && (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                onClick={() => { setAction({ kind: 'activate', row: m }); setActionNote(''); }}
                                className="text-[11px] h-7 bg-[#238636] hover:bg-[#2ea043] text-white"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                {t('Activate')}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { setAction({ kind: 'reject', row: m }); setActionNote(''); }}
                                className="text-[11px] h-7 border-[#30363d] text-[#f85149]"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                {t('Reject')}
                              </Button>
                            </div>
                          )}
                          {m.status === 'active' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setAction({ kind: 'revoke', row: m }); setActionNote(''); }}
                              className="text-[11px] h-7 border-[#30363d] text-[#f85149]"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              {t('Revoke')}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-[#30363d]">
              <Pagination
                currentPage={page}
                totalPages={Math.max(1, Math.ceil(total / 20))}
                totalItems={total}
                pageSize={20}
                onPageChange={setPage}
                compact
              />
            </div>
          </div>
        </>
      )}

      {tab === 'plans' && (
        <>
          <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center gap-3 flex-wrap">
            <div className="w-64">
              <Select
                options={[{ value: '', label: t('Select a site…') }, ...siteOptions]}
                value={planSiteId}
                onChange={(e) => setPlanSiteId(e.target.value)}
                className="bg-[#0d0e12] border-[#30363d] text-xs"
              />
            </div>
            <p className="text-[11px] text-[#8b949e]">
              {t('Plans published here are visible in the driver mobile app.')}
            </p>
          </div>

          <div className="rounded-2xl bg-[#161b22] border border-[#30363d] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0d0e12] text-[#8b949e] border-b border-[#30363d] uppercase font-semibold text-[10px]">
                  <tr>
                    <th className="py-3 px-4">{t('Plan')}</th>
                    <th className="py-3 px-4">{t('Price')}</th>
                    <th className="py-3 px-4">{t('Duration')}</th>
                    <th className="py-3 px-4">{t('Perks')}</th>
                    <th className="py-3 px-4">{t('Status')}</th>
                    <th className="py-3 px-4 text-right">{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]/60 font-medium">
                  {!planSiteId ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[#8b949e]">{t('Select a site to manage its plans.')}</td>
                    </tr>
                  ) : loadingPlans ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[#8b949e]">{t('Loading…')}</td>
                    </tr>
                  ) : plans.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[#8b949e]">
                        <CreditCard className="w-8 h-8 mx-auto mb-2 text-[#8b949e]/50" />
                        <p className="font-semibold text-white">{t('No plans yet')}</p>
                        <p className="text-xs mt-1">{t('Create a plan so drivers can request monthly passes for this site.')}</p>
                      </td>
                    </tr>
                  ) : (
                    plans.map((p) => (
                      <tr key={p.id} className="hover:bg-[#21262d]/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 font-semibold text-white">
                            {p.name}
                            {p.badge && <Badge variant="blue" size="sm">{p.badge}</Badge>}
                          </div>
                          {p.description && (
                            <div className="text-[11px] text-[#8b949e] mt-0.5 max-w-[280px] truncate" title={p.description}>
                              {p.description}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-[#3fb950]">{fmtVnd(p.priceVnd)}</td>
                        <td className="py-3.5 px-4 text-white">{t('{{days}} days', { days: p.durationDays })}</td>
                        <td className="py-3.5 px-4 text-[#8b949e]">
                          {p.perks.length > 0 ? p.perks.join(' · ') : '—'}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant={p.status === 'active' ? 'emerald' : 'slate'}>{t(p.status)}</Badge>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openPlanModal(p)}
                            className="text-[11px] h-7 border-[#30363d] text-[#c9d1d9]"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            {t('Edit')}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'payments' && (
        <>
          {/* Filters */}
          <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center gap-2 flex-wrap text-xs">
            <select
              value={payStatus}
              onChange={(e) => { setPayStatus(e.target.value); setPayPage(1); }}
              className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-2 text-xs text-white focus:outline-hidden"
            >
              <option value="">{t('Status: All')}</option>
              {['created', 'paid', 'refunded', 'failed', 'cancelled', 'expired'].map((s) => (
                <option key={s} value={s}>{t(s)}</option>
              ))}
            </select>
            <select
              value={paySiteId}
              onChange={(e) => { setPaySiteId(e.target.value); setPayPage(1); }}
              className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-2 text-xs text-white focus:outline-hidden"
            >
              <option value="">{t('Site: All')}</option>
              {siteOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-[#8b949e] ml-auto">
              {t('Refunding a paid membership payment revokes the membership and suspends gate access.')}
            </p>
          </div>

          {/* Table */}
          <div className="rounded-2xl bg-[#161b22] border border-[#30363d] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0d0e12] text-[#8b949e] border-b border-[#30363d] uppercase font-semibold text-[10px]">
                  <tr>
                    <th className="py-3 px-4">{t('Driver')}</th>
                    <th className="py-3 px-4">{t('Kind')}</th>
                    <th className="py-3 px-4">{t('Plate')}</th>
                    <th className="py-3 px-4">{t('Site')}</th>
                    <th className="py-3 px-4">{t('Amount')}</th>
                    <th className="py-3 px-4">{t('Method')}</th>
                    <th className="py-3 px-4">{t('Status')}</th>
                    <th className="py-3 px-4">{t('Date')}</th>
                    <th className="py-3 px-4 text-right">{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]/60 font-medium">
                  {loadingPayments ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-[#8b949e]">{t('Loading…')}</td>
                    </tr>
                  ) : payments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-[#8b949e]">
                        <CreditCard className="w-8 h-8 mx-auto mb-2 text-[#8b949e]/50" />
                        <p className="font-semibold text-white">{t('No payments yet')}</p>
                        <p className="text-xs mt-1">{t('Driver membership and parking payments appear here.')}</p>
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.id} className="hover:bg-[#21262d]/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{p.driverName}</div>
                          <div className="text-[11px] text-[#8b949e]">{p.driverEmail}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant="blue">{t(p.kind)}</Badge>
                        </td>
                        <td className="py-3.5 px-4">
                          {p.plateNumber ? (
                            <span className="font-mono font-bold text-white px-2.5 py-1 rounded bg-[#0d0e12] border border-[#30363d] text-xs tracking-wider">
                              {p.plateNumber}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-[#8b949e]">{p.siteName ?? '—'}</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-[#3fb950]">{fmtVnd(p.amountVnd)}</td>
                        <td className="py-3.5 px-4 text-[#8b949e] uppercase text-[10px] font-bold">{p.method}</td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <Badge variant={PAYMENT_STATUS_VARIANT[p.status] ?? 'slate'}>{t(p.status)}</Badge>
                        </td>
                        <td className="py-3.5 px-4 text-[#8b949e] whitespace-nowrap">{fmtDate(p.paidAt ?? p.createdAt)}</td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {p.status === 'paid' && p.kind !== 'topup' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRefundRow(p)}
                              className="text-[11px] h-7 border-[#30363d] text-[#f85149]"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              {t('Refund')}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-[#30363d]">
              <Pagination
                currentPage={payPage}
                totalPages={Math.max(1, Math.ceil(payTotal / 20))}
                totalItems={payTotal}
                pageSize={20}
                onPageChange={setPayPage}
                compact
              />
            </div>
          </div>
        </>
      )}

      {/* Action confirm modal */}
      <Modal
        isOpen={action !== null}
        onClose={() => setAction(null)}
        title={action ? t('{{action}} membership', { action: t(action.kind) }) : ''}
        subtitle={action ? `${action.row.driverName} — ${action.row.plateNumber} · ${action.row.planName}` : undefined}
        maxWidth="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAction(null)} className="border-[#30363d] text-[#c9d1d9]">
              {t('Cancel')}
            </Button>
            <Button
              variant={action?.kind === 'activate' ? 'success' : 'danger'}
              onClick={() => void runAction()}
              isLoading={acting}
            >
              {action ? t(action.kind) : ''}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-[#8b949e]">
          {action?.kind === 'activate' && (
            <p className="flex items-start gap-2">
              <Car className="w-4 h-4 text-[#3fb950] shrink-0 mt-0.5" />
              {t('Activation whitelists this plate for ANPR gate entry until the end of the plan period.')}
            </p>
          )}
          {action?.kind === 'revoke' && (
            <p className="flex items-start gap-2">
              <XCircle className="w-4 h-4 text-[#f85149] shrink-0 mt-0.5" />
              {t('Revoking suspends gate access for this plate immediately.')}
            </p>
          )}
          <Input
            label={t('Admin note (optional)')}
            value={actionNote}
            onChange={(e) => setActionNote(e.target.value)}
            placeholder={t('e.g. Paid at office, receipt #123')}
            className="bg-[#0d0e12] border-[#30363d]"
          />
        </div>
      </Modal>

      {/* Refund confirm modal */}
      <Modal
        isOpen={refundRow !== null}
        onClose={() => setRefundRow(null)}
        title={t('Refund payment')}
        subtitle={refundRow ? `${refundRow.driverName} — ${fmtVnd(refundRow.amountVnd)} · ${t(refundRow.kind)}` : undefined}
        maxWidth="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRefundRow(null)} className="border-[#30363d] text-[#c9d1d9]">
              {t('Cancel')}
            </Button>
            <Button variant="danger" onClick={() => void runRefund()} isLoading={refunding}>
              {t('Refund')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-[#8b949e]">
          {refundRow?.method === 'wallet' ? (
            <p className="flex items-start gap-2">
              <CreditCard className="w-4 h-4 text-[#58a6ff] shrink-0 mt-0.5" />
              {t('The amount is credited back to the driver wallet immediately.')}
            </p>
          ) : (
            <p className="flex items-start gap-2">
              <CreditCard className="w-4 h-4 text-[#58a6ff] shrink-0 mt-0.5" />
              {t('A refund request is sent to the payment provider (MoMo).')}
            </p>
          )}
          {refundRow?.kind === 'membership' && (
            <p className="flex items-start gap-2">
              <XCircle className="w-4 h-4 text-[#f85149] shrink-0 mt-0.5" />
              {t('The linked membership is revoked and its gate access suspended.')}
            </p>
          )}
        </div>
      </Modal>

      {/* Plan create/edit modal */}
      <Modal
        isOpen={planModal !== null}
        onClose={() => setPlanModal(null)}
        title={planModal?.plan ? t('Edit plan') : t('New plan')}
        maxWidth="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setPlanModal(null)} className="border-[#30363d] text-[#c9d1d9]">
              {t('Cancel')}
            </Button>
            <Button
              variant="success"
              onClick={() => void savePlan()}
              isLoading={savingPlan}
              disabled={!planForm.name.trim() || planForm.priceVnd < 0 || planForm.durationDays < 1}
            >
              {planModal?.plan ? t('Save changes') : t('Create plan')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('Plan name')}
            value={planForm.name}
            onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t('e.g. Monthly Resident')}
            className="bg-[#0d0e12] border-[#30363d]"
          />
          <Input
            label={t('Description')}
            value={planForm.description ?? ''}
            onChange={(e) => setPlanForm((f) => ({ ...f, description: e.target.value || null }))}
            className="bg-[#0d0e12] border-[#30363d]"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('Price (VND)')}
              type="number"
              min={0}
              value={planForm.priceVnd}
              onChange={(e) => setPlanForm((f) => ({ ...f, priceVnd: Number(e.target.value) || 0 }))}
              className="bg-[#0d0e12] border-[#30363d]"
            />
            <Input
              label={t('Duration (days)')}
              type="number"
              min={1}
              value={planForm.durationDays}
              onChange={(e) => setPlanForm((f) => ({ ...f, durationDays: Math.max(1, Number(e.target.value) || 1) }))}
              className="bg-[#0d0e12] border-[#30363d]"
            />
          </div>
          <Input
            label={t('Perks (comma separated)')}
            value={perksText}
            onChange={(e) => setPerksText(e.target.value)}
            placeholder={t('ANPR fast entry, Reserved zone…')}
            className="bg-[#0d0e12] border-[#30363d]"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('Badge (optional)')}
              value={planForm.badge ?? ''}
              onChange={(e) => setPlanForm((f) => ({ ...f, badge: e.target.value || null }))}
              placeholder={t('Best value')}
              className="bg-[#0d0e12] border-[#30363d]"
            />
            <Select
              label={t('Status')}
              options={[
                { value: 'active', label: t('Active — visible to drivers') },
                { value: 'inactive', label: t('Inactive — hidden') }
              ]}
              value={planForm.status ?? 'active'}
              onChange={(e) => setPlanForm((f) => ({ ...f, status: e.target.value as 'active' | 'inactive' }))}
              className="bg-[#0d0e12] border-[#30363d]"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
