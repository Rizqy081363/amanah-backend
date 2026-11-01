-- Rollback 0075: Dynamic Patient Relationship Types
CREATE TYPE patient_relationship_type AS ENUM ('self', 'parent', 'child', 'spouse', 'relative', 'friend', 'other');

DROP INDEX IF EXISTS idx_patient_affiliations_relationship_type_id;

ALTER TABLE patient_affiliations 
  DROP COLUMN IF EXISTS relationship_type_id;

ALTER TABLE patient_affiliations 
  ADD COLUMN relationship_type patient_relationship_type DEFAULT 'self'::patient_relationship_type NOT NULL;

DROP TABLE IF EXISTS patient_relationship_types CASCADE;
