import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  DEFAULT_HEALTH_CONDITIONS,
  DEFAULT_SCREENING_QUESTIONS,
} from '../../../modules/medical-records/domain/constants/maternal-catalog.constants';

export async function seedMaternalCatalogs(client: PoolClient): Promise<void> {
  for (const q of DEFAULT_SCREENING_QUESTIONS) {
    const questionRes = await client.query<{ id: string }>(
      `INSERT INTO maternal_screening_questions (
         id, code, category, question_text, help_text, input_type, is_required, display_order, is_active, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())
       ON CONFLICT (code) DO UPDATE
       SET category = EXCLUDED.category,
           question_text = EXCLUDED.question_text,
           help_text = EXCLUDED.help_text,
           input_type = EXCLUDED.input_type,
           is_required = EXCLUDED.is_required,
           display_order = EXCLUDED.display_order,
           updated_at = NOW()
       RETURNING id`,
      [
        randomUUID(),
        q.code,
        q.category,
        q.questionText,
        q.helpText || null,
        q.inputType,
        q.isRequired,
        q.displayOrder,
      ],
    );

    const questionId = questionRes.rows[0].id;

    if (Array.isArray(q.options) && q.options.length > 0) {
      for (const opt of q.options) {
        await client.query(
          `INSERT INTO maternal_question_options (
             id, question_id, option_code, label, display_order, is_active, created_at
           )
           VALUES ($1, $2, $3, $4, $5, true, NOW())
           ON CONFLICT (question_id, option_code) DO UPDATE
           SET label = EXCLUDED.label,
               display_order = EXCLUDED.display_order`,
          [
            randomUUID(),
            questionId,
            opt.optionCode,
            opt.label,
            opt.displayOrder,
          ],
        );
      }
    }
  }

  for (const c of DEFAULT_HEALTH_CONDITIONS) {
    await client.query(
      `INSERT INTO maternal_health_condition_catalog (
         id, code, name, question_prompt, display_order, is_active, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           question_prompt = EXCLUDED.question_prompt,
           display_order = EXCLUDED.display_order,
           updated_at = NOW()`,
      [randomUUID(), c.code, c.name, c.questionPrompt, c.displayOrder],
    );
  }
}
