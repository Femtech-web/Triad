# Triad browser extension

Checks a payment-change email where it arrives. Open the email in Gmail or Outlook on the web, click the Triad icon, confirm which supplier it claims to be from and what it asks to change, and Triad's check opens filled in. Works in Chrome, Edge, Brave and Firefox (Manifest V3).

- **Reads only when you click:** it uses `activeTab`, so it can read a mail page only after you click its icon. It has no access to your mail otherwise.
- **Your suppliers stay in your browser:** their real domain, the account you pay today and the contact you'd call, kept in `chrome.storage.local`. Triad never stores them.
- **Nothing is sent until you press "Check it":** the email travels to Triad's page in the URL fragment (`#prefill=…`), which browsers never send to a server.

## Install

- **Chrome, Edge or Brave:** open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select this folder.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `manifest.json`.

Then open the extension's options to add the suppliers you pay. The icons are drawn by `node make-icons.mjs`.
