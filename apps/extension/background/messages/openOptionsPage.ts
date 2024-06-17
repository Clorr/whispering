import type { PlasmoMessaging } from '@plasmohq/messaging';
import type { Result } from '@repo/shared';
import { WhisperingError, effectToResult } from '@repo/shared';
import { Effect } from 'effect';
import { renderErrorAsToast } from '~lib/errors';

export const openOptionsPage = Effect.tryPromise({
	try: () => chrome.runtime.openOptionsPage(),
	catch: (error) =>
		new WhisperingError({
			title: 'Error opening options page',
			description: error instanceof Error ? error.message : `Unknown error: ${error}`,
			error,
		}),
}).pipe(Effect.catchAll(renderErrorAsToast));

export type RequestBody = {};

export type ResponseBody = Result<number>;

const handler: PlasmoMessaging.MessageHandler<RequestBody, RequestBody> = (req, res) =>
	Effect.gen(function* () {
		yield* openOptionsPage;
		return true as const;
	}).pipe(
		Effect.tapError(renderErrorAsToast),
		effectToResult,
		Effect.map((payload) => res.send(payload)),
		Effect.runPromise,
	);

export default handler;
