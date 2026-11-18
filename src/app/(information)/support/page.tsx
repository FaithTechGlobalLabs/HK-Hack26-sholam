import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, infoStyles as s } from "@/components/info/InfoPage";
import {
  contactHref,
  PRIVACY_PATH,
  SITE_ORIGIN,
  SUPPORT_EMAIL,
  SUPPORT_PATH,
} from "@/lib/site-info";

export const metadata: Metadata = {
  title: "Support · Shalom",
  description:
    "Get help with Shalom chat, Bible references, flashcards and your data. Contact Shalom support by email.",
  alternates: { canonical: `${SITE_ORIGIN}${SUPPORT_PATH}` },
};

export default function SupportPage() {
  return (
    <InfoPage
      current="support"
      title="Help with Shalom"
      lead="Questions about the app, an answer, or your information? Here is how to get help."
    >
      <section aria-labelledby="contact">
        <h2 id="contact">Contact support</h2>
        <p>
          Email <a href={contactHref()}>{SUPPORT_EMAIL}</a> for app problems,
          incorrect or harmful answers, Bible-reference concerns, and privacy
          questions. The link opens your email app with a subject only. It does
          not attach a conversation or send a message for you.
        </p>
        <p>
          For an app problem, include the app version and build number if
          available, your device and operating-system version, and a short
          description of what happened. A screenshot or a brief answer excerpt
          is optional. Share only what is needed; leave out passwords,
          verification codes, API keys and sensitive personal information.
        </p>
        <p>
          Support is handled by email, not an in-app live-chat service. There is
          no guaranteed response time or automatic report-receipt status.
        </p>
      </section>

      <section aria-labelledby="common-questions" className={s.faq}>
        <h2 id="common-questions">Common questions</h2>
        <details>
          <summary>Slow or missing answers</summary>
          <p>
            Chat needs an internet connection and an available AI model service.
            Provider availability and shared usage limits can delay or prevent
            an answer. Check your connection, wait a little, and try again
            deliberately. If the app says a question may already have been
            saved, check your history before resending it.
          </p>
        </details>
        <details>
          <summary>Checked Bible references</summary>
          <p>
            It means the passage was looked up before that answer and matched by
            the app&apos;s reference check. It does not certify the
            interpretation or every sentence of the answer. A reference marked
            not checked has no such confirmation. Open the passage and read it
            for yourself; Shalom can make mistakes.
          </p>
        </details>
        <details>
          <summary>Report a problem</summary>
          <p>
            Email support with a short description and, if you choose, the
            relevant excerpt or reference. You do not need to send your entire
            chat history. App versions with a Report control let you prepare an
            export preview; preparing or copying it does not send it to support.
            You must choose to share or email it yourself. Never include another
            person&apos;s private information without permission.
          </p>
        </details>
        <details>
          <summary>Offline flashcards</summary>
          <p>
            The native iPhone and iPad app includes a deck for offline reading
            and can keep a downloaded public deck. The website normally needs a
            connection. New chat answers always need internet access. Browsing
            cards does not itself send a question to an AI provider.
          </p>
        </details>
        <details>
          <summary>Find chat history</summary>
          <p>
            Native guest history is saved in the app on that device. Signed-out
            website history uses the current browser tab&apos;s session storage.
            A website account can keep signed-in conversations on the server.
            Native sign-in is currently disabled. Local history storage does not
            mean sent questions stay on the device: chat text is processed by
            Shalom, OpenRouter and the selected AI provider.
          </p>
        </details>
        <details>
          <summary>Remove history or data</summary>
          <p>
            In app versions with Delete local chats, use Account and confirm the
            deletion. It clears native guest history and the unsent draft on
            that device, not copies already shared with service providers. Older
            app versions may not offer this control. Clearing browser site data
            removes browser-held history, preferences and sign-in cookies; it
            does not erase signed-in server history.
          </p>
          <p>
            To ask about access, correction or deletion of account information,
            email <a href={contactHref("privacy")}>{SUPPORT_EMAIL}</a>. There is
            no one-click server account-deletion feature in this version.
            Support may need to verify that you control the account before
            acting. Do not send your password or a verification code. See the{" "}
            <Link href={PRIVACY_PATH}>privacy policy</Link> for the limits of
            local deletion.
          </p>
        </details>
        <details>
          <summary>Prices and usage limits</summary>
          <p>
            Shalom&apos;s chat, passages and flashcards are free. Native
            purchasing and subscriptions are disabled. Usage limits protect the
            service; they are not an upgrade offer.
          </p>
        </details>
      </section>

      <section aria-labelledby="important">
        <h2 id="important">When you need more than app support</h2>
        <p>
          Shalom is a study aid, not a pastor, counsellor, medical professional
          or emergency service. For an immediate safety concern, contact local
          emergency services or a trusted person who can help. Do not wait for a
          support email reply.
        </p>
      </section>
    </InfoPage>
  );
}
