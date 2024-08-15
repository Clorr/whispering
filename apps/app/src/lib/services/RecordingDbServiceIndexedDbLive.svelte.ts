import { WhisperingError } from '@repo/shared';
import { Effect, Layer, Option } from 'effect';
import { openDB, type DBSchema } from 'idb';
import type { Recording } from './RecordingDbService';
import { RecordingsDbService } from './RecordingDbService';

const DB_NAME = 'RecordingDB' as const;
const RECORDING_STORE = 'recordings' as const;

const DB_VERSION = 2 as const;
const RECORDING_METADATA_STORE = 'recordingMetadata' as const;
const RECORDING_BLOB_STORE = 'recordingBlobs' as const;

interface RecordingsDbSchema extends DBSchema {
	recordingMetadata: {
		key: Recording['id'];
		value: Omit<Recording, 'blob'>;
		indexes: { 'by-createdAt': number };
	};
	recordingBlobs: {
		key: Recording['id'];
		value: { id: Recording['id']; blob: Blob };
	};
}

interface RecordingsDbSchema extends DBSchema {
	recordings: {
		key: Recording['id'];
		value: Recording;
	};
}

export const RecordingsDbServiceLiveIndexedDb = Layer.effect(
	RecordingsDbService,
	Effect.sync(() => {
		const db = openDB<RecordingsDbSchema>(DB_NAME, DB_VERSION, {
			upgrade(db, oldVersion, newVersion, transaction) {
				if (oldVersion < 1) {
					// This handles the case of a fresh install
					db.createObjectStore(RECORDING_METADATA_STORE, { keyPath: 'id' });
					db.createObjectStore(RECORDING_BLOB_STORE, { keyPath: 'id' });
				}

				if (oldVersion < 2) {
					// This handles the upgrade from version 1 to 2
					const recordingsStore = transaction.objectStore(RECORDING_STORE);
					const metadataStore = db.createObjectStore(RECORDING_METADATA_STORE, { keyPath: 'id' });
					const blobStore = db.createObjectStore(RECORDING_BLOB_STORE, { keyPath: 'id' });

					// Delete the old store after migration
					db.deleteObjectStore(RECORDING_STORE);
				}
			},
		});

		return {
			addRecording: (recording) =>
				Effect.tryPromise({
					try: async () => {
						const { blob, ...metadata } = recording;
						const tx = (await db).transaction(
							[RECORDING_METADATA_STORE, RECORDING_BLOB_STORE],
							'readwrite',
						);
						const recordingMetadataStore = tx.objectStore(RECORDING_METADATA_STORE);
						const recordingBlobStore = tx.objectStore(RECORDING_BLOB_STORE);
						await Promise.all([
							recordingMetadataStore.add(metadata),
							recordingBlobStore.add({ id: recording.id, blob }),
							tx.done,
						]);
					},
					catch: (error) =>
						new WhisperingError({
							title: 'Error adding recording to indexedDB',
							description: error instanceof Error ? error.message : 'Please try again.',
							error,
						}),
				}),
			updateRecording: (recording) =>
				Effect.tryPromise({
					try: async () => {
						const { blob, ...metadata } = recording;
						await Promise.all([
							(await db).put(RECORDING_METADATA_STORE, metadata),
							(await db).put(RECORDING_BLOB_STORE, { id: recording.id, blob }),
						]);
					},
					catch: (error) =>
						new WhisperingError({
							title: 'Error updating recording in indexedDB',
							description: error instanceof Error ? error.message : 'Please try again.',
							error,
						}),
				}),
			deleteRecordingById: (id) =>
				Effect.tryPromise({
					try: async () => {
						const tx = (await db).transaction(
							[RECORDING_METADATA_STORE, RECORDING_BLOB_STORE],
							'readwrite',
						);
						const recordingMetadataStore = tx.objectStore(RECORDING_METADATA_STORE);
						const recordingBlobStore = tx.objectStore(RECORDING_BLOB_STORE);
						await Promise.all([
							recordingMetadataStore.delete(id),
							recordingBlobStore.delete(id),
							tx.done,
						]);
					},
					catch: (error) =>
						new WhisperingError({
							title: 'Error deleting recording from indexedDB',
							description: error instanceof Error ? error.message : 'Please try again.',
							error,
						}),
				}),
			deleteRecordingsById: (ids) =>
				Effect.tryPromise({
					try: async () => {
						const tx = (await db).transaction(
							[RECORDING_METADATA_STORE, RECORDING_BLOB_STORE],
							'readwrite',
						);
						const recordingMetadataStore = tx.objectStore(RECORDING_METADATA_STORE);
						const recordingBlobStore = tx.objectStore(RECORDING_BLOB_STORE);
						for (const id of ids) {
							await recordingMetadataStore.delete(id);
							await recordingBlobStore.delete(id);
						}
						await tx.done;
					},
					catch: (error) =>
						new WhisperingError({
							title: 'Error deleting recordings from indexedDB',
							description: error instanceof Error ? error.message : 'Please try again.',
							error,
						}),
				}),
			getRecording: (id) =>
				Effect.tryPromise({
					try: async () => {
						const tx = (await db).transaction(
							[RECORDING_METADATA_STORE, RECORDING_BLOB_STORE],
							'readonly',
						);
						const recordingMetadataStore = tx.objectStore(RECORDING_METADATA_STORE);
						const recordingBlobStore = tx.objectStore(RECORDING_BLOB_STORE);
						const metadata = await recordingMetadataStore.get(id);
						const blobData = await recordingBlobStore.get(id);
						await tx.done;
						if (metadata && blobData) {
							return { ...metadata, blob: blobData.blob };
						}
						return null;
					},
					catch: (error) =>
						new WhisperingError({
							title: 'Error getting recording from indexedDB',
							description: error instanceof Error ? error.message : 'Please try again.',
							error,
						}),
				}).pipe(Effect.map(Option.fromNullable)),
		};
	}),
);
