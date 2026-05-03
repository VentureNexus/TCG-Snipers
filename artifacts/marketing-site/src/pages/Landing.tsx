import { Hero } from "@/components/landing/Hero";
import { RetailersStrip } from "@/components/landing/RetailersStrip";
import { StatsBand } from "@/components/landing/StatsBand";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { TrackRecord } from "@/components/landing/TrackRecord";
import { Testimonials } from "@/components/landing/Testimonials";
import { Pricing } from "@/components/landing/Pricing";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTA } from "@/components/landing/FinalCTA";

export default function Landing() {
  return (
    <div>
      <Hero />
      <RetailersStrip />
      <StatsBand />
      <Features />
      <HowItWorks />
      <TrackRecord />
      <Testimonials />
      <Pricing />
      <FAQ />
      <FinalCTA />
    </div>
  );
}
