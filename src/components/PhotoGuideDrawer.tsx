import React, { useState } from 'react';
import { Camera, ChevronDown, ChevronUp, CheckCircle2, Sparkles } from 'lucide-react';

interface PhotoPillar {
  title: string;
  countBadge: string;
  items: string[];
}

const PHOTO_PILLARS: PhotoPillar[] = [
  {
    title: '1. Exterior Walkaround',
    countBadge: '30–40 Photos',
    items: [
      '4 corner 3/4 profiles (front-left, front-right, rear-left, rear-right)',
      'Direct front, rear, and profile side views',
      'Wheels & tires (DOT date codes & remaining tread)',
      'Lighting elements (headlights, taillights & signals on/off)',
      'Trim, glass, weatherstripping & emblems'
    ]
  },
  {
    title: '2. Cabin & Cockpit',
    countBadge: '20–30 Photos',
    items: [
      'Front & rear seats (driver outer bolster close-up)',
      'Steering wheel, dashboard & switchgear',
      'Gauges & odometer cluster with engine running',
      'Center console, shifter & infotainment/radio',
      'Headliner, door sills & chassis jamb stickers',
      'Frunk/trunk with tools, compressor & spare tire'
    ]
  },
  {
    title: '3. Powertrain & Mechanical',
    countBadge: '10–15 Photos',
    items: [
      'Complete engine bay overview (both driver & passenger sides)',
      'Factory engine decals & warning stickers',
      'Engine & transmission serial number stampings',
      'Battery tray condition & wiring harness integrity',
      'Fluid reservoirs, belts, hoses & intake plumbing'
    ]
  },
  {
    title: '4. Undercarriage & Suspension',
    countBadge: '15–20 Photos',
    items: [
      'Lift/ramp shots showing front & rear suspension',
      'Steering rack, tie rods & sway bars',
      'Differential, transaxle & oil pan (dryness / leaks)',
      'Rocker seams & floor pans (checking for corrosion or damage)',
      'Complete exhaust system, catalytic converters & heat shields'
    ]
  },
  {
    title: '5. Transparency, Flaws & Paint Depth',
    countBadge: '10–15 Photos',
    items: [
      'Paint depth meter readings across metal panels',
      'Honest close-ups of stone chips, scratches & scuffs',
      'Curb rash on wheel rims & tire sidewall condition',
      'Leather wear, bolster creasing & carpet condition',
      'Prior bodywork repairs, repaint lines, or panel gap variations'
    ]
  }
];

export const PhotoGuideDrawer: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden mb-6 transition-all duration-300 shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between p-4 sm:p-5 text-left transition-colors hover:bg-slate-800/50 cursor-pointer focus:outline-none"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Camera className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm sm:text-base font-bold text-white truncate">
              📸 Collector Photography Guide & Recommended Shot List
            </h4>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              Expand for required angles, lighting tips, and resolution standards
            </p>
          </div>
        </div>
        <div className="text-slate-400 ml-3 shrink-0 transition-transform duration-200">
          {isOpen ? (
            <ChevronUp className="w-5 h-5 text-amber-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="p-5 pt-0 border-t border-slate-800/80">
          <div className="pt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PHOTO_PILLARS.map((pillar) => (
              <div
                key={pillar.title}
                className="bg-slate-800/80 border border-slate-700/60 rounded-lg p-4 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h5 className="font-bold text-white text-xs sm:text-sm">
                      {pillar.title}
                    </h5>
                    <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0">
                      {pillar.countBadge}
                    </span>
                  </div>
                  <ul className="space-y-2 text-xs text-slate-300">
                    {pillar.items.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {/* Pro Tips for Top Bids Banner */}
          <div className="mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-slate-200">
              <span className="font-bold text-amber-400 uppercase tracking-wide mr-1.5">
                Pro Tips for Top Bids:
              </span>
              Shoot in landscape (horizontal), during golden hour (early morning/late afternoon), on clean asphalt/neutral backdrop, with front wheels turned 45° toward the camera.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoGuideDrawer;
