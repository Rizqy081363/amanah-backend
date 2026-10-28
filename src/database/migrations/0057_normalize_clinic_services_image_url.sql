-- Migration 0057: Normalize clinic_services image_url
-- Description: Normalizes absolute, machine-specific, or /healthcare-prefixed image URLs to relative /assets/... paths

UPDATE "clinic_services"
SET "image_url" = 
  CASE 
    -- 1. Menghapus prefix /healthcare jika terdapat /healthcare/assets/
    WHEN "image_url" ~* '.*healthcare/(assets/.*)' THEN 
      '/' || (regexp_match("image_url", '.*healthcare/(assets/.*)', 'i'))[1]

    -- 2. Menghapus absolute URL origin http(s)://.../assets/
    WHEN "image_url" ~* '^https?://[^/]+/(assets/.*)' THEN
      '/' || (regexp_match("image_url", '^https?://[^/]+/(assets/.*)', 'i'))[1]

    -- 3. Mempertahankan URL yang sudah valid berformat /assets/
    WHEN "image_url" LIKE '/assets/%' THEN
      "image_url"

    -- 4. Menambahkan leading slash jika diawali dengan assets/
    WHEN "image_url" LIKE 'assets/%' THEN
      '/' || "image_url"

    ELSE "image_url"
  END
WHERE "image_url" IS NOT NULL;
