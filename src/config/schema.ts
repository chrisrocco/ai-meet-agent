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
  video: z.object({
    mjpegPort: z.number().int().min(1024).max(65535).default(8085),
  }).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
