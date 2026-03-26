import { z } from 'zod';

export const ConfigSchema = z.object({
  devices: z.object({
    camera: z.object({
      label: z.string().default('AI Meet Agent Camera'),
      videoNr: z.number().int().min(0).max(63).default(10),
      imagePath: z.string().optional(),
    }).default({}),
    mic: z.object({
      label: z.string().default('AI Meet Agent Mic'),
      sinkName: z.string().default('ai_meet_mic'),
    }).default({}),
    sink: z.object({
      label: z.string().default('AI Meet Agent Sink'),
      sinkName: z.string().default('ai_meet_sink'),
    }).default({}),
  }).default({}),
  audio: z.object({
    relayPort: z.number().int().min(1024).max(65535).default(19876),
  }).default({}),
  wsl2: z.object({
    captureDevice: z.string().default('CABLE Output (VB-Audio Virtual Cable)'),
    outputDevice: z.string().default('Voicemeeter Input (VB-Audio Voicemeeter VAIO)'),
    ffmpegPath: z.string().default('ffmpeg.exe'),
    ffplayPath: z.string().default('ffplay.exe'),
  }).default({}),
  video: z.object({
    mjpegPort: z.number().int().min(1024).max(65535).default(8085),
  }).default({}),
  persona: z.object({
    name: z.string().default('AI Assistant'),
    role: z.string().default('Meeting Participant'),
    background: z.string().default(''),
    instructions: z.string().default(''),
    introduceOnStart: z.boolean().default(true),
  }).default({}),
  ai: z.object({
    model: z.string().default('gemini-2.5-flash-native-audio-latest'),
  }).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
