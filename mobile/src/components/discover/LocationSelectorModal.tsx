import React, { useState } from 'react';
import { MapPin, Navigation, Search, Check, X, ShieldAlert, Compass } from 'lucide-react';
import { UserLocation } from '../../types';

interface LocationSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocation: UserLocation;
  onSelectLocation: (location: Partial<UserLocation>) => void;
  onRequestGps: () => void;
}

const POPULAR_DISTRICTS = [
  { name: "District 7 (Nguyen Van Linh / PMH)", district: "District 7", lat: 10.7324, lng: 106.7210 },
  { name: "District 1 (Le Loi / CBD)", district: "District 1", lat: 10.7735, lng: 106.7011 },
  { name: "Binh Thanh District (Landmark 81)", district: "Binh Thanh", lat: 10.7950, lng: 106.7220 },
  { name: "District 4 (Hoang Dieu)", district: "District 4", lat: 10.7580, lng: 106.7020 },
  { name: "Thu Duc City (Thao Dien / D2)", district: "Thu Duc", lat: 10.8030, lng: 106.7350 },
  { name: "Tan Binh District (Tan Son Nhat Airport)", district: "Tan Binh", lat: 10.8140, lng: 106.6620 },
];

export const LocationSelectorModal: React.FC<LocationSelectorModalProps> = ({
  isOpen,
  onClose,
  currentLocation,
  onSelectLocation,
  onRequestGps
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const filteredDistricts = POPULAR_DISTRICTS.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white">Select Parking Area</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* GPS Auto Detect Banner */}
          <div className="p-3.5 bg-gradient-to-r from-blue-950/60 to-slate-900 border border-blue-800/40 rounded-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
                  <Navigation className="w-3.5 h-3.5 animate-spin" />
                  <span>GPS Location Service</span>
                </div>
                <p className="text-sm font-medium text-slate-200">
                  {currentLocation.address || "Detecting your location..."}
                </p>
                <p className="text-xs text-slate-400">
                  Automatically finds parking capacity within 3km radius.
                </p>
              </div>
              <button
                onClick={onRequestGps}
                disabled={currentLocation.isDetecting}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
              >
                <Compass className="w-3.5 h-3.5" />
                {currentLocation.isDetecting ? "Locating..." : "Use My GPS"}
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search district, ward or address..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700/70 rounded-xl text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Quick Preset Districts */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Popular HCMC Parking Districts
            </h3>
            <div className="space-y-1.5">
              {filteredDistricts.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onSelectLocation({
                      address: item.name,
                      district: item.district,
                      lat: item.lat,
                      lng: item.lng,
                      permissionStatus: 'simulated'
                    });
                    onClose();
                  }}
                  className="w-full p-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 rounded-xl flex items-center justify-between transition-colors text-left group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-slate-700/50 rounded-lg text-slate-300 group-hover:text-blue-400 group-hover:bg-blue-500/10 transition-colors">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-200 group-hover:text-white">
                        {item.name}
                      </div>
                      <div className="text-xs text-slate-400">Ho Chi Minh City</div>
                    </div>
                  </div>
                  {currentLocation.district === item.district && (
                    <span className="p-1 bg-blue-500/20 text-blue-400 rounded-full">
                      <Check className="w-4 h-4" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-900 flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
