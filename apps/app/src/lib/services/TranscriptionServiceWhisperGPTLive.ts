import { settings } from '$lib/stores/settings.svelte.js';
import { getExtensionFromAudioBlob } from '$lib/utils';
import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from '@effect/platform';
import { TranscriptionService, WhisperingError } from '@repo/shared';
import { Effect, Layer } from 'effect';
import { GPTResponseSchema } from './transcription/GPTResponseSchema';
import { WhisperResponseSchema } from './transcription/WhisperResponseSchema';

const MAX_FILE_SIZE_MB = 25 as const;

export const TranscriptionServiceWhisperGPTLive = Layer.succeed(
  TranscriptionService,
  TranscriptionService.of({
    transcribe: (audioBlob) =>
      Effect.gen(function* () {
        const { openAiApiKey: apiKey, outputLanguage } = settings.value;

        if (!apiKey) {
          return yield* new WhisperingError({
            title: 'OpenAI API Key not provided.',
            description: 'Please enter your OpenAI API key in the settings',
            action: {
              label: 'Go to settings',
              goto: '/settings/transcription',
            },
          });
        }

        if (!apiKey.startsWith('sk-')) {
          return yield* new WhisperingError({
            title: 'Invalid OpenAI API Key',
            description: 'The OpenAI API Key must start with "sk-"',
            action: {
              label: 'Update OpenAI API Key',
              goto: '/settings/transcription',
            },
          });
        }
        const blobSizeInMb = audioBlob.size / (1024 * 1024);
        if (blobSizeInMb > MAX_FILE_SIZE_MB) {
          return yield* new WhisperingError({
            title: `The file size (${blobSizeInMb}MB) is too large`,
            description: `Please upload a file smaller than ${MAX_FILE_SIZE_MB}MB.`,
          });
        }
        const formDataFile = new File(
          [audioBlob],
          `recording.${getExtensionFromAudioBlob(audioBlob)}`,
          {
            type: audioBlob.type,
          }
        );
        const formData = new FormData();
        formData.append('file', formDataFile);
        formData.append('model', 'whisper-1');
        if (outputLanguage !== 'auto')
          formData.append('language', outputLanguage);
        const data = yield* HttpClientRequest.post(
          'https://api.openai.com/v1/audio/transcriptions'
        ).pipe(
          HttpClientRequest.setHeaders({ Authorization: `Bearer ${apiKey}` }),
          HttpClientRequest.formDataBody(formData),
          HttpClient.fetch,
          Effect.andThen(
            HttpClientResponse.schemaBodyJson(WhisperResponseSchema)
          ),
          Effect.scoped,
          Effect.mapError(
            (error) =>
              new WhisperingError({
                title: 'Error transcribing audio',
                description: error.message,
                error,
              })
          )
        );
        if ('error' in data) {
          return yield* new WhisperingError({
            title: 'Server error from Whisper API',
            description: data.error.message,
            error: data.error,
          });
        }

        // PASSAGE a chatGPT

        const formData2 = new FormData();
        formData2.append('model', 'gpt-3.5-turbo');
        formData2.append(
          'messages',
          JSON.stringify([
            {
              role: 'user',
              content:
                'Voici la transcription d\'un audio métier : "' +
                data.text +
                '". ' +
                "Corrige les erreurs de transcription, et écrit comme si c'était un médecin.",
            },
          ])
        );
        // if (outputLanguage !== 'auto') formData.append('language', outputLanguage);
        const data2 = yield* HttpClientRequest.post(
          'https://api.openai.com/v1/chat/completions'
        ).pipe(
          HttpClientRequest.setHeaders({ Authorization: `Bearer ${apiKey}` }),
          HttpClientRequest.formDataBody(formData2),
          HttpClient.fetch,
          Effect.andThen(
            HttpClientResponse.schemaBodyJson(GPTResponseSchema)
          ),
          Effect.scoped,
          Effect.mapError(
            (error) =>
              new WhisperingError({
                title: 'Error passing to GPT',
                description: error.message,
                error,
              })
          )
        );
        if ('error' in data2) {
          return yield* new WhisperingError({
            title: 'Server error from Whisper API',
            description: data2.error.message,
            error: data2.error,
          });
        }
        return data2.choices[0].message.content;
      }),
  })
);
