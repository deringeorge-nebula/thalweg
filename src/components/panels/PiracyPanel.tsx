import React from 'react';
import { PiracyIncident } from '../../hooks/usePiracyData';

interface PiracyPanelProps {
  incident: PiracyIncident;
  onClose: () => void;
}

const ATTACK_COLOR_MAP: Record<string, string> = {
  HIJACKED: 'text-red-500',
  FIRED_UPON: 'text-orange-400',
  BOARDED: 'text-yellow-400',
  APPROACHED: 'text-blue-400',
  SUSPICIOUS: 'text-blue-400',
  ATTEMPTED: 'text-blue-400'
};

export default function PiracyPanel({ incident, onClose }: PiracyPanelProps) {
  // Safe date formatting
  const dateObj = new Date(incident.incident_date);
  const formattedDate = dateObj.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const attackColor = ATTACK_COLOR_MAP[incident.attack_type] || 'text-blue-400';
  
  // Convert enum to "Title Case Words" format
  const formattedAttack = incident.attack_type
    .toLowerCase()
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const areaString = incident.sub_area 
    ? `${incident.area} › ${incident.sub_area}` 
    : incident.area;

  return (
    <div className="absolute top-4 right-4 w-80 glass-panel border-glow bg-navy-950/95 p-4 z-50 rounded">
      
      {/* Header Row */}
      <div className="flex justify-between items-center mb-4">
        <div className="text-red-500 font-heading text-xs uppercase tracking-widest">
          ⚠ PIRACY INCIDENT
        </div>
        <button 
          onClick={onClose} 
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Attack Type Badge */}
      <div className={`w-full text-center py-1.5 rounded-full font-heading text-sm font-bold border border-glow mb-4 uppercase ${attackColor}`}>
        {formattedAttack}
      </div>

      {/* Data Fields */}
      <div className="flex flex-col gap-2 mb-4">
        <DataRow label="DATE" value={formattedDate} />
        <DataRow label="AREA" value={areaString} />
        <DataRow label="ATTACK" value={formattedAttack} />
        <DataRow label="VESSEL TYPE" value={incident.vessel_type ?? 'Unknown'} />
        <DataRow label="STATUS" value={incident.vessel_status ?? 'Unknown'} />
        <DataRow label="CREW" value={incident.crew_count ? `${incident.crew_count} aboard` : 'Unknown'} />
        <DataRow label="SOURCE" value={incident.source} />
        <DataRow label="COORDINATES" value={`${incident.lat.toFixed(3)}°, ${incident.lon.toFixed(3)}°`} />
      </div>

      {/* Description Block */}
      {incident.description && (
        <div className="bg-navy-900/50 rounded p-2 mb-4">
          <p className="text-gray-300 text-sm italic">
            {`"${incident.description}"`}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="text-gray-500 text-xs">
        Data: IMB Annual Report 2024 + ICC-CCS 2025 Q1
      </div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-gray-400 font-heading text-xs uppercase">{label}</span>
      <span className="text-white font-data text-xs text-right truncate" title={value}>
        {value}
      </span>
    </div>
  );
}
