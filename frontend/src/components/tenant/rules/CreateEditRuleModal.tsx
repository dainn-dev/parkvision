import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Building2,
  Calendar,
  Layers,
  Info,
  Check,
  AlertTriangle,
  User,
  Car,
  Tag,
  Sliders,
  CheckCircle2,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { usePlatform } from '../../../context/PlatformContext';
import {
  TenantAccessRule,
  AccessRuleAction,
  AccessRuleStatus,
  AccessRuleTargetType,
  AccessRuleScheduleType,
  AccessRuleDaySchedule
} from '../../../types/tenant';
import { Button, Input } from '../../ui';
import { useTranslation } from 'react-i18next';

interface CreateEditRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  ruleToEdit?: TenantAccessRule | null;
}

const DAYS_OF_WEEK: Array<'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'> = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY'
];

export const CreateEditRuleModal: React.FC<CreateEditRuleModalProps> = ({
  isOpen,
  onClose,
  ruleToEdit
}) => {
  const {
    tenantSites,
    tenantVehicles,
    tenantUsers,
    tenantMembers,
    createTenantAccessRule,
    updateTenantAccessRule,
    detectRuleConflicts
  } = usePlatform();
  const { t } = useTranslation('tenant');

  const isEditing = Boolean(ruleToEdit);

  // Step state (1: Basic, 2: Target, 3: Scope, 4: Schedule, 5: Action & Priority, 6: Review)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<AccessRuleStatus>('ACTIVE');

  // Target
  const [targetType, setTargetType] = useState<AccessRuleTargetType>('MEMBER_GROUP');
  const [targetLicensePlate, setTargetLicensePlate] = useState('');
  const [targetVehicleId, setTargetVehicleId] = useState('');
  const [targetMemberId, setTargetMemberId] = useState('');
  const [targetMemberGroup, setTargetMemberGroup] = useState('EMPLOYEE');
  const [targetVehicleGroup, setTargetVehicleGroup] = useState('COMPANY');
  const [targetNotes, setTargetNotes] = useState('');

  // Scope
  const [allSites, setAllSites] = useState(true);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>(['site-001']);
  const [allGates, setAllGates] = useState(true);
  const [selectedGateIds, setSelectedGateIds] = useState<string[]>(['ALL_GATES']);

  // Schedule
  const [scheduleType, setScheduleType] = useState<AccessRuleScheduleType>('WEEKLY');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('18:00');
  const [weeklyDays, setWeeklyDays] = useState<AccessRuleDaySchedule[]>(
    DAYS_OF_WEEK.map(d => ({
      day: d,
      enabled: d !== 'SATURDAY' && d !== 'SUNDAY',
      windows: [{ start: '06:00', end: '21:00' }]
    }))
  );

  // Action & Advanced
  const [action, setAction] = useState<AccessRuleAction>('ALLOW');
  const [priority, setPriority] = useState<number>(30);
  const [minConfidence, setMinConfidence] = useState<number>(90);
  const [duplicateWindowSeconds, setDuplicateWindowSeconds] = useState<number>(5);
  const [failBehavior, setFailBehavior] = useState<'DENY' | 'SAFE_FALLBACK'>('DENY');

  // Error & conflicts
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize on open or ruleToEdit change
  useEffect(() => {
    if (ruleToEdit) {
      setName(ruleToEdit.name || '');
      setCode(ruleToEdit.code || '');
      setDescription(ruleToEdit.description || '');
      setStatus(ruleToEdit.status || 'ACTIVE');

      setTargetType(ruleToEdit.target?.type || 'ALL_VEHICLES');
      setTargetLicensePlate(ruleToEdit.target?.licensePlate || '');
      setTargetVehicleId(ruleToEdit.target?.vehicleId || '');
      setTargetMemberId(ruleToEdit.target?.memberId || '');
      setTargetMemberGroup(ruleToEdit.target?.memberGroup || 'EMPLOYEE');
      setTargetVehicleGroup(ruleToEdit.target?.vehicleGroup || 'COMPANY');
      setTargetNotes(ruleToEdit.target?.notes || '');

      setAllSites(ruleToEdit.scope?.allSites ?? true);
      setSelectedSiteIds(ruleToEdit.scope?.siteIds || ['site-001']);
      setAllGates(ruleToEdit.scope?.allGates ?? true);
      setSelectedGateIds(ruleToEdit.scope?.gateIds || ['ALL_GATES']);

      setScheduleType(ruleToEdit.schedule?.type || 'ALWAYS');
      setStartDate(ruleToEdit.schedule?.startDate || '');
      setStartTime(ruleToEdit.schedule?.startTime || '08:00');
      setEndDate(ruleToEdit.schedule?.endDate || '');
      setEndTime(ruleToEdit.schedule?.endTime || '18:00');
      if (ruleToEdit.schedule?.days) {
        setWeeklyDays(ruleToEdit.schedule.days);
      }

      setAction(ruleToEdit.action || 'ALLOW');
      setPriority(ruleToEdit.priority || 30);
      setMinConfidence(ruleToEdit.advanced?.minConfidence || 90);
      setDuplicateWindowSeconds(ruleToEdit.advanced?.duplicateWindowSeconds || 5);
      setFailBehavior(ruleToEdit.advanced?.failBehavior === 'SAFE_FALLBACK' ? 'SAFE_FALLBACK' : 'DENY');
    } else {
      // Reset defaults for new rule
      setName('');
      setCode(`RULE-${Math.floor(100 + Math.random() * 900)}`);
      setDescription('');
      setStatus('ACTIVE');
      setTargetType('MEMBER_GROUP');
      setTargetLicensePlate('');
      setTargetVehicleId('');
      setTargetMemberId('');
      setTargetMemberGroup('EMPLOYEE');
      setTargetVehicleGroup('COMPANY');
      setTargetNotes('');
      setAllSites(true);
      setSelectedSiteIds(['site-001']);
      setAllGates(true);
      setSelectedGateIds(['ALL_GATES']);
      setScheduleType('WEEKLY');
      setStartDate(new Date().toISOString().split('T')[0]);
      setStartTime('08:00');
      setEndDate(new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0]);
      setEndTime('18:00');
      setAction('ALLOW');
      setPriority(30);
      setMinConfidence(90);
      setDuplicateWindowSeconds(5);
      setFailBehavior('DENY');
    }
    setCurrentStep(1);
    setErrors({});
  }, [ruleToEdit, isOpen]);

  // Update conflict warnings whenever relevant fields change
  useEffect(() => {
    if (!isOpen) return;
    const testRule: Partial<TenantAccessRule> = {
      action,
      priority,
      target: {
        type: targetType,
        licensePlate: targetLicensePlate,
        vehicleId: targetVehicleId,
        memberId: targetMemberId,
        memberGroup: targetMemberGroup,
        vehicleGroup: targetVehicleGroup
      },
      scope: {
        allSites,
        siteIds: selectedSiteIds,
        allGates,
        gateIds: selectedGateIds
      }
    };
    const detected = detectRuleConflicts(testRule, ruleToEdit?.id);
    setConflicts(detected);
  }, [
    action,
    priority,
    targetType,
    targetLicensePlate,
    targetVehicleId,
    targetMemberId,
    targetMemberGroup,
    targetVehicleGroup,
    allSites,
    selectedSiteIds,
    allGates,
    selectedGateIds,
    isOpen,
    ruleToEdit
  ]);

  if (!isOpen) return null;

  const validateStep = (step: number): boolean => {
    const errs: Record<string, string> = {};
    if (step === 1) {
      if (!name.trim()) errs.name = t('Rule name is required');
      if (!code.trim()) errs.code = t('Rule code is required');
    }
    if (step === 2) {
      if (targetType === 'LICENSE_PLATE' && !targetLicensePlate.trim()) {
        errs.targetLicensePlate = t('License plate number is required');
      }
      if (targetType === 'SPECIFIC_VEHICLE' && !targetVehicleId) {
        errs.targetVehicleId = t('Please select a registered vehicle');
      }
      if (targetType === 'MEMBER' && !targetMemberId) {
        errs.targetMemberId = t('Please select a member');
      }
    }
    if (step === 3) {
      if (!allSites && selectedSiteIds.length === 0) {
        errs.sites = t('Select at least one facility site');
      }
      if (!allGates && selectedGateIds.length === 0) {
        errs.gates = t('Select at least one gate lane');
      }
    }
    if (step === 4) {
      if (scheduleType === 'DATE_RANGE') {
        if (!startDate) errs.startDate = t('Start date required');
        if (!endDate) errs.endDate = t('End date required');
      }
      if (scheduleType === 'WEEKLY') {
        const hasEnabled = weeklyDays.some(d => d.enabled);
        if (!hasEnabled) errs.weeklyDays = t('Enable at least one active day of the week');
      }
    }
    if (step === 5) {
      if (!priority || priority < 1) {
        errs.priority = t('Priority must be at least 1');
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(6, prev + 1));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(1, prev - 1));
  };

  const handleWeeklyDayToggle = (day: string) => {
    setWeeklyDays(prev =>
      prev.map(d => (d.day === day ? { ...d, enabled: !d.enabled } : d))
    );
  };

  const handleWeeklyTimeChange = (day: string, field: 'start' | 'end', val: string) => {
    setWeeklyDays(prev =>
      prev.map(d => {
        if (d.day !== day) return d;
        const currentWindows = d.windows.length > 0 ? [...d.windows] : [{ start: '08:00', end: '18:00' }];
        currentWindows[0] = { ...currentWindows[0], [field]: val };
        return { ...d, windows: currentWindows };
      })
    );
  };

  const applyMondayToAllDays = () => {
    const monday = weeklyDays.find(d => d.day === 'MONDAY');
    if (!monday || monday.windows.length === 0) return;
    const window = monday.windows[0];
    setWeeklyDays(prev =>
      prev.map(d =>
        d.day !== 'SATURDAY' && d.day !== 'SUNDAY'
          ? { ...d, enabled: true, windows: [{ start: window.start, end: window.end }] }
          : d
      )
    );
  };

  const handleSubmit = (finalStatus?: AccessRuleStatus) => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3) || !validateStep(4) || !validateStep(5)) {
      return;
    }

    setIsSubmitting(true);

    const selectedVehicle = tenantVehicles.find(v => v.id === targetVehicleId);
    const selectedMember = tenantUsers.find(u => u.id === targetMemberId);

    // Human summary text for schedule
    let scheduleSummary = t('Always (24/7)');
    if (scheduleType === 'WEEKLY') {
      const enabledDays = weeklyDays.filter(d => d.enabled).map(d => t(d.day.slice(0, 3)));
      const firstWindow = weeklyDays.find(d => d.enabled && d.windows.length > 0)?.windows[0];
      scheduleSummary = `${enabledDays.join(', ')} · ${firstWindow?.start || '08:00'} - ${firstWindow?.end || '18:00'}`;
    } else if (scheduleType === 'DATE_RANGE') {
      scheduleSummary = `${startDate} ${t('to')} ${endDate} (${startTime} - ${endTime})`;
    }

    const rulePayload: Partial<TenantAccessRule> = {
      code: code.toUpperCase().trim(),
      name: name.trim(),
      description: description.trim(),
      action,
      priority: Number(priority),
      status: finalStatus || status,
      target: {
        type: targetType,
        licensePlate: targetType === 'LICENSE_PLATE' ? targetLicensePlate.toUpperCase().trim() : (selectedVehicle?.currentPlate.number || undefined),
        vehicleId: targetType === 'SPECIFIC_VEHICLE' ? targetVehicleId : undefined,
        vehicleName: selectedVehicle?.name,
        memberId: targetType === 'MEMBER' ? targetMemberId : undefined,
        memberName: selectedMember?.name,
        memberEmail: selectedMember?.email,
        memberGroup: targetType === 'MEMBER_GROUP' ? targetMemberGroup : undefined,
        vehicleGroup: targetType === 'VEHICLE_GROUP' ? targetVehicleGroup : undefined,
        notes: targetNotes.trim() || undefined
      },
      scope: {
        allSites,
        siteIds: allSites ? ['ALL_SITES'] : selectedSiteIds,
        siteNames: allSites
          ? [t('All Facilities')]
          : tenantSites.filter(s => selectedSiteIds.includes(s.id)).map(s => s.name),
        allGates,
        gateIds: allGates ? ['ALL_GATES'] : selectedGateIds,
        gateNames: allGates ? [t('All Gates')] : selectedGateIds
      },
      schedule: {
        type: scheduleType,
        timezone: 'Asia/Ho_Chi_Minh',
        startDate: scheduleType === 'DATE_RANGE' ? startDate : undefined,
        startTime: scheduleType === 'DATE_RANGE' ? startTime : undefined,
        endDate: scheduleType === 'DATE_RANGE' ? endDate : undefined,
        endTime: scheduleType === 'DATE_RANGE' ? endTime : undefined,
        days: scheduleType === 'WEEKLY' ? weeklyDays : undefined,
        summaryText: scheduleSummary
      },
      advanced: {
        minConfidence,
        duplicateWindowSeconds,
        failBehavior
      }
    };

    setTimeout(() => {
      if (isEditing && ruleToEdit) {
        updateTenantAccessRule(ruleToEdit.id, rulePayload);
      } else {
        createTenantAccessRule(rulePayload);
      }
      setIsSubmitting(false);
      onClose();
    }, 400);
  };

  const steps = [
    { num: 1, label: t('Basic Info') },
    { num: 2, label: t('Target') },
    { num: 3, label: t('Scope') },
    { num: 4, label: t('Schedule') },
    { num: 5, label: t('Action & Priority') },
    { num: 6, label: t('Review') }
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 " onClick={onClose} />

      <div className="relative w-full max-w-3xl bg-background border border-border rounded-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-[330ms] flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
              action === 'ALLOW'
                ? 'bg-success/15 border-success/30 text-success'
                : 'bg-destructive/15 border-destructive/30 text-destructive'
            }`}>
              {action === 'ALLOW' ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground tracking-tight">
                {isEditing ? t('Edit Access Rule: {{code}}', { code: ruleToEdit?.code }) : t('Create Access Policy Rule')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('Configure automated ANPR camera barrier evaluation policies')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground hover:bg-border flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wizard Stepper Header */}
        <div className="px-6 py-3 bg-card/40 border-b border-border flex items-center justify-between overflow-x-auto gap-2">
          {steps.map((s, idx) => (
            <button
              key={s.num}
              onClick={() => {
                if (s.num < currentStep || validateStep(currentStep)) {
                  setCurrentStep(s.num);
                }
              }}
              className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                currentStep === s.num
                  ? 'bg-primary text-[#fff] '
                  : currentStep > s.num
                  ? 'text-success hover:bg-muted'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-medium ${
                currentStep === s.num
                  ? 'bg-white text-primary'
                  : currentStep > s.num
                  ? 'bg-success text-[#fff]'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {currentStep > s.num ? '✓' : s.num}
              </span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Wizard Form Body */}
        <div className="p-6 overflow-y-auto flex-1 text-xs space-y-5">
          {/* STEP 1: Basic Information */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-[330ms]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-foreground font-medium mb-1.5">
                    {t('Rule Name')} <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder={t('e.g. Employee Standard Parking Access')}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!code || code.startsWith('RULE-')) {
                        setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 24));
                      }
                    }}
                    className={`bg-card border-border text-foreground ${errors.name ? 'border-destructive' : ''}`}
                  />
                  {errors.name && <p className="text-[11px] text-destructive mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-foreground font-medium mb-1.5">
                    {t('Rule Code')} <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="e.g. EMPLOYEE-PARKING"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, '-'))}
                    className={`font-mono bg-card border-border text-foreground ${errors.code ? 'border-destructive' : ''}`}
                  />
                  {errors.code && <p className="text-[11px] text-destructive mt-1">{errors.code}</p>}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-foreground font-medium">{t('Description')}</label>
                  <span className="text-[11px] text-muted-foreground">{description.length}/500</span>
                </div>
                <textarea
                  rows={3}
                  maxLength={500}
                  placeholder={t('Describe purpose of rule, edge trigger conditions, and authorized team members...')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-card border border-border rounded-lg p-3 text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-foreground font-medium mb-1.5">{t('Initial Activation Status')}</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStatus('ACTIVE')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-colors cursor-pointer ${
                      status === 'ACTIVE'
                        ? 'bg-success/15 border-success text-foreground'
                        : 'bg-card border-border text-muted-foreground'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-success" />
                    <div>
                      <div className="font-medium text-foreground">{t('Active (Enforced)')}</div>
                      <div className="text-[11px] text-muted-foreground">{t('Immediately deployed to camera edge controllers')}</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatus('DRAFT')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-colors cursor-pointer ${
                      status === 'DRAFT'
                        ? 'bg-warning/15 border-warning text-foreground'
                        : 'bg-card border-border text-muted-foreground'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-warning" />
                    <div>
                      <div className="font-medium text-foreground">{t('Draft Mode')}</div>
                      <div className="text-[11px] text-muted-foreground">{t('Save policy configuration without active gate enforcement')}</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Target Entity */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-[330ms]">
              <label className="block text-foreground font-medium">{t('Select Target Entity')}</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { type: 'MEMBER_GROUP', label: t('Member Group'), icon: User, desc: t('Employees, VIP, Contractors') },
                  { type: 'LICENSE_PLATE', label: t('License Plate'), icon: Tag, desc: t('Specific license plate number') },
                  { type: 'SPECIFIC_VEHICLE', label: t('Specific Vehicle'), icon: Car, desc: t('Target vehicle in registry') },
                  { type: 'MEMBER', label: t('Individual Member'), icon: User, desc: t('Single registered person') },
                  { type: 'VEHICLE_GROUP', label: t('Vehicle Group'), icon: Layers, desc: t('Car, SUV, Truck, Van') },
                  { type: 'VISITOR', label: t('Pre-Registered Visitor'), icon: User, desc: t('Temporary guest pass') },
                  { type: 'ALL_VEHICLES', label: t('All Vehicles'), icon: ShieldCheck, desc: t('Broad facility rule') }
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = targetType === item.type;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => setTargetType(item.type as AccessRuleTargetType)}
                      className={`p-3 rounded-xl border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-primary/15 border-primary text-foreground '
                          : 'bg-card border-border text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                      </div>
                      <div className="font-medium text-foreground text-xs">{item.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</div>
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Target Inputs */}
              <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                {targetType === 'ALL_VEHICLES' && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium">{t('Broad Policy Notice:')}</span> {t('This rule will apply to every single detected vehicle entering matching gates. Ensure appropriate priority and schedule constraints.')}
                    </div>
                  </div>
                )}

                {targetType === 'LICENSE_PLATE' && (
                  <div>
                    <label className="block text-foreground font-medium mb-1.5">
                      {t('Target License Plate')} <span className="text-destructive">*</span>
                    </label>
                    <Input
                      placeholder="e.g. 51K-881.00"
                      value={targetLicensePlate}
                      onChange={(e) => setTargetLicensePlate(e.target.value.toUpperCase())}
                      className=" bg-background border-border text-foreground"
                    />
                    {errors.targetLicensePlate && (
                      <p className="text-[11px] text-destructive mt-1">{errors.targetLicensePlate}</p>
                    )}
                  </div>
                )}

                {targetType === 'MEMBER_GROUP' && (
                  <div>
                    <label className="block text-foreground font-medium mb-1.5">{t('Member Group Category')}</label>
                    <select
                      value={targetMemberGroup}
                      onChange={(e) => setTargetMemberGroup(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground"
                    >
                      <option value="EMPLOYEE">{t('Employees & Corporate Staff')}</option>
                      <option value="VIP">{t('Executive & VIP Priority Pass')}</option>
                      <option value="MANAGEMENT">{t('Site Operations Management')}</option>
                      <option value="SECURITY">{t('Security & Enforcement Staff')}</option>
                      <option value="CONTRACTOR">{t('Contractor Logistics & Freight Vendors')}</option>
                      <option value="VISITOR">{t('Pre-Registered Visitors')}</option>
                    </select>
                  </div>
                )}

                {targetType === 'SPECIFIC_VEHICLE' && (
                  <div>
                    <label className="block text-foreground font-medium mb-1.5">{t('Select Registered Vehicle')}</label>
                    <select
                      value={targetVehicleId}
                      onChange={(e) => setTargetVehicleId(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground"
                    >
                      <option value="">{t('-- Choose a vehicle --')}</option>
                      {tenantVehicles.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.currentPlate?.number} — {v.name} ({v.type}) · {t('Owner:')} {v.member?.name || t('Unassigned')}
                        </option>
                      ))}
                    </select>
                    {errors.targetVehicleId && (
                      <p className="text-[11px] text-destructive mt-1">{errors.targetVehicleId}</p>
                    )}
                  </div>
                )}

                {targetType === 'MEMBER' && (
                  <div>
                    <label className="block text-foreground font-medium mb-1.5">{t('Select Member')}</label>
                    <select
                      value={targetMemberId}
                      onChange={(e) => setTargetMemberId(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground"
                    >
                      <option value="">{t('-- Choose a member --')}</option>
                      {tenantUsers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email}) — {t('Role:')} {u.role}
                        </option>
                      ))}
                    </select>
                    {errors.targetMemberId && (
                      <p className="text-[11px] text-destructive mt-1">{errors.targetMemberId}</p>
                    )}
                  </div>
                )}

                {targetType === 'VEHICLE_GROUP' && (
                  <div>
                    <label className="block text-foreground font-medium mb-1.5">{t('Vehicle Group')}</label>
                    <select
                      value={targetVehicleGroup}
                      onChange={(e) => setTargetVehicleGroup(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg p-2.5 text-foreground"
                    >
                      <option value="CAR">{t('Passenger Cars / Sedans')}</option>
                      <option value="SUV">{t('SUVs / Crossovers')}</option>
                      <option value="TRUCK">{t('Heavy Trucks / Flatbeds')}</option>
                      <option value="VAN">{t('Commercial Delivery Vans')}</option>
                      <option value="SECURITY">{t('Security Mobile Patrol Vehicles')}</option>
                      <option value="COMPANY">{t('Company Fleet Pool Vehicles')}</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-muted-foreground text-[11px] mb-1">{t('Target Notes / Audit Reason (Optional)')}</label>
                  <Input
                    placeholder={t('e.g. Flagged for tailgating #SEC-9921 or Executive VIP fast-lane privilege')}
                    value={targetNotes}
                    onChange={(e) => setTargetNotes(e.target.value)}
                    className="bg-background border-border text-foreground"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Scope (Facilities & Gates) */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-[330ms]">
              {/* Facilities */}
              <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Building2 className="w-4 h-4 text-primary" />
                    <span>{t('Target Facilities (Sites)')}</span>
                  </div>
                  <label className="flex items-center gap-2 text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSites}
                      onChange={(e) => setAllSites(e.target.checked)}
                      className="rounded border-border bg-background text-primary focus:ring-0"
                    />
                    <span>{t('Apply to All Facilities')}</span>
                  </label>
                </div>

                {!allSites && (
                  <div className="space-y-2 pt-2 border-t border-border/60">
                    {tenantSites.map(s => {
                      const isChecked = selectedSiteIds.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-primary/10 border-primary/40 text-foreground'
                              : 'bg-background border-border text-muted-foreground'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSiteIds([...selectedSiteIds, s.id]);
                                } else {
                                  setSelectedSiteIds(selectedSiteIds.filter(id => id !== s.id));
                                }
                              }}
                              className="rounded border-border bg-background text-primary focus:ring-0"
                            />
                            <span className="font-medium text-foreground">{s.name}</span>
                          </div>
                          <span className="text-[11px] text-muted-foreground">{s.address}</span>
                        </label>
                      );
                    })}
                    {errors.sites && <p className="text-[11px] text-destructive mt-1">{errors.sites}</p>}
                  </div>
                )}
              </div>

              {/* Gates & Lanes */}
              <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <ShieldCheck className="w-4 h-4 text-success" />
                    <span>{t('Target Gates & Lanes')}</span>
                  </div>
                  <label className="flex items-center gap-2 text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allGates}
                      onChange={(e) => setAllGates(e.target.checked)}
                      className="rounded border-border bg-background text-primary focus:ring-0"
                    />
                    <span>{t('Apply to All Gates')}</span>
                  </label>
                </div>

                {!allGates && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border/60">
                    {[
                      { id: 'gate-mc-01', name: t('Entrance Gate 01 (Inbound Main)') },
                      { id: 'gate-mc-02', name: t('Entrance Gate 02 VIP (FastTrack)') },
                      { id: 'gate-mc-03', name: t('Exit Gate 01 (Outbound Main)') },
                      { id: 'gate-cargo-01', name: t('Cargo Logistics Gate 01') }
                    ].map(g => {
                      const isChecked = selectedGateIds.includes(g.id);
                      return (
                        <label
                          key={g.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-success/10 border-success/40 text-foreground'
                              : 'bg-background border-border text-muted-foreground'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedGateIds([...selectedGateIds, g.id]);
                              } else {
                                setSelectedGateIds(selectedGateIds.filter(id => id !== g.id));
                              }
                            }}
                            className="rounded border-border bg-background text-success focus:ring-0"
                          />
                          <span className="font-medium text-foreground">{g.name}</span>
                        </label>
                      );
                    })}
                    {errors.gates && <p className="text-[11px] text-destructive mt-1">{errors.gates}</p>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: Operating Schedule */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-in fade-in duration-[330ms]">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { type: 'ALWAYS', label: t('Always (24/7)'), desc: t('Continuous unlimited access'), icon: Clock },
                  { type: 'WEEKLY', label: t('Weekly Schedule'), desc: t('Working hours & day filters'), icon: Calendar },
                  { type: 'DATE_RANGE', label: t('Date Range'), desc: t('Temporary pass window'), icon: Calendar }
                ].map(item => {
                  const Icon = item.icon;
                  const isSelected = scheduleType === item.type;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => setScheduleType(item.type as AccessRuleScheduleType)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-primary/15 border-primary text-foreground '
                          : 'bg-card border-border text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      <Icon className={`w-4 h-4 mb-1.5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div className="font-medium text-foreground text-xs">{item.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</div>
                    </button>
                  );
                })}
              </div>

              {scheduleType === 'WEEKLY' && (
                <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{t('Daily Operating Windows')}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={applyMondayToAllDays}
                      className="text-[11px] border-border text-primary hover:bg-muted"
                    >
                      {t('Apply Monday Hours to Weekdays')}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {weeklyDays.map(d => (
                      <div
                        key={d.day}
                        className={`p-2.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                          d.enabled
                            ? 'bg-background border-border'
                            : 'bg-card/50 border-border/40 opacity-60'
                        }`}
                      >
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={d.enabled}
                            onChange={() => handleWeeklyDayToggle(d.day)}
                            className="rounded border-border bg-background text-primary focus:ring-0"
                          />
                          <span className="font-medium text-foreground w-28">{t(d.day)}</span>
                        </label>

                        {d.enabled ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={d.windows[0]?.start || '06:00'}
                              onChange={(e) => handleWeeklyTimeChange(d.day, 'start', e.target.value)}
                              className="bg-card border border-border rounded px-2 py-1 text-foreground text-xs"
                            />
                            <span className="text-muted-foreground">{t('to')}</span>
                            <input
                              type="time"
                              value={d.windows[0]?.end || '21:00'}
                              onChange={(e) => handleWeeklyTimeChange(d.day, 'end', e.target.value)}
                              className="bg-card border border-border rounded px-2 py-1 text-foreground text-xs"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">{t('Access Prohibited')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {errors.weeklyDays && <p className="text-[11px] text-destructive mt-1">{errors.weeklyDays}</p>}
                </div>
              )}

              {scheduleType === 'DATE_RANGE' && (
                <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                  <div className="font-medium text-foreground">{t('Temporary Access Validity Window')}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-muted-foreground mb-1">{t('Start Date & Time')}</label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="bg-background border-border text-foreground"
                        />
                        <Input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="bg-background border-border text-foreground w-28"
                        />
                      </div>
                      {errors.startDate && <p className="text-[11px] text-destructive mt-1">{errors.startDate}</p>}
                    </div>

                    <div>
                      <label className="block text-muted-foreground mb-1">{t('End Date & Time')}</label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="bg-background border-border text-foreground"
                        />
                        <Input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="bg-background border-border text-foreground w-28"
                        />
                      </div>
                      {errors.endDate && <p className="text-[11px] text-destructive mt-1">{errors.endDate}</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: Action & Priority */}
          {currentStep === 5 && (
            <div className="space-y-4 animate-in fade-in duration-[330ms]">
              <div>
                <label className="block text-foreground font-medium mb-1.5">{t('Access Decision Action')}</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAction('ALLOW')}
                    className={`p-4 rounded-xl border text-left cursor-pointer transition-colors ${
                      action === 'ALLOW'
                        ? 'bg-success/15 border-success text-foreground'
                        : 'bg-card border-border text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-medium text-success text-sm">
                      <ShieldCheck className="w-5 h-5" />
                      {t('ALLOW (Permit Entry)')}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {t('Barrier lifts automatically and access event is logged as ALLOWED.')}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAction('DENY')}
                    className={`p-4 rounded-xl border text-left cursor-pointer transition-colors ${
                      action === 'DENY'
                        ? 'bg-destructive/15 border-destructive text-foreground'
                        : 'bg-card border-border text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-medium text-destructive text-sm">
                      <ShieldAlert className="w-5 h-5" />
                      {t('DENY (Block Entry)')}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {t('Barrier remains closed; security guard receives immediate infraction alert.')}
                    </p>
                  </button>
                </div>
              </div>

              {/* Priority */}
              <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-foreground text-xs">{t('Evaluation Priority #')}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {t('Lower numbers execute first. Priority 1 overrides Priority 50.')}
                    </div>
                  </div>
                  <div className="w-32">
                    <Input
                      type="number"
                      min={1}
                      max={9999}
                      value={priority}
                      onChange={(e) => setPriority(Number(e.target.value))}
                      className="text-center font-medium text-foreground bg-background border-border"
                    />
                  </div>
                </div>
                {errors.priority && <p className="text-[11px] text-destructive">{errors.priority}</p>}

                <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-2 border-t border-border/60">
                  <Info className="w-3.5 h-3.5 text-primary" />
                  <span>{t('Recommendation: Security Blocklists = 1–9 · VIP Passes = 10–29 · Staff = 30–60 · General = 70+')}</span>
                </div>
              </div>

              {/* Advanced Parameters */}
              <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                <div className="font-medium text-foreground text-xs">{t('Edge Engine Verification Parameters')}</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-muted-foreground text-[11px] mb-1">{t('Min OCR Confidence')}</label>
                    <select
                      value={minConfidence}
                      onChange={(e) => setMinConfidence(Number(e.target.value))}
                      className="w-full bg-background border border-border rounded p-2 text-foreground "
                    >
                      <option value={80}>80% ({t('Lenient')})</option>
                      <option value={85}>85% ({t('Balanced')})</option>
                      <option value={90}>90% ({t('Recommended')})</option>
                      <option value={95}>95% ({t('Strict')})</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-muted-foreground text-[11px] mb-1">{t('De-dup Window (sec)')}</label>
                    <select
                      value={duplicateWindowSeconds}
                      onChange={(e) => setDuplicateWindowSeconds(Number(e.target.value))}
                      className="w-full bg-background border border-border rounded p-2 text-foreground "
                    >
                      <option value={3}>3 {t('seconds')}</option>
                      <option value={5}>5 {t('seconds')} ({t('Default')})</option>
                      <option value={10}>10 {t('seconds')}</option>
                      <option value={30}>30 {t('seconds')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-muted-foreground text-[11px] mb-1">{t('Offline Fail Behavior')}</label>
                    <select
                      value={failBehavior}
                      onChange={(e) => setFailBehavior(e.target.value as any)}
                      className="w-full bg-background border border-border rounded p-2 text-foreground "
                    >
                      <option value="DENY">DENY ({t('Secure')})</option>
                      <option value="SAFE_FALLBACK">SAFE_FALLBACK</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Review & Confirmation */}
          {currentStep === 6 && (
            <div className="space-y-4 animate-in fade-in duration-[330ms]">
              {/* Conflict Warnings */}
              {conflicts.length > 0 && (
                <div className="p-4 rounded-xl bg-warning/15 border border-warning/40 space-y-2">
                  <div className="flex items-center gap-2 font-medium text-warning">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{t('Rule Evaluation Conflict Warnings')} ({conflicts.length})</span>
                  </div>
                  <ul className="space-y-1 text-xs text-foreground pl-6 list-disc">
                    {conflicts.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Summary Card */}
              <div className="p-5 rounded-xl bg-card border border-border space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">{name}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">{code}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full font-medium text-xs ${
                      action === 'ALLOW'
                        ? 'bg-success/20 text-success border border-success/40'
                        : 'bg-destructive/20 text-destructive border border-destructive/40'
                    }`}>
                      {t(action)}
                    </span>
                    <span className=" text-xs font-medium px-2 py-0.5 rounded bg-muted text-primary">
                      {t('Priority')} #{priority}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">{t('Target Entity')}</span>
                    <span className="font-medium text-foreground">
                      {t(targetType)} {targetLicensePlate ? `(${targetLicensePlate})` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">{t('Facility & Gate Scope')}</span>
                    <span className="font-medium text-foreground">
                      {allSites ? t('All Facilities') : `${selectedSiteIds.length} ${t('Site(s)')}`} ·{' '}
                      {allGates ? t('All Gates') : `${selectedGateIds.length} ${t('Gate(s)')}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">{t('Schedule Mode')}</span>
                    <span className="font-medium text-foreground">{t(scheduleType)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">{t('Enforcement Status')}</span>
                    <span className="font-medium text-success">{t(status)}</span>
                  </div>
                </div>

                {description && (
                  <div className="pt-3 border-t border-border/60 text-xs text-muted-foreground">
                    {description}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-between">
          <div>
            {currentStep > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBack}
                disabled={isSubmitting}
                className="text-xs border-border text-foreground hover:bg-muted gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t('Back')}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-xs border-border text-muted-foreground hover:text-foreground"
            >
              {t('Cancel')}
            </Button>

            {currentStep < 6 ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleNext}
                className="text-xs bg-primary hover:bg-primary/90 text-[#fff] gap-1.5"
              >
                {t('Continue')}
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSubmit('DRAFT')}
                  disabled={isSubmitting}
                  className="text-xs border-warning/40 text-warning hover:bg-warning/15"
                >
                  {t('Save as Draft')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleSubmit('ACTIVE')}
                  disabled={isSubmitting}
                  className="text-xs bg-primary hover:bg-primary/90 text-[#fff] gap-1.5 "
                >
                  <Check className="w-4 h-4" />
                  {isEditing ? t('Save & Synchronize') : t('Create & Activate')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
