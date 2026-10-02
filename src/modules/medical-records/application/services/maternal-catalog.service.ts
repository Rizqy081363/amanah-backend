import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  maternalHealthConditionCatalog,
  maternalQuestionOptions,
  maternalScreeningQuestions,
} from '../../../../database/schema';
import {
  BLOOD_TYPE_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  RELIGION_OPTIONS,
  TETANUS_STATUS_OPTIONS,
} from '../../domain/constants/maternal-catalog.constants';

@Injectable()
export class MaternalCatalogService {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async getQuestions() {
    const questions = await this.db.query.maternalScreeningQuestions.findMany({
      where: eq(maternalScreeningQuestions.isActive, true),
      orderBy: [asc(maternalScreeningQuestions.displayOrder)],
      with: {
        options: {
          where: eq(maternalQuestionOptions.isActive, true),
          orderBy: [asc(maternalQuestionOptions.displayOrder)],
        },
      },
    });

    return questions.map((q) => ({
      id: q.id,
      code: q.code,
      category: q.category,
      questionText: q.questionText,
      helpText: q.helpText,
      inputType: q.inputType,
      isRequired: q.isRequired,
      displayOrder: q.displayOrder,
      options: q.options.map((opt) => ({
        id: opt.id,
        optionCode: opt.optionCode,
        label: opt.label,
        displayOrder: opt.displayOrder,
      })),
    }));
  }

  async getConditions() {
    const conditions =
      await this.db.query.maternalHealthConditionCatalog.findMany({
        where: eq(maternalHealthConditionCatalog.isActive, true),
        orderBy: [asc(maternalHealthConditionCatalog.displayOrder)],
      });

    return conditions.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      questionPrompt: c.questionPrompt,
      displayOrder: c.displayOrder,
    }));
  }

  getReferenceOptions() {
    return {
      educationLevels: EDUCATION_LEVEL_OPTIONS,
      religions: RELIGION_OPTIONS,
      bloodTypes: BLOOD_TYPE_OPTIONS,
      tetanusStatuses: TETANUS_STATUS_OPTIONS,
    };
  }
}
