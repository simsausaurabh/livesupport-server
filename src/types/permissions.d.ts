import { AgentRole } from './enums.js';
export type Permission = 'conversations:view' | 'conversations:reply' | 'conversations:assign' | 'conversations:resolve' | 'conversations:delete' | 'messages:send' | 'messages:send_internal_note' | 'analytics:view' | 'analytics:export' | 'agents:invite' | 'agents:remove' | 'agents:change_role' | 'org:manage_widget' | 'org:manage_canned_responses' | 'org:manage_webhooks' | 'org:manage_billing' | 'org:manage_api_keys' | 'org:view_settings';
export declare const ROLE_PERMISSIONS: Record<AgentRole, Permission[]>;
export declare function hasPermission(role: AgentRole, permission: Permission): boolean;
