// ============================================================
//  pointsToJar — pure function, no DB, no side effects.
//  Turns a running points total into the jar state the
//  reward screen consumes. This is the ONLY place the
//  level threshold matters; tune pointsPerLevel freely.
// ============================================================

/**
 * @param {number} previousTotal  points BEFORE this visit (0 on first-ever check-in)
 * @param {number} newTotal       points AFTER this visit's award
 * @param {number} pointsPerLevel how many points = one full level (the dial)
 * @returns {{
 *   previousFill: number,  // 0–100, where the jar starts animating from
 *   newFill: number,       // 0–100, where it fills to
 *   level: number,         // current level number AFTER this visit (1-based)
 *   previousLevel: number, // level BEFORE this visit
 *   added: number,         // raw points added this visit
 *   leveledUp: boolean,    // did this visit cross a level boundary?
 *   firstVisit: boolean    // was previousTotal 0?
 * }}
 */
function pointsToJar(previousTotal, newTotal, pointsPerLevel = 100) {
  const ppl = pointsPerLevel > 0 ? pointsPerLevel : 100;

  const levelFor = (total) => Math.floor(total / ppl) + 1;          // 1-based
  const fillFor  = (total) => ((total % ppl) / ppl) * 100;          // 0–100 within level

  const previousLevel = levelFor(previousTotal);
  const level         = levelFor(newTotal);

  return {
    previousFill: Math.round(fillFor(previousTotal) * 10) / 10,
    newFill:      Math.round(fillFor(newTotal) * 10) / 10,
    level,
    previousLevel,
    added:        newTotal - previousTotal,
    leveledUp:    level > previousLevel,
    firstVisit:   previousTotal === 0,
  };
}

module.exports = { pointsToJar };
