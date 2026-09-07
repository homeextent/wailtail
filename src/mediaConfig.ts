import { MediaConfiguration } from './types';

/**
 * Media Configuration for WailTail Featured Single-Car Auction
 * You can replace any of the sample image URLs below with direct image URLs or Firebase Storage links.
 */
export const mediaConfig: MediaConfiguration = {
  siteLogo: '',
  siteName: 'wailtail',
  siteTagline: 'Single-Car Auctions',
  vehicleName: "1978 Porsche 911 Turbo-Look Coupe 'Whale Tail'",
  
  overviewHeading: "Listing Overview",
  overviewParagraphs: [
    "This 1978 Porsche 911 coupe was modified in Turbo-look widebody style with steel front and rear fender flares and is finished in Guards Red over black upholstery with classic houndstooth seat inserts.",
    "Power comes from an air-cooled 3.0-liter flat-six mated to a Type 915 five-speed manual transaxle. Additional features include an iconic rubber-lipped Whale Tail spoiler, 16″ staggered Fuchs alloy wheels, Euro H4 headlights, Carrera hydraulic timing chain tensioners, Bilstein sport shocks, Turbo tie rods, Dansk stainless sport exhaust, and a Porsche Classic audio unit with Apple CarPlay.",
    "Offered with comprehensive service records, Certificate of Authenticity documentation, owner’s manuals, and clean registration in British Columbia / Alberta."
  ],
  overviewImage: {
    url: "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?auto=format&fit=crop&w=1200&q=85",
    caption: "1978 Porsche 911 Turbo-Look Coupe in Guards Red with iconic Whale Tail",
    alt: "Porsche 911 Whale Tail Overview"
  },
  overviewSpecs: [
    { label: "VIN", value: "9118201492" },
    { label: "Odometer", value: "78,420 Miles" },
    { label: "Engine", value: "3.0L Flat-Six CIS" },
    { label: "Gearbox", value: "5-Speed Manual (915)" },
    { label: "Exterior Color", value: "Guards Red (027)" },
    { label: "Interior", value: "Black / Houndstooth" },
    { label: "Title", value: "Clean Registration" },
    { label: "Seller", value: "wailtail" }
  ],

  // Hero carousel images displayed at top of the listing
  heroImages: [
    "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?auto=format&fit=crop&w=1600&q=85", // Hero 3/4 front
    "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1600&q=85", // Whale tail rear angle
    "https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=1600&q=85", // Profile stance
    "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=1600&q=85", // Cockpit & steering
    "https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=1600&q=85", // Flat-Six Engine Bay
    "https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=1600&q=85", // Fuchs wheel close-up
  ],

  // Embedded YouTube Playlist
  youtubePlaylistUrl: "https://www.youtube.com/embed/videoseries?list=PLADk2zDPU78xC7UHaG5DVkMvfUjewrPEK",
  videoTitle: "Cold Start, Driving Footage & 360 Walkaround",
  videoSubtitle: "Complete high-definition video playlist showcasing the air-cooled flat-six acoustics, 915 gearbox operation, and exterior walkaround.",
  videoChapters: [
    {
      id: "vid-1",
      title: "1. Cold Start & 3.0L CIS Idle",
      description: "Cold engine start showing immediate oil pressure rise, smooth CIS idle warm-up, and Dansk exhaust note.",
      videoUrl: "https://www.youtube.com/embed/videoseries?list=PLADk2zDPU78xC7UHaG5DVkMvfUjewrPEK&index=0",
      duration: "03:45"
    },
    {
      id: "vid-2",
      title: "2. In-Cabin Driving & 915 Shifts",
      description: "Spirited road run demonstrating crisp 1st-through-5th gear shifts, Bilstein damping, and brake firmness.",
      videoUrl: "https://www.youtube.com/embed/videoseries?list=PLADk2zDPU78xC7UHaG5DVkMvfUjewrPEK&index=1",
      duration: "06:12"
    },
    {
      id: "vid-3",
      title: "3. 360° Exterior Walkaround & Gaps",
      description: "Detailed 360-degree exterior walkaround highlighting Whale Tail aerodynamics, paint depth, and panel gaps.",
      videoUrl: "https://www.youtube.com/embed/videoseries?list=PLADk2zDPU78xC7UHaG5DVkMvfUjewrPEK&index=2",
      duration: "04:30"
    },
    {
      id: "vid-4",
      title: "4. Underside & Chassis Lift Inspection",
      description: "Underbody hoist inspection displaying rust-free floor pans, SSI heat exchangers, and leak-free transaxle case.",
      videoUrl: "https://www.youtube.com/embed/videoseries?list=PLADk2zDPU78xC7UHaG5DVkMvfUjewrPEK&index=3",
      duration: "05:18"
    },
    {
      id: "vid-5",
      title: "5. Acceleration Acoustics & Flybys",
      description: "External drive-by acoustic capture illustrating the mechanical rasp of the air-cooled flat-six under full throttle.",
      videoUrl: "https://www.youtube.com/embed/videoseries?list=PLADk2zDPU78xC7UHaG5DVkMvfUjewrPEK&index=4",
      duration: "02:50"
    },
    {
      id: "vid-6",
      title: "6. Cabin Switchgear & Sunroof Demo",
      description: "Full demonstration of electric sunroof, VDO gauges, PCCM audio, power windows, and heating controls.",
      videoUrl: "https://www.youtube.com/embed/videoseries?list=PLADk2zDPU78xC7UHaG5DVkMvfUjewrPEK&index=5",
      duration: "03:15"
    }
  ],

  // Section A: In-Line Showcase Photos embedded between write-up narrative sections
  inlineShowcase: [
    {
      id: "overview-exterior",
      title: "Exterior Highlights & 'Whale Tail' Aerodynamics",
      tagline: "Wide-body steel turbo flares paired with iconic functional rubber-lipped whale tail rear spoiler.",
      paragraphs: [
        "This 1978 Porsche 911 was modified under previous ownership with Turbo-style steel fender flares and finished in stunning Guards Red with contrasting black Carrera side graphics. Exterior equipment includes European-specification H4 headlights, front fog lamps, body-color side mirrors, and polished rocker trims.",
        "The defining centerpiece is the period-correct 'Whale Tail' rear spoiler featuring a durable black polyurethane border, auxiliary oil cooler routing, and integrated engine grille slats designed to maximize downforce and airflow to the rear-mounted air-cooled flat-six."
      ],
      bulletPoints: [
        "Guards Red exterior finish with satin black accents",
        "Factory-style steel Turbo flare conversion (Front & Rear)",
        "Original Whale Tail rear spoiler with pristine rubber lip",
        "Euro-spec Bosch H4 headlights and amber corner lenses",
        "Staggered 16″ Fuchs alloy wheels with satin black centers and polished anodized lips"
      ],
      specs: [
        { label: "Body Style", value: "2-Door Coupe (Widebody)" },
        { label: "Color", value: "Guards Red (Indischrot)" },
        { label: "Aero", value: "Functional Whale Tail" },
        { label: "Wheels", value: "16x7″ Front / 16x9″ Rear Fuchs" }
      ],
      images: [
        {
          url: "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?auto=format&fit=crop&w=1200&q=85",
          caption: "Front three-quarter view showing Euro H4 headlights and Turbo wide-body front fenders.",
          alt: "Porsche 911 Front 3/4 Exterior",
          aspect: "wide"
        },
        {
          url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=85",
          caption: "Rear three-quarter highlight displaying the signature Whale Tail spoiler and wide rear arches.",
          alt: "Porsche 911 Whale Tail Rear",
          aspect: "wide"
        }
      ]
    },
    {
      id: "powertrain-engine",
      title: "Air-Cooled 3.0L Flat-Six Powertrain",
      tagline: "Freshly tuned air-cooled boxer engine paired with a rebuilt Type 915 5-speed manual transaxle.",
      paragraphs: [
        "Power is provided by an air-cooled 3.0-liter flat-six equipped with Bosch K-Jetronic continuous fuel injection (CIS) and upgraded Carrera hydraulic chain tensioners. An auxiliary front fender-mounted oil cooler ensures optimal thermal management during spirited driving.",
        "Power is sent to the rear wheels through a Type 915 five-speed manual transaxle that was overhauled with new synchros, fresh seals, and a lightweight sport clutch assembly. A Dansk stainless steel sport exhaust system produces an unmistakable air-cooled flat-six rasp."
      ],
      bulletPoints: [
        "3.0-Liter Air-Cooled Boxer-6 Engine (Engine #6481xxx)",
        "Upgraded Carrera hydraulic timing chain tensioners installed",
        "Rebuilt Type 915 5-Speed Manual Gearbox with crisp short shifter",
        "Auxiliary trombone oil cooler in right front fender",
        "Dansk stainless steel performance muffler and SSI heat exchangers",
        "Dyno-verified strong compression across all 6 cylinders (165-170 psi)"
      ],
      specs: [
        { label: "Displacement", value: "2,994 cc (3.0 Liters)" },
        { label: "Induction", value: "Bosch K-Jetronic CIS" },
        { label: "Horsepower", value: "180 hp @ 5,500 RPM (Factory Rating)" },
        { label: "Transmission", value: "5-Speed Manual (Type 915)" }
      ],
      images: [
        {
          url: "https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=1200&q=85",
          caption: "Detailed view of the 3.0L flat-six engine bay showing clean shrouds, CIS fuel lines, and tensioner updates.",
          alt: "Porsche 911 Flat Six Engine Bay",
          aspect: "wide"
        },
        {
          url: "https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=1200&q=85",
          caption: "Fuchs wheel and upgraded brake calipers with slotted discs and stainless braided brake lines.",
          alt: "Porsche 911 Fuchs Wheel and Brakes",
          aspect: "standard"
        }
      ]
    },
    {
      id: "interior-cabin",
      title: "Driver-Focused Cabin & Cockpit",
      tagline: "Sport bucket seats trimmed in black leatherette with period-correct German houndstooth/tartan inserts.",
      paragraphs: [
        "The cockpit features bolstered front sport seats retrimmed in supple black leatherette with classic Pasha/Houndstooth woven fabric center inserts. Matching door panels with RS-style pull straps and lightweight carpeting complete the track-inspired vintage atmosphere.",
        "A leather-wrapped three-spoke Momo Prototipo steering wheel frames VDO instrumentation including a central 8,000-RPM tachometer, a 150-mph speedometer, an analog clock, and auxiliary combination gauges for engine oil temperature and pressure."
      ],
      bulletPoints: [
        "Bolstered sport seats with custom houndstooth cloth centers",
        "Momo Prototipo 350mm black leather steering wheel with Porsche crest horn button",
        "Original VDO green-font gauges with calibrated odometer showing 78,420 miles",
        "Porsche Classic Communication Management (PCCM) audio unit with Apple CarPlay & Bluetooth",
        "Dash pad free of sun cracks or warping; fresh headliner and German square-weave floor mats"
      ],
      specs: [
        { label: "Upholstery", value: "Black Leatherette / Houndstooth" },
        { label: "Steering Wheel", value: "Momo Prototipo 3-Spoke" },
        { label: "Instrumentation", value: "Original VDO 5-Gauge Cluster" },
        { label: "Audio", value: "Porsche Classic Unit w/ Bluetooth" }
      ],
      images: [
        {
          url: "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=1200&q=85",
          caption: "Driver cockpit view showcasing Momo steering wheel, central VDO tachometer, and 5-speed shifter.",
          alt: "Porsche 911 Cockpit & Steering Wheel",
          aspect: "wide"
        }
      ]
    },
    {
      id: "chassis-suspension",
      title: "Chassis, Underside & Suspension Dynamics",
      tagline: "Bilstein sport dampers, Turbo tie rods, and zinc-coated suspension hardware.",
      paragraphs: [
        "The suspension has been dialed in for canyon carving and road rallies with Bilstein HD struts and shock absorbers, Elephant Racing hollow torsion bars, front and rear adjustable sway bars, and 930 Turbo tie rod assemblies for razor-sharp steering feedback.",
        "Braking is handled by rebuilt four-wheel disc calipers clamping cross-drilled rotors with ATE Type 200 brake fluid and Goodridge stainless-steel braided lines. The underbody is dry, solid, and retains factory factory Wurth undercoating with no structural corrosion."
      ],
      bulletPoints: [
        "Bilstein HD dampers with custom-valved rebound rates",
        "Elephant Racing torsion bars and monoball front bushings",
        "Porsche 930 Turbo tie rod conversion with bump-steer kit",
        "Dry undercarriage with clean floor pans and factory jack points intact",
        "Toyo Proxes R1R high-performance tires (205/55R16 Front, 245/45R16 Rear)"
      ],
      specs: [
        { label: "Dampers", value: "Bilstein Heavy Duty (HD)" },
        { label: "Tie Rods", value: "930 Turbo Spec" },
        { label: "Tires", value: "Toyo Proxes (2024 Date Codes)" },
        { label: "Brakes", value: "Ventilated 4-Wheel Discs" }
      ],
      images: [
        {
          url: "https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=1200&q=85",
          caption: "Side stance showing the dialed-in Euro ride height, Fuchs wheels, and Turbo wheel arch clearance.",
          alt: "Porsche 911 Side Stance and Suspension",
          aspect: "wide"
        }
      ]
    }
  ],

  // Section B: Full Photo Gallery (Grid at bottom with lightbox popup modal)
  fullGallery: [
    {
      id: "gal-1",
      url: "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?auto=format&fit=crop&w=1600&q=85",
      category: "exterior",
      title: "Front 3/4 Profile",
      caption: "High-angle front three-quarter view showing Guards Red paint, Turbo flares, and Euro H4 headlights."
    },
    {
      id: "gal-2",
      url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1600&q=85",
      category: "exterior",
      title: "Rear 3/4 with Whale Tail",
      caption: "Rear perspective emphasizing the iconic rubber-edged Whale Tail spoiler and wide rear arches."
    },
    {
      id: "gal-3",
      url: "https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=1600&q=85",
      category: "exterior",
      title: "Full Side Profile Stance",
      caption: "Euro ride height stance with staggered 16-inch Fuchs wheels and classic Carrera script."
    },
    {
      id: "gal-4",
      url: "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=1600&q=85",
      category: "interior",
      title: "Driver Cockpit & Dash",
      caption: "Momo Prototipo steering wheel, VDO 5-gauge cluster, and flawless crack-free dashboard."
    },
    {
      id: "gal-5",
      url: "https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=1600&q=85",
      category: "engine",
      title: "3.0L Boxer Engine Bay",
      caption: "Air-cooled 3.0L flat-six with Carrera chain tensioners and clean engine compartment."
    },
    {
      id: "gal-6",
      url: "https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=1600&q=85",
      category: "detail",
      title: "Fuchs Wheel & Caliper",
      caption: "16-inch forged Fuchs alloy wheel with anodized petal lip and black center star."
    },
    {
      id: "gal-7",
      url: "https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&w=1600&q=85",
      category: "exterior",
      title: "Front Fascia & Hood",
      caption: "Front luggage compartment hood with authentic crest emblem and bumper smile trim."
    },
    {
      id: "gal-8",
      url: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1600&q=85",
      category: "exterior",
      title: "Sunroof & Roofline",
      caption: "Operational electric sunroof panel and factory-correct window trim gaskets."
    },
    {
      id: "gal-9",
      url: "https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=1600&q=85",
      category: "interior",
      title: "Sport Seats & Houndstooth Inserts",
      caption: "Supportive sport bucket seats featuring breathable German woven houndstooth inserts."
    },
    {
      id: "gal-10",
      url: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&w=1600&q=85",
      category: "underside",
      title: "Chassis & Heat Exchangers",
      caption: "Dry floor pans, SSI stainless steel heat exchangers, and leak-free transmission casing."
    },
    {
      id: "gal-11",
      url: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1600&q=85",
      category: "detail",
      title: "Whale Tail Polyurethane Grille Detail",
      caption: "Close-up of the whale tail rubber edge profile and dual-stage engine air intake louvers."
    },
    {
      id: "gal-12",
      url: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1600&q=85",
      category: "documentation",
      title: "Service Records & Certificate of Authenticity",
      caption: "Binder of service receipts, engine rebuild dyno sheet, factory owner's manual, and clean title."
    }
  ]
};

// Also export as default
export default mediaConfig;
