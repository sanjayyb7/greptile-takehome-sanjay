/* The field's public surface. Everything an app outside this folder should need is here,
   and everything it should not need — the cells, the send box, the wipe — is not.
   Importing a file directly still works; this is the line that says which of them are the
   ones meant to be imported.

     import { PasskeyField } from "./passkey";

   Two layers, each usable on its own:
     PasskeyField   the whole thing — cells, send box, status line, resend
     usePasskey     the state machine with no markup, for a field of your own
*/
export { PasskeyField } from "./PasskeyField";
export { usePasskey } from "./usePasskey";
export { verifyPasscode, requestNewCode, RESEND_COOLDOWN_S } from "./verifyPasscode";
