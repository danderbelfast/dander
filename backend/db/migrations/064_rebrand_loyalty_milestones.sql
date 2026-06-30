-- ============================================================
--  Rebrand: Dander → TapProve. Fix the two "Dander" leftovers seeded
--  into loyalty_milestones by migration 019 (those rows already exist
--  on live DBs, so editing 019 alone wouldn't touch them — this updates
--  the live rows). Matched by exact old string → idempotent (re-running
--  matches nothing once applied). See also the 019 seed source, fixed
--  so fresh installs are correct from the start.
-- ============================================================
UPDATE loyalty_milestones
   SET description = 'You''ve saved £25 with TapProve!'
 WHERE description = 'You''ve saved £25 with Dander!';

UPDATE loyalty_milestones
   SET title = 'TapProve Champion'
 WHERE title = 'Dander Champion';
