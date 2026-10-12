/* Wire shapes shared with Services/KliveChat (protocol 2). */

export interface RoomSummary {
    roomId: string;
    name: string;
    createdBy: string;
    createdUtc: string;
    lastActiveUtc: string;
    persistent: boolean;
    locked: boolean;
    userCount: number;
    participants: LobbyParticipant[];
    roomPath: string;
    canManage: boolean;
}

export interface LobbyParticipant {
    id: string;
    name: string;
    isGuest: boolean;
    isMuted: boolean;
    hasVideo: boolean;
    isScreenSharing: boolean;
    connected: boolean;
}

export interface ChatMe {
    name: string;
    rank: number;
    userId: string;
    canCreate?: boolean;
    canModerate?: boolean;
    canDeleteAnyRoom?: boolean;
}

export interface RoomState {
    id: string;
    name: string;
    createdBy: string;
    createdUtc: string;
    persistent: boolean;
    locked: boolean;
}

export interface ParticipantSummary {
    id: string;
    name: string;
    rank: number;
    isGuest: boolean;
    isMuted: boolean;
    hasVideo: boolean;
    isScreenSharing: boolean;
    hasScreenAudio?: boolean;
    canModerate: boolean;
    isHost?: boolean;
    connected?: boolean;
    joinedUtc?: string;
}

export interface ServerChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    senderIsGuest?: boolean;
    text: string;
    ts: string;
    clientMsgId?: string;
}

export interface IceServerConfig {
    urls: string[] | string;
    username?: string;
    credential?: string;
}

export interface WireMessage {
    type: string;
    senderId?: string;
    targetId?: string;
    payload?: any;
}
