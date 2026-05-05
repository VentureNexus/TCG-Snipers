export default function Privacy() {
  const updated = "May 5, 2026";
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-10">Last updated: {updated}</p>

      <div className="space-y-10 text-[15px] leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-xl font-semibold mb-3">1. Overview</h2>
          <p>
            TCG Snipers ("we", "us", "our") is a locally-installed desktop application. Your privacy
            is fundamental to how we designed the Software. We do not collect, transmit, or store
            your personal information on any remote server. All data you enter into TCG Snipers —
            profiles, shipping addresses, payment details, proxy lists, task configurations — lives
            exclusively on your local machine.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">2. We Do Not Sell Your Data</h2>
          <p>
            TCG Snipers does not sell, trade, rent, or otherwise transfer any personal information
            to third parties for commercial purposes — ever. Your data is yours.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">3. Data Stored Locally</h2>
          <p className="mb-3">
            All application data is stored in an embedded local database on your device. This
            includes:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Task and monitor configurations</li>
            <li>Checkout profiles (name, address, payment details)</li>
            <li>Proxy lists</li>
            <li>Account credentials for supported retailers</li>
            <li>Activity logs and checkout history</li>
            <li>Application settings and preferences</li>
          </ul>
          <p className="mt-3">
            None of this data is ever uploaded to or accessible by TCG Snipers or any third party.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">4. Data Deleted on Uninstall</h2>
          <p>
            When you uninstall TCG Snipers, all locally stored application data — including
            profiles, tasks, credentials, and logs — is permanently deleted from your device. All
            active connections initiated by the Software (retailer sessions, proxy tunnels,
            monitor loops) are terminated upon application exit or uninstall. We retain no copy of
            this data.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">5. Discord Account Access</h2>
          <p className="mb-3">
            TCG Snipers offers optional sign-in with Discord via OAuth 2.0. If you choose to
            connect your Discord account, the Software requests the following access:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Basic profile</strong> — your Discord username, avatar, and email address,
              used to identify your account and link your license.
            </li>
            <li>
              <strong>Notifications</strong> — the Software sends checkout alerts and status
              updates to your Discord account (via webhook or direct message) so you are notified
              the moment a product is successfully purchased or a task encounters an error.
            </li>
          </ul>
          <p className="mt-3">
            Your Discord access token is stored locally on your device only and is never
            transmitted to our servers. We do not read your Discord messages, servers, channels,
            or any other Discord data. Notifications are outbound only — sent from the Software
            running on your machine.
          </p>
          <p className="mt-3">
            You can revoke TCG Snipers' access to your Discord account at any time by visiting{" "}
            <a
              href="https://discord.com/settings/authorized-apps"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              discord.com/settings/authorized-apps
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">6. License Verification</h2>
          <p>
            To validate your subscription, the Software communicates with our license server. This
            request includes your license key and a device fingerprint used to enforce the
            single-device limit. No personal information such as name, email, or address is
            included in license checks. License verification data is not sold or shared with third
            parties.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">7. Payment Information</h2>
          <p>
            All payment processing is handled by{" "}
            <a
              href="https://stripe.com/privacy"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Stripe
            </a>
            . TCG Snipers does not receive, process, or store your payment card details. When you
            complete a purchase, your payment data is transmitted directly and securely to Stripe.
            Please refer to Stripe's Privacy Policy for details on how payment data is handled.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">8. Analytics &amp; Crash Reporting</h2>
          <p>
            TCG Snipers does not embed any third-party analytics, tracking pixels, or crash
            reporting SDKs. We do not monitor your usage patterns, session duration, or in-app
            behavior.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">9. Third-Party Retailer Interactions</h2>
          <p>
            When TCG Snipers interacts with retailer websites on your behalf, those requests
            originate from your IP address (or the proxy address you configure). You are
            responsible for your use of the Software in accordance with each retailer's terms of
            service. TCG Snipers does not intercept, store, or transmit the data exchanged between
            you and those retailers.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">10. Children's Privacy</h2>
          <p>
            TCG Snipers is not directed to children under the age of 13. We do not knowingly
            collect personal information from children. If you believe a child under 13 has
            provided us with personal information, please contact us and we will take steps to
            delete it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">11. Your Rights</h2>
          <p className="mb-3">
            Because we do not collect or store your personal data on our servers, most traditional
            data subject requests (access, deletion, portability) are fulfilled automatically —
            your data never leaves your device. You always have full control over your local data
            by managing or uninstalling the application. If you have specific concerns about data
            held in connection with your license or payment, please contact us.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">12. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. When we do, we will update the
            "Last updated" date at the top of this page. Continued use of the Software after
            changes are posted constitutes your acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">13. Contact</h2>
          <p>
            Questions about this Privacy Policy? Contact us at{" "}
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
