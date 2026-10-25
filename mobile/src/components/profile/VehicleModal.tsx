import React, { useState, useEffect } from 'react';
import { X, Star, Check, Edit3, Plus, Loader2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { DriverVehicle } from '../../types';
import { ApiError } from '../../lib/api';

export interface VehicleFormValues {
  plateNumber: string;
  label: string;
  vehicleType: 'car' | 'motorcycle';
  isPrimary: boolean;
}

interface VehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: VehicleFormValues, editingId?: string) => Promise<void>;
  editingVehicle?: DriverVehicle | null;
}

export const VehicleModal: React.FC<VehicleModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingVehicle
}) => {
  const { t, language } = useLanguage();
  const isEditing = !!editingVehicle;

  const [plate, setPlate] = useState('');
  const [label, setLabel] = useState('');
  const [vehicleType, setVehicleType] = useState<'car' | 'motorcycle'>('car');
  const [isPrimary, setIsPrimary] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingVehicle) {
      setPlate(editingVehicle.plateNumber);
      setLabel(editingVehicle.label ?? '');
      setVehicleType(editingVehicle.vehicleType);
      setIsPrimary(editingVehicle.isPrimary);
    } else {
      setPlate('');
      setLabel('');
      setVehicleType('car');
      setIsPrimary(false);
    }
    setErrorMsg('');
    setSaving(false);
  }, [editingVehicle, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPlate = plate.trim().toUpperCase();
    if (!trimmedPlate) {
      setErrorMsg(language === 'vi' ? 'Vui lòng nhập biển số xe' : 'Please enter license plate number');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    try {
      await onSave(
        { plateNumber: trimmedPlate, label: label.trim(), vehicleType, isPrimary },
        editingVehicle?.id
      );
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'conflict' || err.status === 409 || err.message.toLowerCase().includes('plate already registered')) {
          setErrorMsg(t('plateAlreadyRegistered'));
        } else {
          setErrorMsg(err.message);
        }
      } else {
        setErrorMsg(t('networkError'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
              {isEditing ? <Edit3 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isEditing ? t('editVehicleTitle') : t('addVehicleTitle')}
              </h2>
              <p className="text-[11px] text-slate-400">
                {language === 'vi'
                  ? 'Quản lý thông tin phương tiện nhận diện ANPR'
                  : 'Manage ANPR automatic barrier plate details'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl">
              {errorMsg}
            </div>
          )}

          {/* License Plate Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <span>{t('vehiclePlateLabel')}</span>
              <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                placeholder="51G-998.22"
                value={plate}
                onChange={(e) => {
                  setPlate(e.target.value.toUpperCase());
                  if (errorMsg) setErrorMsg('');
                }}
                className="w-full pl-3 pr-10 py-3 bg-slate-950 border border-slate-800 rounded-xl text-base font-mono font-extrabold text-amber-400 uppercase tracking-widest focus:outline-none focus:border-amber-400/80 transition-colors"
              />
              <div className="absolute right-3 top-3.5 px-1.5 py-0.5 bg-amber-400/10 text-amber-400 text-[10px] font-mono font-bold rounded">
                ANPR
              </div>
            </div>
          </div>

          {/* Label / Model Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">
              {language === 'vi' ? 'Tên xe / Dòng xe' : 'Vehicle Model / Brand'}
            </label>
            <input
              type="text"
              placeholder={language === 'vi' ? 'Ví dụ: Toyota Camry 2.5Q, Honda SH...' : 'e.g. Mazda CX-5, Honda SH...'}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-medium text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Vehicle Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">{t('vehicleType')}</label>
            <div className="grid grid-cols-2 gap-2">
              {(['car', 'motorcycle'] as const).map((vt) => (
                <button
                  key={vt}
                  type="button"
                  onClick={() => setVehicleType(vt)}
                  className={`py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    vehicleType === vt
                      ? 'bg-blue-950/80 text-blue-300 border-blue-500 font-bold'
                      : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {vt === 'car' ? t('carSuv') : t('motorcycle')}
                </button>
              ))}
            </div>
          </div>

          {/* Make Primary Vehicle Toggle Card */}
          <div
            onClick={() => setIsPrimary(!isPrimary)}
            className={`p-3.5 border rounded-2xl cursor-pointer transition-all flex items-center justify-between gap-3 ${
              isPrimary
                ? 'bg-blue-950/40 border-blue-600/80 shadow-lg shadow-blue-900/20'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-xl mt-0.5 transition-colors ${
                isPrimary ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-800 text-slate-400'
              }`}>
                <Star className={`w-4 h-4 ${isPrimary ? 'fill-white' : ''}`} />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{t('setAsPrimary')}</span>
                  {isPrimary && (
                    <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded">
                      ACTIVE
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                  {t('setAsPrimarySub')}
                </div>
              </div>
            </div>

            <div className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
              isPrimary ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-700 bg-slate-900'
            }`}>
              {isPrimary && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </div>
          </div>

          {/* Form Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs rounded-xl transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>{t('saveVehicle')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
