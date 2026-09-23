// Milestone 50 ("Fully Charged") stage artwork — ported verbatim from milestone-50.html.
// The embedded PowerLine helmet logo (base64 PNG) is kept exactly as in the source. Do not edit by hand.
export const MILESTONE50_SVG = `
      <svg viewBox="0 0 600 380" aria-hidden="true">
        <defs>
          <radialGradient id="gSkin" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#FFE6CF"/><stop offset=".6" stop-color="#F8C9A0"/><stop offset="1" stop-color="#E4A57A"/></radialGradient>
          <radialGradient id="gHelmet" cx="35%" cy="25%" r="85%"><stop offset="0" stop-color="#FFC06A"/><stop offset=".5" stop-color="#F7931E"/><stop offset="1" stop-color="#C96A06"/></radialGradient>
          <linearGradient id="gNavy" x1="0" x2="1"><stop offset="0" stop-color="#2B4379"/><stop offset=".5" stop-color="#1C2E57"/><stop offset="1" stop-color="#0F1A33"/></linearGradient>
          <linearGradient id="gVest" x1="0" x2="1"><stop offset="0" stop-color="#E4FF6A"/><stop offset=".55" stop-color="#C8F03C"/><stop offset="1" stop-color="#93B81E"/></linearGradient>
          <linearGradient id="gBk" x1="0" x2="1"><stop offset="0" stop-color="#F4F6F9"/><stop offset=".6" stop-color="#D5DAE2"/><stop offset="1" stop-color="#AEB5C1"/></linearGradient>
          <linearGradient id="gBkPanel" y1="0" y2="1"><stop offset="0" stop-color="#3A4558"/><stop offset="1" stop-color="#232B38"/></linearGradient>
          <linearGradient id="gMccb" x1="0" x2="1"><stop offset="0" stop-color="#55585E"/><stop offset=".5" stop-color="#43464B"/><stop offset="1" stop-color="#303236"/></linearGradient>
          <linearGradient id="gToggle" y1="0" y2="1"><stop offset="0" stop-color="#E4E6E9"/><stop offset=".6" stop-color="#B9BDC3"/><stop offset="1" stop-color="#8C9097"/></linearGradient>
        </defs>
        <!-- floor -->
        <rect x="-50" y="320" width="700" height="80" fill="rgba(255,255,255,.06)"/>
        <line x1="-50" y1="320" x2="650" y2="320" stroke="rgba(255,255,255,.18)" stroke-width="2"/>

        <!-- ===== BREAKER (lying flat, gets lifted overhead) ===== -->
        <g transform="translate(375,320)">
          <ellipse class="bk-shadow" cx="-75" cy="3" rx="80" ry="6" fill="rgba(0,0,0,.35)"/>
          <g class="bk-lift"><g transform="rotate(-90)">
              <!-- depth -->
              <path d="M6 -156 H112 Q118 -156 118 -150 V-8 L110 0 V-150 H0 Z" fill="#1C1E21"/>
              <!-- body -->
              <rect x="0" y="-150" width="110" height="150" rx="6" fill="url(#gMccb)"/>
              <path d="M0 -140 H110 M0 -10 H110" stroke="#1f2124" stroke-width="1.2"/>
              <g fill="#26282c"><rect x="14" y="-149" width="18" height="7" rx="1.5"/><rect x="46" y="-149" width="18" height="7" rx="1.5"/><rect x="78" y="-149" width="18" height="7" rx="1.5"/>
                <rect x="14" y="-8" width="18" height="7" rx="1.5"/><rect x="46" y="-8" width="18" height="7" rx="1.5"/><rect x="78" y="-8" width="18" height="7" rx="1.5"/></g>
              <!-- front cover -->
              <rect x="6" y="-136" width="98" height="76" rx="3" fill="#3B3E43"/>
              <circle cx="15" cy="-116" r="4.5" fill="#D5DBE2"/><circle cx="15" cy="-116" r="2" fill="#AEB6C0"/>
              <!-- toggle window -->
              <rect x="30" y="-134" width="34" height="9" rx="1.5" fill="#D8232A"/>
              <rect x="31" y="-125" width="32" height="58" fill="#26282C"/>
<g class="bk-handle">
              <rect x="38" y="-122" width="18" height="36" rx="2" fill="url(#gToggle)"/>
              <rect x="42" y="-120" width="10" height="4" rx="1.5" fill="#55595F"/>
              </g>
              <rect x="40" y="-86" width="14" height="6" rx="1" fill="#9EA3AA"/>
              <text x="33" y="-110" font-family="Poppins" font-size="4.5" fill="#fff">on</text>
              <text x="33" y="-72" font-family="Poppins" font-size="4.5" fill="#fff">off</text>
              <rect x="31.5" y="-104" width="5" height="1.6" fill="#F2D23B"/><rect x="57.5" y="-104" width="5" height="1.6" fill="#3FC46E"/>
              <rect x="31.5" y="-80" width="5" height="1.6" fill="#3FC46E"/>
              <text x="58" y="-116" font-family="Poppins" font-weight="700" font-size="6" fill="#fff">I</text>
              <circle cx="60" cy="-73" r="2.4" fill="none" stroke="#fff" stroke-width="1"/>
              <!-- rating label -->
              <rect x="68" y="-132" width="32" height="44" rx="1.5" fill="#4A4E54"/>
              <g stroke="#9DA3AB" stroke-width="1.1"><path d="M71 -127.0 H88"/><path d="M71 -122.6 H97"/><path d="M71 -118.2 H97"/><path d="M71 -113.8 H88"/><path d="M71 -109.4 H97"/><path d="M71 -105.0 H97"/><path d="M71 -100.6 H88"/><path d="M71 -96.2 H97"/></g>
              <rect x="71" y="-93" width="7" height="4" fill="#9DA3AB"/><rect x="81" y="-93" width="7" height="4" fill="#9DA3AB"/>
              <!-- trip unit -->
              <rect x="8" y="-60" width="94" height="44" rx="3" fill="#303337" stroke="#55595F" stroke-width="1"/>
              <rect x="30" y="-63" width="42" height="5" rx="1" fill="#44474C"/>
              <text x="51" y="-59.3" text-anchor="middle" font-family="Poppins" font-size="3.6" fill="#c9cdd3">In = 630 A</text>
              <g font-family="Poppins" font-weight="700" font-size="6" fill="#fff"><text x="12" y="-50">N</text><text x="24" y="-50">L</text><text x="38" y="-50">S</text><text x="52" y="-50">I</text></g>
              <rect x="12" y="-44" width="52" height="9" rx="1" fill="#222428"/>
              <rect x="14.0" y="-42" width="2.8" height="5" rx=".6" fill="#4BA3FF"/><rect x="18.2" y="-42" width="2.8" height="5" rx=".6" fill="#3FC46E"/><rect x="22.4" y="-42" width="2.8" height="5" rx=".6" fill="#3FC46E"/><rect x="26.6" y="-42" width="2.8" height="5" rx=".6" fill="#3FC46E"/><rect x="30.8" y="-42" width="2.8" height="5" rx=".6" fill="#4BA3FF"/><rect x="35.0" y="-42" width="2.8" height="5" rx=".6" fill="#3FC46E"/><rect x="39.2" y="-42" width="2.8" height="5" rx=".6" fill="#3FC46E"/><rect x="43.4" y="-42" width="2.8" height="5" rx=".6" fill="#3FC46E"/><rect x="47.6" y="-42" width="2.8" height="5" rx=".6" fill="#4BA3FF"/><rect x="51.8" y="-42" width="2.8" height="5" rx=".6" fill="#3FC46E"/><rect x="56.0" y="-42" width="2.8" height="5" rx=".6" fill="#3FC46E"/><rect x="60.2" y="-42" width="2.8" height="5" rx=".6" fill="#3FC46E"/>
              <path d="M66 -58 V-18" stroke="#55595F" stroke-width="1"/>
              <text x="70" y="-52" font-family="Poppins" font-size="4.2" fill="#fff">Trip LSI</text>
              <g font-family="Poppins" font-weight="700" font-size="5" fill="#fff"><text x="70" y="-36">L</text><text x="76" y="-36">S</text><text x="82" y="-36">I</text></g>
              <rect x="69" y="-33" width="18" height="12" rx="1" fill="#222428"/>
              <rect x="89" y="-31" width="9" height="6" rx="1" fill="#55595F"/>
              <circle cx="96" cy="-22" r="1.8" fill="#3FC46E"/>
              <rect x="3" y="-146" width="3" height="136" rx="1.5" fill="#fff" opacity=".08"/>
          </g></g>
        </g>

        <!-- ===== ENGINEER ===== -->
        <g id="troupe"><g transform="translate(300,320)">
          <ellipse cx="0" cy="3" rx="32" ry="6" fill="rgba(0,0,0,.3)"/>
          <g class="eng-jump"><g class="eng-squat"><g class="eng-jitter"><g class="eng-waddle" id="eng" data-face="happy" data-arms="side">
              <!-- legs -->
              <g class="legL"><rect x="-15" y="-28" width="12" height="22" rx="5" fill="url(#gNavy)"/><rect x="-19" y="-9" width="18" height="10" rx="5" fill="#3B2A1C"/></g>
              <g class="legR"><rect x="3" y="-28" width="12" height="22" rx="5" fill="url(#gNavy)"/><rect x="1" y="-9" width="18" height="10" rx="5" fill="#3B2A1C"/></g>
              <!-- torso -->
              <rect x="-25" y="-68" width="50" height="46" rx="19" fill="url(#gNavy)"/>
              <path d="M-24 -52 Q-24 -66 -10 -67 L-4 -67 L-4 -26 L-20 -26 Q-24 -30 -24 -36Z" fill="url(#gVest)"/>
              <path d="M24 -52 Q24 -66 10 -67 L4 -67 L4 -26 L20 -26 Q24 -30 24 -36Z" fill="url(#gVest)"/>
              <rect x="-24" y="-46" width="20" height="4.5" fill="#EEF3FA" opacity=".9"/><rect x="4" y="-46" width="20" height="4.5" fill="#EEF3FA" opacity=".9"/>
              <rect x="-24" y="-37" width="20" height="4.5" fill="#EEF3FA" opacity=".9"/><rect x="4" y="-37" width="20" height="4.5" fill="#EEF3FA" opacity=".9"/>
              <circle cx="14" cy="-58" r="3.2" fill="#F7931E"/>
              <rect x="-25" y="-28" width="50" height="5" rx="2" fill="#0B1326"/>
              <!-- head -->
              <circle cx="-25" cy="-86" r="5.5" fill="#EDB388"/><circle cx="25" cy="-86" r="5.5" fill="#EDB388"/>
              <circle cx="0" cy="-88" r="26" fill="url(#gSkin)"/>
              <ellipse cx="-15" cy="-77" rx="4.5" ry="2.6" fill="#FF8FA0" opacity=".6"/><ellipse cx="15" cy="-77" rx="4.5" ry="2.6" fill="#FF8FA0" opacity=".6"/>
              <circle class="soot" cx="0" cy="-88" r="26" fill="#1d1f24"/>
              <!-- face: strain -->
              <g class="face f-strain" stroke="#1b1b2f" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M-14 -90 L-6 -86.5 L-14 -83"/><path d="M14 -90 L6 -86.5 L14 -83"/>
                <rect x="-7.5" y="-80" width="15" height="7" rx="2.5" fill="#fff" stroke-width="1.8"/><path d="M-7 -76.5 H7 M-2.5 -80 V-73 M2.5 -80 V-73" stroke-width="1.2"/>
              </g>
              <!-- face: oh -->
              <g class="face f-oh">
                <ellipse cx="-9" cy="-87" rx="4.6" ry="5.6" fill="#1b1b2f"/><ellipse cx="9" cy="-87" rx="4.6" ry="5.6" fill="#1b1b2f"/>
                <circle cx="-7.5" cy="-89" r="1.7" fill="#fff"/><circle cx="10.5" cy="-89" r="1.7" fill="#fff"/>
                <ellipse cx="0" cy="-75" rx="4" ry="5" fill="#1b1b2f"/>
              </g>
              <!-- face: happy -->
              <g class="face f-happy">
                <path d="M-14 -86 Q-9.5 -93 -5 -86" stroke="#1b1b2f" stroke-width="2.6" fill="none" stroke-linecap="round"/>
                <ellipse cx="9" cy="-87" rx="4.6" ry="5.6" fill="#1b1b2f"/><circle cx="10.5" cy="-89" r="1.7" fill="#fff"/>
                <path d="M-9 -80 Q0 -66 9 -80Z" fill="#1b1b2f"/><path d="M-4 -73 Q0 -70.5 4 -73 Q0 -76 -4 -73Z" fill="#FF7C8F"/>
              </g>
              <!-- face: zapped -->
              <g class="face f-zapped">
                <circle cx="-9" cy="-87" r="6" fill="#fff"/><circle cx="9" cy="-87" r="6" fill="#fff"/>
                <circle cx="-9" cy="-87" r="1.6" fill="#1b1b2f"/><circle cx="9" cy="-87" r="1.6" fill="#1b1b2f"/>
                <path d="M-9 -75 l3 -3 3 3 3 -3 3 3 3 -3" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
              </g>
              <path class="sweat" d="M28 -104 Q31 -98 28 -95 Q25 -98 28 -104Z" fill="#7FD4FF"/>
              <!-- spiky hair (after the zap) -->
              <path class="hair" d="M-24 -106 L-22 -128 L-14 -112 L-8 -138 L-2 -114 L4 -140 L9 -114 L16 -134 L20 -112 L26 -124 L25 -104Z" fill="#3B2A1C"/>
              <!-- helmet -->
              <g class="helmet">
              <path d="M-28 -95 Q-28 -122 0 -122 Q28 -122 28 -95Z" fill="url(#gHelmet)"/>
              <rect x="-33" y="-98" width="66" height="7.5" rx="3.75" fill="#E07A0B"/>
              <ellipse cx="-11" cy="-114" rx="8" ry="3.5" fill="#fff" opacity=".35" transform="rotate(-18 -11 -114)"/>
              <rect x="-21.0" y="-110.9" width="42" height="9.7" rx="4.9" fill="#fff" stroke="#E07A0B" stroke-width=".8"/><image href="data:image/png;base64,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" x="-18.0" y="-108.87" width="36" height="5.74" preserveAspectRatio="xMidYMid meet"/>
              </g>
              <!-- arms: side (walk) -->
              <g class="arm a-side">
                <g class="armL"><path d="M-20 -58 Q-31 -46 -28 -32" stroke="#1C2E57" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="-28" cy="-30" r="6" fill="url(#gSkin)"/></g>
                <g class="armR"><path d="M20 -58 Q31 -46 28 -32" stroke="#233A6B" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="28" cy="-30" r="6" fill="url(#gSkin)"/></g>
              </g>
              <!-- arms: grab -->
              <g class="arm a-grab" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M-20 -58 L-36 -44 L-41 -27" stroke="#1C2E57"/><path d="M20 -58 L36 -44 L41 -27" stroke="#233A6B"/>
                <circle cx="-41" cy="-24" r="6" fill="url(#gSkin)" stroke="none"/><circle cx="41" cy="-24" r="6" fill="url(#gSkin)" stroke="none"/>
              </g>
              <!-- arms: overhead -->
              <g class="arm a-up" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M-20 -60 L-38 -92 L-38 -126" stroke="#1C2E57"/><path d="M20 -60 L38 -92 L38 -126" stroke="#233A6B"/>
                <circle cx="-38" cy="-131" r="6.5" fill="url(#gSkin)" stroke="none"/><circle cx="38" cy="-131" r="6.5" fill="url(#gSkin)" stroke="none"/>
              </g>
              <!-- arms: final pose (fist on hip + thumbs up) -->
              <g class="arm a-pose">
                <path d="M-20 -58 L-36 -46 L-23 -33" stroke="#1C2E57" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="-22" cy="-33" r="6" fill="url(#gSkin)"/>
                <path d="M20 -60 L40 -64 L44 -76" stroke="#233A6B" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                <g transform="rotate(-8 44 -82)">
                  <rect x="39.5" y="-101" width="7.5" height="18" rx="3.75" fill="#F8C9A0" stroke="#D99B72" stroke-width=".8"/>
                  <rect x="41" y="-99.5" width="4.5" height="4" rx="1.6" fill="#FFE6CF"/>
                  <rect x="36" y="-87" width="17" height="15" rx="5" fill="url(#gSkin)" stroke="#D99B72" stroke-width=".8"/>
                  <path d="M40 -83 H52 M40 -79.5 H52 M40 -76 H51" stroke="#D99B72" stroke-width="1" stroke-linecap="round"/>
                </g>
              </g>
          </g></g></g></g>
        </g></g>

        <!-- ===== ZAP ===== -->
        <g class="zap" stroke="#FFF7B0" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M252 190 l10 16 -12 8 14 20 -10 12 12 20"/>
          <path d="M348 190 l-10 16 12 8 -14 20 10 12 -12 20"/>
          <path d="M300 190 l-6 10 8 6 -6 8"/>
          <path d="M232 150 l-18 6 8 10 -20 8"/><path d="M368 150 l18 6 -8 10 20 8"/>
          <path d="M262 270 l-16 4 6 10 -14 6"/><path d="M338 270 l16 4 -6 10 14 6"/>
        </g>
      </svg>
`;
