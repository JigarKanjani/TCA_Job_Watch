"use client";

import { useCallback, useState } from "react";
import { SignalField } from "./SignalField";

// Illustrative roles shown when the radar lights up a match.
const EXAMPLES = [
  { title: "Supply Chain Analyst", meta: "Energy company · Calgary, AB · Hybrid", when: "4 min ago" },
  { title: "Business Analyst", meta: "Fintech startup · Remote, Canada", when: "11 min ago" },
  { title: "Program Coordinator", meta: "Non-profit · Edmonton, AB · On-site", when: "just now" },
  { title: "Data Analyst", meta: "Retail group · Toronto, ON · Hybrid", when: "7 min ago" },
  { title: "IT Support Analyst", meta: "Health network · Calgary, AB", when: "2 min ago" },
  { title: "Procurement Specialist", meta: "Construction firm · Vancouver, BC", when: "9 min ago" },
  { title: "HR Coordinator", meta: "SaaS company · Remote, US", when: "5 min ago" },
  { title: "Operations Analyst", meta: "Logistics co. · Austin, TX", when: "just now" },
];

export function HeroRadar() {
  const [current, setCurrent] = useState(0);
  const [tick, setTick] = useState(0);

  const onIgnite = useCallback((label: number) => {
    setCurrent(label % EXAMPLES.length);
    setTick((t) => t + 1);
  }, []);

  const job = EXAMPLES[current];

  return (
    <div className="radar">
      <SignalField labelCount={EXAMPLES.length} onIgnite={onIgnite} />
      <div className="radar-status">
        <span className="pulse-dot" aria-hidden="true" /> Scanning LinkedIn + Indeed
      </div>
      <div className="radar-card" key={tick} aria-live="polite">
        <div className="alert-card">
          <div className="alert-top">
            <span>● New role just posted</span>
            <span className="radar-example">Example</span>
          </div>
          <div className="alert-body">
            <h4>{job.title}</h4>
            <div className="co">{job.meta}</div>
            <div className="alert-foot">
              <span className="apply">Apply now ↗</span>
              <span className="when">posted {job.when}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
