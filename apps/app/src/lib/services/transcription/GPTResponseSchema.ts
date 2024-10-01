import { Schema } from '@effect/schema';

export const GPTResponseSchema = Schema.Union(
	Schema.Struct({
		choices: Schema.Array(Schema.Struct({
			message: Schema.Struct({
				content: Schema.String,
			}),
		})),
	}),
	Schema.Struct({
		error: Schema.Struct({
			message: Schema.String,
		}),
	}),
);
