/*
 * A pasted code lands complete, so none of the placing that typing does is left to watch.
 * The digits resolve in together, and the one move still to make — out of the last cell
 * into the send box — becomes the whole of the moment: it waits for them to settle, then
 * takes longer than it would have.
 *
 * Both numbers came down from 240/360: the arrow was not legible until 600ms, which is a
 * long time to hold someone off a control they have just finished filling in. The order
 * still holds — the digits resolve, then the move — and 280 is inside the 300ms a piece
 * of UI motion gets.
 *
 * Their own module because the cells and the send box both need them, and the cells
 * already import the box. The shake's length lives here for the same reason: the cells
 * run it and the field colours the strip for exactly as long as it lasts.
 */

/** the pasted digits fade in together over this */
export const PASTE_FADE_MS = 200;
/** then the block pushes out of the last cell, over this — level with the box's own
 *  arrival, so the two finish together rather than one outlasting the other */
export const PASTE_SEND_MS = 220;

/** how long the strip is shaken for on a rejection. Anything timed to the shake reads it
 *  from here rather than repeating the number — see flashesError. */
export const SHAKE_MS = 380;
