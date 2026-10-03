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
  | GetLinkParamsetResponse
  | GetSystemInfoResponse
  | CreateGroupResponse
  | RenameGroupResponse
  | DeleteGroupResponse
  | CreateSysvarResponse
  | RenameSysvarResponse
  | DeleteSysvarResponse
  | GetServiceMessagesResponse
  | AcknowledgeServiceMessageResponse
  | InstallFirmwareResponse
  | CreateBackupResponse
  | GetAlarmMessagesResponse
  | AcknowledgeAlarmMessageResponse
  | GetFavoritesResponse
  | CreateFavoriteResponse
  | RenameFavoriteResponse
  | DeleteFavoriteResponse
  | AddFavoriteItemResponse
  | RemoveFavoriteItemResponse
  | SetChannelTileResponse
  | GetProgramResponse
  | SaveProgramResponse
  | DeleteProgramResponse
  | GetAllLinksResponse
  | GetLayoutResponse
  | SetLayoutResponse
  | GetPushResponse
  | SubscribePushResponse
  | UnsubscribePushResponse
  | TestPushResponse
  | GetSystemSettingsResponse
  | SetLocationResponse
  | PowerActionResponse
  | GetUsersResponse
  | SaveUserResponse
  | DeleteUserResponse
  | SetChannelOptionResponse;

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
  getSystemInfo: GetSystemInfoCall;
  createGroup: CreateGroupCall;
  renameGroup: RenameGroupCall;
  deleteGroup: DeleteGroupCall;
  createSysvar: CreateSysvarCall;
  renameSysvar: RenameSysvarCall;
  deleteSysvar: DeleteSysvarCall;
  getServiceMessages: GetServiceMessagesCall;
  acknowledgeServiceMessage: AcknowledgeServiceMessageCall;
  installFirmware: InstallFirmwareCall;
  createBackup: CreateBackupCall;
  getAlarmMessages: GetAlarmMessagesCall;
  acknowledgeAlarmMessage: AcknowledgeAlarmMessageCall;
  getFavorites: GetFavoritesCall;
  createFavorite: CreateFavoriteCall;
  renameFavorite: RenameFavoriteCall;
  deleteFavorite: DeleteFavoriteCall;
  addFavoriteItem: AddFavoriteItemCall;
  removeFavoriteItem: RemoveFavoriteItemCall;
  setChannelTile: SetChannelTileCall;
  getProgram: GetProgramCall;
  saveProgram: SaveProgramCall;
  deleteProgram: DeleteProgramCall;
  getAllLinks: GetAllLinksCall;
  getLayout: GetLayoutCall;
  setLayout: SetLayoutCall;
  getPush: GetPushCall;
  subscribePush: SubscribePushCall;
  unsubscribePush: UnsubscribePushCall;
  testPush: TestPushCall;
  getSystemSettings: GetSystemSettingsCall;
  setLocation: SetLocationCall;
  powerAction: PowerActionCall;
  getUsers: GetUsersCall;
  saveUser: SaveUserCall;
  deleteUser: DeleteUserCall;
  setChannelOption: SetChannelOptionCall;
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
 * Channels of a room, a trade, a favorite list or (all) of all devices
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
  favoriteId?: string;
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
  favoriteId?: string;
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
  /**
   * Tile chosen in the add-on (ReGa metadata)
   */
  tile?: "light" | "switch";
  /**
   * not visible (the WebUI's channel option)
   */
  hidden?: boolean;
  /**
   * only administrators may operate it
   */
  readOnly?: boolean;
  /**
   * logged in the system protocol
   */
  logged?: boolean;
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
  availableFirmware?: string;
  firmwareUpdateState?: string;
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
  availableFirmware?: string;
  firmwareUpdateState?: string;
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
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetSystemInfoCall".
 */
export interface GetSystemInfoCall {
  request: GetSystemInfoRequest;
  response: GetSystemInfoResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetSystemInfoRequest".
 */
export interface GetSystemInfoRequest {
  type: "getSystemInfo";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetSystemInfoResponse".
 */
export interface GetSystemInfoResponse {
  type: "getSystemInfo_response";
  requestId?: string;
  success: boolean;
  addonVersion?: string;
  firmwareVersion?: string;
  radioInterfaces: RadioInterface[];
}
/**
 * A radio module with its duty cycle (percent of the allowed transmit time used)
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RadioInterface".
 */
export interface RadioInterface {
  interfaceName: string;
  address: string;
  description?: string;
  connected: boolean;
  default: boolean;
  dutyCycle: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CreateGroupCall".
 */
export interface CreateGroupCall {
  request: CreateGroupRequest;
  response: CreateGroupResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CreateGroupRequest".
 */
export interface CreateGroupRequest {
  type: "createGroup";
  requestId?: string;
  list: "rooms" | "trades";
  name: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CreateGroupResponse".
 */
export interface CreateGroupResponse {
  type: "createGroup_response";
  requestId?: string;
  success: boolean;
  id?: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RenameGroupCall".
 */
export interface RenameGroupCall {
  request: RenameGroupRequest;
  response: RenameGroupResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RenameGroupRequest".
 */
export interface RenameGroupRequest {
  type: "renameGroup";
  requestId?: string;
  list: "rooms" | "trades";
  id: number;
  name: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RenameGroupResponse".
 */
export interface RenameGroupResponse {
  type: "renameGroup_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteGroupCall".
 */
export interface DeleteGroupCall {
  request: DeleteGroupRequest;
  response: DeleteGroupResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteGroupRequest".
 */
export interface DeleteGroupRequest {
  type: "deleteGroup";
  requestId?: string;
  list: "rooms" | "trades";
  id: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteGroupResponse".
 */
export interface DeleteGroupResponse {
  type: "deleteGroup_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CreateSysvarCall".
 */
export interface CreateSysvarCall {
  request: CreateSysvarRequest;
  response: CreateSysvarResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CreateSysvarRequest".
 */
export interface CreateSysvarRequest {
  type: "createSysvar";
  requestId?: string;
  name: string;
  kind: "bool" | "alarm" | "number" | "enum" | "string";
  unit?: string;
  min?: number;
  max?: number;
  falseName?: string;
  trueName?: string;
  valueList?: string[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CreateSysvarResponse".
 */
export interface CreateSysvarResponse {
  type: "createSysvar_response";
  requestId?: string;
  success: boolean;
  id?: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RenameSysvarCall".
 */
export interface RenameSysvarCall {
  request: RenameSysvarRequest;
  response: RenameSysvarResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RenameSysvarRequest".
 */
export interface RenameSysvarRequest {
  type: "renameSysvar";
  requestId?: string;
  id: number;
  name: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RenameSysvarResponse".
 */
export interface RenameSysvarResponse {
  type: "renameSysvar_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteSysvarCall".
 */
export interface DeleteSysvarCall {
  request: DeleteSysvarRequest;
  response: DeleteSysvarResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteSysvarRequest".
 */
export interface DeleteSysvarRequest {
  type: "deleteSysvar";
  requestId?: string;
  id: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteSysvarResponse".
 */
export interface DeleteSysvarResponse {
  type: "deleteSysvar_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetServiceMessagesCall".
 */
export interface GetServiceMessagesCall {
  request: GetServiceMessagesRequest;
  response: GetServiceMessagesResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetServiceMessagesRequest".
 */
export interface GetServiceMessagesRequest {
  type: "getServiceMessages";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetServiceMessagesResponse".
 */
export interface GetServiceMessagesResponse {
  type: "getServiceMessages_response";
  requestId?: string;
  messages: ServiceMessage[];
}
/**
 * An active service message of the CCU
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ServiceMessage".
 */
export interface ServiceMessage {
  id: number;
  /**
   * The datapoint that raised it, e.g. STICKY_UNREACH
   */
  type: string;
  value?: string;
  timestamp?: string;
  address?: string;
  name: string;
  roomId?: number;
  roomName?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AcknowledgeServiceMessageCall".
 */
export interface AcknowledgeServiceMessageCall {
  request: AcknowledgeServiceMessageRequest;
  response: AcknowledgeServiceMessageResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AcknowledgeServiceMessageRequest".
 */
export interface AcknowledgeServiceMessageRequest {
  type: "acknowledgeServiceMessage";
  requestId?: string;
  id: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AcknowledgeServiceMessageResponse".
 */
export interface AcknowledgeServiceMessageResponse {
  type: "acknowledgeServiceMessage_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "InstallFirmwareCall".
 */
export interface InstallFirmwareCall {
  request: InstallFirmwareRequest;
  response: InstallFirmwareResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "InstallFirmwareRequest".
 */
export interface InstallFirmwareRequest {
  type: "installFirmware";
  requestId?: string;
  interfaceName: string;
  address: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "InstallFirmwareResponse".
 */
export interface InstallFirmwareResponse {
  type: "installFirmware_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CreateBackupCall".
 */
export interface CreateBackupCall {
  request: CreateBackupRequest;
  response: CreateBackupResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CreateBackupRequest".
 */
export interface CreateBackupRequest {
  type: "createBackup";
  requestId?: string;
  password: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CreateBackupResponse".
 */
export interface CreateBackupResponse {
  type: "createBackup_response";
  requestId?: string;
  success: boolean;
  /**
   * Where to download the backup, once and within 5 minutes
   */
  url: string;
  fileName: string;
  size: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetAlarmMessagesCall".
 */
export interface GetAlarmMessagesCall {
  request: GetAlarmMessagesRequest;
  response: GetAlarmMessagesResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetAlarmMessagesRequest".
 */
export interface GetAlarmMessagesRequest {
  type: "getAlarmMessages";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetAlarmMessagesResponse".
 */
export interface GetAlarmMessagesResponse {
  type: "getAlarmMessages_response";
  requestId?: string;
  alarms: AlarmMessage[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AlarmMessage".
 */
export interface AlarmMessage {
  id: number;
  name: string;
  /**
   * Whether the alarm variable is still set
   */
  active: boolean;
  counter: number;
  firstTime?: string;
  lastTime?: string;
  /**
   * The channel that triggered it
   */
  channel?: string;
  roomName?: string;
  message?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AcknowledgeAlarmMessageCall".
 */
export interface AcknowledgeAlarmMessageCall {
  request: AcknowledgeAlarmMessageRequest;
  response: AcknowledgeAlarmMessageResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AcknowledgeAlarmMessageRequest".
 */
export interface AcknowledgeAlarmMessageRequest {
  type: "acknowledgeAlarmMessage";
  requestId?: string;
  id: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AcknowledgeAlarmMessageResponse".
 */
export interface AcknowledgeAlarmMessageResponse {
  type: "acknowledgeAlarmMessage_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetFavoritesCall".
 */
export interface GetFavoritesCall {
  request: GetFavoritesRequest;
  response: GetFavoritesResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetFavoritesRequest".
 */
export interface GetFavoritesRequest {
  type: "getFavorites";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetFavoritesResponse".
 */
export interface GetFavoritesResponse {
  type: "getFavorites_response";
  requestId?: string;
  favorites: Favorite[];
}
/**
 * A favorite list of the CCU user
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Favorite".
 */
export interface Favorite {
  id: number;
  name: string;
  items: FavoriteItem[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "FavoriteItem".
 */
export interface FavoriteItem {
  id: number;
  type: "CHANNEL" | "SYSVAR" | "PROGRAM" | "SEPARATOR";
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CreateFavoriteCall".
 */
export interface CreateFavoriteCall {
  request: CreateFavoriteRequest;
  response: CreateFavoriteResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CreateFavoriteRequest".
 */
export interface CreateFavoriteRequest {
  type: "createFavorite";
  requestId?: string;
  name: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CreateFavoriteResponse".
 */
export interface CreateFavoriteResponse {
  type: "createFavorite_response";
  requestId?: string;
  success: boolean;
  id?: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RenameFavoriteCall".
 */
export interface RenameFavoriteCall {
  request: RenameFavoriteRequest;
  response: RenameFavoriteResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RenameFavoriteRequest".
 */
export interface RenameFavoriteRequest {
  type: "renameFavorite";
  requestId?: string;
  id: number;
  name: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RenameFavoriteResponse".
 */
export interface RenameFavoriteResponse {
  type: "renameFavorite_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteFavoriteCall".
 */
export interface DeleteFavoriteCall {
  request: DeleteFavoriteRequest;
  response: DeleteFavoriteResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteFavoriteRequest".
 */
export interface DeleteFavoriteRequest {
  type: "deleteFavorite";
  requestId?: string;
  id: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteFavoriteResponse".
 */
export interface DeleteFavoriteResponse {
  type: "deleteFavorite_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AddFavoriteItemCall".
 */
export interface AddFavoriteItemCall {
  request: AddFavoriteItemRequest;
  response: AddFavoriteItemResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AddFavoriteItemRequest".
 */
export interface AddFavoriteItemRequest {
  type: "addFavoriteItem";
  requestId?: string;
  id: number;
  itemId: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AddFavoriteItemResponse".
 */
export interface AddFavoriteItemResponse {
  type: "addFavoriteItem_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RemoveFavoriteItemCall".
 */
export interface RemoveFavoriteItemCall {
  request: RemoveFavoriteItemRequest;
  response: RemoveFavoriteItemResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RemoveFavoriteItemRequest".
 */
export interface RemoveFavoriteItemRequest {
  type: "removeFavoriteItem";
  requestId?: string;
  id: number;
  itemId: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RemoveFavoriteItemResponse".
 */
export interface RemoveFavoriteItemResponse {
  type: "removeFavoriteItem_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetChannelTileCall".
 */
export interface SetChannelTileCall {
  request: SetChannelTileRequest;
  response: SetChannelTileResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetChannelTileRequest".
 */
export interface SetChannelTileRequest {
  type: "setChannelTile";
  requestId?: string;
  id: number;
  /**
   * The tile shown for the channel; empty lets the app decide
   */
  tile: "" | "light" | "switch";
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetChannelTileResponse".
 */
export interface SetChannelTileResponse {
  type: "setChannelTile_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetProgramCall".
 */
export interface GetProgramCall {
  request: GetProgramRequest;
  response: GetProgramResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetProgramRequest".
 */
export interface GetProgramRequest {
  type: "getProgram";
  requestId?: string;
  id: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetProgramResponse".
 */
export interface GetProgramResponse {
  type: "getProgram_response";
  requestId?: string;
  program: ProgramDefinition;
}
/**
 * A program with its WENN / SONST WENN rules and the SONST branch
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ProgramDefinition".
 */
export interface ProgramDefinition {
  /**
   * 0 for a new program
   */
  id: number;
  name: string;
  description: string;
  active: boolean;
  rules: ProgramRule[];
  else?: ProgramBranch;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ProgramRule".
 */
export interface ProgramRule {
  groupOperator: "or" | "and";
  groups: ProgramCondition[][];
  breakOnRestart: boolean;
  destinations: ProgramDestination[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ProgramCondition".
 */
export interface ProgramCondition {
  /**
   * ivtObjectId, ivtSystemId, ivtCurrentDate, ivtEmpty or N:<number>
   */
  leftType: string;
  leftValue: number;
  channel: number;
  datapoint?: string;
  compare: number;
  trigger: number;
  value1Type: string;
  value1: string;
  value2Type: string;
  value2: string;
  time?: TimeModule;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "TimeModule".
 */
export interface TimeModule {
  id: number;
  changed?: boolean;
  timerType: number;
  time: string;
  duration: number;
  sunOffset: number;
  period: number;
  weekdays: number;
  repetitionValue: number;
  begin: string;
  end: string;
  repetitionCount: number;
  repeatTime: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ProgramDestination".
 */
export interface ProgramDestination {
  /**
   * ivtObjectId, ivtSystemId, ivtString (script), ivtEmpty or N:<number>
   */
  param: string;
  channel: number;
  datapointId: number;
  datapoint?: string;
  valueType: string;
  value: string;
  /**
   * seconds, 0 for at once
   */
  delay: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ProgramBranch".
 */
export interface ProgramBranch {
  breakOnRestart: boolean;
  destinations: ProgramDestination[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SaveProgramCall".
 */
export interface SaveProgramCall {
  request: SaveProgramRequest;
  response: SaveProgramResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SaveProgramRequest".
 */
export interface SaveProgramRequest {
  type: "saveProgram";
  requestId?: string;
  program: ProgramDefinition;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SaveProgramResponse".
 */
export interface SaveProgramResponse {
  type: "saveProgram_response";
  requestId?: string;
  success: boolean;
  id?: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteProgramCall".
 */
export interface DeleteProgramCall {
  request: DeleteProgramRequest;
  response: DeleteProgramResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteProgramRequest".
 */
export interface DeleteProgramRequest {
  type: "deleteProgram";
  requestId?: string;
  id: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteProgramResponse".
 */
export interface DeleteProgramResponse {
  type: "deleteProgram_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetAllLinksCall".
 */
export interface GetAllLinksCall {
  request: GetAllLinksRequest;
  response: GetAllLinksResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetAllLinksRequest".
 */
export interface GetAllLinksRequest {
  type: "getAllLinks";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetAllLinksResponse".
 */
export interface GetAllLinksResponse {
  type: "getAllLinks_response";
  requestId?: string;
  links: InterfaceLink[];
}
/**
 * A direct link and the interface it belongs to
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "InterfaceLink".
 */
export interface InterfaceLink {
  interfaceName: string;
  sender: string;
  receiver: string;
  name?: string;
  description?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetLayoutCall".
 */
export interface GetLayoutCall {
  request: GetLayoutRequest;
  response: GetLayoutResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetLayoutRequest".
 */
export interface GetLayoutRequest {
  type: "getLayout";
  requestId?: string;
  /**
   * room, trade or favorite list
   */
  id: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetLayoutResponse".
 */
export interface GetLayoutResponse {
  type: "getLayout_response";
  requestId?: string;
  /**
   * JSON, empty if none
   */
  layout: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetLayoutCall".
 */
export interface SetLayoutCall {
  request: SetLayoutRequest;
  response: SetLayoutResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetLayoutRequest".
 */
export interface SetLayoutRequest {
  type: "setLayout";
  requestId?: string;
  id: number;
  /**
   * JSON; empty removes the layout
   */
  layout: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetLayoutResponse".
 */
export interface SetLayoutResponse {
  type: "setLayout_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetPushCall".
 */
export interface GetPushCall {
  request: GetPushRequest;
  response: GetPushResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetPushRequest".
 */
export interface GetPushRequest {
  type: "getPush";
  requestId?: string;
  /**
   * the device's push endpoint, if subscribed
   */
  endpoint?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetPushResponse".
 */
export interface GetPushResponse {
  type: "getPush_response";
  requestId?: string;
  publicKey: string;
  subscribed: boolean;
  alarms: boolean;
  service: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SubscribePushCall".
 */
export interface SubscribePushCall {
  request: SubscribePushRequest;
  response: SubscribePushResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SubscribePushRequest".
 */
export interface SubscribePushRequest {
  type: "subscribePush";
  requestId?: string;
  subscription: PushSubscription;
  alarms?: boolean;
  service?: boolean;
  language?: string;
  device?: string;
}
/**
 * What PushManager.subscribe returns (toJSON)
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PushSubscription".
 */
export interface PushSubscription {
  endpoint: string;
  expirationTime?: unknown;
  keys: {
    p256dh: string;
    auth: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SubscribePushResponse".
 */
export interface SubscribePushResponse {
  type: "subscribePush_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "UnsubscribePushCall".
 */
export interface UnsubscribePushCall {
  request: UnsubscribePushRequest;
  response: UnsubscribePushResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "UnsubscribePushRequest".
 */
export interface UnsubscribePushRequest {
  type: "unsubscribePush";
  requestId?: string;
  endpoint: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "UnsubscribePushResponse".
 */
export interface UnsubscribePushResponse {
  type: "unsubscribePush_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "TestPushCall".
 */
export interface TestPushCall {
  request: TestPushRequest;
  response: TestPushResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "TestPushRequest".
 */
export interface TestPushRequest {
  type: "testPush";
  requestId?: string;
  endpoint: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "TestPushResponse".
 */
export interface TestPushResponse {
  type: "testPush_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetSystemSettingsCall".
 */
export interface GetSystemSettingsCall {
  request: GetSystemSettingsRequest;
  response: GetSystemSettingsResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetSystemSettingsRequest".
 */
export interface GetSystemSettingsRequest {
  type: "getSystemSettings";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetSystemSettingsResponse".
 */
export interface GetSystemSettingsResponse {
  type: "getSystemSettings_response";
  requestId?: string;
  latitude: number;
  longitude: number;
  /**
   * minutes east of UTC
   */
  timeZoneOffset: number;
  /**
   * the CCU's local time, YYYY-MM-DD HH:MM:SS
   */
  time: string;
  timeZone?: string;
  city?: string;
  /**
   * whether reboot and shutdown work (the add-on runs on the CCU)
   */
  canPower: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetLocationCall".
 */
export interface SetLocationCall {
  request: SetLocationRequest;
  response: SetLocationResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetLocationRequest".
 */
export interface SetLocationRequest {
  type: "setLocation";
  requestId?: string;
  latitude: number;
  longitude: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetLocationResponse".
 */
export interface SetLocationResponse {
  type: "setLocation_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PowerActionCall".
 */
export interface PowerActionCall {
  request: PowerActionRequest;
  response: PowerActionResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PowerActionRequest".
 */
export interface PowerActionRequest {
  type: "powerAction";
  requestId?: string;
  action: "reboot" | "shutdown";
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PowerActionResponse".
 */
export interface PowerActionResponse {
  type: "powerAction_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetUsersCall".
 */
export interface GetUsersCall {
  request: GetUsersRequest;
  response: GetUsersResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetUsersRequest".
 */
export interface GetUsersRequest {
  type: "getUsers";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetUsersResponse".
 */
export interface GetUsersResponse {
  type: "getUsers_response";
  requestId?: string;
  users: CcuUser[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CcuUser".
 */
export interface CcuUser {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  level: "admin" | "user" | "guest" | "";
  hasPassword: boolean;
  /**
   * shown on the WebUI's login page
   */
  showLogin: boolean;
  deletable: boolean;
  mail: string;
  phone: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SaveUserCall".
 */
export interface SaveUserCall {
  request: SaveUserRequest;
  response: SaveUserResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SaveUserRequest".
 */
export interface SaveUserRequest {
  type: "saveUser";
  requestId?: string;
  /**
   * 0 creates a user
   */
  id: number;
  /**
   * login name without spaces; first name up to the first space, as in the WebUI
   */
  fullName: string;
  level: "admin" | "user" | "guest";
  showLogin?: boolean;
  mail?: string;
  phone?: string;
  /**
   * only to set it; the WebUI's allowed characters
   */
  password?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SaveUserResponse".
 */
export interface SaveUserResponse {
  type: "saveUser_response";
  requestId?: string;
  success: boolean;
  id?: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteUserCall".
 */
export interface DeleteUserCall {
  request: DeleteUserRequest;
  response: DeleteUserResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteUserRequest".
 */
export interface DeleteUserRequest {
  type: "deleteUser";
  requestId?: string;
  id: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteUserResponse".
 */
export interface DeleteUserResponse {
  type: "deleteUser_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetChannelOptionCall".
 */
export interface SetChannelOptionCall {
  request: SetChannelOptionRequest;
  response: SetChannelOptionResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetChannelOptionRequest".
 */
export interface SetChannelOptionRequest {
  type: "setChannelOption";
  requestId?: string;
  id: number;
  option: "visible" | "usable" | "logged";
  value: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetChannelOptionResponse".
 */
export interface SetChannelOptionResponse {
  type: "setChannelOption_response";
  requestId?: string;
  success: boolean;
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
