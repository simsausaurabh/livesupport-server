import { AgentRole } from './enums.js';

export type Permission =
  | 'conversations:view'   | 'conversations:reply'
  | 'conversations:assign' | 'conversations:resolve' | 'conversations:delete'
  | 'messages:send'        | 'messages:send_internal_note'
  | 'analytics:view'       | 'analytics:export'
  | 'agents:invite'        | 'agents:remove'        | 'agents:change_role'
  | 'org:manage_widget'    | 'org:manage_canned_responses'
  | 'org:manage_webhooks'  | 'org:manage_billing'
  | 'org:manage_api_keys'  | 'org:view_settings';

export const ROLE_PERMISSIONS: Record<AgentRole, Permission[]> = {
  [AgentRole.OWNER]: [
    'conversations:view','conversations:reply','conversations:assign',
    'conversations:resolve','conversations:delete',
    'messages:send','messages:send_internal_note',
    'analytics:view','analytics:export',
    'agents:invite','agents:remove','agents:change_role',
    'org:manage_widget','org:manage_canned_responses','org:manage_webhooks',
    'org:manage_billing','org:manage_api_keys','org:view_settings',
  ],
  [AgentRole.ADMIN]: [
    'conversations:view','conversations:reply','conversations:assign','conversations:resolve',
    'messages:send','messages:send_internal_note',
    'analytics:view','analytics:export',
    'agents:invite','agents:remove',
    'org:manage_widget','org:manage_canned_responses',
    'org:manage_webhooks','org:view_settings',
  ],
  [AgentRole.AGENT]: [
    'conversations:view','conversations:reply','conversations:resolve',
    'messages:send','messages:send_internal_note',
  ],
  [AgentRole.VIEWER]: [
    'conversations:view','analytics:view',
  ],
};

export function hasPermission(role: AgentRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
