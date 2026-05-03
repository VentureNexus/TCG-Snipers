export default function Terms() {
  const updated = "May 3, 2026";
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight mb-2">Terms of Service</h1>
      <p className="text-sm text-muted-foreground mb-10">Last updated: {updated}</p>

      <div className="space-y-10 text-[15px] leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
          <p>
            By purchasing, downloading, installing, or using the TCG Snipers software ("Software"),
            you ("Customer", "you") agree to be bound by these Terms of Service ("Terms"). If you do
            not agree to these Terms, do not purchase or use the Software.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">2. License</h2>
          <p>
            Subject to your ongoing subscription and these Terms, TCG Snipers grants you a personal,
            non-exclusive, non-transferable, revocable license to install and use the Software on a
            single device per active license. Each license is bound to one device fingerprint and
            may not be shared, resold, or distributed.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">3. Pricing &amp; Billing</h2>
          <p>
            Use of the Software requires a one-time setup fee of $150 USD plus a recurring
            subscription fee of $50 USD per month (or other plan as displayed at checkout). Billing
            is processed by Stripe. Subscriptions automatically renew until canceled. You authorize
            us to charge your payment method on each billing cycle.
          </p>
        </section>

        <section className="border border-primary/30 bg-primary/5 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-3 text-primary">4. No Refund Policy</h2>
          <p className="mb-3">
            <strong>All sales are final.</strong> Due to the nature of digital goods and the
            immediate access granted upon purchase, TCG Snipers does not provide refunds, credits,
            or exchanges for any reason, including but not limited to:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>The setup fee, in whole or in part;</li>
            <li>Monthly subscription charges, including unused time after cancellation;</li>
            <li>Failure to successfully purchase products through the Software;</li>
            <li>Retailer changes, anti-bot measures, captchas, or stockouts;</li>
            <li>Account termination for violation of these Terms;</li>
            <li>Dissatisfaction with results or perceived value.</li>
          </ul>
          <p className="mt-3">
            You may cancel your subscription at any time to stop future charges. Cancellation does
            not entitle you to a refund of any prior payments. Chargebacks initiated without first
            contacting support may result in immediate license termination.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">5. Cancellation</h2>
          <p>
            You may cancel your subscription at any time through the customer portal. Upon
            cancellation, your license remains active until the end of the current paid billing
            period, after which the Software will stop functioning. No refunds will be issued for
            partial months.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">6. Acceptable Use</h2>
          <p className="mb-3">You agree not to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Reverse engineer, decompile, or disassemble the Software;</li>
            <li>Share, lease, sublicense, or resell your license or the Software;</li>
            <li>Use the Software for any illegal purpose or in violation of retailer terms;</li>
            <li>Attempt to bypass license enforcement or device limits;</li>
            <li>Interfere with the Software's operation or our servers.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">7. No Guarantee of Results</h2>
          <p>
            The Software is a tool that automates browsing and checkout actions on third-party
            retailer websites. We do not guarantee successful purchases, product availability,
            inventory, pricing accuracy, or any specific result. Retailers may change their websites
            or implement anti-automation measures at any time, which may temporarily or permanently
            reduce the Software's effectiveness.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">8. Third-Party Retailers</h2>
          <p>
            TCG Snipers is not affiliated with, endorsed by, or sponsored by any retailer, brand,
            or trademark holder displayed on this website or supported by the Software. All
            trademarks remain the property of their respective owners. You are solely responsible
            for complying with each retailer's terms of service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">9. Disclaimer of Warranties</h2>
          <p>
            THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND, EITHER
            EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY,
            FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE
            SOFTWARE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">10. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, TCG SNIPERS SHALL NOT BE LIABLE FOR ANY
            INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF
            PROFITS OR REVENUE, ARISING OUT OF YOUR USE OR INABILITY TO USE THE SOFTWARE. OUR TOTAL
            LIABILITY FOR ANY CLAIM SHALL NOT EXCEED THE AMOUNTS PAID BY YOU IN THE PRIOR THREE (3)
            MONTHS.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">11. Termination</h2>
          <p>
            We reserve the right to suspend or terminate your license and access to the Software at
            any time, without refund, for violation of these Terms or for any other reason at our
            sole discretion.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">12. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the Software after changes
            are posted constitutes your acceptance of the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">13. Contact</h2>
          <p>
            Questions about these Terms? Contact us at{" "}
            <a href="mailto:support@tcgsnipers.com" className="text-primary hover:underline">
              support@tcgsnipers.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
