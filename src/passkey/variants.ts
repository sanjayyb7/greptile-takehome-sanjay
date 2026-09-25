/**
 * The explorations, side by side.
 *
 * Each was a branch of its own while it was being worked on; they are gathered here so
 * they can be switched between and compared without rebuilding. Only what a person would
 * actually see differs — the corrections that came out of the animation review are in all
 * of them, since those were fixes rather than choices.
 *
 * What this module exports is deliberately short: VERSIONS and FINAL for the switcher,
 * behaviourOf and Behaviour for the field, and the handful of types a Behaviour is made
 * of. The traits below are how each one is decided, and they are decided here — they used
 * to be exported because the field called all nineteen of them by hand, and the exports
 * outlived the call sites. A module that hands out both the answer and every step of the
 * working invites the next person to use the steps.
 *
 * VERSIONS is what is on offer, in the order it is offered in: the row is numbered by
 * position, so this array is the running order and nothing else needs to know about it.
 * The Version union is what the code can still run — 3, 6, 7, 9, 10, 11 and 17 were set
 * aside rather than deleted, so their behaviour is still built and still reachable from the
 * predicates below. Putting one back on the row is a single line here.
 */
export type Version = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18;

export const VERSIONS: { id: Version; name: string; note: string; label?: string; final?: true }[] = [
  { id: 13, name: "Vanishing letters", note: "The digit rises in through the cell's bottom edge, and slides back down past it" },
  { id: 12, name: "Caret: smear", note: "The caret stretches into a block as it travels, then snaps back to a line" },
  { id: 1, name: "Version 1", note: "Send box on the end of the strip; digits rise into place" },
  { id: 2, name: "Version 2", note: "Send box set apart in its own container; digits rise into place" },
  { id: 4, name: "Version 4", note: "Send box arrives attached, then is shoved clear — the push opens the gap" },
  { id: 5, name: "Fluid", note: "The box separates from the strip like liquid — a neck thins and breaks" },
  { id: 8, name: "Smooth, box clears", note: "The box opens and clears in one move; the press sends it away, and every case is answered out loud" },
  { id: 14, name: "Filled circle", note: "Says where the code went first. The send box pours into a green disc that spins, and the disc takes the tick" },
  { id: 18, name: "Liquid pour", note: "The send box is liquid: pressing it pours it up into the loader, and the loader closes into the answer — a tick, or a red \u201c!\u201d" },
];

/*
 * The animation review's corrections are no longer a version. They had a dot each — 8.1
 * and 9.1 — and comparing them had served its purpose, so they moved to a switch on the
 * dev panel instead: data-revised, set by DialKit and by nothing else. The row shows the
 * work; the panel is where it gets picked at. What the flag changes is written where each
 * change is made, in passkey.css.
 */

/**
 * The pre-box era: no send box, the last digit submits, and the digit resolves into focus
 * where it lands. Named rather than compared against, because these are a period and not
 * a range — a version added later is not "after" them in any sense that matters, and
 * `v >= 9` quietly swept each new id into the wrong era.
 */
const EARLY = new Set<Version>([9, 10, 11, 12, 13]);
/** and of those, the ones from before there was a send box at all */
const NO_BOX = new Set<Version>([9, 11, 12, 13]);

/**
 * Which verify → authenticated hand-off a version runs.
 *
 * "origin" is what the build had before any of the hand-off work: the design's own
 * eight-spoke glyph rotating in eight steps, and on success a straight swap to the filled
 * checkbox. Nothing gathers, nothing is drawn, nothing travels down to where the cells
 * were. The explorations that predate the send box get it, because they predate the
 * hand-off too — giving them the finished sequence would show the last answer inside the
 * first question.
 */
export type HandOff = "origin" | "v2";
const handOff = (v: Version): HandOff => (EARLY.has(v) ? "origin" : "v2");

/** the one that was chosen. Marked so it reads as the answer, not another option */
export const FINAL: Version = 8;

/**
 * How a typed digit arrives. Three of these were built in turn, and all three are kept:
 *   fade     it resolves into focus where it lands — soft, then sharp, no travel
 *   rise     it comes up through the bottom edge of the cell, soft until it lands
 *   written  it is drawn by the block crossing the cell, and rubbed out the same way
 */
export type Entrance = "fade" | "rise" | "vanish" | "written";
const entrance = (v: Version): Entrance =>
  v === 13 ? "vanish" : EARLY.has(v) ? "fade" : v <= 2 ? "rise" : "written";

/** the versions from before the send box existed: the last digit submits */
export const hasSend = (v: Version) => !NO_BOX.has(v);
/**
 * How the caret gets from one cell to the next. Four of these were tried, in this order:
 *
 *   jump   it is simply in the next cell — no travel at all
 *   slide  it moves on a transition, crossing the dividers on its way
 *   smear  it stretches into a block as it goes, spanning both cells at the halfway
 *          point, and snaps back to a line as it lands
 *   wipe   a block wipes across UNDER the dividers, and the caret itself holds still —
 *          which is what was kept, and what later grew into writing the digit
 *
 * The first three are all pre-box era, so they sit on nine's base: no send box, digits
 * resolving into focus. Only the caret differs between them.
 */
export type CaretStyle = "jump" | "slide" | "smear" | "wipe";
const caretStyle = (v: Version): CaretStyle =>
  v === 11 ? "jump" : v === 9 || v === 13 ? "slide" : v === 12 ? "smear" : "wipe";

/** the send box stands apart from the strip rather than being its fifth cell */
const detachedSend = (v: Version) => (v >= 2 && v <= 8) || v >= 14;
/** the box arrives by being shoved clear rather than simply unfolding into its place */
const boxFallsIn = (v: Version) => (v >= 4 && v <= 8) || v >= 14;
/** and it parts from the strip as liquid does: joined by a neck that thins and breaks */
const fluidSend = (v: Version) => (v >= 5 && v <= 8) || v >= 14;
/**
 * The block crossing a cell is liquid too, and the caret is the bead it leaves and meets.
 *
 * Six only, not six and up. Seven's box opens and clears in one move, so by the time the
 * block reaches the cell's edge the box has already gone — nothing catches it, and a
 * rounded pill is left sitting in the cell with white on both sides. Seven keeps the
 * crisp block, as five does.
 */
const fluidDigits = (v: Version) => v === 6;
/** no holding and no shove: opening and clearing are one continuous motion */
const smoothSend = (v: Version) => v === 7 || v === 8 || v >= 14;
/**
 * The box goes the moment it is pressed, rather than waiting out the check beside the cells.
 *
 * Everywhere else it stays put while verifying, inert and dimmed, so that success can fade
 * it out along with the cells instead of it blinking away under the press. Here the press
 * is what sends it: by the time the spinner is up the strip is alone, and the only thing
 * on screen is the thing being waited on.
 */
const sendClearsOnSubmit = (v: Version) => v === 8 || v >= 14;

/**
 * Holding a digit fills the code a cell at a time, at the same cadence a held Backspace
 * empties it, instead of at the OS key-repeat rate.
 *
 * The OS rate is about 30ms between repeats after a half-second stall, which put all four
 * digits in within a tenth of a second — so the first three were never really seen and
 * the fourth looked like it had arrived late, when it was only the one that could be
 * watched. Held, the field now fills and empties at the same speed and in the same steps,
 * and the send box opens once the last cell is in rather than in the middle of the rush.
 */
const stepsWhenHeld = (v: Version) => v === 8 || v >= 14;

/**
 * The block crosses a divider without a seam in it.
 *
 * Every cell clips its contents inside its own border so a digit is cut at the inner edge
 * rather than drawn across the line. Between two cells that leaves a band nothing can
 * paint in — 1px of divider, and 3px more when the cell being entered is the focused one,
 * because the ring insets the clip further. A block crossing it breaks in half over a
 * strip of cell background.
 *
 * Here the horizontal clipping goes, and nothing is lost by it: the focus ring is the
 * same green as the block, so the block covering the ring's side arms is invisible, and
 * the digit is centred and never comes within 3px of an edge. The divider does get
 * covered for as long as the block is over it — which is the trade, and at 1px against a
 * block that is 44px tall it is the quieter of the two.
 */
const seamlessWipe = (v: Version) => v === 8 || v >= 14;

/**
 * The authenticated mark is a filled circle rather than the design's outlined square.
 *
 * Two departures, and the same reason behind both. The spinner is eight spokes on a ring,
 * pulled inward on success until they overlap into one solid dot, and the mark is handed
 * that dot at its own size. A hollow outline loses its mass at the handover; a square
 * loses its shape. Filled and round, the dot simply grows into the mark, and the tick is
 * drawn across it in white.
 */
const filledMark = (v: Version) => v === 14 || v === 16;

/**
 * No blinking caret: the focus ring is the only thing saying where typing lands.
 *
 * The bar was our own, drawn because the native one blinks at the OS rate and sits beside
 * a filled digit rather than in the middle of an empty cell. Ten asks whether it is needed
 * at all — the ring already marks the cell, the block already shows the move between
 * cells, and a line blinking inside a box that is already outlined in green is a second
 * answer to a question that was only asked once.
 */
const hidesCaret = (v: Version) => v === 17;

/**
 * A rejection hands the code straight back: the box goes, and the caret returns to the
 * last cell.
 *
 * The earlier versions keep the box through an error, because the code is still complete
 * and pressing again is a legitimate thing to want. But it is the wrong thing to offer:
 * the code that was just refused is the only code it can send, so the button's whole
 * meaning is "try that again". Taking it away says the opposite, which is what is true —
 * change something. And the ring comes back with it, on the cell that gets changed first.
 */
const handsBackOnError = (v: Version) => v === 8 || v >= 14;

/**
 * The field keeps one height, so a rejection cannot move the cells.
 *
 * The failure line is 22px and the gap above it 16, and the field is centred — so the
 * strip rose 19px the moment a code was refused, which is the worst possible time for the
 * thing you are about to retype to move. Held at the height of its tallest state, the
 * message appears in space that was already there and nothing above it shifts.
 */
const steadyHeight = (v: Version) => v === 8 || v >= 14;

/**
 * The rejection is a moment rather than a state: it shakes, the strip goes red, and then
 * the field is simply itself again with the last cell selected.
 *
 * The earlier versions hold the red until something is edited, and the selected cell
 * keeps its green ring inside it — a strip that is red except for one cell that is not,
 * which is two answers at once. These flash instead: every cell red for exactly as long
 * as the strip is shaking, the selected one included, and then all of it lifts together.
 * The colour and the movement are one event, so they start and stop on the same frames.
 * What carries the rejection from then on is the line underneath, which is what it is for.
 */
const flashesError = (v: Version) => v === 8 || (v >= 14 && v !== 18);


/**
 * The caret stays on a filled cell, moved rather than hidden.
 *
 * It was hidden on any cell that had a digit, because it is centred and so is the glyph —
 * a green line straight through a numeral. That is fine while a code is being typed, when
 * the caret is always in the empty cell ahead of the last digit. It is wrong afterwards:
 * a rejection lands on a full cell, Backspace steps onto full cells, and through all of
 * that editing there was nothing saying where the next keystroke would land.
 *
 * So it is put past the digit instead, where the next keystroke acts — the place a text
 * cursor goes. Ten has no caret at all, so this does not reach it.
 */
const editCaret = (v: Version) => v === 8 || v >= 14;


/**
 * The field answers every case in words, and confirms before it spends a code.
 *
 * This lived beside eight for a while, as 8.1, because the cost is real — more copy on
 * screen, a dialog in the way, and a field that talks where eight simply behaved. Put
 * next to each other the trade was not close. Eight was silent about a great deal: an
 * incomplete code moved the caret and said nothing about why; a refusal and a dropped
 * connection read identically, though one means retype and the other means try again; and
 * Resend fired on the press, which is a code spent on a misclick. Each of those is now
 * answered in the place the question was asked — missing digits and failures under the
 * strip, the cost of a resend in front of the press.
 *
 * So it is not a variant any more. It is what eight is.
 */
const guarded = (v: Version) => v === 8 || v === 14 || v === 18;

/**
 * "Verifying" without the trailing ellipsis.
 *
 * Three dots are the convention for a wait, and next to a spinner they are the second
 * thing saying the same thing — the ring is already turning, and it says it continuously
 * rather than in three steps. They also make the label a different width in every state,
 * which the lane has to be held open against. Nine drops them and lets the spinner carry
 * the waiting.
 */
const plainProgress = (v: Version) => v === 14;

/**
 * The field says where the code went before asking for it back.
 *
 * Four cells on an empty screen assume you already know what they are for. A line above
 * them naming the inbox answers the two questions people actually arrive with — what is
 * this, and where do I look — and it means the address is on screen before the resend
 * confirmation has to name it rather than only afterwards.
 */
const intro = (v: Version) => v === 14;

/**
 * One piece of green carries the whole transaction.
 *
 * The send box is squeezed out of the strip as liquid (that part is eight's), and here
 * pressing it pours it up into the loader: the box balls up, a neck stretches toward the
 * status slot, snaps at the box end, and the drop arrives as a teardrop that splashes
 * into spokes already turning. Nothing appears or disappears between the press and the
 * verdict — the green that was pressed is the green that spins. See PasskeyPour.
 */
const pours = (v: Version) => v === 14 || v === 18;

/**
 * The loader is a green disc with the spokes turning in white inside it.
 *
 * Poured, the drop has to become something: here it lands as the disc and stays one. The
 * mark is already a filled circle, so the success is the spokes gathering inside a disc
 * that was there all along and the tick being drawn across it — the green never leaves.
 */
const discLoader = (v: Version) => v === 14;

/**
 * The verdict is said in the status row, and a refusal closes the loader into a red "!".
 *
 * A success closes the spinner into a tick; a refusal used to leave it and put a sentence
 * under the strip instead, so the two answers arrived in two different places. Here both
 * come out of the same gather: the spokes close to a dot, still green, and the dot opens
 * into the answer. Everything red lands on that frame — the mark, the label, the focused
 * cell — and the shake with it, so it reads as one event.
 */
const verdictInRow = (v: Version) => v === 18;

/**
 * Everything that differs between the explorations, gathered into one value.
 *
 * The predicates above are how each trait is decided; this is how the field asks. Without
 * it the component imported nineteen of them and called each one by hand, which made the
 * exploration system part of the component's surface — anyone reading PasskeyField met the
 * version matrix before they met any behaviour, and anyone wanting a field that is not one
 * of these versions had no way to say so.
 *
 * With it there is one seam. A version resolves to a Behaviour, and the field takes a
 * Behaviour; whether it came from the switcher or was written out by hand is not something
 * the field knows or needs to.
 */
export type Behaviour = {
  entrance: Entrance;
  caret: CaretStyle;
  handOff: HandOff;
  hasSend: boolean;
  detachedSend: boolean;
  boxFallsIn: boolean;
  fluidSend: boolean;
  fluidDigits: boolean;
  smoothSend: boolean;
  sendClearsOnSubmit: boolean;
  hidesCaret: boolean;
  editCaret: boolean;
  handsBackOnError: boolean;
  flashesError: boolean;
  stepsWhenHeld: boolean;
  seamlessWipe: boolean;
  steadyHeight: boolean;
  filledMark: boolean;
  guarded: boolean;
  plainProgress: boolean;
  intro: boolean;
  pours: boolean;
  discLoader: boolean;
  verdictInRow: boolean;
};

export const behaviourOf = (v: Version): Behaviour => ({
  entrance: entrance(v),
  caret: caretStyle(v),
  handOff: handOff(v),
  hasSend: hasSend(v),
  detachedSend: detachedSend(v),
  boxFallsIn: boxFallsIn(v),
  fluidSend: fluidSend(v),
  fluidDigits: fluidDigits(v),
  smoothSend: smoothSend(v),
  sendClearsOnSubmit: sendClearsOnSubmit(v),
  hidesCaret: hidesCaret(v),
  editCaret: editCaret(v),
  handsBackOnError: handsBackOnError(v),
  flashesError: flashesError(v),
  stepsWhenHeld: stepsWhenHeld(v),
  seamlessWipe: seamlessWipe(v),
  steadyHeight: steadyHeight(v),
  filledMark: filledMark(v),
  guarded: guarded(v),
  plainProgress: plainProgress(v),
  intro: intro(v),
  pours: pours(v),
  discLoader: discLoader(v),
  verdictInRow: verdictInRow(v),
});
