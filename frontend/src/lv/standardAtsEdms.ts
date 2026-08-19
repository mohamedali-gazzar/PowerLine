// Standard ATS panels for EDMS — transcribed from "Database/Standard ATS EDMS.xlsx"
// (one sheet per rating / breaker). Every variant is a "1 out of 2" automatic
// transfer switch (two incomers + interlock + control).
//
// Picking a rating (and a breaker, where both MCCB and ACB exist) in a Standard EDMS
// panel's "Standard ATS" view fills the whole panel from here: name, components,
// enclosure (PLP cells, or a single SR-Basic box on the 630 A) and main-busbar copper.
//
// Transcribed once from the workbook (like standardEdms.ts). The STD_ATS array is the
// source of truth now — edit it here if a sheet changes; there is no live Excel link.
// The apply logic below mirrors standardEdms.ts (partToComponent / PLP cell table / copper).

import { findByName, ENCLOSURES, COMBOS, type DbEnclosure } from "./catalog";
import { cellTable, type CellConfig } from "./cells";
import { copperTotal, type CopperTool } from "./copper";
import {
  DEFAULT_SECTIONS, toPanelComponent, freeComponent, parseEnclDims, uid,
  type LvPanel, type PanelComponent, type PanelTypeItem,
} from "./store";

export type AtsBreaker = "MCCB" | "ACB";
export interface StdAtsPart { qty: number; desc: string }
export type StdAtsEnclosure =
  | { kind: "sr"; box: { H: number; W: number; D: number } }
  | { kind: "plp"; depth: number; cells: Record<string, number> };
export interface StdAtsVariant {
  name: string;
  ratingA: number;
  breaker: AtsBreaker;
  atsType: string;
  enclosure: StdAtsEnclosure;
  copper: CopperTool;
  parts: StdAtsPart[];
}

/** The version shipped with the app — the fallback used until the owner uploads a
 *  "Standard ATS EDMS" workbook on the Combinations tab, and again if an upload is
 *  malformed. Transcribed once from the workbook. */
const STD_ATS_BUNDLED: StdAtsVariant[] = [
  {
    "name": "ATS 630A 3P MCCB 1 out of 2",
    "ratingA": 630,
    "breaker": "MCCB",
    "atsType": "1 out of 2",
    "enclosure": {
      "kind": "sr",
      "box": {
        "H": 1600,
        "W": 1000,
        "D": 400
      }
    },
    "copper": {},
    "parts": [
      {
        "qty": 2,
        "desc": "MCCB XT5N 630A-36kA 630 AF TMA 3P"
      },
      {
        "qty": 2,
        "desc": "YU XT5-XT6 220..240 Vac - 220..250 Vdc"
      },
      {
        "qty": 2,
        "desc": "AUX-C 1Q+1SY 250Vac/dc XT1...XT6 F/P"
      },
      {
        "qty": 2,
        "desc": "MOE XT5 220...250V AC/DC"
      },
      {
        "qty": 1,
        "desc": "MIR-H XT5 MECH,LOCK REAR HO. 2 C.BREAKER"
      },
      {
        "qty": 2,
        "desc": "MIR-P x XT5 F"
      },
      {
        "qty": 1,
        "desc": "Control Circuit 1 out of 2"
      },
      {
        "qty": 2,
        "desc": "Multifunction relay, CM-PVS.41S Three-phase monitoring relay"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Red LED 230V AC"
      },
      {
        "qty": 6,
        "desc": "Pilot Light Green LED 230V AC"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Yellow LED 230V AC"
      },
      {
        "qty": 2,
        "desc": "CP1-10G-10 Pushbutton"
      },
      {
        "qty": 2,
        "desc": "CP1-10R-01 Pushbutton"
      },
      {
        "qty": 1,
        "desc": "Selector 3 Position"
      },
      {
        "qty": 1,
        "desc": "Digital Meter (V,I)"
      },
      {
        "qty": 3,
        "desc": "Current Transformer (800/5) A"
      }
    ]
  },
  {
    "name": "ATS 800A 3P MCCB 1 out of 2",
    "ratingA": 800,
    "breaker": "MCCB",
    "atsType": "1 out of 2",
    "enclosure": {
      "kind": "plp",
      "depth": 70,
      "cells": {
        "400": 1,
        "800": 1
      }
    },
    "copper": {
      "250": {
        "p": 0,
        "n": 0,
        "e": 1200
      },
      "400": {
        "p": 0,
        "n": 1200,
        "e": 0
      },
      "630": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "800": {
        "p": 1200,
        "n": 0,
        "e": 0
      }
    },
    "parts": [
      {
        "qty": 2,
        "desc": "MCCB XT6N 800A-36kA 800 AF Ekip Dip LS/I 3P"
      },
      {
        "qty": 2,
        "desc": "YU XT5-XT6 220..240 Vac - 220..250 Vdc"
      },
      {
        "qty": 2,
        "desc": "AUX-C 1Q+1SY 250Vac/dc XT1...XT6 F/P"
      },
      {
        "qty": 2,
        "desc": "MOE XT6 220...250V AC/DC"
      },
      {
        "qty": 1,
        "desc": "MIR-H XT6 MECH,LOCK REAR HO. 2 C.BREAKER"
      },
      {
        "qty": 2,
        "desc": "MIR-P x XT6 F"
      },
      {
        "qty": 1,
        "desc": "Control Circuit 1 out of 2"
      },
      {
        "qty": 2,
        "desc": "Multifunction relay, CM-PVS.41S Three-phase monitoring relay"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Red LED 230V AC"
      },
      {
        "qty": 6,
        "desc": "Pilot Light Green LED 230V AC"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Yellow LED 230V AC"
      },
      {
        "qty": 2,
        "desc": "CP1-10G-10 Pushbutton"
      },
      {
        "qty": 2,
        "desc": "CP1-10R-01 Pushbutton"
      },
      {
        "qty": 1,
        "desc": "Selector 3 Position"
      },
      {
        "qty": 1,
        "desc": "Digital Meter (V,I)"
      },
      {
        "qty": 3,
        "desc": "Current Transformer (800/5) A"
      }
    ]
  },
  {
    "name": "ATS 1000A 3P MCCB 1 out of 2",
    "ratingA": 1000,
    "breaker": "MCCB",
    "atsType": "1 out of 2",
    "enclosure": {
      "kind": "plp",
      "depth": 70,
      "cells": {
        "400": 1,
        "800": 1
      }
    },
    "copper": {
      "400": {
        "p": 0,
        "n": 1200,
        "e": 1200
      },
      "630": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "800": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1000": {
        "p": 1200,
        "n": 0,
        "e": 0
      }
    },
    "parts": [
      {
        "qty": 2,
        "desc": "MCCB XT7S M 1000A-50kA 1000 AF Ekip Dip LS/I 3P"
      },
      {
        "qty": 2,
        "desc": "YU E1.2..E6.2-XT7-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "YC E1.2..E6.2-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "AUX 4Q 400V E1.2-XT7-XT7M"
      },
      {
        "qty": 2,
        "desc": "S51 250V E1.2-XT7-XT7M"
      },
      {
        "qty": 2,
        "desc": "M XT7M 220-250 V AC/DC"
      },
      {
        "qty": 1,
        "desc": "Cable interlock A - HR E1.2..E6.2-XT7/M"
      },
      {
        "qty": 2,
        "desc": "Support fixed Type A E1.2-XT7/M floor mount"
      },
      {
        "qty": 1,
        "desc": "Control Circuit 1 out of 2"
      },
      {
        "qty": 2,
        "desc": "Multifunction relay, CM-PVS.41S Three-phase monitoring relay"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Red LED 230V AC"
      },
      {
        "qty": 6,
        "desc": "Pilot Light Green LED 230V AC"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Yellow LED 230V AC"
      },
      {
        "qty": 2,
        "desc": "CP1-10G-10 Pushbutton"
      },
      {
        "qty": 2,
        "desc": "CP1-10R-01 Pushbutton"
      },
      {
        "qty": 1,
        "desc": "Selector 3 Position"
      },
      {
        "qty": 1,
        "desc": "Digital Meter (V,I)"
      },
      {
        "qty": 3,
        "desc": "Current Transformer (1000/5) A"
      }
    ]
  },
  {
    "name": "ATS 1000A 3P ACB 1 out of 2",
    "ratingA": 1000,
    "breaker": "ACB",
    "atsType": "1 out of 2",
    "enclosure": {
      "kind": "plp",
      "depth": 70,
      "cells": {
        "600": 1,
        "1000": 1
      }
    },
    "copper": {
      "400": {
        "p": 0,
        "n": 1600,
        "e": 1600
      },
      "630": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "800": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1000": {
        "p": 1600,
        "n": 0,
        "e": 0
      }
    },
    "parts": [
      {
        "qty": 2,
        "desc": "ACB E1.2C 1000A-50kA 1000 AF Ekip Touch LI 3P F F"
      },
      {
        "qty": 2,
        "desc": "YU E1.2..E6.2-XT7-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "YC E1.2..E6.2-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "M  E1.2 220-250 VAC/DC"
      },
      {
        "qty": 1,
        "desc": "Cable interlock A - HR E1.2..E6.2-XT7/M"
      },
      {
        "qty": 2,
        "desc": "Support fixed Type A E1.2-XT7/M floor mount"
      },
      {
        "qty": 1,
        "desc": "Control Circuit 1 out of 2"
      },
      {
        "qty": 2,
        "desc": "Multifunction relay, CM-PVS.41S Three-phase monitoring relay"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Red LED 230V AC"
      },
      {
        "qty": 6,
        "desc": "Pilot Light Green LED 230V AC"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Yellow LED 230V AC"
      },
      {
        "qty": 2,
        "desc": "CP1-10G-10 Pushbutton"
      },
      {
        "qty": 2,
        "desc": "CP1-10R-01 Pushbutton"
      },
      {
        "qty": 1,
        "desc": "Selector 3 Position"
      },
      {
        "qty": 1,
        "desc": "Digital Meter (V,I)"
      },
      {
        "qty": 3,
        "desc": "Current Transformer (1000/5) A"
      }
    ]
  },
  {
    "name": "ATS 1250A 3P MCCB 1 out of 2",
    "ratingA": 1250,
    "breaker": "MCCB",
    "atsType": "1 out of 2",
    "enclosure": {
      "kind": "plp",
      "depth": 70,
      "cells": {
        "400": 1,
        "800": 1
      }
    },
    "copper": {
      "400": {
        "p": 0,
        "n": 0,
        "e": 1200
      },
      "630": {
        "p": 0,
        "n": 1200,
        "e": 0
      },
      "800": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1000": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1250": {
        "p": 1200,
        "n": 0,
        "e": 0
      }
    },
    "parts": [
      {
        "qty": 2,
        "desc": "MCCB XT7S M 1250A-50kA 1250 AF Ekip Dip LS/I 3P"
      },
      {
        "qty": 2,
        "desc": "YU E1.2..E6.2-XT7-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "YC E1.2..E6.2-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "AUX 4Q 400V E1.2-XT7-XT7M"
      },
      {
        "qty": 2,
        "desc": "S51 250V E1.2-XT7-XT7M"
      },
      {
        "qty": 2,
        "desc": "M XT7M 220-250 V AC/DC"
      },
      {
        "qty": 1,
        "desc": "Cable interlock A - HR E1.2..E6.2-XT7/M"
      },
      {
        "qty": 2,
        "desc": "Support fixed Type A E1.2-XT7/M floor mount"
      },
      {
        "qty": 1,
        "desc": "Control Circuit 1 out of 2"
      },
      {
        "qty": 2,
        "desc": "Multifunction relay, CM-PVS.41S Three-phase monitoring relay"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Red LED 230V AC"
      },
      {
        "qty": 6,
        "desc": "Pilot Light Green LED 230V AC"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Yellow LED 230V AC"
      },
      {
        "qty": 2,
        "desc": "CP1-10G-10 Pushbutton"
      },
      {
        "qty": 2,
        "desc": "CP1-10R-01 Pushbutton"
      },
      {
        "qty": 1,
        "desc": "Selector 3 Position"
      },
      {
        "qty": 1,
        "desc": "Digital Meter (V,I)"
      },
      {
        "qty": 3,
        "desc": "Current Transformer (1200/5) A"
      }
    ]
  },
  {
    "name": "ATS 1250A 3P ACB 1 out of 2",
    "ratingA": 1250,
    "breaker": "ACB",
    "atsType": "1 out of 2",
    "enclosure": {
      "kind": "plp",
      "depth": 70,
      "cells": {
        "600": 1,
        "1000": 1
      }
    },
    "copper": {
      "400": {
        "p": 0,
        "n": 0,
        "e": 1600
      },
      "630": {
        "p": 0,
        "n": 1600,
        "e": 0
      },
      "800": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1000": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1250": {
        "p": 1600,
        "n": 0,
        "e": 0
      }
    },
    "parts": [
      {
        "qty": 2,
        "desc": "ACB E1.2C 1250A-50kA 1250 AF Ekip Touch LI 3P F F"
      },
      {
        "qty": 2,
        "desc": "YU E1.2..E6.2-XT7-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "YC E1.2..E6.2-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "M  E1.2 220-250 VAC/DC"
      },
      {
        "qty": 1,
        "desc": "Cable interlock A - HR E1.2..E6.2-XT7/M"
      },
      {
        "qty": 2,
        "desc": "Support fixed Type A E1.2-XT7/M floor mount"
      },
      {
        "qty": 1,
        "desc": "Control Circuit 1 out of 2"
      },
      {
        "qty": 2,
        "desc": "Multifunction relay, CM-PVS.41S Three-phase monitoring relay"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Red LED 230V AC"
      },
      {
        "qty": 6,
        "desc": "Pilot Light Green LED 230V AC"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Yellow LED 230V AC"
      },
      {
        "qty": 2,
        "desc": "CP1-10G-10 Pushbutton"
      },
      {
        "qty": 2,
        "desc": "CP1-10R-01 Pushbutton"
      },
      {
        "qty": 1,
        "desc": "Selector 3 Position"
      },
      {
        "qty": 1,
        "desc": "Digital Meter (V,I)"
      },
      {
        "qty": 3,
        "desc": "Current Transformer (1200/5) A"
      }
    ]
  },
  {
    "name": "ATS 1600A 3P MCCB 1 out of 2",
    "ratingA": 1600,
    "breaker": "MCCB",
    "atsType": "1 out of 2",
    "enclosure": {
      "kind": "plp",
      "depth": 70,
      "cells": {
        "400": 1,
        "800": 1
      }
    },
    "copper": {
      "400": {
        "p": 0,
        "n": 0,
        "e": 1200
      },
      "630": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "800": {
        "p": 0,
        "n": 1200,
        "e": 0
      },
      "1000": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1250": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1600": {
        "p": 1200,
        "n": 0,
        "e": 0
      }
    },
    "parts": [
      {
        "qty": 2,
        "desc": "MCCB XT7S M 1600A-50kA 1600 AF Ekip Dip LS/I 3P"
      },
      {
        "qty": 2,
        "desc": "YU E1.2..E6.2-XT7-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "YC E1.2..E6.2-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "AUX 4Q 400V E1.2-XT7-XT7M"
      },
      {
        "qty": 2,
        "desc": "S51 250V E1.2-XT7-XT7M"
      },
      {
        "qty": 2,
        "desc": "M XT7M 220-250 V AC/DC"
      },
      {
        "qty": 1,
        "desc": "Cable interlock A - HR E1.2..E6.2-XT7/M"
      },
      {
        "qty": 2,
        "desc": "Support fixed Type A E1.2-XT7/M floor mount"
      },
      {
        "qty": 1,
        "desc": "Control Circuit 1 out of 2"
      },
      {
        "qty": 2,
        "desc": "Multifunction relay, CM-PVS.41S Three-phase monitoring relay"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Red LED 230V AC"
      },
      {
        "qty": 6,
        "desc": "Pilot Light Green LED 230V AC"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Yellow LED 230V AC"
      },
      {
        "qty": 2,
        "desc": "CP1-10G-10 Pushbutton"
      },
      {
        "qty": 2,
        "desc": "CP1-10R-01 Pushbutton"
      },
      {
        "qty": 1,
        "desc": "Selector 3 Position"
      },
      {
        "qty": 1,
        "desc": "Digital Meter (V,I)"
      },
      {
        "qty": 3,
        "desc": "Current Transformer (1600/5) A"
      }
    ]
  },
  {
    "name": "ATS 1600A 3P ACB 1 out of 2",
    "ratingA": 1600,
    "breaker": "ACB",
    "atsType": "1 out of 2",
    "enclosure": {
      "kind": "plp",
      "depth": 70,
      "cells": {
        "600": 1,
        "1000": 1
      }
    },
    "copper": {
      "400": {
        "p": 0,
        "n": 0,
        "e": 1600
      },
      "630": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "800": {
        "p": 0,
        "n": 1600,
        "e": 0
      },
      "1000": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1250": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1600": {
        "p": 1600,
        "n": 0,
        "e": 0
      }
    },
    "parts": [
      {
        "qty": 2,
        "desc": "ACB E1.2C 1600A-50kA 1600 AF Ekip Touch LI 3P F F"
      },
      {
        "qty": 2,
        "desc": "YU E1.2..E6.2-XT7-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "YC E1.2..E6.2-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "M  E1.2 220-250 VAC/DC"
      },
      {
        "qty": 1,
        "desc": "Cable interlock A - HR E1.2..E6.2-XT7/M"
      },
      {
        "qty": 2,
        "desc": "Support fixed Type A E1.2-XT7/M floor mount"
      },
      {
        "qty": 1,
        "desc": "Control Circuit 1 out of 2"
      },
      {
        "qty": 2,
        "desc": "Multifunction relay, CM-PVS.41S Three-phase monitoring relay"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Red LED 230V AC"
      },
      {
        "qty": 6,
        "desc": "Pilot Light Green LED 230V AC"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Yellow LED 230V AC"
      },
      {
        "qty": 2,
        "desc": "CP1-10G-10 Pushbutton"
      },
      {
        "qty": 2,
        "desc": "CP1-10R-01 Pushbutton"
      },
      {
        "qty": 1,
        "desc": "Selector 3 Position"
      },
      {
        "qty": 1,
        "desc": "Digital Meter (V,I)"
      },
      {
        "qty": 3,
        "desc": "Current Transformer (1600/5) A"
      }
    ]
  },
  {
    "name": "ATS 2000A 3P ACB 1 out of 2",
    "ratingA": 2000,
    "breaker": "ACB",
    "atsType": "1 out of 2",
    "enclosure": {
      "kind": "plp",
      "depth": 70,
      "cells": {
        "600": 1,
        "1000": 1
      }
    },
    "copper": {
      "400": {
        "p": 0,
        "n": 0,
        "e": 1600
      },
      "630": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "800": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1000": {
        "p": 0,
        "n": 1600,
        "e": 0
      },
      "1250": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1600": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "2000": {
        "p": 1600,
        "n": 0,
        "e": 0
      }
    },
    "parts": [
      {
        "qty": 2,
        "desc": "ACB E2.2N 2000A-66kA 2000 AF Ekip Touch LI 3P FHR"
      },
      {
        "qty": 2,
        "desc": "YU E1.2..E6.2-XT7-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "YC E1.2..E6.2-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "M  E2.2...E6.2 220-250 VAC/DC"
      },
      {
        "qty": 1,
        "desc": "Cable interlock A - HR E1.2..E6.2-XT7/M"
      },
      {
        "qty": 2,
        "desc": "Lever interlock E2.2"
      },
      {
        "qty": 2,
        "desc": "Support F/FP Type A,B,D E2.2…E6.2"
      },
      {
        "qty": 1,
        "desc": "Control Circuit 1 out of 2"
      },
      {
        "qty": 2,
        "desc": "Multifunction relay, CM-PVS.41S Three-phase monitoring relay"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Red LED 230V AC"
      },
      {
        "qty": 6,
        "desc": "Pilot Light Green LED 230V AC"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Yellow LED 230V AC"
      },
      {
        "qty": 2,
        "desc": "CP1-10G-10 Pushbutton"
      },
      {
        "qty": 2,
        "desc": "CP1-10R-01 Pushbutton"
      },
      {
        "qty": 1,
        "desc": "Selector 3 Position"
      },
      {
        "qty": 1,
        "desc": "Digital Meter (V,I)"
      },
      {
        "qty": 3,
        "desc": "Current Transformer (2000/5) A"
      }
    ]
  },
  {
    "name": "ATS 2500A 3P ACB 1 out of 2",
    "ratingA": 2500,
    "breaker": "ACB",
    "atsType": "1 out of 2",
    "enclosure": {
      "kind": "plp",
      "depth": 70,
      "cells": {
        "600": 1,
        "1000": 1
      }
    },
    "copper": {
      "630": {
        "p": 0,
        "n": 0,
        "e": 1600
      },
      "800": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1000": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1250": {
        "p": 0,
        "n": 1600,
        "e": 0
      },
      "1600": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "2000": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "2500": {
        "p": 1600,
        "n": 0,
        "e": 0
      }
    },
    "parts": [
      {
        "qty": 2,
        "desc": "ACB E2.2N 2000A-66kA 2000 AF Ekip Touch LI 3P FHR"
      },
      {
        "qty": 2,
        "desc": "YU E1.2..E6.2-XT7-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "YC E1.2..E6.2-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "M  E2.2...E6.2 220-250 VAC/DC"
      },
      {
        "qty": 1,
        "desc": "Cable interlock A - HR E1.2..E6.2-XT7/M"
      },
      {
        "qty": 2,
        "desc": "Lever interlock E2.2"
      },
      {
        "qty": 2,
        "desc": "Support F/FP Type A,B,D E2.2…E6.2"
      },
      {
        "qty": 1,
        "desc": "Control Circuit 1 out of 2"
      },
      {
        "qty": 2,
        "desc": "Multifunction relay, CM-PVS.41S Three-phase monitoring relay"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Red LED 230V AC"
      },
      {
        "qty": 6,
        "desc": "Pilot Light Green LED 230V AC"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Yellow LED 230V AC"
      },
      {
        "qty": 2,
        "desc": "CP1-10G-10 Pushbutton"
      },
      {
        "qty": 2,
        "desc": "CP1-10R-01 Pushbutton"
      },
      {
        "qty": 1,
        "desc": "Selector 3 Position"
      },
      {
        "qty": 1,
        "desc": "Digital Meter (V,I)"
      },
      {
        "qty": 3,
        "desc": "Current Transformer (2500/5) A"
      }
    ]
  },
  {
    "name": "ATS 3200A 3P ACB 1 out of 2",
    "ratingA": 3200,
    "breaker": "ACB",
    "atsType": "1 out of 2",
    "enclosure": {
      "kind": "plp",
      "depth": 90,
      "cells": {
        "600": 1,
        "1000": 1
      }
    },
    "copper": {
      "800": {
        "p": 0,
        "n": 0,
        "e": 1600
      },
      "1000": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1250": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1600": {
        "p": 0,
        "n": 1600,
        "e": 0
      },
      "2000": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "2500": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "3200": {
        "p": 1600,
        "n": 0,
        "e": 0
      }
    },
    "parts": [
      {
        "qty": 2,
        "desc": "ACB E4.2N 3200A-66kA 3200 AF Ekip Touch LI 3P FHR"
      },
      {
        "qty": 2,
        "desc": "YU E1.2..E6.2-XT7-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "YC E1.2..E6.2-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "M  E2.2...E6.2 220-250 VAC/DC"
      },
      {
        "qty": 1,
        "desc": "Cable interlock A - HR E1.2..E6.2-XT7/M"
      },
      {
        "qty": 2,
        "desc": "Lever interlock E4.2"
      },
      {
        "qty": 2,
        "desc": "Support F/FP Type A,B,D E2.2…E6.2"
      },
      {
        "qty": 1,
        "desc": "Control Circuit 1 out of 2"
      },
      {
        "qty": 2,
        "desc": "Multifunction relay, CM-PVS.41S Three-phase monitoring relay"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Red LED 230V AC"
      },
      {
        "qty": 6,
        "desc": "Pilot Light Green LED 230V AC"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Yellow LED 230V AC"
      },
      {
        "qty": 2,
        "desc": "CP1-10G-10 Pushbutton"
      },
      {
        "qty": 2,
        "desc": "CP1-10R-01 Pushbutton"
      },
      {
        "qty": 1,
        "desc": "Selector 3 Position"
      },
      {
        "qty": 1,
        "desc": "Digital Meter (V,I)"
      },
      {
        "qty": 3,
        "desc": "Current Transformer (4000/5) A"
      }
    ]
  },
  {
    "name": "ATS 4000A 3P ACB 1 out of 2",
    "ratingA": 4000,
    "breaker": "ACB",
    "atsType": "1 out of 2",
    "enclosure": {
      "kind": "plp",
      "depth": 90,
      "cells": {
        "600": 1,
        "1000": 1
      }
    },
    "copper": {
      "1000": {
        "p": 0,
        "n": 0,
        "e": 1600
      },
      "1250": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "1600": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "2000": {
        "p": 0,
        "n": 1600,
        "e": 0
      },
      "2500": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "3200": {
        "p": 0,
        "n": 0,
        "e": 0
      },
      "4000": {
        "p": 1600,
        "n": 0,
        "e": 0
      }
    },
    "parts": [
      {
        "qty": 2,
        "desc": "ACB E4.2N 4000A-66kA 4000 AF Ekip Touch LI 3P FHR"
      },
      {
        "qty": 2,
        "desc": "YU E1.2..E6.2-XT7-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "YC E1.2..E6.2-XT7M 220-240 VAC/DC"
      },
      {
        "qty": 2,
        "desc": "M  E2.2...E6.2 220-250 VAC/DC"
      },
      {
        "qty": 1,
        "desc": "Cable interlock A - HR E1.2..E6.2-XT7/M"
      },
      {
        "qty": 2,
        "desc": "Lever interlock E4.2"
      },
      {
        "qty": 2,
        "desc": "Support F/FP Type A,B,D E2.2…E6.2"
      },
      {
        "qty": 1,
        "desc": "Control Circuit 1 out of 2"
      },
      {
        "qty": 2,
        "desc": "Multifunction relay, CM-PVS.41S Three-phase monitoring relay"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Red LED 230V AC"
      },
      {
        "qty": 6,
        "desc": "Pilot Light Green LED 230V AC"
      },
      {
        "qty": 4,
        "desc": "Pilot Light Yellow LED 230V AC"
      },
      {
        "qty": 2,
        "desc": "CP1-10G-10 Pushbutton"
      },
      {
        "qty": 2,
        "desc": "CP1-10R-01 Pushbutton"
      },
      {
        "qty": 1,
        "desc": "Selector 3 Position"
      },
      {
        "qty": 1,
        "desc": "Digital Meter (V,I)"
      },
      {
        "qty": 3,
        "desc": "Current Transformer (4000/5) A"
      }
    ]
  }
];

// ── Live source: the uploaded workbook (Combinations tab) → parsed variants ──
// The owner uploads "Standard ATS EDMS.xlsx" on the Combinations tab; it is served
// in the catalogue as COMBOS.stdatsedms (one sheet per rating/breaker, cell for
// cell). The builder reads THAT, so editing the workbook changes what it builds —
// no code change. Until one is uploaded, STD_ATS_BUNDLED is used; a malformed
// upload also falls back, so a bad sheet can never empty the builder.

const numOf = (v: unknown): number => {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isNaN(n) ? 0 : n;
};

/** One stored sheet grid → a variant, or null if row 1 is not an ATS title. The
 *  column layout mirrors the workbook the download writes and the engineers keep. */
function parseAtsSheet(grid: unknown[][]): StdAtsVariant | null {
  if (!Array.isArray(grid) || !grid.length) return null;
  const H = (grid[0] ?? []).map((c) => String(c ?? "").trim());
  const m = /ATS\s+(\d+)A\s+3P\s+(MCCB|ACB)\s+(.+)/i.exec(H[0] ?? "");
  if (!m) return null;
  const ratingA = numOf(m[1]);
  const breaker = m[2].toUpperCase() as AtsBreaker;
  const atsType = m[3].trim();

  let enclosure: StdAtsEnclosure;
  const copper: CopperTool = {};
  if (/SR-?Basic/i.test(H[3] ?? "")) {
    const d = /(\d+)\s*[xX]\s*(\d+)\s*[xX]\s*(\d+)/.exec(H[4] ?? "");
    if (!d) return null;
    enclosure = { kind: "sr", box: { H: +d[1], W: +d[2], D: +d[3] } };
  } else {
    const depth = numOf(H[4]);
    const cells: Record<string, number> = {};
    for (let i = 1; i < grid.length; i++) {
      const cm = /^2000x(\d+)x\d+$/i.exec(String((grid[i] ?? [])[3] ?? "").trim());
      if (cm) { const q = numOf((grid[i] ?? [])[4]); if (q > 0) cells[cm[1]] = (cells[cm[1]] || 0) + q; }
    }
    enclosure = { kind: "plp", depth, cells };
    for (let i = 1; i < grid.length; i++) {
      const rate = numOf((grid[i] ?? [])[7]);
      if (rate > 0) copper[String(rate)] = { p: numOf((grid[i] ?? [])[9]), n: numOf((grid[i] ?? [])[10]), e: numOf((grid[i] ?? [])[11]) };
    }
  }

  const parts: StdAtsPart[] = [];
  for (let i = 1; i < grid.length; i++) {
    const qty = numOf((grid[i] ?? [])[0]);
    const desc = String((grid[i] ?? [])[1] ?? "").trim();
    if (qty > 0 && desc) parts.push({ qty, desc });
  }
  if (!parts.length) return null;
  return { name: H[0], ratingA, breaker, atsType, enclosure, copper, parts };
}

// Memoised by the served object's identity: COMBOS is replaced in place on every
// catalogue install, so COMBOS.stdatsedms is a fresh reference exactly when the
// data changes — and stays identical otherwise.
let _atsKey: unknown = Symbol("uninit");
let _atsVariants: StdAtsVariant[] = STD_ATS_BUNDLED;
function atsVariants(): StdAtsVariant[] {
  const served = COMBOS.stdatsedms;
  if (served === _atsKey) return _atsVariants;
  _atsKey = served;
  const next: StdAtsVariant[] = [];
  if (served && Array.isArray(served.sheets)) {
    for (const sh of served.sheets) {
      const v = parseAtsSheet((sh?.grid ?? []) as unknown[][]);
      if (v) next.push(v);
    }
  }
  _atsVariants = next.length ? next : STD_ATS_BUNDLED;
  return _atsVariants;
}

/** ATS ratings offered, small → large. */
export function stdAtsRatings(): number[] {
  return [...new Set(atsVariants().map((v) => v.ratingA))].sort((a, b) => a - b);
}

/** The breaker options for a rating (MCCB / ACB), in that order — only those the
 *  loaded set actually has a sheet for. */
export function atsBreakersFor(ratingA: number): AtsBreaker[] {
  const order: AtsBreaker[] = ["MCCB", "ACB"];
  return order.filter((b) => atsVariants().some((v) => v.ratingA === ratingA && v.breaker === b));
}

/** The ATS variant for a rating + breaker, or undefined when that pair has none. */
export function stdAts(ratingA: number, breaker: string): StdAtsVariant | undefined {
  return atsVariants().find((v) => v.ratingA === ratingA && v.breaker === breaker);
}

// ── Apply ────────────────────────────────────────────────────────────────────
/** Resolve one BOM line against the catalogue; a description with no match becomes a
 *  free line (the same fallback standard panels and the combination builders use). */
function partToComponent(part: StdAtsPart, section: string): PanelComponent {
  const db = findByName(part.desc);
  return db ? toPanelComponent(db, section, part.qty) : freeComponent(part.desc, section, part.qty);
}

/** The PLP cell table at the variant's depth, with its widths filled in (sides locked). */
function plpCellConfig(depth: number, cells: Record<string, number>): CellConfig {
  const rows = cellTable("PLP", depth, "1.5", "IP54").map((r) => {
    if (r.locked) return { ...r };
    const width = /^2000x(\d+)x/.exec(r.desc)?.[1] ?? "";
    return { ...r, qty: cells[width] ?? 0 };
  });
  return { type: "PLP", depth, thickness: "1.5", ip: "IP54", rows };
}

/** The SR-Basic catalogue box matching the given size, as a Panels-mode item. Prefers
 *  the standard SKU (name starts with the dimensions, not a "new" prefix). */
function srPanelItem(box: { H: number; W: number; D: number }): PanelTypeItem | null {
  let best: DbEnclosure | undefined;
  for (const e of ENCLOSURES) {
    if (e.fam !== "SR-Basic") continue;
    const d = parseEnclDims(e.name);
    if (!d || d.H !== box.H || d.W !== box.W || d.D !== box.D) continue;
    if (!best || /^\d/.test((e.name || "").trim())) best = e;
  }
  if (!best) return null;
  return { id: uid(), slot: 1, fam: best.fam, name: best.name, ref: best.ref, ip: String((best as { ip?: unknown }).ip ?? ""), eur: best.eur, egp: best.egp, qty: 1 };
}

/** Apply a standard ATS to a panel: name, rating, components, enclosure and copper.
 *  REPLACES the panel's components / cells / copper while keeping its identity fields
 *  (fed-from, quantity, project specs) — the same contract as applyStdPanel. */
export function applyStdAts(p: LvPanel, v: StdAtsVariant): LvPanel {
  const components: PanelComponent[] = v.parts.map((x) => partToComponent(x, "Main Incoming"));
  const base: LvPanel = {
    ...p,
    name: v.name,
    ratingA: v.ratingA,
    sections: [...DEFAULT_SECTIONS],
    activeSection: "Main Incoming",
    components,
  };
  if (v.enclosure.kind === "plp") {
    return {
      ...base,
      sizingMode: "cells",
      cellConfig: plpCellConfig(v.enclosure.depth, v.enclosure.cells),
      copperTool: { ...v.copper },
      mainBusbarKg: Math.round(copperTotal("PLP", v.copper) * 10) / 10,
      mainBusbarOverride: false,
      panelItems: [],
    };
  }
  // SR-Basic (630 A): one catalogue enclosure in Panels mode; the sheet gives no
  // busbar copper ladder, so the panels-mode auto rule sizes the busbar.
  const item = srPanelItem(v.enclosure.box);
  return {
    ...base,
    sizingMode: "panels",
    panelsSizing: { layout: "Single", family: "SR-Basic", sizing1: "", sizing2: "" },
    panelItems: item ? [item] : [],
    copperTool: {},
    mainBusbarKg: 0,
    mainBusbarOverride: false,
  };
}
