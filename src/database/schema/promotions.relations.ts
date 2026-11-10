import { relations } from 'drizzle-orm';
import { clinicServices, users } from './amanah.schema';
import { promotions } from './promotions.schema';

export const promotionsRelations = relations(promotions, ({ one }) => ({
  service: one(clinicServices, {
    fields: [promotions.serviceId],
    references: [clinicServices.id],
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
