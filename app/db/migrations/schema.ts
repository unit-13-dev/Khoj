import { pgTable, foreignKey, text, boolean, timestamp, unique, uuid, index, doublePrecision, geometry, check, integer, varchar, jsonb, pgView } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const reelMetadata = pgTable("reel_metadata", {
	shortCode: text().primaryKey().notNull(),
	url: text(),
	validation: boolean().default(false),
	caption: text(),
	comments: text().array(),
	transcript: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	placeId: text("place_id"),
	hashtags: text().array(),
	thumbnail: text(),
}, (table) => [
	foreignKey({
			columns: [table.placeId],
			foreignColumns: [places.placeId],
			name: "reel_metadata_place_id_places_place_id_fk"
		}).onDelete("cascade"),
]);

export const userReels = pgTable("user_reels", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	shortCode: text("short_code").notNull(),
	savedAt: timestamp("saved_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.userId],
			name: "user_reels_user_id_user_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.shortCode],
			foreignColumns: [reelMetadata.shortCode],
			name: "user_reels_short_code_reel_metadata_shortCode_fk"
		}).onDelete("cascade"),
	unique("user_reels_user_id_short_code_unique").on(table.userId, table.shortCode),
]);

export const places = pgTable("places", {
	placeId: text("place_id").primaryKey().notNull(),
	displayName: text("display_name"),
	formattedAddress: text("formatted_address"),
	lat: doublePrecision().notNull(),
	lng: doublePrecision().notNull(),
	type: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	location: geometry({ type: "point", srid: 4326 }),
}, (table) => [
	index("places_location_idx").using("gist", table.location.asc().nullsLast().op("gist_geometry_ops_2d")),
]);

export const user = pgTable("user", {
	userId: text("user_id").primaryKey().notNull(),
	email: text(),
	firstName: text("first_name"),
	lastName: text("last_name"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	profileImageUrl: text("profile_image_url"),
});

export const userPlaces = pgTable("user_places", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id"),
	placeId: text("place_id").notNull(),
	savedAt: timestamp("saved_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.userId],
			name: "user_places_user_id_user_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.placeId],
			foreignColumns: [places.placeId],
			name: "user_places_place_id_places_place_id_fk"
		}).onDelete("cascade"),
	unique("user_places_user_id_place_id_unique").on(table.userId, table.placeId),
]);

export const spatialRefSys = pgTable("spatial_ref_sys", {
	srid: integer().notNull(),
	authName: varchar("auth_name", { length: 256 }),
	authSrid: integer("auth_srid"),
	srtext: varchar({ length: 2048 }),
	proj4Text: varchar({ length: 2048 }),
}, (table) => [
	check("spatial_ref_sys_srid_check", sql`(srid > 0) AND (srid <= 998999)`),
]);

export const planningSessions = pgTable("planning_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	destination: text().notNull(),
	startDate: timestamp("start_date", { mode: 'string' }),
	endDate: timestamp("end_date", { mode: 'string' }),
	days: integer(),
	interests: text().array(),
	mustVisitPlaces: text("must_visit_places").array(),
	status: text().default('gathering_info').notNull(),
	conversationHistory: jsonb("conversation_history"),
	approvedPlaces: text("approved_places").array().default([""]),
	rejectedPlaces: text("rejected_places").array().default([""]),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	title: text().default('Trip Planning'),
	finalizedAt: timestamp("finalized_at", { mode: 'string' }),
	finalizedItinerary: jsonb("finalized_itinerary"),
}, (table) => [
	index("idx_planning_sessions_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_planning_sessions_user").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.userId],
			name: "planning_sessions_user_id_user_user_id_fk"
		}).onDelete("cascade"),
]);

export const discoveredPlaces = pgTable("discovered_places", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull(),
	placeId: text("place_id").notNull(),
	placeName: text("place_name").notNull(),
	placeType: text("place_type"),
	rating: doublePrecision(),
	source: text().notNull(),
	lat: doublePrecision(),
	lng: doublePrecision(),
	formattedAddress: text("formatted_address"),
	relevanceScore: integer("relevance_score"),
	status: text().default('suggested').notNull(),
	userFeedback: text("user_feedback"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_discovered_places_session").using("btree", table.sessionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [planningSessions.id],
			name: "discovered_places_session_id_planning_sessions_id_fk"
		}).onDelete("cascade"),
]);
export const geographyColumns = pgView("geography_columns", {	// TODO: failed to parse database type 'name'
	fTableCatalog: unknown("f_table_catalog"),
	// TODO: failed to parse database type 'name'
	fTableSchema: unknown("f_table_schema"),
	// TODO: failed to parse database type 'name'
	fTableName: unknown("f_table_name"),
	// TODO: failed to parse database type 'name'
	fGeographyColumn: unknown("f_geography_column"),
	coordDimension: integer("coord_dimension"),
	srid: integer(),
	type: text(),
}).as(sql`SELECT current_database() AS f_table_catalog, n.nspname AS f_table_schema, c.relname AS f_table_name, a.attname AS f_geography_column, postgis_typmod_dims(a.atttypmod) AS coord_dimension, postgis_typmod_srid(a.atttypmod) AS srid, postgis_typmod_type(a.atttypmod) AS type FROM pg_class c, pg_attribute a, pg_type t, pg_namespace n WHERE t.typname = 'geography'::name AND a.attisdropped = false AND a.atttypid = t.oid AND a.attrelid = c.oid AND c.relnamespace = n.oid AND (c.relkind = ANY (ARRAY['r'::"char", 'v'::"char", 'm'::"char", 'f'::"char", 'p'::"char"])) AND NOT pg_is_other_temp_schema(c.relnamespace) AND has_table_privilege(c.oid, 'SELECT'::text)`);

export const geometryColumns = pgView("geometry_columns", {	fTableCatalog: varchar("f_table_catalog", { length: 256 }),
	// TODO: failed to parse database type 'name'
	fTableSchema: unknown("f_table_schema"),
	// TODO: failed to parse database type 'name'
	fTableName: unknown("f_table_name"),
	// TODO: failed to parse database type 'name'
	fGeometryColumn: unknown("f_geometry_column"),
	coordDimension: integer("coord_dimension"),
	srid: integer(),
	type: varchar({ length: 30 }),
}).as(sql`SELECT current_database()::character varying(256) AS f_table_catalog, n.nspname AS f_table_schema, c.relname AS f_table_name, a.attname AS f_geometry_column, COALESCE(postgis_typmod_dims(a.atttypmod), sn.ndims, 2) AS coord_dimension, COALESCE(NULLIF(postgis_typmod_srid(a.atttypmod), 0), sr.srid, 0) AS srid, replace(replace(COALESCE(NULLIF(upper(postgis_typmod_type(a.atttypmod)), 'GEOMETRY'::text), st.type, 'GEOMETRY'::text), 'ZM'::text, ''::text), 'Z'::text, ''::text)::character varying(30) AS type FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND NOT a.attisdropped JOIN pg_namespace n ON c.relnamespace = n.oid JOIN pg_type t ON a.atttypid = t.oid LEFT JOIN ( SELECT s.connamespace, s.conrelid, s.conkey, replace(split_part(s.consrc, ''''::text, 2), ')'::text, ''::text) AS type FROM ( SELECT pg_constraint.connamespace, pg_constraint.conrelid, pg_constraint.conkey, pg_get_constraintdef(pg_constraint.oid) AS consrc FROM pg_constraint) s WHERE s.consrc ~~* '%geometrytype(% = %'::text) st ON st.connamespace = n.oid AND st.conrelid = c.oid AND (a.attnum = ANY (st.conkey)) LEFT JOIN ( SELECT s.connamespace, s.conrelid, s.conkey, replace(split_part(s.consrc, ' = '::text, 2), ')'::text, ''::text)::integer AS ndims FROM ( SELECT pg_constraint.connamespace, pg_constraint.conrelid, pg_constraint.conkey, pg_get_constraintdef(pg_constraint.oid) AS consrc FROM pg_constraint) s WHERE s.consrc ~~* '%ndims(% = %'::text) sn ON sn.connamespace = n.oid AND sn.conrelid = c.oid AND (a.attnum = ANY (sn.conkey)) LEFT JOIN ( SELECT s.connamespace, s.conrelid, s.conkey, replace(replace(split_part(s.consrc, ' = '::text, 2), ')'::text, ''::text), '('::text, ''::text)::integer AS srid FROM ( SELECT pg_constraint.connamespace, pg_constraint.conrelid, pg_constraint.conkey, pg_get_constraintdef(pg_constraint.oid) AS consrc FROM pg_constraint) s WHERE s.consrc ~~* '%srid(% = %'::text) sr ON sr.connamespace = n.oid AND sr.conrelid = c.oid AND (a.attnum = ANY (sr.conkey)) WHERE (c.relkind = ANY (ARRAY['r'::"char", 'v'::"char", 'm'::"char", 'f'::"char", 'p'::"char"])) AND NOT c.relname = 'raster_columns'::name AND t.typname = 'geometry'::name AND NOT pg_is_other_temp_schema(c.relnamespace) AND has_table_privilege(c.oid, 'SELECT'::text)`);