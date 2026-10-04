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
  | SetChannelOptionResponse
  | GetHistoryResponse
  | ClearHistoryResponse
  | GetAddonsResponse
  | AddonActionResponse
  | CheckAddonUpdateResponse
  | ChangePasswordResponse
  | GetDeviceProgramsResponse
  | GetVirtualKeysResponse
  | ListReplaceableDevicesResponse
  | ReplaceDeviceResponse
  | StartComTestResponse
  | PollComTestResponse
  | CheckFirmwareUpdateResponse
  | GetLoggingResponse
  | SetLoggingResponse
  | DownloadLogsResponse
  | RunScriptResponse
  | SetLogicOptionResponse
  | EditSysvarResponse
  | SetTimeServersResponse
  | SetTimeZoneResponse
  | SetClockResponse
  | GetHeatingGroupsResponse
  | PrepareRestoreResponse
  | CheckRestoreResponse
  | RestoreBackupResponse
  | PrepareCcuFirmwareResponse
  | CheckCcuFirmwareResponse
  | InstallCcuFirmwareResponse
  | CancelCcuFirmwareResponse
  | PrepareAddonUploadResponse
  | InstallAddonResponse
  | GetDiagramsResponse
  | GetDiagramDataResponse
  | SaveDiagramResponse
  | DeleteDiagramResponse
  | GetGeneralSettingsResponse
  | SetGeneralSettingsResponse
  | GetHeatingGroupMembersResponse
  | SaveHeatingGroupResponse
  | DeleteHeatingGroupResponse;

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
  getHistory: GetHistoryCall;
  clearHistory: ClearHistoryCall;
  getAddons: GetAddonsCall;
  addonAction: AddonActionCall;
  checkAddonUpdate: CheckAddonUpdateCall;
  changePassword: ChangePasswordCall;
  getDevicePrograms: GetDeviceProgramsCall;
  getVirtualKeys: GetVirtualKeysCall;
  listReplaceableDevices: ListReplaceableDevicesCall;
  replaceDevice: ReplaceDeviceCall;
  startComTest: StartComTestCall;
  pollComTest: PollComTestCall;
  checkFirmwareUpdate: CheckFirmwareUpdateCall;
  getLogging: GetLoggingCall;
  setLogging: SetLoggingCall;
  downloadLogs: DownloadLogsCall;
  runScript: RunScriptCall;
  setLogicOption: SetLogicOptionCall;
  editSysvar: EditSysvarCall;
  setTimeServers: SetTimeServersCall;
  setTimeZone: SetTimeZoneCall;
  setClock: SetClockCall;
  getHeatingGroups: GetHeatingGroupsCall;
  prepareRestore: PrepareRestoreCall;
  checkRestore: CheckRestoreCall;
  restoreBackup: RestoreBackupCall;
  prepareCcuFirmware: PrepareCcuFirmwareCall;
  checkCcuFirmware: CheckCcuFirmwareCall;
  installCcuFirmware: InstallCcuFirmwareCall;
  cancelCcuFirmware: CancelCcuFirmwareCall;
  prepareAddonUpload: PrepareAddonUploadCall;
  installAddon: InstallAddonCall;
  getDiagrams: GetDiagramsCall;
  getDiagramData: GetDiagramDataCall;
  saveDiagram: SaveDiagramCall;
  deleteDiagram: DeleteDiagramCall;
  getGeneralSettings: GetGeneralSettingsCall;
  setGeneralSettings: SetGeneralSettingsCall;
  getHeatingGroupMembers: GetHeatingGroupMembersCall;
  saveHeatingGroup: SaveHeatingGroupCall;
  deleteHeatingGroup: DeleteHeatingGroupCall;
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
  /**
   * secured transmission (AES), BidCos
   */
  aes?: boolean;
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
  /**
   * The info text (DPInfo)
   */
  description?: string;
  /**
   * The channel the variable belongs to
   */
  channel?: number;
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
  /**
   * Users other than administrators may run it ("bedienbar")
   */
  operate: boolean;
  /**
   * A system-internal program (the WebUI lists them on request)
   */
  internal?: boolean;
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
  /**
   * The time servers (ntpclient), if the file is there
   */
  timeServers?: string;
  /**
   * The time zones to choose from, if time.conf is there
   */
  timeZones?: string[];
  canSetClock: boolean;
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
  option: "visible" | "usable" | "logged" | "aes";
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
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetHistoryCall".
 */
export interface GetHistoryCall {
  request: GetHistoryRequest;
  response: GetHistoryResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetHistoryRequest".
 */
export interface GetHistoryRequest {
  type: "getHistory";
  requestId?: string;
  /**
   * 0 is the newest entry
   */
  start?: number;
  count?: number;
  /**
   * only the entries of this channel (0: all)
   */
  channel?: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetHistoryResponse".
 */
export interface GetHistoryResponse {
  type: "getHistory_response";
  requestId?: string;
  entries: HistoryEntry[];
  total: number;
}
/**
 * One entry of the system protocol (dom.GetHistoryData)
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "HistoryEntry".
 */
export interface HistoryEntry {
  /**
   * entries of one event share a group
   */
  group: number;
  /**
   * YYYY-MM-DD HH:MM:SS
   */
  time: string;
  kind: "channel" | "sysvar";
  name: string;
  datapoint?: string;
  value: string;
  /**
   * the value as the WebUI writes it (system variables)
   */
  text?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ClearHistoryCall".
 */
export interface ClearHistoryCall {
  request: ClearHistoryRequest;
  response: ClearHistoryResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ClearHistoryRequest".
 */
export interface ClearHistoryRequest {
  type: "clearHistory";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ClearHistoryResponse".
 */
export interface ClearHistoryResponse {
  type: "clearHistory_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetAddonsCall".
 */
export interface GetAddonsCall {
  request: GetAddonsRequest;
  response: GetAddonsResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetAddonsRequest".
 */
export interface GetAddonsRequest {
  type: "getAddons";
  requestId?: string;
  language?: "de" | "en";
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetAddonsResponse".
 */
export interface GetAddonsResponse {
  type: "getAddons_response";
  requestId?: string;
  addons: Addon[];
}
/**
 * An add-on as its rc.d script describes itself (cp_software.cgi)
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Addon".
 */
export interface Addon {
  /**
   * the script's file name
   */
  id: string;
  name: string;
  version?: string;
  info?: string[];
  updateUrl?: string;
  configUrl?: string;
  operations: ("restart" | "uninstall")[];
  /**
   * this add-on
   */
  self?: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AddonActionCall".
 */
export interface AddonActionCall {
  request: AddonActionRequest;
  response: AddonActionResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AddonActionRequest".
 */
export interface AddonActionRequest {
  type: "addonAction";
  requestId?: string;
  id: string;
  operation: "restart" | "uninstall";
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "AddonActionResponse".
 */
export interface AddonActionResponse {
  type: "addonAction_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CheckAddonUpdateCall".
 */
export interface CheckAddonUpdateCall {
  request: CheckAddonUpdateRequest;
  response: CheckAddonUpdateResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CheckAddonUpdateRequest".
 */
export interface CheckAddonUpdateRequest {
  type: "checkAddonUpdate";
  requestId?: string;
  id: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CheckAddonUpdateResponse".
 */
export interface CheckAddonUpdateResponse {
  type: "checkAddonUpdate_response";
  requestId?: string;
  /**
   * the newest version the add-on's update URL names
   */
  latest: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ChangePasswordCall".
 */
export interface ChangePasswordCall {
  request: ChangePasswordRequest;
  response: ChangePasswordResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ChangePasswordRequest".
 */
export interface ChangePasswordRequest {
  type: "changePassword";
  requestId?: string;
  currentPassword: string;
  /**
   * the WebUI's allowed characters, not empty
   */
  newPassword: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ChangePasswordResponse".
 */
export interface ChangePasswordResponse {
  type: "changePassword_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetDeviceProgramsCall".
 */
export interface GetDeviceProgramsCall {
  request: GetDeviceProgramsRequest;
  response: GetDeviceProgramsResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetDeviceProgramsRequest".
 */
export interface GetDeviceProgramsRequest {
  type: "getDevicePrograms";
  requestId?: string;
  /**
   * the device address
   */
  address: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetDeviceProgramsResponse".
 */
export interface GetDeviceProgramsResponse {
  type: "getDevicePrograms_response";
  requestId?: string;
  programs: ProgramUsage[];
}
/**
 * A program using channels of a device (ChnEnumDPUsagePrograms)
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ProgramUsage".
 */
export interface ProgramUsage {
  id: number;
  name: string;
  channels: string[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetVirtualKeysCall".
 */
export interface GetVirtualKeysCall {
  request: GetVirtualKeysRequest;
  response: GetVirtualKeysResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetVirtualKeysRequest".
 */
export interface GetVirtualKeysRequest {
  type: "getVirtualKeys";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetVirtualKeysResponse".
 */
export interface GetVirtualKeysResponse {
  type: "getVirtualKeys_response";
  requestId?: string;
  keys: VirtualKey[];
}
/**
 * A virtual key of the CCU (HM-RCV-50, HmIP-RCV-50)
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "VirtualKey".
 */
export interface VirtualKey {
  id: number;
  address: string;
  interfaceName: string;
  name: string;
  /**
   * how many programs use the key
   */
  programs: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ListReplaceableDevicesCall".
 */
export interface ListReplaceableDevicesCall {
  request: ListReplaceableDevicesRequest;
  response: ListReplaceableDevicesResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ListReplaceableDevicesRequest".
 */
export interface ListReplaceableDevicesRequest {
  type: "listReplaceableDevices";
  requestId?: string;
  interfaceName: string;
  /**
   * the new device (from the inbox)
   */
  address: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ListReplaceableDevicesResponse".
 */
export interface ListReplaceableDevicesResponse {
  type: "listReplaceableDevices_response";
  requestId?: string;
  devices: DeviceDescription[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ReplaceDeviceCall".
 */
export interface ReplaceDeviceCall {
  request: ReplaceDeviceRequest;
  response: ReplaceDeviceResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ReplaceDeviceRequest".
 */
export interface ReplaceDeviceRequest {
  type: "replaceDevice";
  requestId?: string;
  interfaceName: string;
  /**
   * the new device
   */
  address: string;
  /**
   * the device it replaces
   */
  oldAddress: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "ReplaceDeviceResponse".
 */
export interface ReplaceDeviceResponse {
  type: "replaceDevice_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "StartComTestCall".
 */
export interface StartComTestCall {
  request: StartComTestRequest;
  response: StartComTestResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "StartComTestRequest".
 */
export interface StartComTestRequest {
  type: "startComTest";
  requestId?: string;
  /**
   * the device address
   */
  address: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "StartComTestResponse".
 */
export interface StartComTestResponse {
  type: "startComTest_response";
  requestId?: string;
  /**
   * the start time, which identifies the test
   */
  started: string;
  answered?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PollComTestCall".
 */
export interface PollComTestCall {
  request: PollComTestRequest;
  response: PollComTestResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PollComTestRequest".
 */
export interface PollComTestRequest {
  type: "pollComTest";
  requestId?: string;
  address: string;
  /**
   * YYYY-MM-DD HH:MM:SS from startComTest
   */
  started: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PollComTestResponse".
 */
export interface PollComTestResponse {
  type: "pollComTest_response";
  requestId?: string;
  /**
   * when the device answered, empty while it hasn't
   */
  answered: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CheckFirmwareUpdateCall".
 */
export interface CheckFirmwareUpdateCall {
  request: CheckFirmwareUpdateRequest;
  response: CheckFirmwareUpdateResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CheckFirmwareUpdateRequest".
 */
export interface CheckFirmwareUpdateRequest {
  type: "checkFirmwareUpdate";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CheckFirmwareUpdateResponse".
 */
export interface CheckFirmwareUpdateResponse {
  type: "checkFirmwareUpdate_response";
  requestId?: string;
  current: string;
  latest: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetLoggingCall".
 */
export interface GetLoggingCall {
  request: GetLoggingRequest;
  response: GetLoggingResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetLoggingRequest".
 */
export interface GetLoggingRequest {
  type: "getLogging";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetLoggingResponse".
 */
export interface GetLoggingResponse {
  type: "getLogging_response";
  requestId?: string;
  host: string;
  rfd: number;
  hmip: string;
  rega: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetLoggingCall".
 */
export interface SetLoggingCall {
  request: SetLoggingRequest;
  response: SetLoggingResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetLoggingRequest".
 */
export interface SetLoggingRequest {
  type: "setLogging";
  requestId?: string;
  host: string;
  rfd: number;
  hmip: string;
  rega: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetLoggingResponse".
 */
export interface SetLoggingResponse {
  type: "setLogging_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DownloadLogsCall".
 */
export interface DownloadLogsCall {
  request: DownloadLogsRequest;
  response: DownloadLogsResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DownloadLogsRequest".
 */
export interface DownloadLogsRequest {
  type: "downloadLogs";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DownloadLogsResponse".
 */
export interface DownloadLogsResponse {
  type: "downloadLogs_response";
  requestId?: string;
  success: boolean;
  url: string;
  fileName: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RunScriptCall".
 */
export interface RunScriptCall {
  request: RunScriptRequest;
  response: RunScriptResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RunScriptRequest".
 */
export interface RunScriptRequest {
  type: "runScript";
  requestId?: string;
  script: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RunScriptResponse".
 */
export interface RunScriptResponse {
  type: "runScript_response";
  requestId?: string;
  syntaxError?: string;
  output: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetLogicOptionCall".
 */
export interface SetLogicOptionCall {
  request: SetLogicOptionRequest;
  response: SetLogicOptionResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetLogicOptionRequest".
 */
export interface SetLogicOptionRequest {
  type: "setLogicOption";
  requestId?: string;
  id: number;
  option: "visible" | "operate";
  value: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetLogicOptionResponse".
 */
export interface SetLogicOptionResponse {
  type: "setLogicOption_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "EditSysvarCall".
 */
export interface EditSysvarCall {
  request: EditSysvarRequest;
  response: EditSysvarResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "EditSysvarRequest".
 */
export interface EditSysvarRequest {
  type: "editSysvar";
  requestId?: string;
  kind: "bool" | "alarm" | "number" | "enum" | "string";
  unit?: string;
  min?: number;
  max?: number;
  falseName?: string;
  trueName?: string;
  valueList?: string[];
  id: number;
  description?: string;
  /**
   * 0: none
   */
  channel?: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "EditSysvarResponse".
 */
export interface EditSysvarResponse {
  type: "editSysvar_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetTimeServersCall".
 */
export interface SetTimeServersCall {
  request: SetTimeServersRequest;
  response: SetTimeServersResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetTimeServersRequest".
 */
export interface SetTimeServersRequest {
  type: "setTimeServers";
  requestId?: string;
  servers: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetTimeServersResponse".
 */
export interface SetTimeServersResponse {
  type: "setTimeServers_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetTimeZoneCall".
 */
export interface SetTimeZoneCall {
  request: SetTimeZoneRequest;
  response: SetTimeZoneResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetTimeZoneRequest".
 */
export interface SetTimeZoneRequest {
  type: "setTimeZone";
  requestId?: string;
  timeZone: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetTimeZoneResponse".
 */
export interface SetTimeZoneResponse {
  type: "setTimeZone_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetClockCall".
 */
export interface SetClockCall {
  request: SetClockRequest;
  response: SetClockResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetClockRequest".
 */
export interface SetClockRequest {
  type: "setClock";
  requestId?: string;
  /**
   * YYYY-MM-DD hh:mm:ss
   */
  time: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetClockResponse".
 */
export interface SetClockResponse {
  type: "setClock_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetHeatingGroupsCall".
 */
export interface GetHeatingGroupsCall {
  request: GetHeatingGroupsRequest;
  response: GetHeatingGroupsResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetHeatingGroupsRequest".
 */
export interface GetHeatingGroupsRequest {
  type: "getHeatingGroups";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetHeatingGroupsResponse".
 */
export interface GetHeatingGroupsResponse {
  type: "getHeatingGroups_response";
  requestId?: string;
  groups: HeatingGroup[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "HeatingGroup".
 */
export interface HeatingGroup {
  id: number;
  name: string;
  type: string;
  typeLabel?: string;
  deviceAddress?: string;
  deviceName?: string;
  forbidSingleOperation: boolean;
  members: {
    address: string;
    type: string;
  }[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PrepareRestoreCall".
 */
export interface PrepareRestoreCall {
  request: PrepareRestoreRequest;
  response: PrepareRestoreResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PrepareRestoreRequest".
 */
export interface PrepareRestoreRequest {
  type: "prepareRestore";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PrepareRestoreResponse".
 */
export interface PrepareRestoreResponse {
  type: "prepareRestore_response";
  requestId?: string;
  success: boolean;
  id: string;
  url: string;
  needsKey?: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CheckRestoreCall".
 */
export interface CheckRestoreCall {
  request: CheckRestoreRequest;
  response: CheckRestoreResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CheckRestoreRequest".
 */
export interface CheckRestoreRequest {
  type: "checkRestore";
  requestId?: string;
  id: string;
  password: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CheckRestoreResponse".
 */
export interface CheckRestoreResponse {
  type: "checkRestore_response";
  requestId?: string;
  success: boolean;
  needsKey: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RestoreBackupCall".
 */
export interface RestoreBackupCall {
  request: RestoreBackupRequest;
  response: RestoreBackupResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RestoreBackupRequest".
 */
export interface RestoreBackupRequest {
  type: "restoreBackup";
  requestId?: string;
  id: string;
  password: string;
  key?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "RestoreBackupResponse".
 */
export interface RestoreBackupResponse {
  type: "restoreBackup_response";
  requestId?: string;
  success: boolean;
  needsKey?: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PrepareCcuFirmwareCall".
 */
export interface PrepareCcuFirmwareCall {
  request: PrepareCcuFirmwareRequest;
  response: PrepareCcuFirmwareResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PrepareCcuFirmwareRequest".
 */
export interface PrepareCcuFirmwareRequest {
  type: "prepareCcuFirmware";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PrepareCcuFirmwareResponse".
 */
export interface PrepareCcuFirmwareResponse {
  type: "prepareCcuFirmware_response";
  requestId?: string;
  success: boolean;
  id: string;
  url: string;
  needsKey?: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CheckCcuFirmwareCall".
 */
export interface CheckCcuFirmwareCall {
  request: CheckCcuFirmwareRequest;
  response: CheckCcuFirmwareResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CheckCcuFirmwareRequest".
 */
export interface CheckCcuFirmwareRequest {
  type: "checkCcuFirmware";
  requestId?: string;
  id: string;
  password: string;
  language?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CheckCcuFirmwareResponse".
 */
export interface CheckCcuFirmwareResponse {
  type: "checkCcuFirmware_response";
  requestId?: string;
  success: boolean;
  needsKey?: boolean;
  eula?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "InstallCcuFirmwareCall".
 */
export interface InstallCcuFirmwareCall {
  request: InstallCcuFirmwareRequest;
  response: InstallCcuFirmwareResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "InstallCcuFirmwareRequest".
 */
export interface InstallCcuFirmwareRequest {
  type: "installCcuFirmware";
  requestId?: string;
  password: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "InstallCcuFirmwareResponse".
 */
export interface InstallCcuFirmwareResponse {
  type: "installCcuFirmware_response";
  requestId?: string;
  success: boolean;
  needsKey?: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CancelCcuFirmwareCall".
 */
export interface CancelCcuFirmwareCall {
  request: CancelCcuFirmwareRequest;
  response: CancelCcuFirmwareResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CancelCcuFirmwareRequest".
 */
export interface CancelCcuFirmwareRequest {
  type: "cancelCcuFirmware";
  requestId?: string;
  password: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "CancelCcuFirmwareResponse".
 */
export interface CancelCcuFirmwareResponse {
  type: "cancelCcuFirmware_response";
  requestId?: string;
  success: boolean;
  needsKey?: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PrepareAddonUploadCall".
 */
export interface PrepareAddonUploadCall {
  request: PrepareAddonUploadRequest;
  response: PrepareAddonUploadResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PrepareAddonUploadRequest".
 */
export interface PrepareAddonUploadRequest {
  type: "prepareAddonUpload";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "PrepareAddonUploadResponse".
 */
export interface PrepareAddonUploadResponse {
  type: "prepareAddonUpload_response";
  requestId?: string;
  success: boolean;
  id: string;
  url: string;
  needsKey?: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "InstallAddonCall".
 */
export interface InstallAddonCall {
  request: InstallAddonRequest;
  response: InstallAddonResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "InstallAddonRequest".
 */
export interface InstallAddonRequest {
  type: "installAddon";
  requestId?: string;
  id: string;
  password: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "InstallAddonResponse".
 */
export interface InstallAddonResponse {
  type: "installAddon_response";
  requestId?: string;
  success: boolean;
  needsKey?: boolean;
  reboot?: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetDiagramsCall".
 */
export interface GetDiagramsCall {
  request: GetDiagramsRequest;
  response: GetDiagramsResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetDiagramsRequest".
 */
export interface GetDiagramsRequest {
  type: "getDiagrams";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetDiagramsResponse".
 */
export interface GetDiagramsResponse {
  type: "getDiagrams_response";
  requestId?: string;
  diagrams: Diagram[];
  energyPrice?: EnergyPrice;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "Diagram".
 */
export interface Diagram {
  id: string;
  name: string;
  series: DiagramSeries[];
  period?: "" | "day" | "week" | "month" | "year";
  /**
   * Rooms, trades and favorite lists (ReGa ids) that show the diagram as a tile
   */
  places?: number[];
}
/**
 * A line of a diagram: a channel's datapoint, or a system variable (address "sysvar", datapoint its id)
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DiagramSeries".
 */
export interface DiagramSeries {
  address: string;
  datapoint: string;
  label?: string;
  color?: string;
  unit?: string;
  /**
   * How the series is drawn; empty lets the app choose
   */
  chart?: "" | "line" | "area" | "bar" | "step" | "state";
  /**
   * What is shown of an interval; delta is the increase of a counter (consumption)
   */
  aggregate?: "" | "avg" | "min" | "max" | "delta";
  axis?: "" | "left" | "right";
}
/**
 * Prices of electricity and gas per kWh (/etc/config/energyPrice)
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "EnergyPrice".
 */
export interface EnergyPrice {
  currency: string;
  electricity: number;
  gas: number;
  gasHeatingValue: number;
  gasConditionNumber: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetDiagramDataCall".
 */
export interface GetDiagramDataCall {
  request: GetDiagramDataRequest;
  response: GetDiagramDataResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetDiagramDataRequest".
 */
export interface GetDiagramDataRequest {
  type: "getDiagramData";
  requestId?: string;
  series: DiagramSeries[];
  /**
   * Start (Unix ms)
   */
  from: number;
  /**
   * End (Unix ms)
   */
  to: number;
  /**
   * The most points per series
   */
  buckets?: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetDiagramDataResponse".
 */
export interface GetDiagramDataResponse {
  type: "getDiagramData_response";
  requestId?: string;
  series: DiagramSeriesData[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DiagramSeriesData".
 */
export interface DiagramSeriesData {
  address: string;
  datapoint: string;
  /**
   * [time (ms), average, minimum, maximum] per interval
   */
  points: [number, number, number, number][];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SaveDiagramCall".
 */
export interface SaveDiagramCall {
  request: SaveDiagramRequest;
  response: SaveDiagramResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SaveDiagramRequest".
 */
export interface SaveDiagramRequest {
  type: "saveDiagram";
  requestId?: string;
  diagram: Diagram;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SaveDiagramResponse".
 */
export interface SaveDiagramResponse {
  type: "saveDiagram_response";
  requestId?: string;
  success: boolean;
  diagram: Diagram;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteDiagramCall".
 */
export interface DeleteDiagramCall {
  request: DeleteDiagramRequest;
  response: DeleteDiagramResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteDiagramRequest".
 */
export interface DeleteDiagramRequest {
  type: "deleteDiagram";
  requestId?: string;
  id: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteDiagramResponse".
 */
export interface DeleteDiagramResponse {
  type: "deleteDiagram_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetGeneralSettingsCall".
 */
export interface GetGeneralSettingsCall {
  request: GetGeneralSettingsRequest;
  response: GetGeneralSettingsResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetGeneralSettingsRequest".
 */
export interface GetGeneralSettingsRequest {
  type: "getGeneralSettings";
  requestId?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetGeneralSettingsResponse".
 */
export interface GetGeneralSettingsResponse {
  type: "getGeneralSettings_response";
  requestId?: string;
  energyPrice: EnergyPrice;
  infoLed: InfoLed;
  hideStickyUnreach: boolean;
  betaFirmware: boolean;
  currencies: string[];
  storage: StorageInfo;
}
/**
 * Whether the CCU3's info LED shows service messages and alarms
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "InfoLed".
 */
export interface InfoLed {
  service: boolean;
  alarm: boolean;
}
/**
 * Bytes the recorded diagram values take and of their file system
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "StorageInfo".
 */
export interface StorageInfo {
  used: number;
  free: number;
  total: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetGeneralSettingsCall".
 */
export interface SetGeneralSettingsCall {
  request: SetGeneralSettingsRequest;
  response: SetGeneralSettingsResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetGeneralSettingsRequest".
 */
export interface SetGeneralSettingsRequest {
  type: "setGeneralSettings";
  requestId?: string;
  energyPrice: EnergyPrice;
  infoLed?: InfoLed;
  hideStickyUnreach?: boolean;
  betaFirmware?: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SetGeneralSettingsResponse".
 */
export interface SetGeneralSettingsResponse {
  type: "setGeneralSettings_response";
  requestId?: string;
  success: boolean;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetHeatingGroupMembersCall".
 */
export interface GetHeatingGroupMembersCall {
  request: GetHeatingGroupMembersRequest;
  response: GetHeatingGroupMembersResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetHeatingGroupMembersRequest".
 */
export interface GetHeatingGroupMembersRequest {
  type: "getHeatingGroupMembers";
  requestId?: string;
  groupType: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "GetHeatingGroupMembersResponse".
 */
export interface GetHeatingGroupMembersResponse {
  type: "getHeatingGroupMembers_response";
  requestId?: string;
  members: {
    assignable: HeatingGroupCandidate[];
    leftover: HeatingGroupCandidate[];
  };
}
/**
 * A channel a heating group may contain
 *
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "HeatingGroupCandidate".
 */
export interface HeatingGroupCandidate {
  /**
   * The channel address
   */
  id: string;
  type: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SaveHeatingGroupCall".
 */
export interface SaveHeatingGroupCall {
  request: SaveHeatingGroupRequest;
  response: SaveHeatingGroupResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SaveHeatingGroupRequest".
 */
export interface SaveHeatingGroupRequest {
  type: "saveHeatingGroup";
  requestId?: string;
  group: HeatingGroupChange;
  /**
   * For a new WebUI session, when the last answer was PASSWORD_REQUIRED
   */
  password?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "HeatingGroupChange".
 */
export interface HeatingGroupChange {
  /**
   * 0 for a new group
   */
  id: number;
  name: string;
  type: "hmip.heating.group" | "HomeMatic.heating";
  forbidSingleOperation?: boolean;
  members?: string[];
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "SaveHeatingGroupResponse".
 */
export interface SaveHeatingGroupResponse {
  type: "saveHeatingGroup_response";
  requestId?: string;
  success: boolean;
  id: number;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteHeatingGroupCall".
 */
export interface DeleteHeatingGroupCall {
  request: DeleteHeatingGroupRequest;
  response: DeleteHeatingGroupResponse;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteHeatingGroupRequest".
 */
export interface DeleteHeatingGroupRequest {
  type: "deleteHeatingGroup";
  requestId?: string;
  id: number;
  password?: string;
}
/**
 * This interface was referenced by `Protocol`'s JSON-Schema
 * via the `definition` "DeleteHeatingGroupResponse".
 */
export interface DeleteHeatingGroupResponse {
  type: "deleteHeatingGroup_response";
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
