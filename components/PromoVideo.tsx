"use client";

import { useEffect, useState } from "react";

const CUTS = {
  land: { video: "/promo/jobwatch-promo-16x9.mp4", poster: "/promo/jobwatch-promo-16x9.jpg" },
  port: { video: "/promo/jobwatch-promo-9x16.mp4", poster: "/promo/jobwatch-promo-9x16.jpg" },
} as const;

// The 60-second tour: the vertical cut on phones, the widescreen cut elsewhere.
// Nothing downloads until the visitor presses play.
export function PromoVideo() {
  const [cut, setCut] = useState<keyof typeof CUTS>("land");
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const pick = () => setCut(mq.matches ? "port" : "land");
    pick();
    mq.addEventListener("change", pick);
    return () => mq.removeEventListener("change", pick);
  }, []);
  const c = CUTS[cut];
  return (
    <figure className={`promo-video promo-${cut}`}>
      <video key={cut} controls playsInline preload="none" poster={c.poster} aria-label="JobWatch in 60 seconds">
        <source src={c.video} type="video/mp4" />
        <track kind="captions" src="/promo/jobwatch-promo.en.vtt" srcLang="en" label="English" />
      </video>
      <figcaption className="small muted">
        Share it: <a href={CUTS.land.video} download>widescreen (16:9)</a> · <a href={CUTS.port.video} download>vertical (9:16)</a>
      </figcaption>
    </figure>
  );
}
