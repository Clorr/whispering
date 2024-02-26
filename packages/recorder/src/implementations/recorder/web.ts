import AudioRecorder from 'audio-recorder-polyfill';
import type { Context } from 'effect';
import { Effect } from 'effect';
import { RecorderError, type RecorderService } from '../../services/recorder';

class GetNavigatorMediaError extends RecorderError {
	constructor({ message, origError }: { message: string; origError?: unknown }) {
		super({ message, origError });
	}
}

class StopMediaRecorderError extends RecorderError {
	constructor({ message, origError }: { message: string; origError?: unknown }) {
		super({ message, origError });
	}
}

class EnumerateRecordingDevicesError extends RecorderError {
	constructor({ message, origError }: { message: string; origError?: unknown }) {
		super({ message, origError });
	}
}

let stream: MediaStream;
let mediaRecorder: MediaRecorder;
const recordedChunks: Blob[] = [];

const getMediaStream = Effect.tryPromise({
	try: () => navigator.mediaDevices.getUserMedia({ audio: true }),
	catch: (error) =>
		new GetNavigatorMediaError({
			message: 'Error getting media stream',
			origError: error
		})
});
export const webRecorderService: Context.Tag.Service<RecorderService> = {
	startRecording: Effect.gen(function* (_) {
		stream = yield* _(getMediaStream);
		recordedChunks.length = 0;
		mediaRecorder = new AudioRecorder(stream);
		mediaRecorder.addEventListener(
			'dataavailable',
			(event: BlobEvent) => {
				if (!event.data.size) return;
				recordedChunks.push(event.data);
			},
			{ once: true }
		);
		mediaRecorder.start();
	}),
	stopRecording: Effect.tryPromise({
		try: () =>
			new Promise<Blob>((resolve) => {
				mediaRecorder.addEventListener(
					'stop',
					() => {
						const audioBlob = new Blob(recordedChunks, { type: 'audio/wav' });
						recordedChunks.length = 0;
						resolve(audioBlob);
						stream.getTracks().forEach((track) => track.stop());
					},
					{ once: true }
				);
				mediaRecorder.stop();
			}),
		catch: (error) =>
			new StopMediaRecorderError({
				message: 'Error stopping media recorder and getting audio blob',
				origError: error
			})
	}),
	enumerateRecordingDevices: Effect.tryPromise({
		try: async () => {
			const devices = await navigator.mediaDevices.enumerateDevices();
			const audioInputDevices = devices.filter((device) => device.kind === 'audioinput');
			return audioInputDevices;
		},
		catch: (error) =>
			new EnumerateRecordingDevicesError({
				message: 'Error enumerating recording devices',
				origError: error
			})
	})
};
