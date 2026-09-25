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
      if (!name.trim()) errs.name = 'Rule name is required';
      if (!code.trim()) errs.code = 'Rule code is required';
    }
    if (step === 2) {
      if (targetType === 'LICENSE_PLATE' && !targetLicensePlate.trim()) {
        errs.targetLicensePlate = 'License plate number is required';
      }
      if (targetType === 'SPECIFIC_VEHICLE' && !targetVehicleId) {
        errs.targetVehicleId = 'Please select a registered vehicle';
      }
      if (targetType === 'MEMBER' && !targetMemberId) {
        errs.targetMemberId = 'Please select a member';
      }
    }
    if (step === 3) {
      if (!allSites && selectedSiteIds.length === 0) {
        errs.sites = 'Select at least one facility site';
      }
      if (!allGates && selectedGateIds.length === 0) {
        errs.gates = 'Select at least one gate lane';
      }
    }
    if (step === 4) {
      if (scheduleType === 'DATE_RANGE') {
        if (!startDate) errs.startDate = 'Start date required';
        if (!endDate) errs.endDate = 'End date required';
      }
      if (scheduleType === 'WEEKLY') {
        const hasEnabled = weeklyDays.some(d => d.enabled);
        if (!hasEnabled) errs.weeklyDays = 'Enable at least one active day of the week';
      }
    }
    if (step === 5) {
      if (!priority || priority < 1) {
        errs.priority = 'Priority must be at least 1';
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
    let scheduleSummary = 'Always (24/7)';
    if (scheduleType === 'WEEKLY') {
      const enabledDays = weeklyDays.filter(d => d.enabled).map(d => d.day.slice(0, 3));
      const firstWindow = weeklyDays.find(d => d.enabled && d.windows.length > 0)?.windows[0];
      scheduleSummary = `${enabledDays.join(', ')} · ${firstWindow?.start || '08:00'} - ${firstWindow?.end || '18:00'}`;
    } else if (scheduleType === 'DATE_RANGE') {
      scheduleSummary = `${startDate} to ${endDate} (${startTime} - ${endTime})`;
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
          ? ['All Facilities']
          : tenantSites.filter(s => selectedSiteIds.includes(s.id)).map(s => s.name),
        allGates,
        gateIds: allGates ? ['ALL_GATES'] : selectedGateIds,
        gateNames: allGates ? ['All Gates'] : selectedGateIds
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
    { num: 1, label: 'Basic Info' },
    { num: 2, label: 'Target' },
    { num: 3, label: 'Scope' },
    { num: 4, label: 'Schedule' },
    { num: 5, label: 'Action & Priority' },
    { num: 6, label: 'Review' }
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-3xl bg-[#0d0e12] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
              action === 'ALLOW'
                ? 'bg-[#238636]/15 border-[#238636]/30 text-[#3fb950]'
                : 'bg-[#da3633]/15 border-[#da3633]/30 text-[#f85149]'
            }`}>
              {action === 'ALLOW' ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {isEditing ? `Edit Access Rule: ${ruleToEdit?.code}` : 'Create Access Policy Rule'}
              </h3>
              <p className="text-xs text-[#8b949e]">
                Configure automated ANPR camera barrier evaluation policies
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-white hover:bg-[#30363d] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wizard Stepper Header */}
        <div className="px-6 py-3 bg-[#161b22]/40 border-b border-[#30363d] flex items-center justify-between overflow-x-auto gap-2">
          {steps.map((s, idx) => (
            <button
              key={s.num}
              onClick={() => {
                if (s.num < currentStep || validateStep(currentStep)) {
                  setCurrentStep(s.num);
                }
              }}
              className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                currentStep === s.num
                  ? 'bg-[#1f6feb] text-white shadow-xs'
                  : currentStep > s.num
                  ? 'text-[#3fb950] hover:bg-[#21262d]'
                  : 'text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                currentStep === s.num
                  ? 'bg-white text-[#1f6feb]'
                  : currentStep > s.num
                  ? 'bg-[#238636] text-white'
                  : 'bg-[#21262d] text-[#8b949e]'
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
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#c9d1d9] font-medium mb-1.5">
                    Rule Name <span className="text-[#f85149]">*</span>
                  </label>
                  <Input
                    placeholder="e.g. Employee Standard Parking Access"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!code || code.startsWith('RULE-')) {
                        setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 24));
                      }
                    }}
                    className={`bg-[#161b22] border-[#30363d] text-white ${errors.name ? 'border-[#f85149]' : ''}`}
                  />
                  {errors.name && <p className="text-[11px] text-[#f85149] mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-[#c9d1d9] font-medium mb-1.5">
                    Rule Code <span className="text-[#f85149]">*</span>
                  </label>
                  <Input
                    placeholder="e.g. EMPLOYEE-PARKING"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, '-'))}
                    className={`font-mono bg-[#161b22] border-[#30363d] text-white ${errors.code ? 'border-[#f85149]' : ''}`}
                  />
                  {errors.code && <p className="text-[11px] text-[#f85149] mt-1">{errors.code}</p>}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[#c9d1d9] font-medium">Description</label>
                  <span className="text-[11px] text-[#8b949e]">{description.length}/500</span>
                </div>
                <textarea
                  rows={3}
                  maxLength={500}
                  placeholder="Describe purpose of rule, edge trigger conditions, and authorized team members..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[#161b22] border border-[#30363d] rounded-lg p-3 text-white focus:outline-hidden focus:border-[#58a6ff]"
                />
              </div>

              <div>
                <label className="block text-[#c9d1d9] font-medium mb-1.5">Initial Activation Status</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStatus('ACTIVE')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-colors cursor-pointer ${
                      status === 'ACTIVE'
                        ? 'bg-[#238636]/15 border-[#238636] text-white'
                        : 'bg-[#161b22] border-[#30363d] text-[#8b949e]'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-[#3fb950]" />
                    <div>
                      <div className="font-bold text-white">Active (Enforced)</div>
                      <div className="text-[11px] text-[#8b949e]">Immediately deployed to camera edge controllers</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatus('DRAFT')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-colors cursor-pointer ${
                      status === 'DRAFT'
                        ? 'bg-[#d29922]/15 border-[#d29922] text-white'
                        : 'bg-[#161b22] border-[#30363d] text-[#8b949e]'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-[#e3b341]" />
                    <div>
                      <div className="font-bold text-white">Draft Mode</div>
                      <div className="text-[11px] text-[#8b949e]">Save policy configuration without active gate enforcement</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Target Entity */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <label className="block text-[#c9d1d9] font-medium">Select Target Entity</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { type: 'MEMBER_GROUP', label: 'Member Group', icon: User, desc: 'Employees, VIP, Contractors' },
                  { type: 'LICENSE_PLATE', label: 'License Plate', icon: Tag, desc: 'Specific license plate number' },
                  { type: 'SPECIFIC_VEHICLE', label: 'Specific Vehicle', icon: Car, desc: 'Target vehicle in registry' },
                  { type: 'MEMBER', label: 'Individual Member', icon: User, desc: 'Single registered person' },
                  { type: 'VEHICLE_GROUP', label: 'Vehicle Group', icon: Layers, desc: 'Car, SUV, Truck, Van' },
                  { type: 'VISITOR', label: 'Pre-Registered Visitor', icon: User, desc: 'Temporary guest pass' },
                  { type: 'ALL_VEHICLES', label: 'All Vehicles', icon: ShieldCheck, desc: 'Broad facility rule' }
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = targetType === item.type;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => setTargetType(item.type as AccessRuleTargetType)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-[#1f6feb]/15 border-[#1f6feb] text-white shadow-xs'
                          : 'bg-[#161b22] border-[#30363d] text-[#8b949e] hover:border-[#58a6ff]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-[#58a6ff]' : 'text-[#8b949e]'}`} />
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff]" />}
                      </div>
                      <div className="font-bold text-white text-xs">{item.label}</div>
                      <div className="text-[10px] text-[#8b949e] mt-0.5">{item.desc}</div>
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Target Inputs */}
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
                {targetType === 'ALL_VEHICLES' && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#d29922]/10 border border-[#d29922]/30 text-[#e3b341]">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Broad Policy Notice:</span> This rule will apply to every single detected vehicle entering matching gates. Ensure appropriate priority and schedule constraints.
                    </div>
                  </div>
                )}

                {targetType === 'LICENSE_PLATE' && (
                  <div>
                    <label className="block text-[#c9d1d9] font-medium mb-1.5">
                      Target License Plate <span className="text-[#f85149]">*</span>
                    </label>
                    <Input
                      placeholder="e.g. 51K-881.00"
                      value={targetLicensePlate}
                      onChange={(e) => setTargetLicensePlate(e.target.value.toUpperCase())}
                      className="font-mono uppercase bg-[#0d0e12] border-[#30363d] text-white"
                    />
                    {errors.targetLicensePlate && (
                      <p className="text-[11px] text-[#f85149] mt-1">{errors.targetLicensePlate}</p>
                    )}
                  </div>
                )}

                {targetType === 'MEMBER_GROUP' && (
                  <div>
                    <label className="block text-[#c9d1d9] font-medium mb-1.5">Member Group Category</label>
                    <select
                      value={targetMemberGroup}
                      onChange={(e) => setTargetMemberGroup(e.target.value)}
                      className="w-full bg-[#0d0e12] border border-[#30363d] rounded-lg p-2.5 text-white"
                    >
                      <option value="EMPLOYEE">Employees & Corporate Staff</option>
                      <option value="VIP">Executive & VIP Priority Pass</option>
                      <option value="MANAGEMENT">Site Operations Management</option>
                      <option value="SECURITY">Security & Enforcement Staff</option>
                      <option value="CONTRACTOR">Contractor Logistics & Freight Vendors</option>
                      <option value="VISITOR">Pre-Registered Visitors</option>
                    </select>
                  </div>
                )}

                {targetType === 'SPECIFIC_VEHICLE' && (
                  <div>
                    <label className="block text-[#c9d1d9] font-medium mb-1.5">Select Registered Vehicle</label>
                    <select
                      value={targetVehicleId}
                      onChange={(e) => setTargetVehicleId(e.target.value)}
                      className="w-full bg-[#0d0e12] border border-[#30363d] rounded-lg p-2.5 text-white"
                    >
                      <option value="">-- Choose a vehicle --</option>
                      {tenantVehicles.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.currentPlate?.number} — {v.name} ({v.type}) · Owner: {v.member?.name || 'Unassigned'}
                        </option>
                      ))}
                    </select>
                    {errors.targetVehicleId && (
                      <p className="text-[11px] text-[#f85149] mt-1">{errors.targetVehicleId}</p>
                    )}
                  </div>
                )}

                {targetType === 'MEMBER' && (
                  <div>
                    <label className="block text-[#c9d1d9] font-medium mb-1.5">Select Member</label>
                    <select
                      value={targetMemberId}
                      onChange={(e) => setTargetMemberId(e.target.value)}
                      className="w-full bg-[#0d0e12] border border-[#30363d] rounded-lg p-2.5 text-white"
                    >
                      <option value="">-- Choose a member --</option>
                      {tenantUsers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email}) — Role: {u.role}
                        </option>
                      ))}
                    </select>
                    {errors.targetMemberId && (
                      <p className="text-[11px] text-[#f85149] mt-1">{errors.targetMemberId}</p>
                    )}
                  </div>
                )}

                {targetType === 'VEHICLE_GROUP' && (
                  <div>
                    <label className="block text-[#c9d1d9] font-medium mb-1.5">Vehicle Group</label>
                    <select
                      value={targetVehicleGroup}
                      onChange={(e) => setTargetVehicleGroup(e.target.value)}
                      className="w-full bg-[#0d0e12] border border-[#30363d] rounded-lg p-2.5 text-white"
                    >
                      <option value="CAR">Passenger Cars / Sedans</option>
                      <option value="SUV">SUVs / Crossovers</option>
                      <option value="TRUCK">Heavy Trucks / Flatbeds</option>
                      <option value="VAN">Commercial Delivery Vans</option>
                      <option value="SECURITY">Security Mobile Patrol Vehicles</option>
                      <option value="COMPANY">Company Fleet Pool Vehicles</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[#8b949e] text-[11px] mb-1">Target Notes / Audit Reason (Optional)</label>
                  <Input
                    placeholder="e.g. Flagged for tailgating #SEC-9921 or Executive VIP fast-lane privilege"
                    value={targetNotes}
                    onChange={(e) => setTargetNotes(e.target.value)}
                    className="bg-[#0d0e12] border-[#30363d] text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Scope (Facilities & Gates) */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Facilities */}
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-white">
                    <Building2 className="w-4 h-4 text-[#58a6ff]" />
                    <span>Target Facilities (Sites)</span>
                  </div>
                  <label className="flex items-center gap-2 text-[#c9d1d9] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSites}
                      onChange={(e) => setAllSites(e.target.checked)}
                      className="rounded border-[#30363d] bg-[#0d0e12] text-[#1f6feb] focus:ring-0"
                    />
                    <span>Apply to All Facilities</span>
                  </label>
                </div>

                {!allSites && (
                  <div className="space-y-2 pt-2 border-t border-[#30363d]/60">
                    {tenantSites.map(s => {
                      const isChecked = selectedSiteIds.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-[#1f6feb]/10 border-[#1f6feb]/40 text-white'
                              : 'bg-[#0d0e12] border-[#30363d] text-[#8b949e]'
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
                              className="rounded border-[#30363d] bg-[#0d0e12] text-[#1f6feb] focus:ring-0"
                            />
                            <span className="font-semibold text-white">{s.name}</span>
                          </div>
                          <span className="text-[11px] text-[#8b949e]">{s.address}</span>
                        </label>
                      );
                    })}
                    {errors.sites && <p className="text-[11px] text-[#f85149] mt-1">{errors.sites}</p>}
                  </div>
                )}
              </div>

              {/* Gates & Lanes */}
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-white">
                    <ShieldCheck className="w-4 h-4 text-[#3fb950]" />
                    <span>Target Gates & Lanes</span>
                  </div>
                  <label className="flex items-center gap-2 text-[#c9d1d9] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allGates}
                      onChange={(e) => setAllGates(e.target.checked)}
                      className="rounded border-[#30363d] bg-[#0d0e12] text-[#1f6feb] focus:ring-0"
                    />
                    <span>Apply to All Gates</span>
                  </label>
                </div>

                {!allGates && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[#30363d]/60">
                    {[
                      { id: 'gate-mc-01', name: 'Entrance Gate 01 (Inbound Main)' },
                      { id: 'gate-mc-02', name: 'Entrance Gate 02 VIP (FastTrack)' },
                      { id: 'gate-mc-03', name: 'Exit Gate 01 (Outbound Main)' },
                      { id: 'gate-cargo-01', name: 'Cargo Logistics Gate 01' }
                    ].map(g => {
                      const isChecked = selectedGateIds.includes(g.id);
                      return (
                        <label
                          key={g.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-[#3fb950]/10 border-[#3fb950]/40 text-white'
                              : 'bg-[#0d0e12] border-[#30363d] text-[#8b949e]'
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
                            className="rounded border-[#30363d] bg-[#0d0e12] text-[#3fb950] focus:ring-0"
                          />
                          <span className="font-semibold text-white">{g.name}</span>
                        </label>
                      );
                    })}
                    {errors.gates && <p className="text-[11px] text-[#f85149] mt-1">{errors.gates}</p>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: Operating Schedule */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { type: 'ALWAYS', label: 'Always (24/7)', desc: 'Continuous unlimited access', icon: Clock },
                  { type: 'WEEKLY', label: 'Weekly Schedule', desc: 'Working hours & day filters', icon: Calendar },
                  { type: 'DATE_RANGE', label: 'Date Range', desc: 'Temporary pass window', icon: Calendar }
                ].map(item => {
                  const Icon = item.icon;
                  const isSelected = scheduleType === item.type;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => setScheduleType(item.type as AccessRuleScheduleType)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#1f6feb]/15 border-[#1f6feb] text-white shadow-xs'
                          : 'bg-[#161b22] border-[#30363d] text-[#8b949e] hover:border-[#58a6ff]/40'
                      }`}
                    >
                      <Icon className={`w-4 h-4 mb-1.5 ${isSelected ? 'text-[#58a6ff]' : 'text-[#8b949e]'}`} />
                      <div className="font-bold text-white text-xs">{item.label}</div>
                      <div className="text-[10px] text-[#8b949e] mt-0.5">{item.desc}</div>
                    </button>
                  );
                })}
              </div>

              {scheduleType === 'WEEKLY' && (
                <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">Daily Operating Windows</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={applyMondayToAllDays}
                      className="text-[11px] border-[#30363d] text-[#58a6ff] hover:bg-[#21262d]"
                    >
                      Apply Monday Hours to Weekdays
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {weeklyDays.map(d => (
                      <div
                        key={d.day}
                        className={`p-2.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                          d.enabled
                            ? 'bg-[#0d0e12] border-[#30363d]'
                            : 'bg-[#161b22]/50 border-[#30363d]/40 opacity-60'
                        }`}
                      >
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={d.enabled}
                            onChange={() => handleWeeklyDayToggle(d.day)}
                            className="rounded border-[#30363d] bg-[#0d0e12] text-[#1f6feb] focus:ring-0"
                          />
                          <span className="font-bold text-white w-28">{d.day}</span>
                        </label>

                        {d.enabled ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={d.windows[0]?.start || '06:00'}
                              onChange={(e) => handleWeeklyTimeChange(d.day, 'start', e.target.value)}
                              className="bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-white font-mono text-xs"
                            />
                            <span className="text-[#8b949e]">to</span>
                            <input
                              type="time"
                              value={d.windows[0]?.end || '21:00'}
                              onChange={(e) => handleWeeklyTimeChange(d.day, 'end', e.target.value)}
                              className="bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-white font-mono text-xs"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-[#8b949e] italic">Access Prohibited</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {errors.weeklyDays && <p className="text-[11px] text-[#f85149] mt-1">{errors.weeklyDays}</p>}
                </div>
              )}

              {scheduleType === 'DATE_RANGE' && (
                <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
                  <div className="font-bold text-white">Temporary Access Validity Window</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[#8b949e] mb-1">Start Date & Time</label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="bg-[#0d0e12] border-[#30363d] text-white"
                        />
                        <Input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="bg-[#0d0e12] border-[#30363d] text-white w-28"
                        />
                      </div>
                      {errors.startDate && <p className="text-[11px] text-[#f85149] mt-1">{errors.startDate}</p>}
                    </div>

                    <div>
                      <label className="block text-[#8b949e] mb-1">End Date & Time</label>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="bg-[#0d0e12] border-[#30363d] text-white"
                        />
                        <Input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="bg-[#0d0e12] border-[#30363d] text-white w-28"
                        />
                      </div>
                      {errors.endDate && <p className="text-[11px] text-[#f85149] mt-1">{errors.endDate}</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: Action & Priority */}
          {currentStep === 5 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div>
                <label className="block text-[#c9d1d9] font-medium mb-1.5">Access Decision Action</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAction('ALLOW')}
                    className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                      action === 'ALLOW'
                        ? 'bg-[#238636]/15 border-[#238636] text-white'
                        : 'bg-[#161b22] border-[#30363d] text-[#8b949e]'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-[#3fb950] text-sm">
                      <ShieldCheck className="w-5 h-5" />
                      ALLOW (Permit Entry)
                    </div>
                    <p className="text-[11px] text-[#8b949e] mt-1">
                      Barrier lifts automatically and access event is logged as ALLOWED.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAction('DENY')}
                    className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                      action === 'DENY'
                        ? 'bg-[#da3633]/15 border-[#da3633] text-white'
                        : 'bg-[#161b22] border-[#30363d] text-[#8b949e]'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-[#f85149] text-sm">
                      <ShieldAlert className="w-5 h-5" />
                      DENY (Block Entry)
                    </div>
                    <p className="text-[11px] text-[#8b949e] mt-1">
                      Barrier remains closed; security guard receives immediate infraction alert.
                    </p>
                  </button>
                </div>
              </div>

              {/* Priority */}
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white text-xs">Evaluation Priority #</div>
                    <div className="text-[11px] text-[#8b949e]">
                      Lower numbers execute first. Priority 1 overrides Priority 50.
                    </div>
                  </div>
                  <div className="w-32">
                    <Input
                      type="number"
                      min={1}
                      max={9999}
                      value={priority}
                      onChange={(e) => setPriority(Number(e.target.value))}
                      className="text-center font-mono font-bold text-white bg-[#0d0e12] border-[#30363d]"
                    />
                  </div>
                </div>
                {errors.priority && <p className="text-[11px] text-[#f85149]">{errors.priority}</p>}

                <div className="flex items-center gap-2 text-[11px] text-[#8b949e] pt-2 border-t border-[#30363d]/60">
                  <Info className="w-3.5 h-3.5 text-[#58a6ff]" />
                  <span>Recommendation: Security Blocklists = 1–9 · VIP Passes = 10–29 · Staff = 30–60 · General = 70+</span>
                </div>
              </div>

              {/* Advanced Parameters */}
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
                <div className="font-bold text-white text-xs">Edge Engine Verification Parameters</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[#8b949e] text-[11px] mb-1">Min OCR Confidence</label>
                    <select
                      value={minConfidence}
                      onChange={(e) => setMinConfidence(Number(e.target.value))}
                      className="w-full bg-[#0d0e12] border border-[#30363d] rounded p-2 text-white font-mono"
                    >
                      <option value={80}>80% (Lenient)</option>
                      <option value={85}>85% (Balanced)</option>
                      <option value={90}>90% (Recommended)</option>
                      <option value={95}>95% (Strict)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#8b949e] text-[11px] mb-1">De-dup Window (sec)</label>
                    <select
                      value={duplicateWindowSeconds}
                      onChange={(e) => setDuplicateWindowSeconds(Number(e.target.value))}
                      className="w-full bg-[#0d0e12] border border-[#30363d] rounded p-2 text-white font-mono"
                    >
                      <option value={3}>3 seconds</option>
                      <option value={5}>5 seconds (Default)</option>
                      <option value={10}>10 seconds</option>
                      <option value={30}>30 seconds</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#8b949e] text-[11px] mb-1">Offline Fail Behavior</label>
                    <select
                      value={failBehavior}
                      onChange={(e) => setFailBehavior(e.target.value as any)}
                      className="w-full bg-[#0d0e12] border border-[#30363d] rounded p-2 text-white font-mono"
                    >
                      <option value="DENY">DENY (Secure)</option>
                      <option value="SAFE_FALLBACK">SAFE_FALLBACK</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Review & Confirmation */}
          {currentStep === 6 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Conflict Warnings */}
              {conflicts.length > 0 && (
                <div className="p-4 rounded-xl bg-[#d29922]/15 border border-[#d29922]/40 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-[#e3b341]">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Rule Evaluation Conflict Warnings ({conflicts.length})</span>
                  </div>
                  <ul className="space-y-1 text-xs text-[#c9d1d9] pl-6 list-disc">
                    {conflicts.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Summary Card */}
              <div className="p-5 rounded-xl bg-[#161b22] border border-[#30363d] space-y-4">
                <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
                  <div>
                    <div className="text-sm font-bold text-white">{name}</div>
                    <div className="text-xs text-[#8b949e] font-mono mt-0.5">{code}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full font-bold text-xs ${
                      action === 'ALLOW'
                        ? 'bg-[#238636]/20 text-[#3fb950] border border-[#238636]/40'
                        : 'bg-[#da3633]/20 text-[#f85149] border border-[#da3633]/40'
                    }`}>
                      {action}
                    </span>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#21262d] text-[#58a6ff]">
                      Priority #{priority}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[#8b949e] block text-[11px]">Target Entity</span>
                    <span className="font-semibold text-white">
                      {targetType} {targetLicensePlate ? `(${targetLicensePlate})` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8b949e] block text-[11px]">Facility & Gate Scope</span>
                    <span className="font-semibold text-white">
                      {allSites ? 'All Facilities' : `${selectedSiteIds.length} Site(s)`} ·{' '}
                      {allGates ? 'All Gates' : `${selectedGateIds.length} Gate(s)`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8b949e] block text-[11px]">Schedule Mode</span>
                    <span className="font-semibold text-white">{scheduleType}</span>
                  </div>
                  <div>
                    <span className="text-[#8b949e] block text-[11px]">Enforcement Status</span>
                    <span className="font-semibold text-[#3fb950]">{status}</span>
                  </div>
                </div>

                {description && (
                  <div className="pt-3 border-t border-[#30363d]/60 text-xs text-[#8b949e]">
                    {description}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-[#30363d] bg-[#161b22] flex items-center justify-between">
          <div>
            {currentStep > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBack}
                disabled={isSubmitting}
                className="text-xs border-[#30363d] text-[#c9d1d9] hover:bg-[#21262d] gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-xs border-[#30363d] text-[#8b949e] hover:text-white"
            >
              Cancel
            </Button>

            {currentStep < 6 ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleNext}
                className="text-xs bg-[#1f6feb] hover:bg-[#388bfd] text-white gap-1.5"
              >
                Continue
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSubmit('DRAFT')}
                  disabled={isSubmitting}
                  className="text-xs border-[#d29922]/40 text-[#e3b341] hover:bg-[#d29922]/15"
                >
                  Save as Draft
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleSubmit('ACTIVE')}
                  disabled={isSubmitting}
                  className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5 shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  {isEditing ? 'Save & Synchronize' : 'Create & Activate'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
