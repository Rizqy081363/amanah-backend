import { relations } from 'drizzle-orm';
import { applicationPages, clinicServices, users } from './amanah.schema';
import { promotions } from './promotions.schema';

export const promotionsRelations = relations(promotions, ({ one }) => ({
  service: one(clinicServices, {
    fields: [promotions.serviceId],
    references: [clinicServices.id],
  }),
  targetPage: one(applicationPages, {
    fields: [promotions.targetPageId],
    references: [applicationPages.id],
  }),
  createdByUser: one(users, {
    fields: [promotions.createdBy],
    references: [users.id],
    relationName: 'promotionCreatedBy',
  }),
  updatedByUser: one(users, {
    fields: [promotions.updatedBy],
    references: [users.id],
    relationName: 'promotionUpdatedBy',
  }),
}));
