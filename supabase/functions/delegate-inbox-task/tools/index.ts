import type { Tool, ToolName } from './types.ts'
import { createMeetingTopicTool } from './createMeetingTopic.ts'
import { postSlackUpdateTool } from './postSlackUpdate.ts'

export const TOOL_REGISTRY: Record<ToolName, Tool> = {
  create_meeting_topic: createMeetingTopicTool,
  post_slack_update: postSlackUpdateTool,
}

export const TOOL_NAMES = Object.keys(TOOL_REGISTRY) as ToolName[]

export function getTool(name: string): Tool | null {
  return (TOOL_REGISTRY as Record<string, Tool>)[name] ?? null
}

export * from './types.ts'
