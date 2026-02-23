import { relations } from "drizzle-orm/relations";
import { places, reelMetadata, user, userReels, userPlaces, planningSessions, discoveredPlaces } from "./schema";

export const reelMetadataRelations = relations(reelMetadata, ({one, many}) => ({
	place: one(places, {
		fields: [reelMetadata.placeId],
		references: [places.placeId]
	}),
	userReels: many(userReels),
}));

export const placesRelations = relations(places, ({many}) => ({
	reelMetadata: many(reelMetadata),
	userPlaces: many(userPlaces),
}));

export const userReelsRelations = relations(userReels, ({one}) => ({
	user: one(user, {
		fields: [userReels.userId],
		references: [user.userId]
	}),
	reelMetadatum: one(reelMetadata, {
		fields: [userReels.shortCode],
		references: [reelMetadata.shortCode]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	userReels: many(userReels),
	userPlaces: many(userPlaces),
	planningSessions: many(planningSessions),
}));

export const userPlacesRelations = relations(userPlaces, ({one}) => ({
	user: one(user, {
		fields: [userPlaces.userId],
		references: [user.userId]
	}),
	place: one(places, {
		fields: [userPlaces.placeId],
		references: [places.placeId]
	}),
}));

export const planningSessionsRelations = relations(planningSessions, ({one, many}) => ({
	user: one(user, {
		fields: [planningSessions.userId],
		references: [user.userId]
	}),
	discoveredPlaces: many(discoveredPlaces),
}));

export const discoveredPlacesRelations = relations(discoveredPlaces, ({one}) => ({
	planningSession: one(planningSessions, {
		fields: [discoveredPlaces.sessionId],
		references: [planningSessions.id]
	}),
}));