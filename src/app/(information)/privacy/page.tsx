import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, infoStyles as s } from "@/components/info/InfoPage";
import {
  contactHref,
  POLICY_UPDATED,
  PRIVACY_PATH,
  SITE_ORIGIN,
  SUPPORT_EMAIL,
  SUPPORT_PATH,
} from "@/lib/site-info";

export const metadata: Metadata = {
  title: "Privacy policy · Shalom",
  description:
    "How Shalom handles chat questions, local history, website accounts, service-provider processing and privacy requests.",
  alternates: { canonical: `${SITE_ORIGIN}${PRIVACY_PATH}` },
};

export default function PrivacyPage() {
  return (
    <InfoPage
      current="privacy"
      title="Privacy policy"
      lead="What Shalom handles, why it is needed, and the choices you have."
      updated={POLICY_UPDATED}
    >
      <nav className={s.toc} aria-label="Policy sections">
        <a href="#chat-processing">AI chat</a>
        <a href="#storage">History and accounts</a>
        <a href="#providers">Service providers</a>
        <a href="#choices">Your choices</a>
        <a href="#contact">Contact</a>
      </nav>

      <section aria-labelledby="scope">
        <h2 id="scope">About this policy</h2>
        <p>
          This policy covers the Shalom website and its native iPhone and iPad
          app. Their storage and account features differ, as described below.
          For support or privacy questions, contact{" "}
          <a href={contactHref("privacy")}>{SUPPORT_EMAIL}</a>. Public Bible
          passages and flashcards are separate from private conversation
          history.
        </p>
      </section>

      <section aria-labelledby="chat-processing">
        <h2 id="chat-processing">When you ask an AI question</h2>
        <p>
          Sending a question transmits its text and a limited, shortened portion
          of the same conversation&apos;s recent messages to Shalom&apos;s
          server. The server sends the conversation context, instructions and
          relevant lookup results to OpenRouter, which routes the request to an
          AI model provider to produce an answer. Bible passages and flashcard
          results may be included so the answer can refer to them.
        </p>
        <p>
          This processing is necessary to generate the answer; it is not an
          on-device AI conversation. Local history storage does not prevent sent
          text from reaching these services. Questions about faith may reveal
          religious beliefs or other sensitive information. Avoid names, contact
          details, health information, passwords, verification codes and
          anything you do not want processed outside the device.
        </p>
        <p>
          OpenRouter and the selected provider may retain or use requests under
          their own policies. The provider can vary. Shalom does not guarantee
          zero retention or that submitted text is never used for training.
          Check the provider information linked below before deciding what to
          send.
        </p>
      </section>

      <section aria-labelledby="storage">
        <h2 id="storage">History and account information</h2>
        <h3>Native app, without sign-in</h3>
        <p>
          Native sign-in is disabled in the current app configuration. Guest
          conversations are saved in the app&apos;s storage on that device,
          within a bounded cache. The cache uses operating-system file
          protection and is excluded from normal app backups. Shalom&apos;s chat
          database does not save a guest conversation as an account history.
          This does not describe retention by hosting services or AI providers.
        </p>
        <h3>Website, without sign-in</h3>
        <p>
          The website keeps a limited list of signed-out conversations in the
          current tab&apos;s session storage. This is not cross-device history
          and is normally removed when the tab session ends. Browser
          session-restoration behaviour can vary. Clearing site data removes
          browser-held data, but not any copies already transmitted to service
          providers.
        </p>
        <h3>Website accounts</h3>
        <p>
          If you use website sign-in, Supabase handles authentication using your
          email address and session credentials. Shalom can store your user
          identifier, display name, conversations and related message metadata
          in its database so you can return to account history. Stored messages
          may include model-supplied content, tool results, citation evidence
          and reasoning metadata if returned by the model. These conversations
          are not part of the public flashcard deck.
        </p>
        <p>
          After signing in, signed-out conversations from the current tab can
          become account history: automatically when you continue one, or when
          you choose Keep. Those earlier messages are then copied to the account
          database and are no longer held only in the tab.
        </p>
        <p>
          Signed-in history does not have an automatic expiry in the current
          application code. Signing out ends the session; it is not account or
          server-history deletion. Questions about access, correction or removal
          can be sent to the contact below. Do not treat local deletion as
          erasure of server, provider or backup copies.
        </p>
      </section>

      <section aria-labelledby="technical-data">
        <h2 id="technical-data">Service operation and browser storage</h2>
        <p>
          Shalom uses request counts to enforce usage limits and protect
          availability. Counts are associated with a signed-in user identifier
          or a keyed hash of a guest&apos;s IP address. The application&apos;s
          usage-counter records do not contain the raw IP address. The server
          and hosting providers still receive network requests and may retain
          ordinary request metadata, such as IP address, time, device/browser
          information and errors, under their own settings and policies.
        </p>
        <p>
          The counter cleanup code attempts to remove rows last updated more
          than three days earlier. Cleanup is periodic and best-effort, not a
          promise that every record or backup is deleted at an exact deadline.
          Counters may instead be held in temporary server memory when database
          counters are unavailable.
        </p>
        <p>
          The website uses authentication cookies for sign-in, session storage
          for tab history and one-time question handoffs, and local storage for
          preferences such as sidebar collapse. A session cookie or
          session-storage flag remembers whether the launch screen was shown.
          These support and privacy pages do not add an advertising or analytics
          service of their own.
        </p>
      </section>

      <section aria-labelledby="providers">
        <h2 id="providers">Services involved</h2>
        <ul>
          <li>
            <strong>Vercel:</strong> hosts Shalom&apos;s website and server API,
            which receive requests and serve the app.
          </li>
          <li>
            <strong>Supabase:</strong> provides database and website
            authentication services. The public Bible/card dataset and signed-in
            account history are stored separately in application data
            structures.
          </li>
          <li>
            <strong>OpenRouter and its selected AI provider:</strong> process
            question text, recent context and lookup results to generate
            answers.
          </li>
          <li>
            <strong>Email services:</strong> process the address and information
            you choose to send when contacting support. The published support
            address uses Gmail; your own email provider may also process the
            message.
          </li>
        </ul>
        <p>
          These services may process information outside your country.
          Provider-side retention, logging, training settings and backup
          handling are not controlled by deleting history on your device. Shalom
          does not state a universal retention period for those copies.
        </p>
        <p>
          Further information:{" "}
          <a
            href="https://openrouter.ai/privacy"
            rel="noreferrer"
            target="_blank"
          >
            OpenRouter privacy policy
          </a>
          ,{" "}
          <a
            href="https://openrouter.ai/docs/guides/privacy/data-collection"
            rel="noreferrer"
            target="_blank"
          >
            OpenRouter data collection
          </a>
          ,{" "}
          <a
            href="https://openrouter.ai/docs/guides/privacy/provider-logging"
            rel="noreferrer"
            target="_blank"
          >
            AI provider policies
          </a>
          ,{" "}
          <a
            href="https://supabase.com/privacy"
            rel="noreferrer"
            target="_blank"
          >
            Supabase privacy policy
          </a>
          ,{" "}
          <a
            href="https://vercel.com/legal/privacy-policy"
            rel="noreferrer"
            target="_blank"
          >
            Vercel privacy policy
          </a>
          , and{" "}
          <a
            href="https://policies.google.com/privacy"
            rel="noreferrer"
            target="_blank"
          >
            Google privacy policy
          </a>
          .
        </p>
      </section>

      <section aria-labelledby="support-messages">
        <h2 id="support-messages">When you contact support</h2>
        <p>
          Emailing support shares your sender address, message and any
          attachments you choose to include with the support mailbox and the
          email services handling the message. Send only what is needed to
          explain the problem. Support messages are used to answer requests and
          investigate app, safety or privacy concerns; there is no published
          automatic deletion schedule for support email.
        </p>
        <p>
          In app versions with a Report control, preparing a draft is not an
          upload. Answer text is excluded by default and added only if you
          explicitly choose it. An answer can repeat personal material from a
          question, so inspect the preview. Sharing or emailing requires your
          own action and does not prove that support received or acted on the
          report.
        </p>
      </section>

      <section aria-labelledby="choices">
        <h2 id="choices">Your choices and requests</h2>
        <ul>
          <li>
            You can browse public flashcards without asking an AI question.
            Reading saved native answers does not itself request a new AI
            answer.
          </li>
          <li>
            App versions with AI-sharing controls let you review permission
            before sending and turn it off in Account. Older builds may not have
            these controls. You can always stop sending further questions;
            stopping an answer cannot recall data already transmitted.
          </li>
          <li>
            App versions with Delete local chats can clear the native guest
            cache and unsent draft after confirmation. Older builds may require
            removing the app to remove its local data. Neither action deletes
            provider or account-server records.
          </li>
          <li>
            You can clear browser site data to remove browser-held history,
            preferences and cookies. Browser restoration and synchronisation
            settings are controlled by the browser.
          </li>
          <li>
            You can contact support about access, correction, deletion or other
            applicable privacy rights. Support may need to verify account
            control before acting. There is no one-click server account-deletion
            feature in this version, and a request is not an automatic deletion
            confirmation.
          </li>
        </ul>
      </section>

      <section aria-labelledby="security">
        <h2 id="security">Security and younger users</h2>
        <p>
          The production website and app API are configured for HTTPS. This is
          not end-to-end encryption between you and a private human adviser:
          Shalom and the AI services process submitted text to provide an
          answer. No service can promise absolute security, and checked Bible
          references do not guarantee an answer is correct.
        </p>
        <p>
          Shalom does not currently verify age or provide parental-control
          tools. Do not enter personal information about children. A parent or
          guardian can contact support about a child&apos;s information. App age
          ratings do not replace decisions about what personal information is
          appropriate to share.
        </p>
      </section>

      <section aria-labelledby="changes">
        <h2 id="changes">Changes to this policy</h2>
        <p>
          This page may be updated as the service, providers or app controls
          change. The date above identifies the latest revision. Revisit it
          before sharing information, particularly after an app update or a
          change to AI processing.
        </p>
      </section>

      <section aria-labelledby="contact">
        <h2 id="contact">Contact</h2>
        <p>
          For privacy questions or a request about your information, email
          Shalom support at <a href={contactHref("privacy")}>{SUPPORT_EMAIL}</a>
          . Do not include passwords, verification codes or API keys. For app
          help, see <Link href={SUPPORT_PATH}>Support</Link>.
        </p>
      </section>
    </InfoPage>
  );
}
