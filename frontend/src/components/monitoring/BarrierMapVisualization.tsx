import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import {
  TenantSiteBarrierLocation,
  BarrierGateItem,
  BarrierStatus,
  BarrierHealth,
  BarrierAlertEvent
} from '../../types/barrier';
import { INITIAL_TENANT_BARRIER_SITES, VIETNAM_MAP_GEO_OUTLINE } from '../../data/barrierMockData';
import { usePlatform } from '../../context/PlatformContext';
import { anomalyDetectorService } from '../../services/anomalyDetectionService';
import { BarrierAnomalyResult } from '../../types/anomaly';
import { BarrierAnomalyInspector } from './BarrierAnomalyInspector';
import {
  MapPin,
  LayoutGrid,
  Map as MapIcon,
  Search,
  Filter,
  RefreshCw,
  Play,
  Pause,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Lock,
  Unlock,
  Radio,
  WifiOff,
  Camera,
  DoorOpen,
  ArrowUpRight,
  ArrowDownRight,
  Car,
  Zap,
  Sliders,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  Info,
  Layers,
  Activity,
  ShieldAlert,
  ChevronRight,
  X,
  Volume2,
  VolumeX,
  Bell,
  BellRing,
  Wrench,
  Power,
  Clock,
  Flame,
  ExternalLink,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import { Button, Badge, Card } from '../ui';

export interface InAppBarrierToast {
  id: string;
  alertId: string;
  type: 'STUCK' | 'OFFLINE' | 'ML_ANOMALY';
  severity: 'CRITICAL' | 'WARNING';
  title: string;
  message: string;
  siteId: string;
  siteName: string;
  gateId: string;
  gateCode: string;
  gateName: string;
  timestamp: string;
  createdAt: number;
  durationMs: number;
  anomalyScore?: number;
  anomalyZScore?: number;
  observedReqPerMin?: number;
}

interface BarrierMapVisualizationProps {
  initialSiteId?: string | null;
  tenantFilterId?: string | null;
  className?: string;
}

export const BarrierMapVisualization: React.FC<BarrierMapVisualizationProps> = ({
  initialSiteId = null,
  tenantFilterId = null,
  className = ''
}) => {
  const { addToast, pushAuditLog } = usePlatform();

  // Active view: 'd3-map' | 'grid'
  const [viewMode, setViewMode] = useState<'d3-map' | 'grid'>('d3-map');

  // Sites state
  const [sites, setSites] = useState<TenantSiteBarrierLocation[]>(INITIAL_TENANT_BARRIER_SITES);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(initialSiteId);
  const [selectedGate, setSelectedGate] = useState<BarrierGateItem | null>(null);

  // =========================================================================
  // MACHINE LEARNING HEURISTIC ANOMALY STATE & OVERLAY CONFIG
  // =========================================================================
  const [anomalies, setAnomalies] = useState<BarrierAnomalyResult[]>(() => anomalyDetectorService.getAllAnomalies());
  const [isMlAnomalyOverlayEnabled, setIsMlAnomalyOverlayEnabled] = useState<boolean>(true);
  const [selectedAnomaly, setSelectedAnomaly] = useState<BarrierAnomalyResult | null>(null);
  const [isAnomalyInspectorOpen, setIsAnomalyInspectorOpen] = useState<boolean>(false);

  // Subscribe to real-time ML anomaly detector updates
  useEffect(() => {
    const unsubscribe = anomalyDetectorService.subscribe((updatedAnomalies) => {
      setAnomalies([...updatedAnomalies]);
    });
    return () => unsubscribe();
  }, []);

  // Real-time alerts state for STUCK and OFFLINE barriers
  const [alerts, setAlerts] = useState<BarrierAlertEvent[]>([
    {
      id: 'alert-init-tsn',
      type: 'OFFLINE',
      severity: 'WARNING',
      siteId: 'site-b-004',
      siteName: 'Ga Hàng Hóa Sân Bay Tân Sơn Nhất',
      gateId: 'bg-004-03',
      gateCode: 'GATE-TSN-CUSTOMS',
      gateName: 'Cổng Kiểm Soát Hải Quan Đặc Biệt',
      tenantId: 't-004',
      tenantName: 'Tan Son Nhat Air Cargo Terminal',
      timestamp: '2 phút trước',
      title: 'Mất tín hiệu camera RTSP & kết nối Edge',
      message: 'Mất tín hiệu camera RTSP & kết nối Edge Gateway > 45s',
      suggestedAction: 'Kiểm tra nguồn UPS và khởi động lại dịch vụ Edge Gateway',
      resolved: false
    }
  ]);

  // In-component active toasts
  const [inAppToasts, setInAppToasts] = useState<InAppBarrierToast[]>([]);

  // Sound chime toggle
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);

  // Incidents Drawer / Modal toggle
  const [isIncidentsDrawerOpen, setIsIncidentsDrawerOpen] = useState<boolean>(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [tenantFilter, setTenantFilter] = useState<string>(tenantFilterId || 'ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL'); // 'ALL' | 'OPEN' | 'CLOSED' | 'WARNING' | 'LOCKED' | 'STUCK' | 'OFFLINE'
  const [regionFilter, setRegionFilter] = useState<string>('ALL'); // 'ALL' | 'NORTH' | 'CENTRAL' | 'SOUTH'

  // Live real-time simulation toggle
  const [isLiveTelemetryActive, setIsLiveTelemetryActive] = useState<boolean>(true);
  const [lastLiveEventText, setLastLiveEventText] = useState<string>('Hệ thống giám sát thời gian thực đang hoạt động');

  // D3 SVG references
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // List of unique tenants for filter
  const tenantOptions = useMemo(() => {
    const map = new Map<string, string>();
    sites.forEach(s => map.set(s.tenantId, s.tenantName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [sites]);

  // Filtered sites based on filters
  const filteredSites = useMemo(() => {
    return sites.filter(site => {
      // Tenant filter
      if (tenantFilter !== 'ALL' && site.tenantId !== tenantFilter) {
        return false;
      }
      // Region filter
      if (regionFilter !== 'ALL' && site.region !== regionFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = site.name.toLowerCase().includes(query);
        const matchesAddress = site.address.toLowerCase().includes(query);
        const matchesTenant = site.tenantName.toLowerCase().includes(query);
        const matchesGate = site.gates.some(g => g.name.toLowerCase().includes(query) || g.code.toLowerCase().includes(query));
        if (!matchesName && !matchesAddress && !matchesTenant && !matchesGate) {
          return false;
        }
      }
      // Status filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'OPEN') {
          return site.gates.some(g => g.status === 'OPEN');
        }
        if (statusFilter === 'CLOSED') {
          return site.gates.some(g => g.status === 'CLOSED');
        }
        if (statusFilter === 'STUCK') {
          return site.gates.some(g => g.status === 'STUCK');
        }
        if (statusFilter === 'OFFLINE') {
          return site.overallHealth === 'OFFLINE' || site.gates.some(g => g.health === 'OFFLINE');
        }
        if (statusFilter === 'WARNING') {
          return site.overallHealth === 'WARNING' || site.gates.some(g => g.health === 'WARNING' || g.health === 'CRITICAL');
        }
        if (statusFilter === 'LOCKED') {
          return site.gates.some(g => g.status === 'LOCKED');
        }
      }
      return true;
    });
  }, [sites, tenantFilter, regionFilter, searchQuery, statusFilter]);

  // Overall KPI statistics
  const metrics = useMemo(() => {
    let totalGates = 0;
    let openGates = 0;
    let closedGates = 0;
    let lockedGates = 0;
    let stuckGates = 0;
    let offlineGates = 0;
    let warningGates = 0;
    let totalOccupancy = 0;
    let totalCapacity = 0;

    sites.forEach(site => {
      totalOccupancy += site.currentOccupancy;
      totalCapacity += site.capacity;
      site.gates.forEach(gate => {
        totalGates += 1;
        if (gate.status === 'OPEN') openGates += 1;
        else if (gate.status === 'CLOSED') closedGates += 1;
        else if (gate.status === 'LOCKED') lockedGates += 1;
        else if (gate.status === 'STUCK') stuckGates += 1;

        if (gate.health === 'OFFLINE') {
          offlineGates += 1;
        } else if (gate.health === 'WARNING' || gate.health === 'CRITICAL') {
          warningGates += 1;
        }
      });
    });

    return {
      totalSites: sites.length,
      totalGates,
      openGates,
      closedGates,
      lockedGates,
      stuckGates,
      offlineGates,
      warningGates,
      totalOccupancy,
      totalCapacity,
      occupancyRate: totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0
    };
  }, [sites]);

  // Selected site object
  const activeSelectedSite = useMemo(() => {
    if (!selectedSiteId) return null;
    return sites.find(s => s.id === selectedSiteId) || null;
  }, [sites, selectedSiteId]);

  // =========================================================================
  // REAL-TIME SIMULATION ENGINE
  // =========================================================================
  useEffect(() => {
    if (!isLiveTelemetryActive) return;

    const samplePlates = [
      '51K-912.83', '30E-445.62', '29A-883.19', '43B-019.45',
      '60C-552.10', '59P-821.34', '51H-111.22', '15A-339.81'
    ];

    const timer = setInterval(() => {
      // Pick random site and random gate
      setSites(prevSites => {
        const randomSiteIndex = Math.floor(Math.random() * prevSites.length);
        const targetSite = prevSites[randomSiteIndex];
        if (!targetSite || targetSite.gates.length === 0) return prevSites;

        const randomGateIndex = Math.floor(Math.random() * targetSite.gates.length);
        const targetGate = targetSite.gates[randomGateIndex];

        // If gate is locked or in maintenance, do not auto-open
        if (targetGate.status === 'LOCKED' || targetGate.status === 'MAINTENANCE') {
          return prevSites;
        }

        const randomPlate = samplePlates[Math.floor(Math.random() * samplePlates.length)];
        const confidence = parseFloat((0.985 + Math.random() * 0.014).toFixed(3));

        // Create updated gate: Raise barrier (OPEN) and activate loop detector
        const updatedGates = [...targetSite.gates];
        updatedGates[randomGateIndex] = {
          ...targetGate,
          status: 'OPEN',
          armAngleDeg: 90,
          loopDetectorActive: true,
          lastPlate: randomPlate,
          lastConfidence: confidence,
          lastPassageTime: 'Vừa xong (1s)',
          dailyCycles: targetGate.dailyCycles + 1
        };

        const updatedSite: TenantSiteBarrierLocation = {
          ...targetSite,
          openGateCount: updatedGates.filter(g => g.status === 'OPEN').length,
          currentOccupancy: Math.min(targetSite.capacity, targetSite.currentOccupancy + (targetGate.direction === 'IN' ? 1 : -1)),
          gates: updatedGates
        };

        const newSites = [...prevSites];
        newSites[randomSiteIndex] = updatedSite;

        setLastLiveEventText(`[ANPR Edge] Xe ${randomPlate} qua ${targetGate.name} (${targetSite.name})`);

        // Schedule auto-lowering of barrier after 2.5 seconds
        setTimeout(() => {
          setSites(currentSites => {
            const siteIndex = currentSites.findIndex(s => s.id === targetSite.id);
            if (siteIndex === -1) return currentSites;

            const siteToUpdate = currentSites[siteIndex];
            const gateIdx = siteToUpdate.gates.findIndex(g => g.id === targetGate.id);
            if (gateIdx === -1) return currentSites;

            const gatesList = [...siteToUpdate.gates];
            if (gatesList[gateIdx].status === 'OPEN') {
              gatesList[gateIdx] = {
                ...gatesList[gateIdx],
                status: 'CLOSED',
                armAngleDeg: 0,
                loopDetectorActive: false
              };
            }

            const refreshedSite: TenantSiteBarrierLocation = {
              ...siteToUpdate,
              openGateCount: gatesList.filter(g => g.status === 'OPEN').length,
              gates: gatesList
            };

            const result = [...currentSites];
            result[siteIndex] = refreshedSite;
            return result;
          });
        }, 2600);

        return newSites;
      });
    }, 4200);

    return () => clearInterval(timer);
  }, [isLiveTelemetryActive]);

  // =========================================================================
  // D3.JS INTERACTIVE MAP INITIALIZATION & RENDERING
  // =========================================================================
  useEffect(() => {
    if (viewMode !== 'd3-map') return;
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const width = 600;
    const height = 700;

    // Clear previous elements
    svg.selectAll('*').remove();

    // Create container group for zoom and pan
    const container = svg.append('g').attr('class', 'map-viewport-container');

    // Define defs (gradients, filters, glow effects)
    const defs = svg.append('defs');

    // Glow filter for active sites
    const glowFilter = defs.append('filter')
      .attr('id', 'pulse-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    glowFilter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
    const feMerge = glowFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Neon glow filter for ML Anomalies
    const anomalyFilter = defs.append('filter')
      .attr('id', 'anomaly-neon-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    anomalyFilter.append('feGaussianBlur').attr('stdDeviation', '6').attr('result', 'purpleBlur');
    const anomMerge = anomalyFilter.append('feMerge');
    anomMerge.append('feMergeNode').attr('in', 'purpleBlur');
    anomMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Radial gradient for Anomaly pulsating aura
    const anomalyRadialGrad = defs.append('radialGradient')
      .attr('id', 'anomaly-aura-gradient');
    anomalyRadialGrad.append('stop').attr('offset', '0%').attr('stop-color', '#c084fc').attr('stop-opacity', '0.6');
    anomalyRadialGrad.append('stop').attr('offset', '50%').attr('stop-color', '#a855f7').attr('stop-opacity', '0.25');
    anomalyRadialGrad.append('stop').attr('offset', '100%').attr('stop-color', '#581c87').attr('stop-opacity', '0');

    // Gradient for coastal territory
    const seaGradient = defs.append('linearGradient')
      .attr('id', 'sea-grid-grad')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '100%').attr('y2', '100%');
    seaGradient.append('stop').attr('offset', '0%').attr('stop-color', '#161b22').attr('stop-opacity', '0.4');
    seaGradient.append('stop').attr('offset', '100%').attr('stop-color', '#0d1117').attr('stop-opacity', '0.9');

    // 1. Draw Background Grid Lines (Tactical Coordinates)
    const gridGroup = container.append('g').attr('class', 'grid-lines').attr('opacity', 0.25);
    for (let x = 0; x <= width; x += 40) {
      gridGroup.append('line')
        .attr('x1', x).attr('y1', 0)
        .attr('x2', x).attr('y2', height)
        .attr('stroke', '#30363d')
        .attr('stroke-dasharray', '2,4');
    }
    for (let y = 0; y <= height; y += 40) {
      gridGroup.append('line')
        .attr('x1', 0).attr('y1', y)
        .attr('x2', width).attr('y2', y)
        .attr('stroke', '#30363d')
        .attr('stroke-dasharray', '2,4');
    }

    // 2. Draw Vietnam Outline Boundary
    const landGroup = container.append('g').attr('class', 'land-boundary');
    landGroup.append('path')
      .attr('d', VIETNAM_MAP_GEO_OUTLINE.coastlinePath)
      .attr('fill', '#161b22')
      .attr('stroke', '#30363d')
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round')
      .attr('filter', 'url(#sea-grid-grad)');

    // Inner contour styling
    landGroup.append('path')
      .attr('d', VIETNAM_MAP_GEO_OUTLINE.coastlinePath)
      .attr('fill', 'none')
      .attr('stroke', '#58a6ff')
      .attr('stroke-width', 0.75)
      .attr('stroke-opacity', 0.4);

    // 3. Islands & Maritime annotations
    const islandsGroup = container.append('g').attr('class', 'islands');
    // Paracel Islands
    VIETNAM_MAP_GEO_OUTLINE.paracelIslands.forEach((isle) => {
      islandsGroup.append('circle')
        .attr('cx', isle.x).attr('cy', isle.y)
        .attr('r', 3)
        .attr('fill', '#58a6ff').attr('opacity', 0.6);
      if (isle.label) {
        islandsGroup.append('text')
          .attr('x', isle.x + 8).attr('y', isle.y + 4)
          .text(isle.label)
          .attr('fill', '#8b949e')
          .attr('font-size', '9px')
          .attr('font-family', 'ui-monospace, monospace');
      }
    });

    // Spratly Islands
    VIETNAM_MAP_GEO_OUTLINE.spratlyIslands.forEach((isle) => {
      islandsGroup.append('circle')
        .attr('cx', isle.x).attr('cy', isle.y)
        .attr('r', 3)
        .attr('fill', '#58a6ff').attr('opacity', 0.6);
      if (isle.label) {
        islandsGroup.append('text')
          .attr('x', isle.x + 8).attr('y', isle.y + 4)
          .text(isle.label)
          .attr('fill', '#8b949e')
          .attr('font-size', '9px')
          .attr('font-family', 'ui-monospace, monospace');
      }
    });

    // 4. Region Label Watermarks
    const labelGroup = container.append('g').attr('class', 'region-labels').attr('opacity', 0.4);
    labelGroup.append('text')
      .attr('x', 320).attr('y', 140)
      .text('BẮC BỘ')
      .attr('fill', '#8b949e').attr('font-size', '11px').attr('font-weight', 'bold').attr('letter-spacing', '2px');

    labelGroup.append('text')
      .attr('x', 380).attr('y', 330)
      .text('TRUNG BỘ')
      .attr('fill', '#8b949e').attr('font-size', '11px').attr('font-weight', 'bold').attr('letter-spacing', '2px');

    labelGroup.append('text')
      .attr('x', 370).attr('y', 510)
      .text('NAM BỘ')
      .attr('fill', '#8b949e').attr('font-size', '11px').attr('font-weight', 'bold').attr('letter-spacing', '2px');

    // 5. Connection vectors between tenant sites (inter-facility telemetry links)
    const linksGroup = container.append('g').attr('class', 'facility-links').attr('opacity', 0.2);
    for (let i = 0; i < filteredSites.length - 1; i++) {
      const s1 = filteredSites[i];
      const s2 = filteredSites[i + 1];
      linksGroup.append('line')
        .attr('x1', s1.mapCoordinates.x).attr('y1', s1.mapCoordinates.y)
        .attr('x2', s2.mapCoordinates.x).attr('y2', s2.mapCoordinates.y)
        .attr('stroke', '#58a6ff')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3');
    }

    // 6. Draw Site Nodes & Barriers Status Pins
    const sitesGroup = container.append('g').attr('class', 'site-nodes');

    filteredSites.forEach(site => {
      const isSelected = selectedSiteId === site.id;
      const siteAnomalies = isMlAnomalyOverlayEnabled ? anomalies.filter(a => a.siteId === site.id) : [];
      const hasAnomaly = siteAnomalies.length > 0;
      const primaryAnomaly = siteAnomalies[0];
      const hasStuck = site.gates.some(g => g.status === 'STUCK');
      const hasOffline = site.overallHealth === 'OFFLINE' || site.gates.some(g => g.health === 'OFFLINE');
      const hasWarning = site.overallHealth === 'WARNING' || site.gates.some(g => g.health === 'WARNING') || hasOffline;
      const hasCritical = site.overallHealth === 'CRITICAL' || site.gates.some(g => g.health === 'CRITICAL') || hasStuck;
      const hasOpenGates = site.openGateCount > 0;

      // Color coding
      let statusColor = '#3fb950'; // emerald nominal
      if (hasAnomaly && isMlAnomalyOverlayEnabled) statusColor = '#c084fc'; // vibrant violet for ML anomaly
      else if (hasStuck) statusColor = '#f85149'; // red stuck
      else if (hasOffline) statusColor = '#e3b341'; // amber offline
      else if (hasCritical) statusColor = '#f85149'; // red critical
      else if (hasWarning) statusColor = '#d29922'; // amber warning

      const node = sitesGroup.append('g')
        .attr('class', `site-node site-${site.id}`)
        .attr('transform', `translate(${site.mapCoordinates.x}, ${site.mapCoordinates.y})`)
        .attr('cursor', 'pointer')
        .on('click', () => {
          setSelectedSiteId(site.id);
          if (hasAnomaly) {
            setSelectedAnomaly(primaryAnomaly);
          }
        });

      // =========================================================================
      // DISTINCT MACHINE LEARNING ANOMALY OVERLAY
      // =========================================================================
      if (hasAnomaly && isMlAnomalyOverlayEnabled) {
        // Outer pulsating radial aura
        node.append('circle')
          .attr('r', 36)
          .attr('fill', 'url(#anomaly-aura-gradient)')
          .attr('class', 'animate-pulse');

        // Spinning dashed cyber reticle ring
        node.append('circle')
          .attr('r', 28)
          .attr('fill', 'none')
          .attr('stroke', '#d946ef')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,3')
          .attr('opacity', 0.95)
          .attr('class', 'animate-spin')
          .style('animation-duration', '7s');

        // Expanding radar beacon ping
        node.append('circle')
          .attr('r', 24)
          .attr('fill', 'none')
          .attr('stroke', '#a855f7')
          .attr('stroke-width', 2)
          .attr('opacity', 0.8)
          .attr('class', 'animate-ping origin-center');
      } else if (hasStuck || hasOffline) {
        // Animated pulse ring if stuck, offline, or open
        node.append('circle')
          .attr('r', 22)
          .attr('fill', 'none')
          .attr('stroke', hasStuck ? '#f85149' : '#e3b341')
          .attr('stroke-width', 2)
          .attr('opacity', 0.8)
          .attr('class', 'animate-ping origin-center');
      } else if (hasOpenGates) {
        node.append('circle')
          .attr('r', 18)
          .attr('fill', 'none')
          .attr('stroke', statusColor)
          .attr('stroke-width', 1.5)
          .attr('opacity', 0.6)
          .attr('class', 'animate-ping origin-center');
      }

      // Outer focus glow if selected
      if (isSelected) {
        node.append('circle')
          .attr('r', 24)
          .attr('fill', 'none')
          .attr('stroke', hasAnomaly && isMlAnomalyOverlayEnabled ? '#e879f9' : '#58a6ff')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '4,2')
          .attr('opacity', 0.9);
      }

      // Base shadow / background circle
      node.append('circle')
        .attr('r', 14)
        .attr('fill', hasAnomaly && isMlAnomalyOverlayEnabled ? '#2e1065' : '#0d1117')
        .attr('stroke', isSelected ? '#58a6ff' : (hasAnomaly && isMlAnomalyOverlayEnabled ? '#c084fc' : '#30363d'))
        .attr('stroke-width', isSelected ? 2 : 1.5);

      // Status indicator ring
      node.append('circle')
        .attr('r', 8)
        .attr('fill', statusColor)
        .attr('filter', hasAnomaly && isMlAnomalyOverlayEnabled ? 'url(#anomaly-neon-glow)' : 'url(#pulse-glow)');

      // Core center dot
      node.append('circle')
        .attr('r', 4)
        .attr('fill', hasAnomaly && isMlAnomalyOverlayEnabled ? '#fdf4ff' : '#ffffff');

      // Label with site name & open barrier counter
      const labelCard = node.append('g')
        .attr('transform', 'translate(18, -12)');

      // Label background pill
      const labelText = site.name.length > 22 ? site.name.substring(0, 22) + '...' : site.name;
      const barrierCounterText = `${site.openGateCount}/${site.totalGateCount} Mở`;

      labelCard.append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', Math.max(120, labelText.length * 6.8 + 50))
        .attr('height', 24)
        .attr('rx', 4)
        .attr('fill', isSelected ? '#21262d' : '#161b22')
        .attr('stroke', isSelected ? '#58a6ff' : (hasAnomaly && isMlAnomalyOverlayEnabled ? '#a855f7' : '#30363d'))
        .attr('stroke-width', 1);

      // Site Title
      labelCard.append('text')
        .attr('x', 8)
        .attr('y', 11)
        .text(labelText)
        .attr('fill', '#e6edf3')
        .attr('font-size', '9.5px')
        .attr('font-weight', '600');

      // Subtitle / Gate counter
      labelCard.append('text')
        .attr('x', 8)
        .attr('y', 20)
        .text(`${barrierCounterText} · ${site.city}`)
        .attr('fill', statusColor)
        .attr('font-size', '8px')
        .attr('font-family', 'ui-monospace, monospace');

      // Tactical ML Anomaly Floating Badge
      if (hasAnomaly && isMlAnomalyOverlayEnabled) {
        const anomalyBadge = node.append('g')
          .attr('transform', 'translate(18, -34)')
          .attr('cursor', 'pointer')
          .on('click', (e) => {
            e.stopPropagation();
            setSelectedSiteId(site.id);
            setSelectedAnomaly(primaryAnomaly);
            setIsAnomalyInspectorOpen(true);
          });

        anomalyBadge.append('rect')
          .attr('x', 0)
          .attr('y', 0)
          .attr('width', 162)
          .attr('height', 19)
          .attr('rx', 4)
          .attr('fill', '#2e1065')
          .attr('stroke', '#c084fc')
          .attr('stroke-width', 1.5)
          .attr('filter', 'url(#pulse-glow)');

        anomalyBadge.append('text')
          .attr('x', 6)
          .attr('y', 13)
          .text(`⚡ ML: ${primaryAnomaly.features.currentReqPerMin} req/m (+${primaryAnomaly.features.zScore}σ) · Sc ${primaryAnomaly.anomalyScore}`)
          .attr('fill', '#f5d0fe')
          .attr('font-size', '8.5px')
          .attr('font-weight', '700')
          .attr('font-family', 'ui-monospace, monospace');
      }
    });

    // 7. Setup D3 Zoom & Pan Behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.8, 4])
      .translateExtent([[-100, -100], [width + 200, height + 200]])
      .on('zoom', (event) => {
        container.attr('transform', event.transform.toString());
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // If a site is pre-selected, smoothly pan to it
    if (selectedSiteId) {
      const targetSite = sites.find(s => s.id === selectedSiteId);
      if (targetSite) {
        const x = targetSite.mapCoordinates.x;
        const y = targetSite.mapCoordinates.y;
        svg.transition().duration(600).call(
          zoom.transform,
          d3.zoomIdentity.translate(width / 2 - x * 1.5, height / 2 - y * 1.5).scale(1.5)
        );
      }
    }
  }, [viewMode, filteredSites, selectedSiteId, anomalies, isMlAnomalyOverlayEnabled]);

  // Zoom preset handlers
  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 1.3);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 0.7);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(500).call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  };

  const handleRegionJump = (region: 'ALL' | 'NORTH' | 'CENTRAL' | 'SOUTH') => {
    setRegionFilter(region);
    if (!svgRef.current || !zoomBehaviorRef.current) return;

    if (region === 'NORTH') {
      d3.select(svgRef.current).transition().duration(650).call(
        zoomBehaviorRef.current.transform,
        d3.zoomIdentity.translate(600 / 2 - 390 * 2, 700 / 2 - 160 * 2).scale(2)
      );
    } else if (region === 'CENTRAL') {
      d3.select(svgRef.current).transition().duration(650).call(
        zoomBehaviorRef.current.transform,
        d3.zoomIdentity.translate(600 / 2 - 440 * 2, 700 / 2 - 360 * 2).scale(2)
      );
    } else if (region === 'SOUTH') {
      d3.select(svgRef.current).transition().duration(650).call(
        zoomBehaviorRef.current.transform,
        d3.zoomIdentity.translate(600 / 2 - 440 * 2, 700 / 2 - 550 * 2).scale(2)
      );
    } else {
      handleResetZoom();
    }
  };

  // =========================================================================
  // GATE INTERACTION HANDLERS
  // =========================================================================
  const handleToggleBarrierArm = (siteId: string, gateId: string, targetAction: 'OPEN' | 'CLOSE') => {
    setSites(prev =>
      prev.map(site => {
        if (site.id !== siteId) return site;
        const updatedGates = site.gates.map(gate => {
          if (gate.id !== gateId) return gate;
          const newStatus: BarrierStatus = targetAction === 'OPEN' ? 'OPEN' : 'CLOSED';
          const newAngle = targetAction === 'OPEN' ? 90 : 0;
          return {
            ...gate,
            status: newStatus,
            armAngleDeg: newAngle,
            dailyCycles: targetAction === 'OPEN' ? gate.dailyCycles + 1 : gate.dailyCycles
          };
        });
        return {
          ...site,
          openGateCount: updatedGates.filter(g => g.status === 'OPEN').length,
          gates: updatedGates
        };
      })
    );

    const site = sites.find(s => s.id === siteId);
    const gate = site?.gates.find(g => g.id === gateId);

    addToast({
      type: targetAction === 'OPEN' ? 'success' : 'info',
      title: `Barrier ${targetAction === 'OPEN' ? 'Nâng cần' : 'Hạ cần'}: ${gate?.name}`,
      description: `Lệnh rơ-le ${targetAction} đã gửi thành công tới Edge Controller.`
    });

    pushAuditLog(
      'MONITORING',
      targetAction === 'OPEN' ? 'BARRIER_MANUAL_OPEN' : 'BARRIER_MANUAL_CLOSE',
      'BARRIER_GATE',
      gateId,
      gate?.name,
      site?.tenantName,
      [{ field: 'status', before: gate?.status, after: targetAction === 'OPEN' ? 'OPEN' : 'CLOSED' }]
    );
  };

  const handleEmergencyLock = (siteId: string, gateId: string) => {
    setSites(prev =>
      prev.map(site => {
        if (site.id !== siteId) return site;
        const updatedGates = site.gates.map(gate => {
          if (gate.id !== gateId) return gate;
          const isCurrentlyLocked = gate.status === 'LOCKED';
          const newStatus: BarrierStatus = isCurrentlyLocked ? 'CLOSED' : 'LOCKED';
          const newHealth: BarrierHealth = isCurrentlyLocked ? 'HEALTHY' : 'CRITICAL';
          return {
            ...gate,
            status: newStatus,
            health: newHealth,
            armAngleDeg: 0,
            warningNote: isCurrentlyLocked ? undefined : 'Khóa khẩn cấp do quản trị viên kích hoạt từ giao diện giám sát'
          };
        });
        return {
          ...site,
          gates: updatedGates
        };
      })
    );

    const site = sites.find(s => s.id === siteId);
    const gate = site?.gates.find(g => g.id === gateId);
    const isLocked = gate?.status === 'LOCKED';

    addToast({
      type: isLocked ? 'info' : 'warning',
      title: isLocked ? `Mở khóa Barrier: ${gate?.name}` : `Khóa Khẩn Cấp: ${gate?.name}`,
      description: isLocked ? 'Đã gỡ lệnh khóa an toàn.' : 'Barrier đã khóa cứng relay, không tự động nâng cần.'
    });

    pushAuditLog(
      'SECURITY',
      isLocked ? 'BARRIER_EMERGENCY_UNLOCK' : 'BARRIER_EMERGENCY_LOCK',
      'BARRIER_GATE',
      gateId,
      gate?.name,
      site?.tenantName
    );
  };

  const handleSimulatePassage = (siteId: string, gateId: string) => {
    const site = sites.find(s => s.id === siteId);
    const gate = site?.gates.find(g => g.id === gateId);
    if (!site || !gate) return;

    const plates = ['51K-882.19', '30F-990.11', '29B-452.33', '43A-667.22'];
    const plate = plates[Math.floor(Math.random() * plates.length)];

    // Raise barrier
    handleToggleBarrierArm(siteId, gateId, 'OPEN');

    // Auto lower barrier after 2.5s
    setTimeout(() => {
      handleToggleBarrierArm(siteId, gateId, 'CLOSE');
    }, 2500);

    addToast({
      type: 'success',
      title: `Mô phỏng xe qua: ${plate}`,
      description: `Camera ANPR nhận diện xe thành công trên làn ${gate.code}.`
    });
  };

  // =========================================================================
  // REAL-TIME AUDIO & INCIDENT NOTIFICATION SYSTEM
  // =========================================================================
  const playAlertSound = (type: 'STUCK' | 'OFFLINE' | 'ML_ANOMALY') => {
    if (isAudioMuted) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'STUCK') {
        // High priority alarm: 880Hz -> 587Hz urgent double chirp
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(587.33, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === 'ML_ANOMALY') {
        // Futuristic cyber synth chime: 520Hz -> 780Hz -> 1040Hz
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1040, ctx.currentTime + 0.22);
        gain.gain.setValueAtTime(0.14, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.36);
      } else {
        // Offline tone: dropping chime 640Hz -> 360Hz
        osc.type = 'sine';
        osc.frequency.setValueAtTime(640, ctx.currentTime);
        osc.frequency.setValueAtTime(360, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.34);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch {
      // Audio playback restrictions fallback
    }
  };

  // ML Anomaly Triggers and Mitigation
  const handleTriggerBurstAnomaly = (targetSiteId?: string, targetGateId?: string) => {
    const siteId = targetSiteId || selectedSiteId || 'site-b-001';
    const anom = anomalyDetectorService.triggerHighFrequencyBurst(siteId, targetGateId);
    playAlertSound('ML_ANOMALY');

    const toastId = `toast-ml-${Date.now()}`;
    const newToast: InAppBarrierToast = {
      id: toastId,
      alertId: anom.id,
      type: 'ML_ANOMALY',
      severity: 'CRITICAL',
      title: 'CẢNH BÁO ML: TẦN SUẤT DỊ THƯỜNG',
      message: `${anom.title}. Tốc độ yêu cầu tăng vọt ${anom.features.currentReqPerMin} req/m (+${anom.features.zScore}σ so với baseline).`,
      siteId: anom.siteId,
      siteName: anom.siteName,
      gateId: anom.gateId,
      gateCode: anom.gateCode,
      gateName: anom.gateName,
      timestamp: new Date().toLocaleTimeString('vi-VN'),
      createdAt: Date.now(),
      durationMs: 14000,
      anomalyScore: anom.anomalyScore,
      anomalyZScore: anom.features.zScore,
      observedReqPerMin: anom.features.currentReqPerMin
    };

    setInAppToasts(prev => [newToast, ...prev.slice(0, 2)]);

    addToast({
      type: 'warning',
      title: `⚡ Bất Thường Heuristic ML: ${anom.gateName}`,
      description: `${anom.features.currentReqPerMin} req/phút (Z = +${anom.features.zScore}σ, vượt ${(anom.features.burstRatio * 100).toFixed(0)}% baseline)`
    });

    pushAuditLog(
      'MONITORING',
      'ML_HEURISTIC_ANOMALY_FLAGGED',
      'BARRIER_GATE',
      anom.gateId,
      anom.gateName,
      anom.tenantName,
      [{ field: 'anomalyScore', before: 0, after: anom.anomalyScore }]
    );
  };

  const handleMitigateAnomaly = (gateId: string, actionNote: string) => {
    const success = anomalyDetectorService.mitigateAnomaly(gateId, actionNote);
    if (success) {
      setInAppToasts(prev => prev.filter(t => t.gateId !== gateId || t.type !== 'ML_ANOMALY'));
      addToast({
        type: 'success',
        title: 'Đã Giảm Thiểu Bất Thường ML Thành Công',
        description: `${actionNote}. Mô hình heuristic đã đưa cổng về trạng thái danh định.`
      });
      pushAuditLog(
        'MONITORING',
        'ML_HEURISTIC_ANOMALY_MITIGATED',
        'BARRIER_GATE',
        gateId,
        undefined,
        undefined,
        [{ field: 'mitigationNote', before: 'ANOMALY_ACTIVE', after: actionNote }]
      );
    }
  };

  // Auto-dismiss for in-app floating toasts
  useEffect(() => {
    if (inAppToasts.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setInAppToasts(prev => prev.filter(t => (now - t.createdAt) < t.durationMs));
    }, 1000);
    return () => clearInterval(interval);
  }, [inAppToasts]);

  const dismissInAppToast = (toastId: string) => {
    setInAppToasts(prev => prev.filter(t => t.id !== toastId));
  };

  const focusSiteOnMap = (siteId: string, gateId?: string) => {
    setSelectedSiteId(siteId);
    setViewMode('d3-map');
    if (gateId) {
      const s = sites.find(item => item.id === siteId);
      const g = s?.gates.find(item => item.id === gateId);
      if (g) setSelectedGate(g);
    }
  };

  // Trigger STUCK barrier alert
  const triggerStuckBarrierAlert = (targetSiteId?: string, targetGateId?: string, customReason?: string) => {
    let foundSite: TenantSiteBarrierLocation | undefined;
    let foundGate: BarrierGateItem | undefined;

    if (targetSiteId && targetGateId) {
      foundSite = sites.find(s => s.id === targetSiteId);
      foundGate = foundSite?.gates.find(g => g.id === targetGateId);
    } else if (selectedSiteId) {
      foundSite = sites.find(s => s.id === selectedSiteId);
      foundGate = foundSite?.gates.find(g => g.status !== 'STUCK') || foundSite?.gates[0];
    } else {
      foundSite = sites[0];
      foundGate = foundSite?.gates[0];
    }

    if (!foundSite || !foundGate) return;

    const stuckGateId = foundGate.id;
    const stuckSiteId = foundSite.id;
    const reason = customReason || 'Cần barrier kẹt cơ học ở góc 42° - Cảm biến dòng báo quá tải động cơ 54.8°C';
    const timestampStr = new Date().toLocaleTimeString('vi-VN');

    setSites(prev =>
      prev.map(site => {
        if (site.id !== stuckSiteId) return site;
        const updatedGates = site.gates.map(gate => {
          if (gate.id !== stuckGateId) return gate;
          return {
            ...gate,
            status: 'STUCK' as BarrierStatus,
            health: 'CRITICAL' as BarrierHealth,
            armAngleDeg: 42,
            motorTempC: 54.8,
            warningNote: `KẸT CẦN CƠ HỌC: ${reason}`,
            stuckSince: timestampStr,
            stuckReason: reason
          };
        });
        return {
          ...site,
          overallHealth: 'CRITICAL' as BarrierHealth,
          gates: updatedGates
        };
      })
    );

    playAlertSound('STUCK');

    const alertId = `alert-stuck-${Date.now()}`;
    const newAlert: BarrierAlertEvent = {
      id: alertId,
      type: 'STUCK',
      severity: 'CRITICAL',
      siteId: stuckSiteId,
      siteName: foundSite.name,
      gateId: stuckGateId,
      gateCode: foundGate.code,
      gateName: foundGate.name,
      tenantId: foundSite.tenantId,
      tenantName: foundSite.tenantName,
      timestamp: timestampStr,
      title: 'Barrier Bị Kẹt Cần Cơ Học (Góc 42°)',
      message: `${foundGate.name} (${foundSite.name}): ${reason}`,
      armAngleDeg: 42,
      motorTempC: 54.8,
      suggestedAction: 'Gửi lệnh rơ-le khởi động lại hoặc nâng cần cưỡng bức',
      resolved: false
    };

    setAlerts(prev => [newAlert, ...prev.filter(a => !(a.gateId === stuckGateId && a.type === 'STUCK'))]);

    const newToast: InAppBarrierToast = {
      id: `toast-${Date.now()}`,
      alertId,
      type: 'STUCK',
      severity: 'CRITICAL',
      title: 'CẢNH BÁO: BARRIER KẸT CẦN',
      message: `${foundGate.name} tại ${foundSite.name} bị kẹt ở góc 42°. Động cơ servo quá dòng 54.8°C.`,
      siteId: stuckSiteId,
      siteName: foundSite.name,
      gateId: stuckGateId,
      gateCode: foundGate.code,
      gateName: foundGate.name,
      timestamp: timestampStr,
      createdAt: Date.now(),
      durationMs: 12000
    };

    setInAppToasts(prev => [newToast, ...prev.slice(0, 2)]);

    addToast({
      type: 'error',
      title: `🚨 Sự Cố Kẹt Cần: ${foundGate.name}`,
      description: `${foundSite.name} - ${reason}`
    });

    pushAuditLog(
      'MONITORING',
      'BARRIER_ARM_STUCK_DETECTED',
      'BARRIER_GATE',
      stuckGateId,
      foundGate.name,
      foundSite.tenantName,
      [{ field: 'status', before: foundGate.status, after: 'STUCK' }]
    );
  };

  // Trigger OFFLINE barrier alert
  const triggerOfflineBarrierAlert = (targetSiteId?: string, targetGateId?: string, customReason?: string) => {
    let foundSite: TenantSiteBarrierLocation | undefined;
    let foundGate: BarrierGateItem | undefined;

    if (targetSiteId && targetGateId) {
      foundSite = sites.find(s => s.id === targetSiteId);
      foundGate = foundSite?.gates.find(g => g.id === targetGateId);
    } else if (selectedSiteId) {
      foundSite = sites.find(s => s.id === selectedSiteId);
      foundGate = foundSite?.gates.find(g => g.health !== 'OFFLINE') || foundSite?.gates[foundSite.gates.length - 1];
    } else {
      foundSite = sites[1] || sites[0];
      foundGate = foundSite?.gates[foundSite.gates.length - 1];
    }

    if (!foundSite || !foundGate) return;

    const offlineGateId = foundGate.id;
    const offlineSiteId = foundSite.id;
    const reason = customReason || 'Mất kết nối telemetry: Heartbeat timeout > 45s từ Edge Gateway';
    const timestampStr = new Date().toLocaleTimeString('vi-VN');

    setSites(prev =>
      prev.map(site => {
        if (site.id !== offlineSiteId) return site;
        const updatedGates = site.gates.map(gate => {
          if (gate.id !== offlineGateId) return gate;
          return {
            ...gate,
            health: 'OFFLINE' as BarrierHealth,
            cameraConnected: false,
            averageLatencyMs: 0,
            warningNote: `MẤT KẾT NỐI: ${reason}`,
            offlineSince: timestampStr,
            offlineReason: reason
          };
        });
        return {
          ...site,
          overallHealth: 'WARNING' as BarrierHealth,
          gates: updatedGates
        };
      })
    );

    playAlertSound('OFFLINE');

    const alertId = `alert-offline-${Date.now()}`;
    const newAlert: BarrierAlertEvent = {
      id: alertId,
      type: 'OFFLINE',
      severity: 'WARNING',
      siteId: offlineSiteId,
      siteName: foundSite.name,
      gateId: offlineGateId,
      gateCode: foundGate.code,
      gateName: foundGate.name,
      tenantId: foundSite.tenantId,
      tenantName: foundSite.tenantName,
      timestamp: timestampStr,
      title: 'Barrier Mất Tín Hiệu (Offline)',
      message: `${foundGate.name} (${foundSite.name}): ${reason}`,
      suggestedAction: 'Kiểm tra cáp RS-485 / Ethernet và kiểm tra trạng thái Edge Gateway',
      resolved: false
    };

    setAlerts(prev => [newAlert, ...prev.filter(a => !(a.gateId === offlineGateId && a.type === 'OFFLINE'))]);

    const newToast: InAppBarrierToast = {
      id: `toast-${Date.now()}`,
      alertId,
      type: 'OFFLINE',
      severity: 'WARNING',
      title: 'CẢNH BÁO: BARRIER MẤT KẾT NỐI (OFFLINE)',
      message: `${foundGate.name} tại ${foundSite.name} không phản hồi tín hiệu heartbeat > 45s.`,
      siteId: offlineSiteId,
      siteName: foundSite.name,
      gateId: offlineGateId,
      gateCode: foundGate.code,
      gateName: foundGate.name,
      timestamp: timestampStr,
      createdAt: Date.now(),
      durationMs: 12000
    };

    setInAppToasts(prev => [newToast, ...prev.slice(0, 2)]);

    addToast({
      type: 'warning',
      title: `⚠️ Mất Kết Nối: ${foundGate.name}`,
      description: `${foundSite.name} - ${reason}`
    });

    pushAuditLog(
      'MONITORING',
      'BARRIER_TELEMETRY_OFFLINE',
      'BARRIER_GATE',
      offlineGateId,
      foundGate.name,
      foundSite.tenantName,
      [{ field: 'health', before: foundGate.health, after: 'OFFLINE' }]
    );
  };

  // Resolve a single alert
  const resolveBarrierIncident = (alertId: string, actionType: 'REBOOT' | 'FORCE_OPEN' | 'DISPATCH' = 'REBOOT') => {
    const alert = alerts.find(a => a.id === alertId);
    if (!alert) return;

    setSites(prev =>
      prev.map(site => {
        if (site.id !== alert.siteId) return site;
        const updatedGates = site.gates.map(gate => {
          if (gate.id !== alert.gateId) return gate;
          return {
            ...gate,
            status: (actionType === 'FORCE_OPEN' ? 'OPEN' : 'CLOSED') as BarrierStatus,
            health: 'HEALTHY' as BarrierHealth,
            armAngleDeg: actionType === 'FORCE_OPEN' ? 90 : 0,
            motorTempC: 37.5,
            cameraConnected: true,
            averageLatencyMs: 40,
            warningNote: undefined,
            stuckSince: undefined,
            stuckReason: undefined,
            offlineSince: undefined,
            offlineReason: undefined
          };
        });

        const anyCritical = updatedGates.some(g => g.health === 'CRITICAL' || g.status === 'STUCK');
        const anyWarning = updatedGates.some(g => g.health === 'WARNING' || g.health === 'OFFLINE');
        const overall = anyCritical ? 'CRITICAL' : anyWarning ? 'WARNING' : 'HEALTHY';

        return {
          ...site,
          overallHealth: overall as BarrierHealth,
          openGateCount: updatedGates.filter(g => g.status === 'OPEN').length,
          gates: updatedGates
        };
      })
    );

    setAlerts(prev => prev.filter(a => a.id !== alertId));
    setInAppToasts(prev => prev.filter(t => t.alertId !== alertId));

    const actionText = actionType === 'REBOOT'
      ? 'Khởi động lại rơ-le'
      : actionType === 'FORCE_OPEN'
      ? 'Nâng cần cưỡng bức'
      : 'Điều phối kỹ thuật viên';

    addToast({
      type: 'success',
      title: `Đã xử lý cảnh báo: ${alert.gateName}`,
      description: `${actionText} thành công. Barrier đã trở về trạng thái danh định.`
    });

    pushAuditLog(
      'MONITORING',
      'BARRIER_INCIDENT_RESOLVED',
      'BARRIER_GATE',
      alert.gateId,
      alert.gateName,
      alert.tenantName,
      [{ field: 'resolution', before: alert.type, after: `RESOLVED_${actionType}` }]
    );
  };

  // Resolve all incidents
  const resolveAllIncidents = () => {
    setSites(prev =>
      prev.map(site => {
        const updatedGates = site.gates.map(gate => {
          if (gate.status === 'STUCK' || gate.health === 'OFFLINE' || gate.health === 'CRITICAL') {
            return {
              ...gate,
              status: 'CLOSED' as BarrierStatus,
              health: 'HEALTHY' as BarrierHealth,
              armAngleDeg: 0,
              motorTempC: 36.5,
              cameraConnected: true,
              averageLatencyMs: 38,
              warningNote: undefined,
              stuckSince: undefined,
              stuckReason: undefined,
              offlineSince: undefined,
              offlineReason: undefined
            };
          }
          return gate;
        });

        return {
          ...site,
          overallHealth: 'HEALTHY' as BarrierHealth,
          gates: updatedGates
        };
      })
    );

    setAlerts([]);
    setInAppToasts([]);
    setIsIncidentsDrawerOpen(false);

    addToast({
      type: 'success',
      title: 'Đã khắc phục toàn bộ cảnh báo',
      description: 'Tất cả các rơ-le barrier và kết nối telemetry đã được đưa về trạng thái bình thường.'
    });

    pushAuditLog(
      'MONITORING',
      'ALL_BARRIER_INCIDENTS_RESOLVED',
      'SYSTEM',
      'BARRIER_MONITOR',
      'Toàn bộ Barrier',
      'Platform'
    );
  };

  return (
    <div className={`relative space-y-5 ${className}`}>
      {/* ========================================================================= */}
      {/* FLOATING REAL-TIME TOAST NOTIFICATION STACK */}
      {/* ========================================================================= */}
      {inAppToasts.length > 0 && (
        <div className="fixed top-20 right-6 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none">
          {inAppToasts.map(toast => {
            const isStuck = toast.type === 'STUCK';
            const isMlAnomaly = toast.type === 'ML_ANOMALY';
            return (
              <div
                key={toast.id}
                className={`pointer-events-auto rounded-2xl p-4 shadow-2xl backdrop-blur-md border transition-all ${
                  isMlAnomaly
                    ? 'bg-[#161b22]/95 border-purple-500/60 shadow-purple-950/40 text-white'
                    : isStuck
                    ? 'bg-[#161b22]/95 border-[#f85149]/50 shadow-red-950/40 text-white'
                    : 'bg-[#161b22]/95 border-[#e3b341]/50 shadow-amber-950/40 text-white'
                }`}
              >
                {/* Toast Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isMlAnomaly
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-inner'
                        : isStuck
                        ? 'bg-[#f85149]/20 text-[#f85149]'
                        : 'bg-[#e3b341]/20 text-[#e3b341]'
                    }`}>
                      {isMlAnomaly ? (
                        <Activity className="w-5 h-5 animate-pulse text-purple-400" />
                      ) : isStuck ? (
                        <AlertOctagon className="w-5 h-5 animate-pulse" />
                      ) : (
                        <WifiOff className="w-5 h-5 animate-pulse" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold uppercase tracking-wider ${
                          isMlAnomaly ? 'text-purple-300' : isStuck ? 'text-[#f85149]' : 'text-[#e3b341]'
                        }`}>
                          {toast.title}
                        </span>
                        {isMlAnomaly && (
                          <span className="text-[10px] font-mono text-purple-200 bg-purple-950/80 px-1.5 py-0.2 rounded border border-purple-700/60 font-bold">
                            Score {toast.anomalyScore}
                          </span>
                        )}
                        <span className="text-[10px] text-[#8b949e] font-mono">{toast.timestamp}</span>
                      </div>
                      <h4 className="text-sm font-bold text-white mt-0.5">{toast.gateName}</h4>
                    </div>
                  </div>

                  <button
                    onClick={() => dismissInAppToast(toast.id)}
                    className="p-1 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Toast Message Body */}
                <p className="text-xs text-[#c9d1d9] mt-2 leading-relaxed">
                  {toast.message}
                </p>
                <div className="text-[11px] text-[#8b949e] mt-1 font-mono">
                  {toast.siteName} · {toast.gateCode}
                </div>

                {/* Action CTAs */}
                <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-[#30363d]/60">
                  <button
                    onClick={() => {
                      focusSiteOnMap(toast.siteId, toast.gateId);
                      dismissInAppToast(toast.id);
                    }}
                    className="py-1 px-2.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5 text-[#58a6ff]" />
                    <span>Xem Vị Trí Map</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {isMlAnomaly ? (
                      <>
                        <button
                          onClick={() => {
                            const anom = anomalies.find(a => a.gateId === toast.gateId) || null;
                            setSelectedAnomaly(anom);
                            setIsAnomalyInspectorOpen(true);
                            dismissInAppToast(toast.id);
                          }}
                          className="py-1 px-2.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/50 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Activity className="w-3.5 h-3.5" />
                          <span>Phân Tích ML</span>
                        </button>
                        <button
                          onClick={() => {
                            handleMitigateAnomaly(toast.gateId, 'Kích hoạt Edge Rate-Limiting tự động');
                            dismissInAppToast(toast.id);
                          }}
                          className="py-1 px-2.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>Giảm Thiểu</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          resolveBarrierIncident(toast.alertId, 'REBOOT');
                          dismissInAppToast(toast.id);
                        }}
                        className="py-1 px-2.5 rounded-lg bg-[#3fb950]/20 hover:bg-[#3fb950]/30 text-[#3fb950] border border-[#3fb950]/30 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Khắc Phục Nhanh</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* INCIDENTS & ALERT RESOLUTION CENTER MODAL/DRAWER */}
      {/* ========================================================================= */}
      {isIncidentsDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex justify-end">
          <div className="bg-[#161b22] border-l border-[#30363d] w-full max-w-xl h-full flex flex-col justify-between shadow-2xl p-6 overflow-y-auto">
            {/* Header */}
            <div className="space-y-4 border-b border-[#30363d] pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-[#f85149]">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Trung Tâm Cảnh Báo & Xử Lý Sự Cố</h3>
                    <p className="text-xs text-[#8b949e]">Giám sát thời gian thực lỗi kẹt cần cơ học & mất kết nối telemetry</p>
                  </div>
                </div>

                <button
                  onClick={() => setIsIncidentsDrawerOpen(false)}
                  className="p-1.5 rounded-xl text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Stats strip */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-[#0d1117] p-2.5 rounded-xl border border-[#30363d]">
                  <span className="text-[#8b949e] text-[10px] block uppercase font-semibold">Tổng Sự Cố</span>
                  <span className="text-white font-mono font-bold text-base tabular-nums mt-0.5 block">{alerts.length}</span>
                </div>
                <div className="bg-[#0d1117] p-2.5 rounded-xl border border-[#30363d]">
                  <span className="text-[#f85149] text-[10px] block uppercase font-semibold">Kẹt Cần (Stuck)</span>
                  <span className="text-[#f85149] font-mono font-bold text-base tabular-nums mt-0.5 block">
                    {alerts.filter(a => a.type === 'STUCK').length}
                  </span>
                </div>
                <div className="bg-[#0d1117] p-2.5 rounded-xl border border-[#30363d]">
                  <span className="text-[#e3b341] text-[10px] block uppercase font-semibold">Mất Kết Nối (Offline)</span>
                  <span className="text-[#e3b341] font-mono font-bold text-base tabular-nums mt-0.5 block">
                    {alerts.filter(a => a.type === 'OFFLINE').length}
                  </span>
                </div>
              </div>
            </div>

            {/* Alerts List */}
            <div className="flex-1 py-4 space-y-3 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[#3fb950]/15 border border-[#3fb950]/30 flex items-center justify-center text-[#3fb950] mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Hệ Thống Đang Hoạt Động Ổn Định</h4>
                    <p className="text-xs text-[#8b949e] mt-1 max-w-xs mx-auto">
                      Không phát hiện barrier kẹt cần hay mất tín hiệu telemetry nào trên toàn bộ các cơ sở.
                    </p>
                  </div>
                  <div className="pt-2 flex justify-center gap-2">
                    <button
                      onClick={() => triggerStuckBarrierAlert()}
                      className="px-3 py-1.5 rounded-lg bg-[#f85149]/20 text-[#f85149] border border-[#f85149]/30 text-xs font-semibold cursor-pointer"
                    >
                      Mô Phỏng Thử Kẹt Cần
                    </button>
                    <button
                      onClick={() => triggerOfflineBarrierAlert()}
                      className="px-3 py-1.5 rounded-lg bg-[#e3b341]/20 text-[#e3b341] border border-[#e3b341]/30 text-xs font-semibold cursor-pointer"
                    >
                      Mô Phỏng Offline
                    </button>
                  </div>
                </div>
              ) : (
                alerts.map(alert => {
                  const isStuck = alert.type === 'STUCK';
                  return (
                    <div
                      key={alert.id}
                      className={`bg-[#0d1117] rounded-xl p-4 border space-y-3 ${
                        isStuck ? 'border-[#f85149]/50' : 'border-[#e3b341]/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={isStuck ? 'red' : 'amber'} size="sm" dot>
                            {isStuck ? 'KẸT CẦN (STUCK)' : 'MẤT KẾT NỐI (OFFLINE)'}
                          </Badge>
                          <span className="text-[11px] text-[#8b949e] font-mono">{alert.timestamp}</span>
                        </div>
                        <span className="text-[10px] font-mono text-[#58a6ff] bg-[#161b22] px-2 py-0.5 rounded border border-[#30363d]">
                          {alert.gateCode}
                        </span>
                      </div>

                      <div>
                        <h4 className="font-bold text-white text-sm">{alert.gateName}</h4>
                        <div className="text-xs text-[#8b949e] mt-0.5">
                          {alert.siteName} · {alert.tenantName}
                        </div>
                      </div>

                      <div className="text-xs p-2.5 rounded-lg bg-[#161b22] border border-[#30363d]/60 text-[#c9d1d9] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[#8b949e]">Hiện trạng:</span>
                          <span className={`font-mono font-bold ${isStuck ? 'text-[#f85149]' : 'text-[#e3b341]'}`}>
                            {isStuck ? `Kẹt tại góc ${alert.armAngleDeg || 42}° · Motor ${alert.motorTempC || 54.8}°C` : 'Telemetry heartbeat timeout'}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#8b949e] pt-1 border-t border-[#30363d]/40">
                          <span className="font-semibold text-white">Khuyến nghị:</span> {alert.suggestedAction}
                        </div>
                      </div>

                      {/* Remediation Action Buttons */}
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <button
                          onClick={() => resolveBarrierIncident(alert.id, 'REBOOT')}
                          className="py-1.5 px-2 rounded-lg bg-[#3fb950]/20 hover:bg-[#3fb950]/30 text-[#3fb950] border border-[#3fb950]/30 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>Reset Rơ-le</span>
                        </button>

                        <button
                          onClick={() => resolveBarrierIncident(alert.id, 'FORCE_OPEN')}
                          className="py-1.5 px-2 rounded-lg bg-[#58a6ff]/20 hover:bg-[#58a6ff]/30 text-[#58a6ff] border border-[#58a6ff]/30 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <span>Nâng Cưỡng Bức</span>
                        </button>

                        <button
                          onClick={() => {
                            focusSiteOnMap(alert.siteId, alert.gateId);
                            setIsIncidentsDrawerOpen(false);
                          }}
                          className="py-1.5 px-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white text-xs font-medium flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          <MapPin className="w-3.5 h-3.5 text-[#58a6ff]" />
                          <span>Định Vị Map</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Drawer Footer */}
            <div className="border-t border-[#30363d] pt-4 flex items-center justify-between gap-3">
              <button
                onClick={() => setIsIncidentsDrawerOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] text-xs font-semibold cursor-pointer"
              >
                Đóng
              </button>

              {alerts.length > 0 && (
                <button
                  onClick={() => resolveAllIncidents()}
                  className="px-4 py-2 rounded-xl bg-[#3fb950] hover:bg-[#2ea043] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/40"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Khắc Phục Tất Cả ({alerts.length})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. TOP METRICS & STATS RIBBON */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3">
          <div className="text-[10px] text-[#8b949e] font-semibold uppercase tracking-wider">Tổng Cơ Sở / Trạm</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-white tabular-nums">{metrics.totalSites}</span>
            <span className="text-[10px] text-[#58a6ff] font-mono">Toàn quốc</span>
          </div>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3">
          <div className="text-[10px] text-[#8b949e] font-semibold uppercase tracking-wider">Tổng Barrier Gates</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-[#58a6ff] tabular-nums">{metrics.totalGates}</span>
            <span className="text-[10px] text-[#8b949e]">làn cổng</span>
          </div>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3">
          <div className="text-[10px] text-[#8b949e] font-semibold uppercase tracking-wider">Barrier Đang Nâng (Open)</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-[#3fb950] tabular-nums">{metrics.openGates}</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-[#3fb950]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-ping" />
              Đang lưu thông
            </span>
          </div>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3">
          <div className="text-[10px] text-[#8b949e] font-semibold uppercase tracking-wider">Barrier Đang Hạ (Nominal)</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-white tabular-nums">{metrics.closedGates}</span>
            <span className="text-[10px] text-[#8b949e]">sẵn sàng</span>
          </div>
        </div>

        {/* Incident Alert Metric Card - Interactive Click to open drawer */}
        <div
          onClick={() => setIsIncidentsDrawerOpen(true)}
          className={`rounded-xl p-3 border cursor-pointer transition-all ${
            metrics.stuckGates > 0 || metrics.offlineGates > 0
              ? 'bg-[#f85149]/10 border-[#f85149]/40 hover:bg-[#f85149]/15'
              : metrics.warningGates > 0 || metrics.lockedGates > 0
              ? 'bg-[#161b22] border-[#30363d] hover:border-[#d29922]/50'
              : 'bg-[#161b22] border-[#30363d]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8b949e]">Sự Cố & Cảnh Báo</div>
            {(metrics.stuckGates > 0 || metrics.offlineGates > 0) && (
              <span className="w-2 h-2 rounded-full bg-[#f85149] animate-ping" />
            )}
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`text-xl font-bold font-mono tabular-nums ${
              metrics.stuckGates > 0 ? 'text-[#f85149]' : metrics.offlineGates > 0 ? 'text-[#e3b341]' : 'text-white'
            }`}>
              {metrics.stuckGates + metrics.offlineGates + metrics.warningGates}
            </span>
            <span className="text-[10px] font-mono text-[#f85149]">
              {metrics.stuckGates > 0 ? `${metrics.stuckGates} kẹt` : ''}
              {metrics.stuckGates > 0 && metrics.offlineGates > 0 ? ' · ' : ''}
              {metrics.offlineGates > 0 ? `${metrics.offlineGates} off` : ''}
              {metrics.stuckGates === 0 && metrics.offlineGates === 0 ? 'Ổn định' : ''}
            </span>
          </div>
        </div>

        {/* ML Heuristic Anomaly Stat Card */}
        <div
          onClick={() => {
            if (anomalies.length > 0) {
              setSelectedAnomaly(anomalies[0]);
              setIsAnomalyInspectorOpen(true);
            } else {
              handleTriggerBurstAnomaly();
            }
          }}
          className={`rounded-xl p-3 border cursor-pointer transition-all ${
            anomalies.length > 0
              ? 'bg-purple-950/30 border-purple-500/60 hover:bg-purple-950/40 shadow-lg shadow-purple-950/30'
              : 'bg-[#161b22] border-[#30363d] hover:border-purple-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-purple-300 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" />
              ML Heuristic
            </div>
            {anomalies.length > 0 ? (
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
            ) : (
              <span className="text-[10px] text-emerald-400 font-mono">Nominal</span>
            )}
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`text-xl font-bold font-mono tabular-nums ${anomalies.length > 0 ? 'text-purple-300' : 'text-slate-200'}`}>
              {anomalies.length} Dị Thường
            </span>
            <span className="text-[10px] font-mono text-purple-400">
              {anomalies.length > 0 ? `${anomalies[0].features.currentReqPerMin} req/m` : 'Học máy AI'}
            </span>
          </div>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3">
          <div className="text-[10px] text-[#8b949e] font-semibold uppercase tracking-wider">Sức Chứa Đỗ Xe</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-bold font-mono text-[#e6edf3] tabular-nums">{metrics.occupancyRate}%</span>
            <span className="text-[10px] text-[#8b949e] font-mono">{metrics.totalOccupancy}/{metrics.totalCapacity}</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. CONTROL TOOLBAR & FILTER BAR */}
      {/* ========================================================================= */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* View Mode Toggle & ML Overlay Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[#0d1117] p-1 rounded-xl border border-[#30363d]">
              <button
                onClick={() => setViewMode('d3-map')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  viewMode === 'd3-map'
                    ? 'bg-[#21262d] text-[#58a6ff] shadow-xs'
                    : 'text-[#8b949e] hover:text-[#c9d1d9]'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Bản đồ Tương tác D3.js</span>
              </button>

              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-[#21262d] text-[#58a6ff] shadow-xs'
                    : 'text-[#8b949e] hover:text-[#c9d1d9]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Bố cục Lưới Trực quan</span>
              </button>
            </div>

            {/* ML Anomaly Overlay Toggle */}
            <button
              onClick={() => setIsMlAnomalyOverlayEnabled(!isMlAnomalyOverlayEnabled)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
                isMlAnomalyOverlayEnabled
                  ? 'bg-purple-600/20 border-purple-500/60 text-purple-300 shadow-md shadow-purple-950/30'
                  : 'bg-[#0d1117] border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
              title="Bật/Tắt Lớp phủ trực quan dị thường Heuristic Machine Learning"
            >
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              <span>Lớp Phủ ML Anomaly</span>
              {anomalies.length > 0 && (
                <span className="px-1.5 py-0.2 bg-purple-500 text-white rounded-full text-[10px] font-bold">
                  {anomalies.length}
                </span>
              )}
            </button>
          </div>

          {/* Real-time Alerts Badge & Incident Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Incident Notification Badge Button */}
            <button
              onClick={() => setIsIncidentsDrawerOpen(true)}
              className={`relative flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                metrics.stuckGates > 0 || metrics.offlineGates > 0
                  ? 'bg-[#f85149]/15 hover:bg-[#f85149]/25 border-[#f85149]/40 text-white shadow-md shadow-red-950/20'
                  : 'bg-[#0d1117] hover:bg-[#21262d] border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
            >
              {metrics.stuckGates > 0 || metrics.offlineGates > 0 ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f85149] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#f85149]"></span>
                  </span>
                  <ShieldAlert className="w-3.5 h-3.5 text-[#f85149]" />
                  <span className="font-mono tabular-nums font-bold text-red-300">
                    {metrics.stuckGates + metrics.offlineGates} Cảnh Báo
                  </span>
                  <span className="text-[10px] text-red-200/70 font-normal hidden sm:inline">
                    ({metrics.stuckGates > 0 ? `${metrics.stuckGates} Kẹt` : ''}
                    {metrics.stuckGates > 0 && metrics.offlineGates > 0 ? ' · ' : ''}
                    {metrics.offlineGates > 0 ? `${metrics.offlineGates} Off` : ''})
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#3fb950]" />
                  <span>0 Cảnh Báo Sự Cố</span>
                </>
              )}
            </button>

            {/* Audio Chime Toggle */}
            <button
              onClick={() => {
                const nextMuted = !isAudioMuted;
                setIsAudioMuted(nextMuted);
                if (isAudioMuted) {
                  playAlertSound('STUCK');
                }
              }}
              title={isAudioMuted ? 'Bật âm thanh chuông cảnh báo' : 'Tắt âm thanh chuông cảnh báo'}
              className={`p-1.5 rounded-xl border transition-colors cursor-pointer text-xs ${
                isAudioMuted
                  ? 'bg-[#0d1117] border-[#30363d] text-[#8b949e] hover:text-white'
                  : 'bg-[#58a6ff]/15 border-[#58a6ff]/30 text-[#58a6ff] hover:bg-[#58a6ff]/25'
              }`}
            >
              {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Incident & ML Simulation Buttons */}
            <div className="flex items-center gap-1 bg-[#0d1117] p-1 rounded-xl border border-[#30363d]">
              <button
                onClick={() => triggerStuckBarrierAlert()}
                title="Kích hoạt sự cố kẹt cần barrier để kiểm tra chuông và toast"
                className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#f85149]/15 hover:bg-[#f85149]/25 text-[#f85149] border border-[#f85149]/30 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Flame className="w-3 h-3" />
                <span>Test Kẹt</span>
              </button>
              <button
                onClick={() => triggerOfflineBarrierAlert()}
                title="Kích hoạt sự cố mất kết nối telemetry"
                className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#e3b341]/15 hover:bg-[#e3b341]/25 text-[#e3b341] border border-[#e3b341]/30 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <WifiOff className="w-3 h-3" />
                <span>Test Off</span>
              </button>
              <button
                onClick={() => handleTriggerBurstAnomaly()}
                title="Kích hoạt mô phỏng tần suất truy cập bất thường ML (Burst flood / Tailgating / Replay attack)"
                className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Zap className="w-3 h-3 text-purple-400" />
                <span>Test ML Burst</span>
              </button>
              {(metrics.stuckGates > 0 || metrics.offlineGates > 0 || alerts.length > 0) && (
                <button
                  onClick={() => resolveAllIncidents()}
                  title="Khắc phục tất cả sự cố kẹt cần và offline"
                  className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#3fb950]/15 hover:bg-[#3fb950]/25 text-[#3fb950] border border-[#3fb950]/30 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Khắc Phục</span>
                </button>
              )}
            </div>

            {/* Live Telemetry Stream Toggle */}
            <Button
              variant={isLiveTelemetryActive ? 'secondary' : 'outline'}
              size="sm"
              icon={isLiveTelemetryActive ? Pause : Play}
              onClick={() => setIsLiveTelemetryActive(!isLiveTelemetryActive)}
              className="text-xs shrink-0 cursor-pointer"
            >
              {isLiveTelemetryActive ? 'Tạm dừng Stream' : 'Bật Live Telemetry'}
            </Button>
          </div>
        </div>

        {/* Filter Rows */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-[#30363d]">
          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]" />
            <input
              type="text"
              placeholder="Tìm theo tên cơ sở, mã cổng, địa chỉ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#c9d1d9] placeholder-[#8b949e] focus:outline-hidden focus:border-[#58a6ff]"
            />
          </div>

          {/* Tenant Select */}
          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-[#c9d1d9] focus:outline-hidden focus:border-[#58a6ff] cursor-pointer"
          >
            <option value="ALL">Tất cả Doanh Nghiệp (All Tenants)</option>
            {tenantOptions.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {/* Barrier Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-[#c9d1d9] focus:outline-hidden focus:border-[#58a6ff] cursor-pointer"
          >
            <option value="ALL">Mọi trạng thái Barrier (Tất cả)</option>
            <option value="STUCK">🚨 Barrier kẹt cần (STUCK)</option>
            <option value="OFFLINE">⚠️ Mất kết nối telemetry (OFFLINE)</option>
            <option value="OPEN">Barrier đang nâng (OPEN)</option>
            <option value="CLOSED">Barrier đang hạ (CLOSED)</option>
            <option value="WARNING">Có cảnh báo / Lỗi cảm biến</option>
            <option value="LOCKED">Đang khóa cưỡng bức</option>
          </select>

          {/* Region Quick Jump */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleRegionJump('ALL')}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer text-center ${
                regionFilter === 'ALL' ? 'bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/30' : 'bg-[#0d1117] text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
            >
              Toàn quốc
            </button>
            <button
              onClick={() => handleRegionJump('NORTH')}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer text-center ${
                regionFilter === 'NORTH' ? 'bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/30' : 'bg-[#0d1117] text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
            >
              Bắc
            </button>
            <button
              onClick={() => handleRegionJump('CENTRAL')}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer text-center ${
                regionFilter === 'CENTRAL' ? 'bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/30' : 'bg-[#0d1117] text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
            >
              Trung
            </button>
            <button
              onClick={() => handleRegionJump('SOUTH')}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer text-center ${
                regionFilter === 'SOUTH' ? 'bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/30' : 'bg-[#0d1117] text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
            >
              Nam
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN CONTENT: D3.JS MAP VIEW OR GRID LAYOUT */}
      {/* ========================================================================= */}
      {viewMode === 'd3-map' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left/Center: Interactive D3.js SVG Map Canvas */}
          <div className="lg:col-span-8 bg-[#0d1117] border border-[#30363d] rounded-2xl p-4 relative overflow-hidden flex flex-col justify-between min-h-[580px]">
            {/* Map Floating Controls */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-[#161b22]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#30363d] text-xs shadow-lg">
              <span className="w-2 h-2 rounded-full bg-[#3fb950] animate-pulse" />
              <span className="font-semibold text-white">Bản Đồ Tactical Telemetry</span>
              <span className="text-[#8b949e]">· D3 Vector Engine</span>
            </div>

            {/* Zoom Controls */}
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-1 bg-[#161b22]/90 backdrop-blur-md p-1 rounded-xl border border-[#30363d] shadow-lg">
              <button
                onClick={handleZoomIn}
                title="Phóng to"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#c9d1d9] hover:bg-[#21262d] hover:text-white transition-colors cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleZoomOut}
                title="Thu nhỏ"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#c9d1d9] hover:bg-[#21262d] hover:text-white transition-colors cursor-pointer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={handleResetZoom}
                title="Đặt lại góc nhìn"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#c9d1d9] hover:bg-[#21262d] hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* D3 SVG Element */}
            <div className="w-full flex-1 flex items-center justify-center overflow-hidden">
              <svg
                ref={svgRef}
                viewBox="0 0 600 700"
                className="w-full h-full max-h-[560px] select-none"
              />
            </div>

            {/* Map Legend */}
            <div className="border-t border-[#30363d] pt-3 mt-2 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#8b949e]">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3fb950]" />
                  <span>Hoạt động bình thường</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#e3b341]" />
                  <span>Cảnh báo / Độ trễ cao</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#f85149]" />
                  <span>Khóa khẩn cấp / Mất kết nối</span>
                </span>
              </div>
              <span className="text-[10px] font-mono">Dùng con lăn chuột để zoom, giữ chuột trái để di chuyển bản đồ</span>
            </div>
          </div>

          {/* Right: Selected Site Detailed Barrier Gates & Telemetry Drawer */}
          <div className="lg:col-span-4 space-y-4">
            {activeSelectedSite ? (
              <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 space-y-4 animate-in fade-in duration-200">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-[#30363d] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-sm">{activeSelectedSite.name}</h3>
                      <Badge
                        variant={activeSelectedSite.overallHealth === 'HEALTHY' ? 'emerald' : activeSelectedSite.overallHealth === 'WARNING' ? 'amber' : 'red'}
                        size="sm"
                      >
                        {activeSelectedSite.overallHealth}
                      </Badge>
                    </div>
                    <p className="text-xs text-[#8b949e] mt-0.5">{activeSelectedSite.address}</p>
                    <div className="text-[10px] text-[#58a6ff] font-medium mt-1">
                      {activeSelectedSite.tenantName} · Gateway: {activeSelectedSite.edgeGatewayId} ({activeSelectedSite.edgeLatencyMs}ms)
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedSiteId(null)}
                    className="p-1 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Gates Overview for this site */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#e6edf3]">Danh Sách Barrier ({activeSelectedSite.gates.length} làn)</span>
                    <span className="font-mono text-[#3fb950] font-bold">
                      {activeSelectedSite.openGateCount} Đang Nâng
                    </span>
                  </div>

                  {activeSelectedSite.gates.map(gate => {
                    const isStuck = gate.status === 'STUCK';
                    const isOffline = gate.health === 'OFFLINE';

                    return (
                      <div
                        key={gate.id}
                        className={`bg-[#0d1117] border rounded-xl p-3.5 space-y-3 transition-colors ${
                          isStuck
                            ? 'border-[#f85149]/60 shadow-xs shadow-red-950/30'
                            : isOffline
                            ? 'border-[#e3b341]/60'
                            : 'border-[#30363d] hover:border-[#58a6ff]/40'
                        }`}
                      >
                        {/* Gate Top Info */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${
                              isStuck ? 'bg-[#f85149] animate-ping' : isOffline ? 'bg-[#e3b341]' : gate.status === 'OPEN' ? 'bg-[#3fb950] animate-ping' : gate.status === 'LOCKED' ? 'bg-[#f85149]' : 'bg-[#58a6ff]'
                            }`} />
                            <span className="font-bold text-xs text-white">{gate.name}</span>
                          </div>
                          <Badge
                            variant={isStuck ? 'red' : isOffline ? 'amber' : gate.status === 'OPEN' ? 'emerald' : gate.status === 'LOCKED' ? 'red' : 'blue'}
                            size="sm"
                            dot={isStuck || isOffline}
                          >
                            {isStuck ? 'KẸT CẦN (STUCK)' : isOffline ? 'MẤT KẾT NỐI (OFFLINE)' : gate.status === 'OPEN' ? 'CẦN NÂNG' : gate.status === 'LOCKED' ? 'KHÓA' : 'CẦN HẠ'}
                          </Badge>
                        </div>

                        {/* Barrier Visual Arm Diagram */}
                        <div className="bg-[#161b22] rounded-lg p-2.5 flex items-center justify-between border border-[#30363d]/60">
                          {/* Mechanical Arm Schema */}
                          <div className="flex items-center gap-3">
                            <div className="relative w-12 h-10 bg-[#0d1117] rounded-md border border-[#30363d] flex items-end justify-center pb-1">
                              {/* Motor base */}
                              <div className="w-3.5 h-6 bg-slate-600 rounded-t-sm relative">
                                <span className={`w-1.5 h-1.5 rounded-full absolute -top-1 left-1 ${
                                  isStuck ? 'bg-[#f85149] animate-ping' : gate.status === 'OPEN' ? 'bg-[#3fb950]' : gate.status === 'LOCKED' ? 'bg-[#f85149]' : 'bg-[#e3b341]'
                                }`} />
                              </div>
                              {/* Barrier Arm */}
                              <div
                                className="absolute w-8 h-1 rounded-full origin-left transition-transform duration-500"
                                style={{
                                  left: '20px',
                                  bottom: '16px',
                                  transform: `rotate(-${gate.armAngleDeg}deg)`,
                                  background: isStuck || gate.status === 'LOCKED'
                                    ? 'repeating-linear-gradient(45deg, #f85149, #f85149 4px, #ffffff 4px, #ffffff 8px)'
                                    : 'repeating-linear-gradient(45deg, #e3b341, #e3b341 4px, #ffffff 4px, #ffffff 8px)'
                                }}
                              />
                            </div>

                            <div className="text-[11px] space-y-0.5">
                              <div className="text-[#8b949e]">Góc mở: <span className={`font-mono font-bold ${isStuck ? 'text-[#f85149]' : 'text-white'}`}>{gate.armAngleDeg}°</span></div>
                              <div className="text-[#8b949e]">Vòng quay hôm nay: <span className="text-[#58a6ff] font-mono tabular-nums">{gate.dailyCycles}</span></div>
                            </div>
                          </div>

                          {/* ANPR & Loop Detector indicators */}
                          <div className="text-right text-[10px] space-y-1">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-[#8b949e]">Vòng từ (Loop):</span>
                              <span className={`px-1.5 py-0.2 rounded font-mono ${gate.loopDetectorActive ? 'bg-[#3fb950]/20 text-[#3fb950]' : 'bg-[#21262d] text-[#8b949e]'}`}>
                                {gate.loopDetectorActive ? 'CÓ XE' : 'TRỐNG'}
                              </span>
                            </div>
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-[#8b949e]">Xe gần nhất:</span>
                              <span className="font-mono font-bold text-white">{gate.lastPlate}</span>
                            </div>
                          </div>
                        </div>

                        {/* Warnings or Stuck Notes */}
                        {isStuck && (
                          <div className="text-[10px] p-2 rounded bg-red-500/10 border border-red-500/30 text-red-300 flex items-start gap-1.5">
                            <AlertOctagon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#f85149]" />
                            <span>Phát hiện cần dừng tại góc {gate.armAngleDeg}°. Motor rơ-le ngắt quá dòng. Nhấn Reset Rơ-le hoặc Nâng Cưỡng Bức.</span>
                          </div>
                        )}

                        {isOffline && (
                          <div className="text-[10px] p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-1.5">
                            <WifiOff className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#e3b341]" />
                            <span>Mất tín hiệu telemetry từ Edge Gateway. Đang thử kết nối lại heartbeat...</span>
                          </div>
                        )}

                        {!isStuck && !isOffline && gate.warningNote && (
                          <div className="text-[10px] p-2 rounded bg-[#d29922]/10 border border-[#d29922]/30 text-[#e3b341] flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{gate.warningNote}</span>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="grid grid-cols-3 gap-1.5 pt-1">
                          {isStuck ? (
                            <>
                              <button
                                onClick={() => {
                                  const matching = alerts.find(a => a.gateId === gate.id);
                                  if (matching) resolveBarrierIncident(matching.id, 'REBOOT');
                                  else handleToggleBarrierArm(activeSelectedSite.id, gate.id, 'CLOSE');
                                }}
                                className="py-1 px-2 rounded-lg bg-[#3fb950]/20 hover:bg-[#3fb950]/30 text-[#3fb950] border border-[#3fb950]/30 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                              >
                                <Power className="w-3.5 h-3.5" />
                                <span>Reset Rơ-le</span>
                              </button>

                              <button
                                onClick={() => {
                                  const matching = alerts.find(a => a.gateId === gate.id);
                                  if (matching) resolveBarrierIncident(matching.id, 'FORCE_OPEN');
                                  else handleToggleBarrierArm(activeSelectedSite.id, gate.id, 'OPEN');
                                }}
                                className="py-1 px-2 rounded-lg bg-[#58a6ff]/20 hover:bg-[#58a6ff]/30 text-[#58a6ff] border border-[#58a6ff]/30 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                              >
                                <ArrowUpRight className="w-3.5 h-3.5" />
                                <span>Nâng Ép</span>
                              </button>
                            </>
                          ) : isOffline ? (
                            <>
                              <button
                                onClick={() => {
                                  const matching = alerts.find(a => a.gateId === gate.id);
                                  if (matching) resolveBarrierIncident(matching.id, 'REBOOT');
                                  else handleToggleBarrierArm(activeSelectedSite.id, gate.id, 'OPEN');
                                }}
                                className="py-1 px-2 rounded-lg bg-[#58a6ff]/20 hover:bg-[#58a6ff]/30 text-[#58a6ff] border border-[#58a6ff]/30 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Re-link</span>
                              </button>

                              <button
                                onClick={() => handleEmergencyLock(activeSelectedSite.id, gate.id)}
                                className="py-1 px-2 rounded-lg bg-[#f85149]/20 hover:bg-[#f85149]/30 text-[#f85149] border border-[#f85149]/30 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                              >
                                <Lock className="w-3.5 h-3.5" />
                                <span>Khóa</span>
                              </button>
                            </>
                          ) : gate.status === 'OPEN' ? (
                            <button
                              onClick={() => handleToggleBarrierArm(activeSelectedSite.id, gate.id, 'CLOSE')}
                              className="py-1 px-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                            >
                              <ArrowDownRight className="w-3.5 h-3.5 text-[#58a6ff]" />
                              <span>Hạ Cần</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleBarrierArm(activeSelectedSite.id, gate.id, 'OPEN')}
                              className="py-1 px-2 rounded-lg bg-[#3fb950]/20 hover:bg-[#3fb950]/30 text-[#3fb950] border border-[#3fb950]/30 text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                            >
                              <ArrowUpRight className="w-3.5 h-3.5" />
                              <span>Nâng Cần</span>
                            </button>
                          )}

                          {!isStuck && !isOffline && (
                            <button
                              onClick={() => handleEmergencyLock(activeSelectedSite.id, gate.id)}
                              className={`py-1 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                                gate.status === 'LOCKED'
                                  ? 'bg-[#3fb950]/20 hover:bg-[#3fb950]/30 text-[#3fb950] border border-[#3fb950]/30'
                                  : 'bg-[#f85149]/20 hover:bg-[#f85149]/30 text-[#f85149] border border-[#f85149]/30'
                              }`}
                            >
                              {gate.status === 'LOCKED' ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                              <span>{gate.status === 'LOCKED' ? 'Gỡ Khóa' : 'Khóa'}</span>
                            </button>
                          )}

                          <button
                            onClick={() => setSelectedGate(gate)}
                            className="py-1 px-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] hover:text-white text-[11px] font-medium flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Chi Tiết</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 text-center space-y-3 flex flex-col items-center justify-center min-h-[380px]">
                <div className="w-12 h-12 rounded-full bg-[#21262d] border border-[#30363d] flex items-center justify-center text-[#58a6ff]">
                  <MapPin className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">Chưa Chọn Cơ Sở Nào</h4>
                  <p className="text-xs text-[#8b949e] mt-1 max-w-xs">
                    Nhấp vào một điểm ghim trên bản đồ D3.js bên trái hoặc danh sách bên dưới để xem trực quan các cần barrier và gửi lệnh điều khiển.
                  </p>
                </div>
                {filteredSites.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSiteId(filteredSites[0].id)}
                    className="text-xs mt-2"
                  >
                    Chọn cơ sở đầu tiên: {filteredSites[0].name}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* 4. HIGH-DENSITY GRID LAYOUT VIEW */
        /* ========================================================================= */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSites.map(site => {
            const siteHasStuck = site.gates.some(g => g.status === 'STUCK');
            const siteHasOffline = site.overallHealth === 'OFFLINE' || site.gates.some(g => g.health === 'OFFLINE');

            return (
              <div
                key={site.id}
                className={`bg-[#161b22] border rounded-2xl p-5 space-y-4 transition-all flex flex-col justify-between ${
                  siteHasStuck
                    ? 'border-[#f85149]/60 shadow-lg shadow-red-950/20'
                    : siteHasOffline
                    ? 'border-[#e3b341]/60 shadow-lg shadow-amber-950/20'
                    : 'border-[#30363d] hover:border-[#58a6ff]/40'
                }`}
              >
                {/* Site Card Header */}
                <div className="space-y-1.5 border-b border-[#30363d] pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={siteHasStuck ? 'red' : siteHasOffline ? 'amber' : site.overallHealth === 'HEALTHY' ? 'emerald' : 'amber'}
                        size="sm"
                        dot
                      >
                        {siteHasStuck ? 'CÓ SỰ CỐ KẸT' : siteHasOffline ? 'OFFLINE' : site.overallHealth}
                      </Badge>
                      {siteHasStuck && (
                        <span className="text-[10px] text-[#f85149] font-mono animate-pulse">🚨 CẦN XỬ LÝ</span>
                      )}
                    </div>
                    <span className="text-[10px] text-[#58a6ff] font-mono bg-[#21262d] px-2 py-0.5 rounded-md border border-[#30363d]">
                      {site.city}
                    </span>
                  </div>

                  <h3 className="font-bold text-white text-sm tracking-tight">{site.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-[#8b949e]">
                    <span>{site.tenantName}</span>
                    <span>·</span>
                    <span className="font-mono text-[#e6edf3]">{site.currentOccupancy}/{site.capacity} xe</span>
                  </div>
                </div>

                {/* Barrier Gates Grid inside this Site */}
                <div className="space-y-2.5 flex-1">
                  <div className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-wider flex items-center justify-between">
                    <span>Trạng thái Làn Barrier</span>
                    <span className="font-mono text-[#3fb950] font-bold">{site.openGateCount}/{site.totalGateCount} Mở</span>
                  </div>

                  <div className="space-y-2">
                    {site.gates.map(gate => {
                      const isStuck = gate.status === 'STUCK';
                      const isOffline = gate.health === 'OFFLINE';

                      return (
                        <div
                          key={gate.id}
                          className={`bg-[#0d1117] border rounded-xl p-3 space-y-2.5 transition-colors ${
                            isStuck
                              ? 'border-[#f85149]/60 shadow-xs shadow-red-950/30'
                              : isOffline
                              ? 'border-[#e3b341]/60'
                              : 'border-[#30363d]'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${
                                isStuck ? 'bg-[#f85149] animate-ping' : isOffline ? 'bg-[#e3b341]' : gate.status === 'OPEN' ? 'bg-[#3fb950] animate-ping' : gate.status === 'LOCKED' ? 'bg-[#f85149]' : 'bg-[#58a6ff]'
                              }`} />
                              <span className="font-bold text-white text-[11px]">{gate.name}</span>
                            </div>
                            <Badge
                              variant={isStuck ? 'red' : isOffline ? 'amber' : gate.status === 'OPEN' ? 'emerald' : gate.status === 'LOCKED' ? 'red' : 'blue'}
                              size="sm"
                              dot={isStuck || isOffline}
                            >
                              {isStuck ? 'KẸT CẦN' : isOffline ? 'OFFLINE' : gate.status === 'OPEN' ? 'NÂNG' : gate.status === 'LOCKED' ? 'KHÓA' : 'HẠ'}
                            </Badge>
                          </div>

                          {/* Micro Visual Status Bar */}
                          <div className="flex items-center justify-between text-[10px] text-[#8b949e] bg-[#161b22] px-2.5 py-1.5 rounded-lg border border-[#30363d]/50">
                            <div className="flex items-center gap-1.5">
                              <span>Góc cần:</span>
                              <span className={`font-mono font-bold ${isStuck ? 'text-[#f85149]' : 'text-white'}`}>{gate.armAngleDeg}°</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span>Xe gần nhất:</span>
                              <span className="font-mono text-[#58a6ff] font-semibold">{gate.lastPlate}</span>
                            </div>
                          </div>

                          {/* Quick controls */}
                          <div className="grid grid-cols-3 gap-1 pt-1">
                            {isStuck ? (
                              <>
                                <button
                                  onClick={() => {
                                    const matching = alerts.find(a => a.gateId === gate.id);
                                    if (matching) resolveBarrierIncident(matching.id, 'REBOOT');
                                    else handleToggleBarrierArm(site.id, gate.id, 'CLOSE');
                                  }}
                                  className="py-1 px-1.5 rounded-md bg-[#3fb950]/20 text-[#3fb950] hover:bg-[#3fb950]/30 border border-[#3fb950]/30 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Power className="w-3 h-3" />
                                  <span>Reset</span>
                                </button>
                                <button
                                  onClick={() => {
                                    const matching = alerts.find(a => a.gateId === gate.id);
                                    if (matching) resolveBarrierIncident(matching.id, 'FORCE_OPEN');
                                    else handleToggleBarrierArm(site.id, gate.id, 'OPEN');
                                  }}
                                  className="py-1 px-1.5 rounded-md bg-[#58a6ff]/20 text-[#58a6ff] hover:bg-[#58a6ff]/30 border border-[#58a6ff]/30 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                >
                                  <ArrowUpRight className="w-3 h-3" />
                                  <span>Nâng Ép</span>
                                </button>
                                <button
                                  onClick={() => setSelectedGate(gate)}
                                  className="py-1 px-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] text-[10px] font-medium flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Xem Lỗi</span>
                                </button>
                              </>
                            ) : isOffline ? (
                              <>
                                <button
                                  onClick={() => {
                                    const matching = alerts.find(a => a.gateId === gate.id);
                                    if (matching) resolveBarrierIncident(matching.id, 'REBOOT');
                                    else handleToggleBarrierArm(site.id, gate.id, 'OPEN');
                                  }}
                                  className="py-1 px-1.5 rounded-md bg-[#58a6ff]/20 text-[#58a6ff] hover:bg-[#58a6ff]/30 border border-[#58a6ff]/30 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  <span>Re-link</span>
                                </button>
                                <button
                                  onClick={() => handleEmergencyLock(site.id, gate.id)}
                                  className="py-1 px-1.5 rounded-md bg-[#f85149]/20 text-[#f85149] hover:bg-[#f85149]/30 border border-[#f85149]/30 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Lock className="w-3 h-3" />
                                  <span>Khóa</span>
                                </button>
                                <button
                                  onClick={() => setSelectedGate(gate)}
                                  className="py-1 px-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] text-[10px] font-medium flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Chi Tiết</span>
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleToggleBarrierArm(site.id, gate.id, gate.status === 'OPEN' ? 'CLOSE' : 'OPEN')}
                                  className={`py-1 px-1.5 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                                    gate.status === 'OPEN'
                                      ? 'bg-[#21262d] text-white hover:bg-[#30363d]'
                                      : 'bg-[#3fb950]/20 text-[#3fb950] hover:bg-[#3fb950]/30 border border-[#3fb950]/30'
                                  }`}
                                >
                                  {gate.status === 'OPEN' ? 'Hạ cần' : 'Nâng cần'}
                                </button>

                                <button
                                  onClick={() => handleEmergencyLock(site.id, gate.id)}
                                  className={`py-1 px-1.5 rounded-md text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                                    gate.status === 'LOCKED'
                                      ? 'bg-[#3fb950]/20 text-[#3fb950] hover:bg-[#3fb950]/30 border border-[#3fb950]/30'
                                      : 'bg-[#f85149]/20 text-[#f85149] hover:bg-[#f85149]/30 border border-[#f85149]/30'
                                  }`}
                                >
                                  {gate.status === 'LOCKED' ? 'Gỡ khóa' : 'Khóa'}
                                </button>

                                <button
                                  onClick={() => handleSimulatePassage(site.id, gate.id)}
                                  className="py-1 px-1.5 rounded-md bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] text-[10px] font-medium flex items-center justify-center gap-1 cursor-pointer transition-colors"
                                >
                                  <Car className="w-3 h-3 text-[#58a6ff]" />
                                  <span>Xe qua</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              {/* Site Footer Actions */}
              <div className="border-t border-[#30363d] pt-3 flex items-center justify-between text-xs">
                <span className="text-[11px] text-[#8b949e]">
                  Edge Gateway: <span className="font-mono text-[#58a6ff]">{site.edgeLatencyMs}ms</span>
                </span>
                <button
                  onClick={() => {
                    setSelectedSiteId(site.id);
                    setViewMode('d3-map');
                  }}
                  className="text-xs text-[#58a6ff] hover:text-[#79c0ff] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>Xem trên Bản đồ</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    )}

      {/* ========================================================================= */}
      {/* 5. INDIVIDUAL GATE HARDWARE DIAGNOSTICS MODAL */}
      {/* ========================================================================= */}
      {selectedGate && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-start justify-between border-b border-[#30363d] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">{selectedGate.name}</h3>
                  <Badge
                    variant={selectedGate.status === 'STUCK' ? 'red' : selectedGate.health === 'OFFLINE' ? 'amber' : selectedGate.status === 'OPEN' ? 'emerald' : selectedGate.status === 'LOCKED' ? 'red' : 'blue'}
                    dot={selectedGate.status === 'STUCK' || selectedGate.health === 'OFFLINE'}
                  >
                    {selectedGate.status === 'STUCK' ? 'KẸT CẦN (STUCK)' : selectedGate.health === 'OFFLINE' ? 'OFFLINE' : selectedGate.status}
                  </Badge>
                </div>
                <p className="text-xs text-[#8b949e] mt-1 font-mono">{selectedGate.code} · {selectedGate.siteName}</p>
              </div>

              <button
                onClick={() => setSelectedGate(null)}
                className="p-1 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Incident Alert Callout if Stuck or Offline */}
            {selectedGate.status === 'STUCK' && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs space-y-2">
                <div className="flex items-center gap-2 text-[#f85149] font-bold">
                  <AlertOctagon className="w-4 h-4 animate-pulse" />
                  <span>SỰ CỐ CƠ HỌC: CẦN BARRIER BỊ KẸT TẠI {selectedGate.armAngleDeg}°</span>
                </div>
                <p className="text-red-200/90 text-[11px] leading-relaxed">
                  Cảm biến vị trí trục khuỷu phát hiện tay cần dừng bất thường khi rơ-le đang đóng. Rơ-le quá tải đã tự ngắt để bảo vệ cuộn dây động cơ servo.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => {
                      const alert = alerts.find(a => a.gateId === selectedGate.id);
                      if (alert) resolveBarrierIncident(alert.id, 'REBOOT');
                      setSelectedGate(null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#3fb950] hover:bg-[#2ea043] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>Reset Rơ-le & Căn Chỉnh Vị Trí Cần</span>
                  </button>
                  <button
                    onClick={() => {
                      const alert = alerts.find(a => a.gateId === selectedGate.id);
                      if (alert) resolveBarrierIncident(alert.id, 'FORCE_OPEN');
                      setSelectedGate(null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#58a6ff]/20 hover:bg-[#58a6ff]/30 text-[#58a6ff] border border-[#58a6ff]/30 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Nâng Cưỡng Bức</span>
                  </button>
                </div>
              </div>
            )}

            {selectedGate.health === 'OFFLINE' && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
                <div className="flex items-center gap-2 text-[#e3b341] font-bold">
                  <WifiOff className="w-4 h-4 animate-pulse" />
                  <span>CẢNH BÁO MẤT TÍN HIỆU TELEMETRY (EDGE OFFLINE)</span>
                </div>
                <p className="text-amber-200/90 text-[11px] leading-relaxed">
                  Không nhận được gói tin MQTT telemetry và luồng RTSP camera trong hơn 15 giây.
                </p>
                <div className="pt-1">
                  <button
                    onClick={() => {
                      const alert = alerts.find(a => a.gateId === selectedGate.id);
                      if (alert) resolveBarrierIncident(alert.id, 'REBOOT');
                      setSelectedGate(null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#e3b341] hover:bg-[#d29922] text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Tái Khởi Động Telemetry Socket</span>
                  </button>
                </div>
              </div>
            )}

            {/* Hardware Telemetry Parameters */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[#0d1117] p-3 rounded-xl border border-[#30363d]">
                <span className="text-[#8b949e] block text-[10px] uppercase font-semibold">Cơ cấu Truyền động</span>
                <span className="text-white font-bold font-mono text-sm mt-0.5 block">{selectedGate.barrierType}</span>
                <span className="text-[10px] text-[#3fb950] mt-1 block">Tốc độ nâng: 0.6s servo</span>
              </div>

              <div className="bg-[#0d1117] p-3 rounded-xl border border-[#30363d]">
                <span className="text-[#8b949e] block text-[10px] uppercase font-semibold">Nhiệt độ Động cơ</span>
                <span className="text-white font-bold font-mono text-sm mt-0.5 block">{selectedGate.motorTempC} °C</span>
                <span className="text-[10px] text-[#8b949e] mt-1 block">Ngưỡng cảnh báo: 65°C</span>
              </div>

              <div className="bg-[#0d1117] p-3 rounded-xl border border-[#30363d]">
                <span className="text-[#8b949e] block text-[10px] uppercase font-semibold">Cảm biến Vòng từ (Loop Coil)</span>
                <span className={`font-mono font-bold text-sm mt-0.5 block ${selectedGate.loopDetectorActive ? 'text-[#3fb950]' : 'text-[#8b949e]'}`}>
                  {selectedGate.loopDetectorActive ? 'PHÁT HIỆN XE TRÊN VÒNG' : 'KHÔNG CÓ XE'}
                </span>
                <span className="text-[10px] text-[#8b949e] mt-1 block">Tần số: 38.2 kHz (Nominal)</span>
              </div>

              <div className="bg-[#0d1117] p-3 rounded-xl border border-[#30363d]">
                <span className="text-[#8b949e] block text-[10px] uppercase font-semibold">Nguồn Điện Hoạt Động</span>
                <span className="text-white font-bold font-mono text-sm mt-0.5 block">{selectedGate.powerSource}</span>
                <span className="text-[10px] text-[#58a6ff] mt-1 block">Pin UPS dự phòng: {selectedGate.upsBatteryPercent}%</span>
              </div>
            </div>

            {/* Last Vehicle Scan Preview */}
            <div className="bg-[#0d1117] p-4 rounded-xl border border-[#30363d] space-y-2">
              <span className="text-[10px] uppercase font-bold text-[#8b949e] tracking-wider block">Lượt xe quét gần nhất</span>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 bg-white text-slate-950 font-mono font-extrabold text-sm rounded border-2 border-slate-900 shadow-sm">
                    {selectedGate.lastPlate}
                  </div>
                  <div>
                    <div className="text-xs text-[#e6edf3] font-medium">Độ chính xác OCR: <span className="font-mono text-[#3fb950] font-bold">{(selectedGate.lastConfidence * 100).toFixed(1)}%</span></div>
                    <div className="text-[10px] text-[#8b949e]">Thời gian: {selectedGate.lastPassageTime}</div>
                  </div>
                </div>
                <Badge variant="emerald" size="sm">HỢP LỆ</Badge>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#30363d]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedGate(null)}
              >
                Đóng
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  handleSimulatePassage(selectedGate.siteId, selectedGate.id);
                  setSelectedGate(null);
                }}
              >
                Mô Phỏng Xe Qua Làn Này
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ML ANOMALY INSPECTOR DRAWER / MODAL */}
      {/* ========================================================================= */}
      <BarrierAnomalyInspector
        isOpen={isAnomalyInspectorOpen}
        anomaly={selectedAnomaly}
        onClose={() => setIsAnomalyInspectorOpen(false)}
        onMitigate={handleMitigateAnomaly}
      />
    </div>
  );
};
