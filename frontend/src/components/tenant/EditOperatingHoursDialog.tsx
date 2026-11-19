import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Copy,
  ToggleLeft,
  ToggleRight,
  Save,
  Globe
} from 'lucide-react';
import { Button } from '../ui';
import { OperatingHoursSchedule, OperatingHoursDay } from '../../types/tenant';
import { useTranslation } from 'react-i18next';

interface EditOperatingHoursDialogProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: OperatingHoursSchedule;
  onSave: (updatedSchedule: OperatingHoursSchedule) => void;
}

const DAYS_ORDER: Array<{ day: OperatingHoursDay['day']; label: string; short: string }> = [
  { day: 'MONDAY', label: 'Monday', short: 'Mon' },
  { day: 'TUESDAY', label: 'Tuesday', short: 'Tue' },
  { day: 'WEDNESDAY', label: 'Wednesday', short: 'Wed' },
  { day: 'THURSDAY', label: 'Thursday', short: 'Thu' },
  { day: 'FRIDAY', label: 'Friday', short: 'Fri' },
  { day: 'SATURDAY', label: 'Saturday', short: 'Sat' },
  { day: 'SUNDAY', label: 'Sunday', short: 'Sun' }
];

export const EditOperatingHoursDialog: React.FC<EditOperatingHoursDialogProps> = ({
  isOpen,
  onClose,
  schedule,
  onSave
}) => {
  const { t } = useTranslation('tenant');
  const [isOpen24_7, setIsOpen24_7] = useState<boolean>(schedule.isOpen24_7 || false);
  const [days, setDays] = useState<OperatingHoursDay[]>(schedule.days);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setIsOpen24_7(schedule.isOpen24_7 || false);
      // Ensure all 7 days exist
      const dayMap = new Map<OperatingHoursDay['day'], OperatingHoursDay>(
        schedule.days.map((d) => [d.day, d])
      );
      const fullDays: OperatingHoursDay[] = DAYS_ORDER.map(({ day }) => {
        const existing = dayMap.get(day);
        if (existing) return existing;
        return {
          day,
          enabled: day !== 'SUNDAY',
          open: '07:00',
          close: '22:00'
        };
      });
      setDays(fullDays);
    }
  }, [isOpen, schedule]);

  if (!isOpen) return null;

  const handleToggleDay = (dayKey: OperatingHoursDay['day']) => {
    setDays((prev) =>
      prev.map((d) => (d.day === dayKey ? { ...d, enabled: !d.enabled } : d))
    );
  };

  const handleTimeChange = (
    dayKey: OperatingHoursDay['day'],
    field: 'open' | 'close',
    value: string
  ) => {
    setDays((prev) =>
      prev.map((d) => (d.day === dayKey ? { ...d, [field]: value } : d))
    );
  };

  const handleCopyMondayToWeekdays = () => {
    const monday = days.find((d) => d.day === 'MONDAY') || {
      day: 'MONDAY' as const,
      enabled: true,
      open: '07:00',
      close: '22:00'
    };

    setDays((prev) =>
      prev.map((d) => {
        if (['TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].includes(d.day)) {
          return {
            ...d,
            enabled: monday.enabled,
            open: monday.open,
            close: monday.close
          };
        }
        return d;
      })
    );
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      onSave({
        timezone: schedule.timezone || 'Asia/Ho_Chi_Minh',
        isOpen24_7,
        days
      });
      setIsSaving(false);
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-xl bg-card border border-border rounded-2xl overflow-hidden z-10 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-[330ms]">
        {/* Header */}
        <div className="p-5 border-b border-border bg-background flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-success/15 border border-success/30 text-success flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground tracking-tight">
                {t('Manage Operating Hours')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('Set opening schedule for ANPR access gates and tenant facilities')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Quick Presets & 24/7 Mode */}
          <div className="bg-background border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-foreground font-medium text-xs flex items-center gap-2">
                  <span>{t('24/7 Continuous Operations')}</span>
                  {isOpen24_7 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-success/20 text-success border border-success/40 ">
                      {t('Active')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t('Gates remain operational 24 hours every day without time-window restriction')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen24_7(!isOpen24_7)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-[330ms] ease-in-out focus:outline-hidden ${
                  isOpen24_7 ? 'bg-success' : 'bg-border'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white ring-0 transition duration-[330ms] ease-in-out ${
                    isOpen24_7 ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {!isOpen24_7 && (
              <div className="pt-2 border-t border-muted flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {t('Timezone:')}{' '}
                  <span className="text-foreground ">
                    {schedule.timezone || 'Asia/Ho_Chi_Minh (UTC+07:00)'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyMondayToWeekdays}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted hover:bg-border text-primary hover:text-foreground transition-colors text-[11px] font-medium"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {t('Apply Mon to Fri')}
                </button>
              </div>
            )}
          </div>

          {/* Daily Schedule List (when not 24/7) */}
          {!isOpen24_7 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1 font-medium">
                <span>{t('Day of Week')}</span>
                <span>{t('Operating Time Window')}</span>
              </div>

              {DAYS_ORDER.map(({ day, label }) => {
                const dayConfig = days.find((d) => d.day === day) || {
                  day,
                  enabled: false,
                  open: '07:00',
                  close: '22:00'
                };

                return (
                  <div
                    key={day}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                      dayConfig.enabled
                        ? 'bg-background border-border'
                        : 'bg-background/40 border-border/50 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id={`check-${day}`}
                        checked={dayConfig.enabled}
                        onChange={() => handleToggleDay(day)}
                        className="rounded border-border bg-card text-success focus:ring-0 w-4 h-4 cursor-pointer"
                      />
                      <label
                        htmlFor={`check-${day}`}
                        className={`text-xs font-medium cursor-pointer ${
                          dayConfig.enabled ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {t(label)}
                      </label>
                    </div>

                    {dayConfig.enabled ? (
                      <div className="flex items-center gap-2 text-xs">
                        <input
                          type="time"
                          value={dayConfig.open || '07:00'}
                          onChange={(e) => handleTimeChange(day, 'open', e.target.value)}
                          className="bg-card border border-border rounded-lg px-2 py-1 text-foreground text-xs focus:border-primary focus:outline-hidden"
                        />
                        <span className="text-muted-foreground">{t('to')}</span>
                        <input
                          type="time"
                          value={dayConfig.close || '22:00'}
                          onChange={(e) => handleTimeChange(day, 'close', e.target.value)}
                          className="bg-card border border-border rounded-lg px-2 py-1 text-foreground text-xs focus:border-primary focus:outline-hidden"
                        />
                      </div>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[11px] font-medium">
                        {t('Closed / Inactive')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center bg-background/50 border border-dashed border-success/40 rounded-xl space-y-2">
              <div className="w-12 h-12 rounded-full bg-success/15 text-success flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-foreground font-medium text-sm">{t('24/7 Mode Enabled')}</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {t('This location is designated for round-the-clock automatic ANPR vehicle entry and exit operations.')}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border bg-background flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs border-border text-muted-foreground hover:text-foreground"
          >
            {t('Cancel')}
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            isLoading={isSaving}
            onClick={handleSave}
            className="text-xs bg-primary hover:bg-primary/90 text-[#fff] gap-1.5 font-medium"
          >
            <Save className="w-3.5 h-3.5" />
            {t('Save Operating Hours')}
          </Button>
        </div>
      </div>
    </div>
  );
};
