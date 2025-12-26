/**
 * 🎧 Áudio distorcido (FUTURO)
 *
 * Para integrar áudio real, opções comuns:
 * - gerar arquivo .ogg/.mp3 com ruído (FFmpeg) e enviar como attachment
 * - usar TTS + filtro distorção (FFmpeg) + upload
 *
 * Este arquivo é um placeholder para manter a arquitetura pronta.
 */

export type DistortedAudioOptions = {
  intensity?: number; // 0..1
  noise?: number; // 0..1
};

export async function generateDistortedAudio(_text: string, _opts?: DistortedAudioOptions) {
  // TODO: implementar (FFmpeg / TTS)
  return null as unknown as { buffer: Buffer; filename: string } | null;
}
