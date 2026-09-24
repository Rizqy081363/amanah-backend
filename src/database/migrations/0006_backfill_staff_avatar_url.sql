-- Migration: 0006_backfill_staff_avatar_url.sql
-- Description: One-time backfill of staff_profiles.avatar_url from users.image_url
-- for rows where staff_profiles.avatar_url is NULL but users.image_url is set.
-- This addresses cases where a staff_profile was created after the user's avatar
-- was already uploaded, so the UPDATE trigger never fired for that row.

UPDATE staff_profiles sp
SET avatar_url = u.image_url,
    updated_at = now()
FROM users u
WHERE sp.user_id = u.id
  AND sp.avatar_url IS NULL
  AND u.image_url IS NOT NULL
  AND u.image_url <> '';
