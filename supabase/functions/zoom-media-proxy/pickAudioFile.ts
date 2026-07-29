// Pulled out of index.ts so it's testable without importing a module that
// calls Deno.serve() at load time (which would start listening during a test
// run). Pure logic only — see PLAN_idea10 §2.2/§5.4 for why participant_audio_files
// is deliberately not considered here for v1.

export interface RecordingFile {
  id: string
  file_type: string
  file_extension?: string
  download_url: string
  recording_type?: string
}

/**
 * Prefer an audio-only track (M4A) so the <audio> element isn't pulling down
 * a full video container just to play sound; fall back to the video (MP4)
 * file if that's all the recording has — its audio track still plays fine in
 * a plain <audio> element in every evergreen browser. Returns null if
 * neither is present (e.g. only a TRANSCRIPT/CHAT file exists).
 */
export function pickAudioFile(files: RecordingFile[]): RecordingFile | null {
  const m4a = files.find(f => f.file_type === 'M4A')
  if (m4a) return m4a
  const mp4 = files.find(f => f.file_type === 'MP4')
  if (mp4) return mp4
  return null
}

export function contentTypeFor(file: RecordingFile): string {
  if (file.file_type === 'M4A') return 'audio/mp4'
  if (file.file_type === 'MP4') return 'video/mp4'
  return 'application/octet-stream'
}
