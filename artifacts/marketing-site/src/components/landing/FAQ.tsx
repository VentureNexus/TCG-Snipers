import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    q: "How does pricing work?",
    a: "$200 for the first 3 months gets you onboarded — that's a one-time $150 setup fee plus the $50/mo subscription. After 90 days you're billed $50/mo, cancel anytime.",
  },
  {
    q: "Which sites are supported?",
    a: "Target, Walmart, Best Buy, Amazon, TCGplayer, and Pokémon Center are live today, with more retailers (including Costco and GameStop) shipping regularly via the desktop app's auto-updater.",
  },
  {
    q: "Can I run on multiple devices?",
    a: "Each license activates on one device at a time. You can swap devices yourself any time from the Manage license dashboard at no extra cost. If you want a second machine running at the same time (24/7), you'll need to purchase a second license — that's another $150 setup fee + $50/mo, so $200 up front for the first month and $50/mo after that, per additional device.",
  },
  {
    q: "Do I need an account on this site?",
    a: "No. Checkout, license delivery, and self-service are all driven by your email — we send a magic link if you ever need to manage your subscription.",
  },
  {
    q: "What happens if my card fails?",
    a: "The desktop app keeps a 5-minute heartbeat with our license server. If your subscription becomes past_due, the bot stops running until you fix the payment from the Manage license page.",
  },
  {
    q: "What do I need to get started?",
    a: "A Windows or macOS machine, an email inbox the bot can read for verification codes, and your retailer accounts pre-loaded with shipping and payment info. Proxies are optional but recommended for high-volume drops.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="px-6 py-24 max-w-3xl mx-auto">
      <div className="text-center mb-10">
        <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-2">FAQ</p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Frequently asked questions
        </h2>
      </div>
      <div className="bg-card/60 border border-border rounded-2xl px-6">
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((f, i) => (
            <AccordionItem key={f.q} value={`item-${i}`} className="border-border last:border-0">
              <AccordionTrigger className="text-left text-base font-semibold py-5 hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-sm leading-relaxed pb-5">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
