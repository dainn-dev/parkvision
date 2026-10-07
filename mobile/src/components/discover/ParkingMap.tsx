import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Navigation, ZoomIn, ZoomOut, Layers, RefreshCw, Activity, Compass } from 'lucide-react';
import { Tenant, UserLocation } from '../../types';

interface ParkingMapProps {
  tenants: Tenant[];
  selectedTenant: Tenant | null;
  onSelectTenant: (tenant: Tenant) => void;
  userLocation: UserLocation;
  onRecenterGps: () => void;
  isRealtimeStreaming?: boolean;
  fullHeight?: boolean;
  className?: string;
}

export const ParkingMap: React.FC<ParkingMapProps> = ({
  tenants,
  selectedTenant,
  onSelectTenant,
  userLocation,
  onRecenterGps,
  isRealtimeStreaming = true,
  fullHeight = false,
  className = ''
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapInstance = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current) return;

    if (!leafletMapInstance.current) {
      const map = L.map(mapRef.current, {
        center: [userLocation.lat, userLocation.lng],
        zoom: 15,
        zoomControl: false,
        attributionControl: false
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c']
      }).addTo(map);

      leafletMapInstance.current = map;
      markersGroupRef.current = L.layerGroup().addTo(map);

      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    }

    return () => {
      if (leafletMapInstance.current) {
        leafletMapInstance.current.remove();
        leafletMapInstance.current = null;
      }
    };
  }, []);

  // Invalidate size on fullHeight changes
  useEffect(() => {
    if (leafletMapInstance.current) {
      const timer = setTimeout(() => {
        leafletMapInstance.current?.invalidateSize();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [fullHeight]);

  // Update User Location Marker
  useEffect(() => {
    const map = leafletMapInstance.current;
    if (!map) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      const userIcon = L.divIcon({
        className: 'custom-user-marker',
        html: `
          <div class="relative flex items-center justify-center w-8 h-8">
            <span class="absolute w-8 h-8 rounded-full bg-blue-500/30 animate-ping"></span>
            <span class="relative w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-lg"></span>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon }).addTo(map);
    }
  }, [userLocation.lat, userLocation.lng]);

  // Render Tenant Markers
  useEffect(() => {
    const map = leafletMapInstance.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    tenants.forEach((tenant) => {
      const isSelected = selectedTenant?.id === tenant.id;
      const isFull = tenant.capacity.available <= 0;
      const isLimited = tenant.capacity.status === 'LIMITED' || tenant.capacity.status === 'ALMOST_FULL';

      let bgClass = "bg-emerald-600 text-white border-emerald-400";
      let statusBadge = `${tenant.capacity.available} spots`;

      if (isFull) {
        bgClass = "bg-rose-600 text-white border-rose-400";
        statusBadge = "FULL";
      } else if (isLimited) {
        bgClass = "bg-amber-500 text-slate-950 border-amber-300 font-bold";
      }

      const customHtml = `
        <div class="cursor-pointer transition-all transform ${isSelected ? 'scale-110 z-50' : 'hover:scale-105'}">
          <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full shadow-xl border ${bgClass} font-mono text-xs whitespace-nowrap">
            <span class="font-extrabold">🅿️ ${(tenant.pricing.hourlyFrom / 1000)}k</span>
            <span class="w-1 h-1 rounded-full bg-white opacity-80"></span>
            <span class="text-[10px] uppercase">${statusBadge}</span>
          </div>
          ${isSelected ? `<div class="w-2 h-2 bg-blue-500 mx-auto transform rotate-45 -mt-1 shadow-md"></div>` : ''}
        </div>
      `;

      const markerIcon = L.divIcon({
        className: 'tenant-map-marker',
        html: customHtml,
        iconSize: [100, 36],
        iconAnchor: [50, 18]
      });

      const marker = L.marker([tenant.lat, tenant.lng], { icon: markerIcon });
      marker.on('click', () => {
        onSelectTenant(tenant);
        map.panTo([tenant.lat, tenant.lng], { animate: true });
      });

      markersGroup.addLayer(marker);
    });
  }, [tenants, selectedTenant, onSelectTenant]);

  return (
    <div className={`relative w-full ${fullHeight ? 'h-full min-h-[calc(100vh-80px)]' : 'h-[320px] sm:h-[380px]'} bg-slate-950 overflow-hidden shadow-inner border-y border-slate-800 ${className}`}>
      {/* Map DOM Container */}
      <div ref={mapRef} className="w-full h-full z-0" />

      {/* Realtime Stream Status Overlay Badge */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-lg text-xs">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span className="font-semibold text-slate-200">Live ANPR Map</span>
        <span className="text-[10px] text-slate-400 font-mono">({tenants.length} nearby)</span>
      </div>

      {/* Floating Map Controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        {/* Recenter GPS */}
        <button
          onClick={() => {
            if (leafletMapInstance.current) {
              leafletMapInstance.current.panTo([userLocation.lat, userLocation.lng], { animate: true });
            }
            onRecenterGps();
          }}
          className="p-2.5 bg-slate-900/90 hover:bg-slate-800 text-blue-400 rounded-xl shadow-lg border border-slate-700 transition-colors"
          title="Recenter GPS Location"
          aria-label="Recenter GPS Location"
        >
          <Compass className="w-5 h-5" />
        </button>

        {/* Zoom In */}
        <button
          onClick={() => leafletMapInstance.current?.zoomIn()}
          className="p-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 rounded-xl shadow-lg border border-slate-700 transition-colors"
          title="Zoom In"
          aria-label="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        {/* Zoom Out */}
        <button
          onClick={() => leafletMapInstance.current?.zoomOut()}
          className="p-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 rounded-xl shadow-lg border border-slate-700 transition-colors"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
