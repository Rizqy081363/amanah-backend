import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  maternalHealthConditionCatalog,
  maternalQuestionOptions,
  maternalScreeningQuestions,
  occupations,
} from '../../../../database/schema';
import {
  BIRTH_ATTENDANT_OPTIONS,
  BLOOD_TYPE_OPTIONS,
  CHILD_SEX_OPTIONS,
  CONTRACEPTIVE_TYPE_OPTIONS,
  DELIVERY_METHOD_OPTIONS,
  DELIVERY_PLACE_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  OCCUPATION_OPTIONS,
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

  async getReferenceOptions() {
    let occupationsList: Array<{
      code: string;
      name: string;
      displayOrder: number;
    }> = [];
    try {
      occupationsList = await this.db.query.occupations.findMany({
        where: eq(occupations.isActive, true),
        orderBy: [asc(occupations.displayOrder)],
      });
    } catch {
      occupationsList = OCCUPATION_OPTIONS.map((o) => ({
        code: o.code,
        name: o.label,
        displayOrder: o.displayOrder,
      }));
    }

    const resolvedOccupations =
      occupationsList.length > 0
        ? occupationsList.map((occ) => ({
            code: occ.code,
            label: occ.name,
            displayOrder: occ.displayOrder,
          }))
        : OCCUPATION_OPTIONS;

    return {
      educationLevels: EDUCATION_LEVEL_OPTIONS,
      religions: RELIGION_OPTIONS,
      bloodTypes: BLOOD_TYPE_OPTIONS,
      tetanusStatuses: TETANUS_STATUS_OPTIONS,
      deliveryMethods: DELIVERY_METHOD_OPTIONS,
      deliveryPlaces: DELIVERY_PLACE_OPTIONS,
      childSexes: CHILD_SEX_OPTIONS,
      birthAttendants: BIRTH_ATTENDANT_OPTIONS,
      contraceptiveTypes: CONTRACEPTIVE_TYPE_OPTIONS,
      occupations: resolvedOccupations,
    };
  }
}
