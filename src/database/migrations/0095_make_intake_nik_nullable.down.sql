ALTER TABLE child_immunization_intakes
  ALTER COLUMN child_nik SET NOT NULL;

ALTER TABLE maternal_health_intakes
  ALTER COLUMN mother_nik SET NOT NULL;
