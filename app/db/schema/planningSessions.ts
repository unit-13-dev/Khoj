import { pgTable, text, timestamp, integer, jsonb, uuid, boolean, doublePrecision } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './user';

export const planningSessions = pgTable('planning_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').references(() => user.userId, { onDelete: 'cascade' }).notNull(),
  title: text('title').default('Trip Planning'),
  destination: text('destination').notNull(),
  destinationImage: text('destination_image'),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  days: integer('days'),
  interests: text('interests').array(),
  mustVisitPlaces: text('must_visit_places').array(),
  status: text('status').default('gathering_info').notNull(),
  conversationHistory: jsonb('conversation_history'),
  approvedPlaces: text('approved_places').array().default(sql`'{}'`),
  rejectedPlaces: text('rejected_places').array().default(sql`'{}'`),
  finalizedItinerary: jsonb('finalized_itinerary'),
  finalizedAt: timestamp('finalized_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const discoveredPlaces = pgTable('discovered_places', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => planningSessions.id, { onDelete: 'cascade' }).notNull(),
  placeId: text('place_id').notNull(),
  placeName: text('place_name').notNull(),
  placeType: text('place_type'),
  rating: doublePrecision('rating'),
  source: text('source').notNull(),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  formattedAddress: text('formatted_address'),
  relevanceScore: integer('relevance_score'),
  status: text('status').default('suggested').notNull(),
  userFeedback: text('user_feedback'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});
