/* Generated from protocol/schema.json by npm run generate:protocol. Do not edit. */

/**
 * A datapoint or parameter value
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Value".
 */
export type Value = string | number | boolean | null;
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "UserLevel".
 */
export type UserLevel = "admin" | "user" | "guest" | "";
/**
 * Every message the server sends
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ServerMessage".
 */
export type ServerMessage =
  | AuthResponse
  | ErrorResponse
  | EventMessage
  | GetRoomsResponse
  | GetTradesResponse
  | GetChannelsResponse
  | SubscribeResponse
  | SetDatapointResponse
  | GetDeviceProblemsResponse
  | GetParamsetDescriptionResponse
  | GetParamsetResponse
  | PutParamsetResponse
  | ListDevicesResponse
  | ElevateResponse
  | RenameResponse
  | SetGroupMemberResponse
  | SetInstallModeResponse
  | AcceptDeviceResponse
  | DeleteDeviceResponse
  | SetSysvarResponse
  | RunProgramResponse
  | SetProgramActiveResponse
  | RevokeSessionResponse
  | LogoutResponse
  | AddLinkResponse
  | RemoveLinkResponse
  | PutLinkParamsetResponse
  | GetInstallModeResponse
  | GetInboxResponse
  | GetSysvarsResponse
  | GetProgramsResponse
  | ListSessionsResponse
  | GetLinksResponse
  | GetLinkParamsetDescriptionResponse
  | GetLinkParamsetResponse;

/**
 * The WebSocket protocol between the app and the go-server: for every request type its request and response. The single source for the TypeScript types (npm run generate:protocol) and checked against the real server in go-server/integration_test.go.
 */
export interface Protocol {
  getRooms: GetRoomsCall;
  getTrades: GetTradesCall;
  getChannels: GetChannelsCall;
  subscribe: SubscribeCall;
  setDatapoint: SetDatapointCall;
  getDeviceProblems: GetDeviceProblemsCall;
  getParamsetDescription: GetParamsetDescriptionCall;
  getParamset: GetParamsetCall;
  putParamset: PutParamsetCall;
  listDevices: ListDevicesCall;
  elevate: ElevateCall;
  rename: RenameCall;
  setGroupMember: SetGroupMemberCall;
  setInstallMode: SetInstallModeCall;
  acceptDevice: AcceptDeviceCall;
  deleteDevice: DeleteDeviceCall;
  setSysvar: SetSysvarCall;
  runProgram: RunProgramCall;
  setProgramActive: SetProgramActiveCall;
  revokeSession: RevokeSessionCall;
  logout: LogoutCall;
  addLink: AddLinkCall;
  removeLink: RemoveLinkCall;
  putLinkParamset: PutLinkParamsetCall;
  getInstallMode: GetInstallModeCall;
  getInbox: GetInboxCall;
  getSysvars: GetSysvarsCall;
  getPrograms: GetProgramsCall;
  listSessions: ListSessionsCall;
  getLinks: GetLinksCall;
  getLinkParamsetDescription: GetLinkParamsetDescriptionCall;
  getLinkParamset: GetLinkParamsetCall;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetRoomsCall".
 */
export interface GetRoomsCall {
  request: GetRoomsRequest;
  response: GetRoomsResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetRoomsRequest".
 */
export interface GetRoomsRequest {
  type: "getRooms";
  requestId?: string;
  deviceId: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetRoomsResponse".
 */
export interface GetRoomsResponse {
  requestId?: string;
  deviceId: string;
  rooms: NamedObject[];
}
/**
 * A room or trade
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "NamedObject".
 */
export interface NamedObject {
  id: number;
  name: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetTradesCall".
 */
export interface GetTradesCall {
  request: GetTradesRequest;
  response: GetTradesResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetTradesRequest".
 */
export interface GetTradesRequest {
  type: "getTrades";
  requestId?: string;
  deviceId: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetTradesResponse".
 */
export interface GetTradesResponse {
  requestId?: string;
  deviceId: string;
  trades: NamedObject[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetChannelsCall".
 */
export interface GetChannelsCall {
  request: GetChannelsRequest;
  response: GetChannelsResponse;
}
/**
 * Channels of a room, a trade or (all) of all devices
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetChannelsRequest".
 */
export interface GetChannelsRequest {
  type: "getChannels";
  requestId?: string;
  deviceId: string;
  roomId?: string;
  tradeId?: string;
  all?: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetChannelsResponse".
 */
export interface GetChannelsResponse {
  requestId?: string;
  deviceId: string;
  roomId?: string;
  tradeId?: string;
  all?: boolean;
  channels: Channel[];
}
/**
 * A channel as ReGa knows it, with its current values
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Channel".
 */
export interface Channel {
  id: number;
  address: string;
  name: string;
  type: string;
  interfaceName: string;
  datapoints: {
    [k: string]: Value;
  };
  statusAddress?: string;
  status?: ChannelStatus;
  rooms?: number[];
  trades?: number[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ChannelStatus".
 */
export interface ChannelStatus {
  LOW_BAT?: boolean;
  UNREACH?: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SubscribeCall".
 */
export interface SubscribeCall {
  request: SubscribeRequest;
  response: SubscribeResponse;
}
/**
 * Events for these channels (replacing the previous list)
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SubscribeRequest".
 */
export interface SubscribeRequest {
  type: "subscribe";
  requestId?: string;
  deviceId: string;
  channels: string[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SubscribeResponse".
 */
export interface SubscribeResponse {
  type: "subscribe_response";
  requestId?: string;
  success: boolean;
  deviceId: string;
  channels: string[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetDatapointCall".
 */
export interface SetDatapointCall {
  request: SetDatapointRequest;
  response: SetDatapointResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetDatapointRequest".
 */
export interface SetDatapointRequest {
  type: "setDatapoint";
  requestId?: string;
  interfaceName: string;
  address: string;
  attribute: string;
  value: Value;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetDatapointResponse".
 */
export interface SetDatapointResponse {
  type: "setDatapoint_response";
  requestId?: string;
  success: boolean;
  error?: string;
  code?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetDeviceProblemsCall".
 */
export interface GetDeviceProblemsCall {
  request: GetDeviceProblemsRequest;
  response: GetDeviceProblemsResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetDeviceProblemsRequest".
 */
export interface GetDeviceProblemsRequest {
  type: "getDeviceProblems";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetDeviceProblemsResponse".
 */
export interface GetDeviceProblemsResponse {
  type: "deviceProblems";
  requestId?: string;
  devices: DeviceProblem[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeviceProblem".
 */
export interface DeviceProblem {
  address: string;
  name: string;
  roomId?: number;
  roomName?: string;
  lowBat: boolean;
  unreach: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetParamsetDescriptionCall".
 */
export interface GetParamsetDescriptionCall {
  request: GetParamsetDescriptionRequest;
  response: GetParamsetDescriptionResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetParamsetDescriptionRequest".
 */
export interface GetParamsetDescriptionRequest {
  type: "getParamsetDescription";
  requestId?: string;
  interfaceName: string;
  address: string;
  paramsetKey: "VALUES" | "MASTER";
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetParamsetDescriptionResponse".
 */
export interface GetParamsetDescriptionResponse {
  type: "paramsetDescription";
  requestId?: string;
  address: string;
  paramsetKey: string;
  description: ParamsetDescription;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ParamsetDescription".
 */
export interface ParamsetDescription {
  [k: string]: ParameterDescription;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ParameterDescription".
 */
export interface ParameterDescription {
  type: "FLOAT" | "INTEGER" | "BOOL" | "ENUM" | "STRING" | "ACTION";
  operations: number;
  flags: number;
  default?: Value;
  min?: Value;
  max?: Value;
  unit?: string;
  tabOrder: number;
  control?: string;
  valueList?: string[];
  special?: SpecialValue[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SpecialValue".
 */
export interface SpecialValue {
  id: string;
  value?: Value;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetParamsetCall".
 */
export interface GetParamsetCall {
  request: GetParamsetRequest;
  response: GetParamsetResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetParamsetRequest".
 */
export interface GetParamsetRequest {
  type: "getParamset";
  requestId?: string;
  interfaceName: string;
  address: string;
  paramsetKey: "VALUES" | "MASTER";
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetParamsetResponse".
 */
export interface GetParamsetResponse {
  type: "paramset";
  requestId?: string;
  address: string;
  paramsetKey: string;
  values: Values;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Values".
 */
export interface Values {
  [k: string]: Value;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PutParamsetCall".
 */
export interface PutParamsetCall {
  request: PutParamsetRequest;
  response: PutParamsetResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PutParamsetRequest".
 */
export interface PutParamsetRequest {
  type: "putParamset";
  requestId?: string;
  interfaceName: string;
  address: string;
  paramsetKey: "VALUES" | "MASTER";
  values: Values;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PutParamsetResponse".
 */
export interface PutParamsetResponse {
  type: "putParamset_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ListDevicesCall".
 */
export interface ListDevicesCall {
  request: ListDevicesRequest;
  response: ListDevicesResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ListDevicesRequest".
 */
export interface ListDevicesRequest {
  type: "listDevices";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ListDevicesResponse".
 */
export interface ListDevicesResponse {
  type: "devices";
  requestId?: string;
  devices: Device[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Device".
 */
export interface Device {
  type: string;
  address: string;
  parent?: string;
  parentType?: string;
  children?: string[];
  paramsets: string[];
  index: number;
  version: number;
  firmware?: string;
  flags: number;
  direction?: number;
  linkSourceRoles?: string[];
  linkTargetRoles?: string[];
  interfaceName: string;
  name?: string;
  channels?: DeviceDescription[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeviceDescription".
 */
export interface DeviceDescription {
  type: string;
  address: string;
  parent?: string;
  parentType?: string;
  children?: string[];
  paramsets: string[];
  index: number;
  version: number;
  firmware?: string;
  flags: number;
  direction?: number;
  linkSourceRoles?: string[];
  linkTargetRoles?: string[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ElevateCall".
 */
export interface ElevateCall {
  request: ElevateRequest;
  response: ElevateResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ElevateRequest".
 */
export interface ElevateRequest {
  type: "elevate";
  requestId?: string;
  password: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ElevateResponse".
 */
export interface ElevateResponse {
  type: "elevate_response";
  requestId?: string;
  success: boolean;
  adminToken?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RenameCall".
 */
export interface RenameCall {
  request: RenameRequest;
  response: RenameResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RenameRequest".
 */
export interface RenameRequest {
  type: "rename";
  requestId?: string;
  address: string;
  name: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RenameResponse".
 */
export interface RenameResponse {
  type: "rename_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetGroupMemberCall".
 */
export interface SetGroupMemberCall {
  request: SetGroupMemberRequest;
  response: SetGroupMemberResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetGroupMemberRequest".
 */
export interface SetGroupMemberRequest {
  type: "setGroupMember";
  requestId?: string;
  groupId: number;
  channelId: number;
  member: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetGroupMemberResponse".
 */
export interface SetGroupMemberResponse {
  type: "setGroupMember_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetInstallModeCall".
 */
export interface SetInstallModeCall {
  request: SetInstallModeRequest;
  response: SetInstallModeResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetInstallModeRequest".
 */
export interface SetInstallModeRequest {
  type: "setInstallMode";
  requestId?: string;
  interfaceName: string;
  on: boolean;
  seconds: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetInstallModeResponse".
 */
export interface SetInstallModeResponse {
  type: "setInstallMode_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AcceptDeviceCall".
 */
export interface AcceptDeviceCall {
  request: AcceptDeviceRequest;
  response: AcceptDeviceResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AcceptDeviceRequest".
 */
export interface AcceptDeviceRequest {
  type: "acceptDevice";
  requestId?: string;
  address: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AcceptDeviceResponse".
 */
export interface AcceptDeviceResponse {
  type: "acceptDevice_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteDeviceCall".
 */
export interface DeleteDeviceCall {
  request: DeleteDeviceRequest;
  response: DeleteDeviceResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteDeviceRequest".
 */
export interface DeleteDeviceRequest {
  type: "deleteDevice";
  requestId?: string;
  interfaceName: string;
  address: string;
  reset?: boolean;
  force?: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteDeviceResponse".
 */
export interface DeleteDeviceResponse {
  type: "deleteDevice_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetSysvarCall".
 */
export interface SetSysvarCall {
  request: SetSysvarRequest;
  response: SetSysvarResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetSysvarRequest".
 */
export interface SetSysvarRequest {
  type: "setSysvar";
  requestId?: string;
  id: number;
  value: Value;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetSysvarResponse".
 */
export interface SetSysvarResponse {
  type: "setSysvar_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RunProgramCall".
 */
export interface RunProgramCall {
  request: RunProgramRequest;
  response: RunProgramResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RunProgramRequest".
 */
export interface RunProgramRequest {
  type: "runProgram";
  requestId?: string;
  id: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RunProgramResponse".
 */
export interface RunProgramResponse {
  type: "runProgram_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetProgramActiveCall".
 */
export interface SetProgramActiveCall {
  request: SetProgramActiveRequest;
  response: SetProgramActiveResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetProgramActiveRequest".
 */
export interface SetProgramActiveRequest {
  type: "setProgramActive";
  requestId?: string;
  id: number;
  active: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetProgramActiveResponse".
 */
export interface SetProgramActiveResponse {
  type: "setProgramActive_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RevokeSessionCall".
 */
export interface RevokeSessionCall {
  request: RevokeSessionRequest;
  response: RevokeSessionResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RevokeSessionRequest".
 */
export interface RevokeSessionRequest {
  type: "revokeSession";
  requestId?: string;
  id: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RevokeSessionResponse".
 */
export interface RevokeSessionResponse {
  type: "revokeSession_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "LogoutCall".
 */
export interface LogoutCall {
  request: LogoutRequest;
  response: LogoutResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "LogoutRequest".
 */
export interface LogoutRequest {
  type: "logout";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "LogoutResponse".
 */
export interface LogoutResponse {
  type: "logout_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AddLinkCall".
 */
export interface AddLinkCall {
  request: AddLinkRequest;
  response: AddLinkResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AddLinkRequest".
 */
export interface AddLinkRequest {
  type: "addLink";
  requestId?: string;
  interfaceName: string;
  sender: string;
  receiver: string;
  name?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AddLinkResponse".
 */
export interface AddLinkResponse {
  type: "addLink_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RemoveLinkCall".
 */
export interface RemoveLinkCall {
  request: RemoveLinkRequest;
  response: RemoveLinkResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RemoveLinkRequest".
 */
export interface RemoveLinkRequest {
  type: "removeLink";
  requestId?: string;
  interfaceName: string;
  sender: string;
  receiver: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RemoveLinkResponse".
 */
export interface RemoveLinkResponse {
  type: "removeLink_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PutLinkParamsetCall".
 */
export interface PutLinkParamsetCall {
  request: PutLinkParamsetRequest;
  response: PutLinkParamsetResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PutLinkParamsetRequest".
 */
export interface PutLinkParamsetRequest {
  type: "putLinkParamset";
  requestId?: string;
  interfaceName: string;
  address: string;
  partner: string;
  values: Values;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PutLinkParamsetResponse".
 */
export interface PutLinkParamsetResponse {
  type: "putLinkParamset_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetInstallModeCall".
 */
export interface GetInstallModeCall {
  request: GetInstallModeRequest;
  response: GetInstallModeResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetInstallModeRequest".
 */
export interface GetInstallModeRequest {
  type: "getInstallMode";
  requestId?: string;
  interfaceName: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetInstallModeResponse".
 */
export interface GetInstallModeResponse {
  type: "getInstallMode_response";
  requestId?: string;
  success: boolean;
  seconds: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetInboxCall".
 */
export interface GetInboxCall {
  request: GetInboxRequest;
  response: GetInboxResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetInboxRequest".
 */
export interface GetInboxRequest {
  type: "getInbox";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetInboxResponse".
 */
export interface GetInboxResponse {
  type: "getInbox_response";
  requestId?: string;
  success: boolean;
  devices?: InboxDevice[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "InboxDevice".
 */
export interface InboxDevice {
  address: string;
  type: string;
  interfaceName: string;
  name: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetSysvarsCall".
 */
export interface GetSysvarsCall {
  request: GetSysvarsRequest;
  response: GetSysvarsResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetSysvarsRequest".
 */
export interface GetSysvarsRequest {
  type: "getSysvars";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetSysvarsResponse".
 */
export interface GetSysvarsResponse {
  type: "getSysvars_response";
  requestId?: string;
  success: boolean;
  sysvars?: Sysvar[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Sysvar".
 */
export interface Sysvar {
  id: number;
  name: string;
  visible: boolean;
  kind: "bool" | "alarm" | "number" | "enum" | "string";
  unit?: string;
  min?: number;
  max?: number;
  value: Value;
  falseName?: string;
  trueName?: string;
  valueList?: string[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetProgramsCall".
 */
export interface GetProgramsCall {
  request: GetProgramsRequest;
  response: GetProgramsResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetProgramsRequest".
 */
export interface GetProgramsRequest {
  type: "getPrograms";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetProgramsResponse".
 */
export interface GetProgramsResponse {
  type: "getPrograms_response";
  requestId?: string;
  success: boolean;
  programs?: Program[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Program".
 */
export interface Program {
  id: number;
  name: string;
  active: boolean;
  visible: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ListSessionsCall".
 */
export interface ListSessionsCall {
  request: ListSessionsRequest;
  response: ListSessionsResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ListSessionsRequest".
 */
export interface ListSessionsRequest {
  type: "listSessions";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ListSessionsResponse".
 */
export interface ListSessionsResponse {
  type: "listSessions_response";
  requestId?: string;
  success: boolean;
  sessions?: SessionInfo[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SessionInfo".
 */
export interface SessionInfo {
  id: string;
  user: string;
  device: string;
  created: string;
  lastUsed: string;
  current: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetLinksCall".
 */
export interface GetLinksCall {
  request: GetLinksRequest;
  response: GetLinksResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetLinksRequest".
 */
export interface GetLinksRequest {
  type: "getLinks";
  requestId?: string;
  interfaceName: string;
  address: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetLinksResponse".
 */
export interface GetLinksResponse {
  type: "getLinks_response";
  requestId?: string;
  success: boolean;
  links?: Link[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Link".
 */
export interface Link {
  sender: string;
  receiver: string;
  name?: string;
  description?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetLinkParamsetDescriptionCall".
 */
export interface GetLinkParamsetDescriptionCall {
  request: GetLinkParamsetDescriptionRequest;
  response: GetLinkParamsetDescriptionResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetLinkParamsetDescriptionRequest".
 */
export interface GetLinkParamsetDescriptionRequest {
  type: "getLinkParamsetDescription";
  requestId?: string;
  interfaceName: string;
  address: string;
  partner: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetLinkParamsetDescriptionResponse".
 */
export interface GetLinkParamsetDescriptionResponse {
  type: "getLinkParamsetDescription_response";
  requestId?: string;
  success: boolean;
  description?: ParamsetDescription;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetLinkParamsetCall".
 */
export interface GetLinkParamsetCall {
  request: GetLinkParamsetRequest;
  response: GetLinkParamsetResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetLinkParamsetRequest".
 */
export interface GetLinkParamsetRequest {
  type: "getLinkParamset";
  requestId?: string;
  interfaceName: string;
  address: string;
  partner: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetLinkParamsetResponse".
 */
export interface GetLinkParamsetResponse {
  type: "getLinkParamset_response";
  requestId?: string;
  success: boolean;
  values?: Values;
}
/**
 * Sent first on every connection
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AuthRequest".
 */
export interface AuthRequest {
  type: "auth";
  token?: string;
  adminToken?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "LoginRequest".
 */
export interface LoginRequest {
  type: "login";
  username: string;
  password: string;
}
/**
 * Answer to auth and login
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AuthResponse".
 */
export interface AuthResponse {
  type: "auth_response";
  success: boolean;
  authRequired: boolean;
  user?: string;
  level?: UserLevel;
  adminToken?: string;
  elevated: boolean;
  token?: string;
  error?: string;
  code?: string;
}
/**
 * A failed request; requestId if the request had one
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ErrorResponse".
 */
export interface ErrorResponse {
  type: "error";
  error: string;
  code?: string;
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Event".
 */
export interface Event {
  interface: string;
  channel: string;
  datapoint: string;
  value: Value;
  timestamp: string;
}
/**
 * A value reported by the CCU for a subscribed channel
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "EventMessage".
 */
export interface EventMessage {
  event: Event;
}
