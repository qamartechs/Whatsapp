import type { NodeTypes } from "@xyflow/react"
import { StartNode } from "./start-node"
import { MessageNode } from "./message-node"
import { ListNode } from "./list-node"
import { ConditionNode } from "./condition-node"
import { ApiNode } from "./api-node"
import { DelayNode } from "./delay-node"
import { AiNode } from "./ai-node"
import { FlowNode } from "./flow-node"
import { SetVariableNode } from "./set-variable-node"
import { SetLabelNode } from "./set-label-node"
import { AiTriggerNode } from "./ai-trigger-node"
import { AiChatNode } from "./ai-chat-node"
import { TransferToHumanNode } from "./transfer-to-human-node"

export const nodeTypes: NodeTypes = {
  start: StartNode,
  message: MessageNode,
  list: ListNode,
  condition: ConditionNode,
  api: ApiNode,
  delay: DelayNode,
  ai: AiNode,
  flow: FlowNode,
  setVariable: SetVariableNode,
  setLabel: SetLabelNode,
  aiTrigger: AiTriggerNode,
  aiChat: AiChatNode,
  transferToHuman: TransferToHumanNode,
}

export {
  StartNode,
  MessageNode,
  ListNode,
  ConditionNode,
  ApiNode,
  DelayNode,
  AiNode,
  FlowNode,
  SetVariableNode,
  SetLabelNode,
  AiTriggerNode,
  AiChatNode,
  TransferToHumanNode,
}
