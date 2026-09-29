import React from 'react';
import type { MapLevelOut, MapZoneOut } from '../../../services/api';

interface ParkingMapCanvasProps {
  levels: MapLevelOut[];
  selectedLevelId: string | null;
  onSelectLevel: (id: string) => void;
  highlightZoneId?: string | null;
  editMode?: boolean;
  onZoneClick?: (zone: MapZoneOut) => void;
}

const zoneFill = (z: MapZoneOut): string => {
  if (!z.capacity) return 'rgba(88,166,255,0.28)'; // neutral blue when capacity unknown
  const ratio = Math.min(1, z.occupiedCount / z.capacity);
  if (ratio >= 1) return 'rgba(248,81,73,0.38)';
  if (ratio >= 0.7) return 'rgba(210,153,34,0.35)';
  return 'rgba(63,185,80,0.30)';
};

export const ParkingMapCanvas: React.FC<ParkingMapCanvasProps> = ({
  levels,
  selectedLevelId,
  onSelectLevel,
  highlightZoneId,
  editMode = false,
  onZoneClick,
}) => {
  const level = levels.find((l) => l.id === selectedLevelId) ?? levels[0];

  return (
    <div className="flex flex-col h-full">
      {/* Level tabs */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {levels.map((lv) => (
          <button
            key={lv.id}
            onClick={() => onSelectLevel(lv.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
              (level?.id === lv.id)
                ? 'bg-[#58a6ff]/15 text-[#58a6ff] border-[#58a6ff]/40'
                : 'text-[#8b949e] border-[#30363d] hover:bg-[#161b22] hover:text-[#c9d1d9]'
            }`}
          >
            {lv.name}
            {lv.code && <span className="ml-1.5 text-[10px] font-mono opacity-70">{lv.code}</span>}
          </button>
        ))}
      </div>

      {/* Map surface: level image (or grid fallback) + zone rects in a 0..100 box */}
      <div className="relative flex-1 min-h-[320px] rounded-xl overflow-hidden border border-[#30363d] bg-[#0d0e12]">
        {level?.mapImageUrl ? (
          <img
            src={level.mapImageUrl}
            alt={level.name}
            className="absolute inset-0 w-full h-full object-contain opacity-90"
            draggable={false}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(rgba(48,54,61,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(48,54,61,0.35) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
        )}

        {level && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
          >
            {level.zones.map((z) => {
              const b = z.bounds;
              if (!b) return null;
              const isHi = z.id === highlightZoneId;
              return (
                <g
                  key={z.id}
                  onClick={() => onZoneClick?.(z)}
                  className={onZoneClick || editMode ? 'cursor-pointer' : ''}
                >
                  <rect
                    x={b.x * 100}
                    y={b.y * 100}
                    width={b.w * 100}
                    height={b.h * 100}
                    fill={isHi ? 'rgba(88,166,255,0.45)' : zoneFill(z)}
                    stroke={isHi ? '#58a6ff' : 'rgba(201,209,217,0.5)'}
                    strokeWidth={isHi ? 0.6 : 0.25}
                    vectorEffect="non-scaling-stroke"
                    className={isHi ? 'animate-pulse' : ''}
                  />
                  <text
                    x={(b.x + b.w / 2) * 100}
                    y={(b.y + b.h / 2) * 100}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="3.2"
                    fill="#c9d1d9"
                    style={{ pointerEvents: 'none', fontFamily: 'monospace', fontWeight: 700 }}
                  >
                    {z.code ?? z.name}
                  </text>
                  <text
                    x={(b.x + b.w / 2) * 100}
                    y={(b.y + b.h / 2) * 100 + 4}
                    textAnchor="middle"
                    fontSize="2.2"
                    fill="#8b949e"
                    style={{ pointerEvents: 'none', fontFamily: 'monospace' }}
                  >
                    {z.occupiedCount}{z.capacity ? `/${z.capacity}` : ''}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Zone legend */}
      {level && level.zones.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {level.zones.map((z) => (
            <button
              key={z.id}
              onClick={() => onZoneClick?.(z)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono border transition-all cursor-pointer ${
                z.id === highlightZoneId
                  ? 'border-[#58a6ff] text-[#58a6ff] bg-[#58a6ff]/10'
                  : 'border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
            >
              {z.code ?? z.name} · {z.occupiedCount}{z.capacity ? `/${z.capacity}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
