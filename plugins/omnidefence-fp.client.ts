import { startOmniDefenceFingerprint } from '~/scripts/omniDefenceFingerprint';

// OmniDefence browser beacon (→ /omnidefence/fp). Runs for every visitor, logged in or
// not, so the server can tell real people in real browsers from automation.
export default defineNuxtPlugin(() => {
    startOmniDefenceFingerprint();
});
