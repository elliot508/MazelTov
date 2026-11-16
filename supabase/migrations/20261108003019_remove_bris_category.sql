/*
# Remove "bris" from allowed simcha types

## Overview
Drops the existing CHECK constraint on simcha_posts.simcha_type and
replaces it with one that no longer includes 'bris'. Existing bris rows
(if any) are left in place — only the constraint on future inserts
changes. No data is deleted.
*/

ALTER TABLE simcha_posts DROP CONSTRAINT IF EXISTS simcha_posts_simcha_type_check;

ALTER TABLE simcha_posts ADD CONSTRAINT simcha_posts_simcha_type_check
  CHECK (simcha_type IN ('wedding','vort','bar_mitzvah','birth'));
